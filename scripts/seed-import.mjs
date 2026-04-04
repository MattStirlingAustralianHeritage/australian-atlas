#!/usr/bin/env node
/**
 * Seed Importer — imports validated seed JSON files into the master listings DB.
 *
 * Expects seed files validated by seed-validate.mjs. Handles both the core
 * listings table and per-vertical meta extension tables.
 *
 * Modes:
 *   --dry-run   (default) Parse and validate only, report what would change
 *   --import    Actually upsert into database
 *   --force     Skip confirmation prompt
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-import.mjs seeds/field-expansion.json
 *   node --env-file=.env.local scripts/seed-import.mjs seeds/field-expansion.json --import
 *   node --env-file=.env.local scripts/seed-import.mjs seeds/corner-expansion.json --import --force
 */
import { readFileSync } from 'fs'
import { createInterface } from 'readline'
import { createClient } from '@supabase/supabase-js'

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(MASTER_URL, MASTER_KEY)

const args = process.argv.slice(2)
const filePath = args.find(a => !a.startsWith('--'))
const importMode = args.includes('--import')
const forceMode = args.includes('--force')
const dryRun = !importMode

if (!filePath) {
  console.error('Usage: node scripts/seed-import.mjs <seed-file.json> [--import] [--force]')
  process.exit(1)
}

// Meta table name per vertical
const META_TABLES = {
  sba: 'sba_meta',
  collection: 'collection_meta',
  craft: 'craft_meta',
  fine_grounds: 'fine_grounds_meta',
  rest: 'rest_meta',
  field: 'field_meta',
  corner: 'corner_meta',
  found: 'found_meta',
  table: 'table_meta',
}

// Core listing fields (anything not in this list goes to meta)
const CORE_FIELDS = new Set([
  'name', 'slug', 'vertical', 'source_id', 'description', 'region', 'state',
  'lat', 'lng', 'website', 'phone', 'address', 'hero_image_url',
  'is_claimed', 'is_featured', 'is_market', 'status',
  // Seed-only fields (not stored in listings)
  'meta', 'verification_sources', 'data_source', 'needs_review',
])

function confirm(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.toLowerCase().startsWith('y'))
    })
  })
}

