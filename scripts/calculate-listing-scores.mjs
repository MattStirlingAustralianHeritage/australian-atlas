#!/usr/bin/env node
/**
 * Calculate Listing Completeness Scores
 *
 * Scores every active listing based on which weighted fields are populated.
 * Per-vertical schemas let each vertical emphasise what matters most.
 *
 * Usage:
 *   node --env-file=.env.local scripts/calculate-listing-scores.mjs
 *   node --env-file=.env.local scripts/calculate-listing-scores.mjs --vertical=sba
 *   node --env-file=.env.local scripts/calculate-listing-scores.mjs --dry-run
 */
import { createClient } from '@supabase/supabase-js'

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(MASTER_URL, MASTER_KEY)

// ── CLI flags ──────────────────────────────────────────────
const args = process.argv.slice(2)
const verticalFlag = args.find(a => a.startsWith('--vertical='))?.split('=')[1] || null
const dryRun = args.includes('--dry-run')

// ── Per-vertical completeness schemas ──────────────────────
// weight = how much this field contributes to the 100-point score
// Fields with weight 0 are tracked for missing_fields but don't affect score
// (e.g. lng is counted together with lat)

const DEFAULT_SCHEMA = {
  fields: [
    { name: 'name',           weight: 10, label: 'Venue name' },
    { name: 'description',    weight: 15, label: 'Description' },
    { name: 'address',        weight: 5,  label: 'Address' },
    { name: 'state',          weight: 5,  label: 'State' },
    { name: 'lat',            weight: 10, label: 'Map coordinates' },
    { name: 'lng',            weight: 0,  label: 'Map coordinates' },
    { name: 'hero_image_url', weight: 15, label: 'Hero image' },
    { name: 'website',        weight: 10, label: 'Website' },
    { name: 'phone',          weight: 5,  label: 'Phone number' },
    { name: 'region',         weight: 10, label: 'Region' },
  ],
}

