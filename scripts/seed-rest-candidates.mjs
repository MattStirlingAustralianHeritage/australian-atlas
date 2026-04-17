#!/usr/bin/env node
/**
 * Seed Rest Atlas candidates into listing_candidates table.
 *
 * Reads candidate JSON data and inserts into the listing_candidates table
 * with ON CONFLICT (name+vertical unique index) DO NOTHING for idempotency.
 *
 * Usage:
 *   node scripts/seed-rest-candidates.mjs
 *   node scripts/seed-rest-candidates.mjs --dry-run
 *
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

config({ path: '.env.local' })

const __dirname = dirname(fileURLToPath(import.meta.url))

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DRY_RUN = process.argv.includes('--dry-run')
const BATCH_SIZE = 50

// Category mapping — normalise to Rest Atlas subcategories
const CATEGORY_MAP = {
  boutique_hotel: 'boutique_hotel',
  guesthouse: 'guesthouse',
  bed_and_breakfast: 'bed_and_breakfast',
  eco_lodge: 'eco_lodge',
  heritage_stay: 'heritage_stay',
  design_hotel: 'design_hotel',
  unique_stay: 'unique_stay',
  independent_motel: 'motel',
  eco_resort: 'eco_resort',
  motel: 'motel',
}

async function main() {
  console.log(`\n🏨 Rest Atlas Candidate Seeder${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log('─'.repeat(50))

  // Load candidate data
  const dataPath = join(__dirname, 'data', 'rest-candidates.json')
  let allCandidates
  try {
    allCandidates = JSON.parse(readFileSync(dataPath, 'utf-8'))
  } catch (err) {
    console.error(`Failed to read ${dataPath}: ${err.message}`)
    console.error('Run the research agents first and compile results into scripts/data/rest-candidates.json')
    process.exit(1)
  }

  console.log(`Loaded ${allCandidates.length} candidates from ${dataPath}`)

  // Deduplicate by lowercase name (within the loaded set)
  const seen = new Set()
  const deduped = []
  for (const c of allCandidates) {
    const key = c.name.toLowerCase().trim()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(c)
  }
  console.log(`After dedup: ${deduped.length} unique candidates (removed ${allCandidates.length - deduped.length} duplicates)`)

  // Check existing candidates in DB to avoid wasted inserts
  const { data: existing } = await sb
    .from('listing_candidates')
    .select('name')
    .eq('vertical', 'rest')
    .limit(10000)

  const existingNames = new Set((existing || []).map(c => c.name.toLowerCase().trim()))
  const newCandidates = deduped.filter(c => !existingNames.has(c.name.toLowerCase().trim()))
  console.log(`Already in DB: ${deduped.length - newCandidates.length} | New to insert: ${newCandidates.length}`)

  if (newCandidates.length === 0) {
    console.log('\nNo new candidates to insert.')
    return
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would insert these candidates:')
    const byCityCount = {}
    for (const c of newCandidates) {
      const city = c.city || c.region || 'Unknown'
      byCityCount[city] = (byCityCount[city] || 0) + 1
    }
    for (const [city, count] of Object.entries(byCityCount).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${city}: ${count}`)
    }
    console.log(`\n  Total: ${newCandidates.length}`)
    return
  }

  // Insert individually — PostgREST doesn't support expression-based onConflict
  // so we skip upsert and handle duplicates via error code 23505.
  let inserted = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < newCandidates.length; i++) {
    const c = newCandidates[i]

    const row = {
      name: c.name.trim(),
      website_url: normaliseUrl(c.website) || null,
      region: c.city || c.region || null,
      vertical: 'rest',
      confidence: 0.6,
      source: 'web_search',
      source_detail: `rest_atlas_city_audit_2026_${(c.city || c.region || 'unknown').toLowerCase().replace(/\s+/g, '_')}`,
      notes: [
        c.description ? c.description : null,
        c.category ? `Category: ${CATEGORY_MAP[c.category] || c.category}` : null,
        c.suburb ? `Suburb: ${c.suburb}` : null,
      ].filter(Boolean).join(' | ') || null,
      status: 'pending',
    }

    try {
      const { error: insertErr } = await sb
        .from('listing_candidates')
        .insert(row)

      if (insertErr) {
        if (insertErr.code === '23505') {
          skipped++
        } else {
          console.error(`  Error inserting "${row.name}": ${insertErr.message}`)
          errors++
        }
      } else {
        inserted++
      }
    } catch (err) {
      console.error(`  Fatal error for "${row.name}": ${err.message}`)
      errors++
    }

    if ((i + 1) % BATCH_SIZE === 0 || i === newCandidates.length - 1) {
      process.stdout.write(`\r  Processed ${i + 1}/${newCandidates.length}...`)
    }
  }

  console.log(`\n\n✅ Done!`)
  console.log(`  Inserted: ${inserted}`)
  console.log(`  Skipped (duplicate): ${skipped}`)
  console.log(`  Errors: ${errors}`)

  // Summary by city
  const byCityCount = {}
  for (const c of newCandidates) {
    const city = c.city || c.region || 'Unknown'
    byCityCount[city] = (byCityCount[city] || 0) + 1
  }
  console.log('\nBy city:')
  for (const [city, count] of Object.entries(byCityCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${city}: ${count}`)
  }
}

function normaliseUrl(url) {
  if (!url) return null
  let u = url.trim()
  if (!u) return null
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    u = `https://${u}`
  }
  if (u.startsWith('http://')) {
    u = u.replace(/^http:\/\//, 'https://')
  }
  // Remove trailing slash for consistency
  u = u.replace(/\/+$/, '')
  return u
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
