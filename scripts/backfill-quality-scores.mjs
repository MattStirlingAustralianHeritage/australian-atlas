#!/usr/bin/env node
// ============================================================
// Backfill quality scores for all active listings
// Uses the standardised 0-100 scoring rubric with meta table checks
//
// Usage:
//   node --env-file=.env.local scripts/backfill-quality-scores.mjs
//   node --env-file=.env.local scripts/backfill-quality-scores.mjs --dry-run
// ============================================================

import { createClient } from '@supabase/supabase-js'

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(MASTER_URL, MASTER_KEY)
const DRY_RUN = process.argv.includes('--dry-run')
const BATCH_SIZE = 500

// ── Meta table mapping by vertical ───────────────────────────
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

const VERTICAL_LABELS = {
  sba: 'Small Batch',
  collection: 'Culture',
  craft: 'Craft',
  fine_grounds: 'Fine Grounds',
  rest: 'Rest',
  field: 'Field',
  corner: 'Corner',
  found: 'Found',
  table: 'Table',
}

// ── Quality Score (0-100) ────────────────────────────────────
// Scoring rubric:
//   Has description (>= 50 words):    +15
//   Has address:                       +10
//   Has phone:                         +5
//   Has website:                       +10
//   Has hero_image_url:                +15
//   Has lat/lng coordinates:           +10
//   Has region assigned:               +5
//   Has sub_type set:                  +5
//   Description > 100 words:           +5 bonus
//   Description > 200 words:           +5 bonus
//   Has meta table entry:              +10
//   Is claimed (is_claimed = true):    +5
//   Total max:                         100
// ─────────────────────────────────────────────────────────────
function calculateQualityScore(listing, hasMeta) {
  let score = 0

  // Description: must be >= 50 words for the full +15
  const wordCount = (listing.description || '').trim().split(/\s+/).filter(Boolean).length
  if (wordCount >= 50) score += 15

  // Address
  if (listing.address && listing.address.trim().length > 0) score += 10

  // Phone
  if (listing.phone && listing.phone.trim().length > 0) score += 5

  // Website
  if (listing.website && listing.website.trim().length > 0) score += 10

  // Hero image
  if (listing.hero_image_url && listing.hero_image_url.trim().length > 0) score += 15

  // Lat/lng coordinates
  if (listing.lat != null && listing.lng != null) score += 10

  // Region assigned
  if (listing.region && listing.region.trim().length > 0) score += 5

  // Sub-type set
  if (listing.sub_type && listing.sub_type.trim().length > 0) score += 5

  // Description bonuses
  if (wordCount > 100) score += 5
  if (wordCount > 200) score += 5

  // Has meta table entry
  if (hasMeta) score += 10

  // Is claimed
  if (listing.is_claimed) score += 5

  return Math.min(score, 100)
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '='.repeat(60))
  console.log(DRY_RUN ? '  QUALITY SCORE BACKFILL (DRY RUN)' : '  QUALITY SCORE BACKFILL')
  console.log('='.repeat(60))
  console.log()

  // ── Step 1: Fetch all active listings ──────────────────────
  const selectCols = [
    'id', 'name', 'description', 'website', 'phone', 'address',
    'lat', 'lng', 'hero_image_url', 'sub_type', 'region',
    'is_claimed', 'vertical', 'status', 'slug', 'suburb', 'state',
  ].join(', ')

  let allListings = []
  let offset = 0

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select(selectCols)
      .eq('status', 'active')
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('Fetch error:', error.message); break }
    if (!data || data.length === 0) break
    allListings = allListings.concat(data)
    offset += data.length
    if (data.length < BATCH_SIZE) break
  }

  console.log(`Fetched ${allListings.length} active listings`)

  // ── Step 2: Check meta table existence per vertical ────────
  // Group listings by vertical
  const byVertical = {}
  for (const listing of allListings) {
    const v = listing.vertical || 'unknown'
    if (!byVertical[v]) byVertical[v] = []
    byVertical[v].push(listing)
  }

  // For each vertical, check which listing_ids have a meta row
  const metaSet = new Set()

  for (const [vertical, listings] of Object.entries(byVertical)) {
    const metaTable = META_TABLES[vertical]
    if (!metaTable) continue

    const listingIds = listings.map(l => l.id)

    // Fetch in batches (Supabase .in() has limits)
    for (let i = 0; i < listingIds.length; i += BATCH_SIZE) {
      const batchIds = listingIds.slice(i, i + BATCH_SIZE)
      const { data: metaRows, error } = await sb
        .from(metaTable)
        .select('listing_id')
        .in('listing_id', batchIds)

      if (!error && metaRows) {
        for (const row of metaRows) {
          metaSet.add(row.listing_id)
        }
      }
    }
  }

  console.log(`Found ${metaSet.size} listings with meta table entries\n`)

  // ── Step 3: Calculate scores ───────────────────────────────
  const distribution = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 }
  const verticalScores = {}
  const allScored = []

  for (const listing of allListings) {
    const hasMeta = metaSet.has(listing.id)
    const qualityScore = calculateQualityScore(listing, hasMeta)

    // Distribution buckets
    if (qualityScore <= 20) distribution['0-20']++
    else if (qualityScore <= 40) distribution['21-40']++
    else if (qualityScore <= 60) distribution['41-60']++
    else if (qualityScore <= 80) distribution['61-80']++
    else distribution['81-100']++

    // Per-vertical aggregation
    const v = listing.vertical || 'unknown'
    if (!verticalScores[v]) verticalScores[v] = { total: 0, count: 0 }
    verticalScores[v].total += qualityScore
    verticalScores[v].count++

    allScored.push({
      id: listing.id,
      name: listing.name,
      vertical: listing.vertical,
      slug: listing.slug,
      suburb: listing.suburb,
      state: listing.state,
      region: listing.region,
      qualityScore,
    })
  }

  // ── Step 4: Batch update quality_score column ──────────────
  let updated = 0
  let errors = 0

  if (!DRY_RUN) {
    console.log('Writing quality_score to database...')
    for (let i = 0; i < allScored.length; i += BATCH_SIZE) {
      const batch = allScored.slice(i, i + BATCH_SIZE)
      for (const item of batch) {
        const { error: err } = await sb
          .from('listings')
          .update({ quality_score: item.qualityScore })
          .eq('id', item.id)
        if (err) { errors++; continue }
        updated++
      }
      const progress = Math.min(i + BATCH_SIZE, allScored.length)
      if (progress % 1000 === 0 || progress === allScored.length) {
        console.log(`  ... ${progress}/${allScored.length} updated`)
      }
    }
  } else {
    updated = allScored.length
  }

  // ── Step 5: Print report ───────────────────────────────────
  console.log('\n' + '='.repeat(60))
  console.log('  DISTRIBUTION')
  console.log('='.repeat(60))

  const total = allScored.length
  for (const [range, count] of Object.entries(distribution)) {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
    const bar = '#'.repeat(Math.round(parseFloat(pct) / 2))
    console.log(`  ${range.padEnd(8)} ${String(count).padStart(6)} (${pct.padStart(5)}%) ${bar}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('  AVERAGE BY VERTICAL')
  console.log('='.repeat(60))

  const avgByVertical = Object.entries(verticalScores)
    .map(([vertical, { total, count }]) => ({
      vertical,
      label: VERTICAL_LABELS[vertical] || vertical,
      avg: Math.round(total / count),
      count,
    }))
    .sort((a, b) => b.avg - a.avg)

  for (const v of avgByVertical) {
    console.log(`  ${v.label.padEnd(16)} avg ${String(v.avg).padStart(3)}/100  (${v.count} listings)`)
  }

  // Top 20 highest
  const top20 = [...allScored]
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, 20)

  console.log('\n' + '='.repeat(60))
  console.log('  TOP 20 HIGHEST SCORING')
  console.log('='.repeat(60))

  for (const l of top20) {
    const location = [l.suburb, l.state].filter(Boolean).join(', ')
    console.log(`  ${String(l.qualityScore).padStart(3)}/100 - ${l.name} [${l.vertical}] ${location}`)
  }

  // Bottom 20 lowest
  const bottom20 = [...allScored]
    .sort((a, b) => a.qualityScore - b.qualityScore)
    .slice(0, 20)

  console.log('\n' + '='.repeat(60))
  console.log('  BOTTOM 20 LOWEST SCORING')
  console.log('='.repeat(60))

  for (const l of bottom20) {
    const location = [l.suburb, l.state].filter(Boolean).join(', ')
    console.log(`  ${String(l.qualityScore).padStart(3)}/100 - ${l.name} [${l.vertical}] ${location}`)
  }

  // Summary
  const overallAvg = total > 0
    ? Math.round(allScored.reduce((s, l) => s + l.qualityScore, 0) / total)
    : 0

  console.log('\n' + '='.repeat(60))
  console.log('  SUMMARY')
  console.log('='.repeat(60))
  console.log(`  Total scored:  ${total}`)
  console.log(`  Updated:       ${updated}`)
  console.log(`  Errors:        ${errors}`)
  console.log(`  Overall avg:   ${overallAvg}/100`)
  console.log('\nDone.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