const VERTICAL_SCHEMAS = {
  sba: {
    fields: [
      { name: 'name',           weight: 10, label: 'Venue name' },
      { name: 'description',    weight: 15, label: 'Description' },
      { name: 'address',        weight: 5,  label: 'Address' },
      { name: 'state',          weight: 5,  label: 'State' },
      { name: 'lat',            weight: 10, label: 'Map coordinates' },
      { name: 'lng',            weight: 0,  label: 'Map coordinates' },
      { name: 'hero_image_url', weight: 15, label: 'Hero image' },
      { name: 'website',        weight: 10, label: 'Website' },
      { name: 'phone',          weight: 5,  label: 'Phone number' },
      { name: 'region',         weight: 10, label: 'Region' },
    ],
    // SBA meta fields (from sba_meta table)
    metaTable: 'sba_meta',
    metaFields: [
      { name: 'producer_type', weight: 5,  label: 'Producer type' },
      { name: 'features',      weight: 5,  label: 'Features' },
      { name: 'google_rating', weight: 5,  label: 'Google rating' },
    ],
  },

  fine_grounds: {
    fields: [
      { name: 'name',           weight: 10, label: 'Venue name' },
      { name: 'description',    weight: 15, label: 'Description' },
      { name: 'address',        weight: 5,  label: 'Address' },
      { name: 'state',          weight: 5,  label: 'State' },
      { name: 'lat',            weight: 10, label: 'Map coordinates' },
      { name: 'lng',            weight: 0,  label: 'Map coordinates' },
      { name: 'hero_image_url', weight: 15, label: 'Hero image' },
      { name: 'website',        weight: 5,  label: 'Website' },
      { name: 'phone',          weight: 5,  label: 'Phone number' },
      { name: 'region',         weight: 5,  label: 'Region' },
    ],
    metaTable: 'fine_grounds_meta',
    metaFields: [
      { name: 'entity_type',     weight: 5,  label: 'Entity type (roaster/cafe)' },
      { name: 'brewing_methods',  weight: 5,  label: 'Brewing methods' },
      { name: 'beans_origin',     weight: 5,  label: 'Bean origins' },
      { name: 'roaster_master_id',weight: 5,  label: 'Roaster relationship' },
      { name: 'google_rating',    weight: 5,  label: 'Google rating' },
    ],
  },

  rest: {
    fields: [
      { name: 'name',           weight: 10, label: 'Property name' },
      { name: 'description',    weight: 10, label: 'Description' },
      { name: 'address',        weight: 5,  label: 'Address' },
      { name: 'state',          weight: 5,  label: 'State' },
      { name: 'lat',            weight: 10, label: 'Map coordinates' },
      { name: 'lng',            weight: 0,  label: 'Map coordinates' },
      { name: 'hero_image_url', weight: 10, label: 'Hero image' },
      { name: 'website',        weight: 10, label: 'Booking URL' },
      { name: 'phone',          weight: 5,  label: 'Phone number' },
      { name: 'region',         weight: 5,  label: 'Region' },
    ],
    metaTable: 'rest_meta',
    metaFields: [
      { name: 'accommodation_type', weight: 5,  label: 'Accommodation type' },
      { name: 'setting',            weight: 5,  label: 'Setting' },
      { name: 'min_price_per_night',weight: 5,  label: 'Price range' },
      { name: 'guest_capacity',     weight: 5,  label: 'Guest capacity' },
      { name: 'amenities',          weight: 5,  label: 'Amenities' },
      { name: 'google_rating',      weight: 5,  label: 'Google rating' },
    ],
  },

  field: {
    fields: [
      { name: 'name',           weight: 10, label: 'Place name' },
      { name: 'description',    weight: 15, label: 'Description' },
      { name: 'state',          weight: 5,  label: 'State' },
      { name: 'lat',            weight: 10, label: 'Map coordinates' },
      { name: 'lng',            weight: 0,  label: 'Map coordinates' },
      { name: 'hero_image_url', weight: 15, label: 'Hero image' },
      { name: 'region',         weight: 10, label: 'Region' },
    ],
    metaTable: 'field_meta',
    metaFields: [
      { name: 'feature_type',       weight: 5,  label: 'Feature type' },
      { name: 'difficulty',          weight: 5,  label: 'Difficulty' },
      { name: 'know_before_you_go',  weight: 10, label: 'Access notes' },
      { name: 'best_seasons',        weight: 5,  label: 'Best seasons' },
      { name: 'nearest_town',        weight: 5,  label: 'Nearest town' },
      { name: 'entry_fee',           weight: 5,  label: 'Entry fee info' },
    ],
  },

  collection: {
    fields: [
      { name: 'name',           weight: 10, label: 'Institution name' },
      { name: 'description',    weight: 15, label: 'Description' },
      { name: 'address',        weight: 5,  label: 'Address' },
      { name: 'state',          weight: 5,  label: 'State' },
      { name: 'lat',            weight: 10, label: 'Map coordinates' },
      { name: 'lng',            weight: 0,  label: 'Map coordinates' },
      { name: 'hero_image_url', weight: 15, label: 'Hero image' },
      { name: 'website',        weight: 10, label: 'Website' },
      { name: 'phone',          weight: 5,  label: 'Phone number' },
      { name: 'region',         weight: 5,  label: 'Region' },
    ],
    metaTable: 'collection_meta',
    metaFields: [
      { name: 'institution_type',  weight: 5,  label: 'Institution type' },
      { name: 'admission_price',   weight: 5,  label: 'Admission info' },
      { name: 'features',          weight: 5,  label: 'Features' },
      { name: 'google_rating',     weight: 5,  label: 'Google rating' },
    ],
  },

  craft: {
    fields: [
      { name: 'name',           weight: 10, label: 'Maker name' },
      { name: 'description',    weight: 15, label: 'Description' },
      { name: 'address',        weight: 5,  label: 'Address' },
      { name: 'state',          weight: 5,  label: 'State' },
      { name: 'lat',            weight: 10, label: 'Map coordinates' },
      { name: 'lng',            weight: 0,  label: 'Map coordinates' },
      { name: 'hero_image_url', weight: 15, label: 'Hero image' },
      { name: 'website',        weight: 10, label: 'Website' },
      { name: 'region',         weight: 5,  label: 'Region' },
    ],
    metaTable: 'craft_meta',
    metaFields: [
      { name: 'discipline',            weight: 5,  label: 'Discipline' },
      { name: 'practice_description',   weight: 5,  label: 'Practice description' },
      { name: 'materials',              weight: 5,  label: 'Materials' },
      { name: 'google_rating',          weight: 5,  label: 'Google rating' },
    ],
  },

  corner: {
    fields: [
      { name: 'name',           weight: 10, label: 'Shop name' },
      { name: 'description',    weight: 15, label: 'Description' },
      { name: 'address',        weight: 5,  label: 'Address' },
      { name: 'state',          weight: 5,  label: 'State' },
      { name: 'lat',            weight: 10, label: 'Map coordinates' },
      { name: 'lng',            weight: 0,  label: 'Map coordinates' },
      { name: 'hero_image_url', weight: 15, label: 'Hero image' },
      { name: 'website',        weight: 10, label: 'Website' },
      { name: 'phone',          weight: 5,  label: 'Phone number' },
      { name: 'region',         weight: 5,  label: 'Region' },
    ],
    metaTable: 'corner_meta',
    metaFields: [
      { name: 'shop_type',   weight: 5,  label: 'Shop type' },
      { name: 'story',       weight: 5,  label: 'Shop story' },
      { name: 'known_for',   weight: 5,  label: 'Known for' },
    ],
  },

  found: {
    fields: [
      { name: 'name',           weight: 10, label: 'Shop name' },
      { name: 'description',    weight: 15, label: 'Description' },
      { name: 'address',        weight: 5,  label: 'Address' },
      { name: 'state',          weight: 5,  label: 'State' },
      { name: 'lat',            weight: 10, label: 'Map coordinates' },
      { name: 'lng',            weight: 0,  label: 'Map coordinates' },
      { name: 'hero_image_url', weight: 15, label: 'Hero image' },
      { name: 'website',        weight: 10, label: 'Website' },
      { name: 'phone',          weight: 5,  label: 'Phone number' },
      { name: 'region',         weight: 5,  label: 'Region' },
    ],
    metaTable: 'found_meta',
    metaFields: [
      { name: 'shop_type',   weight: 5,  label: 'Shop type' },
      { name: 'story',       weight: 5,  label: 'Shop story' },
      { name: 'known_for',   weight: 5,  label: 'Known for' },
    ],
  },

  table: {
    fields: [
      { name: 'name',           weight: 10, label: 'Listing name' },
      { name: 'description',    weight: 15, label: 'Description' },
      { name: 'address',        weight: 5,  label: 'Address' },
      { name: 'state',          weight: 5,  label: 'State' },
      { name: 'lat',            weight: 10, label: 'Map coordinates' },
      { name: 'lng',            weight: 0,  label: 'Map coordinates' },
      { name: 'hero_image_url', weight: 15, label: 'Hero image' },
      { name: 'website',        weight: 10, label: 'Website' },
      { name: 'phone',          weight: 5,  label: 'Phone number' },
      { name: 'region',         weight: 5,  label: 'Region' },
    ],
    metaTable: 'table_meta',
    metaFields: [
      { name: 'food_type',   weight: 5,  label: 'Food type' },
      { name: 'cuisine',     weight: 5,  label: 'Cuisine' },
      { name: 'story',       weight: 5,  label: 'Story' },
      { name: 'known_for',   weight: 5,  label: 'Known for' },
    ],
  },
}