async function main() {
  console.log('\n════════════════════════════════════════')
  console.log('  SEED IMPORTER')
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no database changes)' : '\x1b[33mIMPORT (will write to database)\x1b[0m'}`)
  console.log('════════════════════════════════════════\n')

  // ── 1. Read and parse ──
  let raw
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (err) {
    console.error(`Cannot read file: ${filePath}`)
    process.exit(1)
  }

  let data
  try {
    data = JSON.parse(raw)
  } catch (err) {
    console.error(`Invalid JSON: ${err.message}`)
    process.exit(1)
  }

  const venues = data.venues || data.listings || data
  if (!Array.isArray(venues)) {
    console.error('Expected a JSON array or object with "venues" or "listings" key')
    process.exit(1)
  }

  console.log(`  Source file: ${filePath}`)
  console.log(`  Venues to import: ${venues.length}`)

  // ── 2. Validate basics ──
  const vertical = venues[0]?.vertical
  if (!vertical) {
    console.error('First venue has no vertical — cannot determine target table')
    process.exit(1)
  }
  const allSameVertical = venues.every(v => v.vertical === vertical)
  if (!allSameVertical) {
    const verticals = [...new Set(venues.map(v => v.vertical))]
    console.log(`  \x1b[33mMultiple verticals detected: ${verticals.join(', ')}\x1b[0m`)
  }
  console.log(`  Primary vertical: ${vertical}`)

  const metaTable = META_TABLES[vertical]
  console.log(`  Meta table: ${metaTable || 'none'}`)

  // ── 3. Check for existing listings ──
  const sourceIds = venues.map(v => v.source_id).filter(Boolean)
  let existingCount = 0
  if (sourceIds.length > 0) {
    // Check in batches (Supabase .in() has limits)
    for (let i = 0; i < sourceIds.length; i += 100) {
      const batch = sourceIds.slice(i, i + 100)
      const { count } = await sb
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('vertical', vertical)
        .in('source_id', batch)
      existingCount += (count || 0)
    }
  }

  const newCount = venues.length - existingCount
  console.log(`  Already in DB: ${existingCount} (will update)`)
  console.log(`  New listings: ${newCount} (will insert)`)

  // ── 4. State distribution ──
  const stateCounts = {}
  for (const v of venues) {
    stateCounts[v.state] = (stateCounts[v.state] || 0) + 1
  }
  console.log(`  States: ${Object.entries(stateCounts).map(([s, c]) => `${s}(${c})`).join(' ')}`)

  // ── 5. Preview sample ──
  console.log('\n  Sample venues:')
  for (const v of venues.slice(0, 5)) {
    const meta = v.meta ? ` [${Object.entries(v.meta).map(([k, val]) => `${k}=${val}`).join(', ')}]` : ''
    console.log(`    - ${v.name} (${v.state}) ${v.lat ? `(${v.lat.toFixed(4)}, ${v.lng.toFixed(4)})` : '(no coords)'}${meta}`)
  }
  if (venues.length > 5) console.log(`    ... and ${venues.length - 5} more`)

  // ── 6. Dry run stops here ──
  if (dryRun) {
    console.log('\n  \x1b[36mDry run complete. Run with --import to write to database.\x1b[0m\n')
    return
  }

  // ── 7. Confirmation ──
  if (!forceMode) {
    const ok = await confirm(`\n  Import ${venues.length} venues into ${vertical}? (y/N) `)
    if (!ok) {
      console.log('  Cancelled.')
      process.exit(0)
    }
  }

  // ── 8. Import ──
  console.log('\n  Importing...')
  let imported = 0
  let metaImported = 0
  let errors = 0

  // Process in chunks of 50
  for (let i = 0; i < venues.length; i += 50) {
    const chunk = venues.slice(i, i + 50)

    // Prepare core listing rows
    const listingRows = chunk.map(venue => {
      const row = {
        vertical: venue.vertical,
        source_id: venue.source_id || `${venue.vertical}_${venue.slug}`,
        name: venue.name,
        slug: venue.slug,
        description: venue.description || null,
        region: venue.region || null,
        state: venue.state,
        lat: venue.lat || null,
        lng: venue.lng || null,
        website: venue.website || null,
        phone: venue.phone || null,
        address: venue.address || null,
        hero_image_url: venue.hero_image_url || null,
        is_claimed: venue.is_claimed || false,
        is_featured: venue.is_featured || false,
        status: venue.status || 'active',
        synced_at: new Date().toISOString(),
      }

      // Data integrity fields
      if (venue.data_source) row.data_source = venue.data_source
      if (venue.needs_review != null) row.needs_review = venue.needs_review

      return row
    })

    // Upsert listings
    const { data: upserted, error } = await sb
      .from('listings')
      .upsert(listingRows, { onConflict: 'vertical,source_id' })
      .select('id, source_id')

    if (error) {
      console.error(`  Batch error (listings ${i}-${i + chunk.length}): ${error.message}`)
      errors += chunk.length
      continue
    }

    imported += upserted?.length || 0

    // Upsert meta if available
    if (metaTable && upserted) {
      const metaRows = []
      for (const listing of upserted) {
        const venue = chunk.find(v =>
          (v.source_id || `${v.vertical}_${v.slug}`) === listing.source_id
        )
        if (venue?.meta && Object.keys(venue.meta).length > 0) {
          metaRows.push({
            listing_id: listing.id,
            ...venue.meta,
          })
        }
      }

      if (metaRows.length > 0) {
        const { data: metaResult, error: metaError } = await sb
          .from(metaTable)
          .upsert(metaRows, { onConflict: 'listing_id' })
          .select('listing_id')

        if (metaError) {
          console.error(`  Meta batch error: ${metaError.message}`)
        } else {
          metaImported += metaResult?.length || 0
        }
      }
    }

    process.stdout.write(`\r  Processed ${Math.min(i + 50, venues.length)}/${venues.length}`)
  }
  process.stdout.write('\n')

  // ── 9. Summary ──
  console.log('\n════════════════════════════════════════')
  console.log('  IMPORT COMPLETE')
  console.log('════════════════════════════════════════')
  console.log(`  Listings upserted: ${imported}`)
  if (metaImported > 0) console.log(`  Meta rows upserted: ${metaImported}`)
  if (errors > 0) console.log(`  \x1b[31mErrors: ${errors}\x1b[0m`)

  // Verify final count
  const { count: finalCount } = await sb
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
    .eq('vertical', vertical)
  console.log(`  Total active ${vertical} listings in DB: ${finalCount}`)
  console.log('')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