const ALL_VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']
const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Collection', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

// ── Helpers ────────────────────────────────────────────────
function isFilled(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string' && value.trim() === '') return false
  if (Array.isArray(value) && value.length === 0) return false
  return true
}

function scoreListing(listing, metaRow, schema) {
  const allFields = [...schema.fields, ...(schema.metaFields || [])]
  const totalWeight = allFields.reduce((sum, f) => sum + f.weight, 0)

  let earnedWeight = 0
  const missing = []

  for (const field of schema.fields) {
    const value = listing[field.name]
    if (isFilled(value)) {
      earnedWeight += field.weight
    } else if (field.weight > 0) {
      missing.push(field.label)
    }
  }

  if (schema.metaFields && metaRow) {
    for (const field of schema.metaFields) {
      const value = metaRow[field.name]
      if (isFilled(value)) {
        earnedWeight += field.weight
      } else {
        missing.push(field.label)
      }
    }
  } else if (schema.metaFields && !metaRow) {
    // No meta row at all — all meta fields are missing
    for (const field of schema.metaFields) {
      missing.push(field.label)
    }
  }

  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0

  // Generate improvement note based on the highest-weight missing field
  const sortedMissing = allFields
    .filter(f => f.weight > 0 && missing.includes(f.label))
    .sort((a, b) => b.weight - a.weight)

  let improvementNote = null
  if (sortedMissing.length > 0) {
    const top = sortedMissing[0]
    improvementNote = `Add ${top.label.toLowerCase()} (+${Math.round((top.weight / totalWeight) * 100)} pts)`
    if (sortedMissing.length > 1) {
      const second = sortedMissing[1]
      improvementNote += `, then ${second.label.toLowerCase()} (+${Math.round((second.weight / totalWeight) * 100)} pts)`
    }
  }

  // Deduplicate missing labels (e.g. lat/lng both show "Map coordinates")
  const uniqueMissing = [...new Set(missing)]

  return { score, missingFields: uniqueMissing, improvementNote }
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  const verticalsToProcess = verticalFlag ? [verticalFlag] : ALL_VERTICALS

  console.log('\n========================================')
  console.log('  LISTING COMPLETENESS SCORING')
  console.log('========================================')
  if (verticalFlag) console.log(`  Vertical filter: ${verticalFlag}`)
  if (dryRun) console.log('  DRY RUN — no database writes')
  console.log()

  const allResults = []

  for (const vertical of verticalsToProcess) {
    const schema = VERTICAL_SCHEMAS[vertical] || DEFAULT_SCHEMA
    const label = VERTICAL_LABELS[vertical] || vertical

    // Fetch active listings for this vertical
    const { data: listings, error: listErr } = await sb
      .from('listings')
      .select('*')
      .eq('vertical', vertical)
      .eq('status', 'active')

    if (listErr) {
      console.error(`  Error fetching ${label} listings:`, listErr.message)
      continue
    }

    if (!listings || listings.length === 0) {
      console.log(`  ${label}: 0 listings — skipping`)
      continue
    }

    // Fetch meta rows if this vertical has a meta table
    let metaByListingId = {}
    if (schema.metaTable) {
      const metaFields = schema.metaFields.map(f => f.name).join(',')
      const { data: metaRows, error: metaErr } = await sb
        .from(schema.metaTable)
        .select(`listing_id,${metaFields}`)
        .in('listing_id', listings.map(l => l.id))

      if (!metaErr && metaRows) {
        for (const row of metaRows) {
          metaByListingId[row.listing_id] = row
        }
      }
    }

    // Score each listing
    const scored = listings.map(listing => {
      const metaRow = metaByListingId[listing.id] || null
      const result = scoreListing(listing, metaRow, schema)
      return {
        listing_id: listing.id,
        vertical,
        name: listing.name,
        ...result,
      }
    })

    allResults.push(...scored)

    // Print vertical summary
    const critical = scored.filter(s => s.score < 40).length
    const incomplete = scored.filter(s => s.score >= 40 && s.score < 70).length
    const good = scored.filter(s => s.score >= 70).length
    const avg = Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length)

    console.log(`  ${label} (${scored.length} listings, avg ${avg}/100)`)
    console.log(`    Critical (<40):   ${critical}`)
    console.log(`    Incomplete (40-69): ${incomplete}`)
    console.log(`    Good (70+):       ${good}`)
    console.log()
  }

  // ── Upsert to database ──────────────────────────────────
  if (!dryRun && allResults.length > 0) {
    console.log(`  Upserting ${allResults.length} scores...`)

    // Batch in chunks of 500
    const BATCH_SIZE = 500
    let upserted = 0

    for (let i = 0; i < allResults.length; i += BATCH_SIZE) {
      const batch = allResults.slice(i, i + BATCH_SIZE).map(r => ({
        listing_id: r.listing_id,
        vertical: r.vertical,
        score: r.score,
        missing_fields: r.missingFields,
        improvement_note: r.improvementNote,
        calculated_at: new Date().toISOString(),
      }))

      const { error } = await sb
        .from('listing_scores')
        .upsert(batch, { onConflict: 'listing_id' })

      if (error) {
        console.error(`  Upsert error (batch ${i / BATCH_SIZE + 1}):`, error.message)
      } else {
        upserted += batch.length
      }
    }

    console.log(`  Upserted ${upserted} scores.`)
  }

  // ── Final summary ────────────────────────────────────────
  const totalCritical = allResults.filter(s => s.score < 40).length
  const totalIncomplete = allResults.filter(s => s.score >= 40 && s.score < 70).length
  const totalGood = allResults.filter(s => s.score >= 70).length
  const totalAvg = allResults.length > 0
    ? Math.round(allResults.reduce((sum, s) => sum + s.score, 0) / allResults.length)
    : 0

  console.log('\n────────────────────────────────────────')
  console.log('  TOTAL SUMMARY')
  console.log('────────────────────────────────────────')
  console.log(`  Total scored:       ${allResults.length}`)
  console.log(`  Average score:      ${totalAvg}/100`)
  console.log(`  Critical (<40):     ${totalCritical}`)
  console.log(`  Incomplete (40-69): ${totalIncomplete}`)
  console.log(`  Good (70+):         ${totalGood}`)

  // Show worst 10
  if (allResults.length > 0) {
    const worst = allResults.sort((a, b) => a.score - b.score).slice(0, 10)
    console.log('\n  Lowest 10:')
    for (const w of worst) {
      console.log(`    ${w.score}/100 — ${w.name} (${w.vertical})`)
      if (w.improvementNote) console.log(`           ${w.improvementNote}`)
    }
  }

  console.log('\nDone.\n')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
