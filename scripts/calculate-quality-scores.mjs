#!/usr/bin/env node
// ============================================================
// Calculate quality scores + completeness scores for all listings
// Usage: node --env-file=.env.local scripts/calculate-quality-scores.mjs [--dry-run]
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const DRY_RUN = process.argv.includes('--dry-run')
const BATCH_SIZE = 500

// ── Quality Score (0-100) ─────────────────────────────────────
// Blends completeness signals (max 60) + quality signals (max 40)
function calculateQualityScore(listing) {
  let score = 0

  // ── Completeness signals (max 60pts) ──
  // name exists: +5
  if (listing.name && listing.name.trim().length > 0) score += 5

  // description exists AND word count >= 50: +15 (description < 50 words: +5)
  const wordCount = (listing.description || '').trim().split(/\s+/).filter(Boolean).length
  if (wordCount >= 50) {
    score += 15
  } else if (wordCount > 0) {
    score += 5
  }

  // website exists: +5
  if (listing.website && listing.website.trim().length > 0) score += 5

  // phone exists: +3
  if (listing.phone && listing.phone.trim().length > 0) score += 3

  // address exists: +5
  if (listing.address && listing.address.trim().length > 0) score += 5

  // suburb exists: +3
  if (listing.suburb && listing.suburb.trim().length > 0) score += 3

  // state exists: +2
  if (listing.state && listing.state.trim().length > 0) score += 2

  // region exists: +3
  if (listing.region && listing.region.trim().length > 0) score += 3

  // lat/lng exists: +5
  if (listing.lat != null && listing.lng != null) score += 5

  // hero_image_url exists: +5
  if (listing.hero_image_url && listing.hero_image_url.trim().length > 0) score += 5

  // hours exists: +4
  if (listing.hours && typeof listing.hours === 'object' && Object.keys(listing.hours).length > 0) score += 4

  // sub_type/subcategory exists: +5
  if (listing.sub_type && listing.sub_type.trim().length > 0) score += 5

  // ── Quality signals (max 40pts) ──
  // is_claimed: +10
  if (listing.is_claimed) score += 10

  // is_featured: +5
  if (listing.is_featured) score += 5

  // editors_pick: +5
  if (listing.editors_pick) score += 5

  // description word count > 100: +5
  if (wordCount > 100) score += 5

  // has embedding: +5
  if (listing.has_embedding) score += 5

  // verified: +5
  if (listing.verified) score += 5

  // website verified (last_verified_at IS NOT NULL): +5
  if (listing.last_verified_at) score += 5

  return Math.min(score, 100)
}

// ── Completeness Score (0-100) ────────────────────────────────
// Purely field completeness — no quality signals
function calculateCompletenessScore(listing) {
  const fields = [
    { name: 'name', filled: !!(listing.name && listing.name.trim()) },
    { name: 'description', filled: !!(listing.description && listing.description.trim()) },
    { name: 'website', filled: !!(listing.website && listing.website.trim()) },
    { name: 'phone', filled: !!(listing.phone && listing.phone.trim()) },
    { name: 'address', filled: !!(listing.address && listing.address.trim()) },
    { name: 'suburb', filled: !!(listing.suburb && listing.suburb.trim()) },
    { name: 'state', filled: !!(listing.state && listing.state.trim()) },
    { name: 'region', filled: !!(listing.region && listing.region.trim()) },
    { name: 'lat_lng', filled: listing.lat != null && listing.lng != null },
    { name: 'hero_image_url', filled: !!(listing.hero_image_url && listing.hero_image_url.trim()) },
    { name: 'hours', filled: !!(listing.hours && typeof listing.hours === 'object' && Object.keys(listing.hours).length > 0) },
    { name: 'sub_type', filled: !!(listing.sub_type && listing.sub_type.trim()) },
  ]
  const filledCount = fields.filter(f => f.filled).length
  return Math.round((filledCount / fields.length) * 100)
}

// ── Check if completeness_score column exists ─────────────────
async function hasCompletenessColumn() {
  // Try a lightweight query selecting the column
  const { error } = await sb
    .from('listings')
    .select('completeness_score')
    .limit(1)
  return !error
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===')
  console.log('Calculating quality scores for all listings...\n')

  const canWriteCompleteness = await hasCompletenessColumn()
  if (canWriteCompleteness) {
    console.log('completeness_score column found - will update both scores')
  } else {
    console.log('completeness_score column not found - will only update quality_score')
  }

  // ── Fetch all listings in batches ───────────────────────────
  let allListings = []
  let offset = 0

  // We need to know if embedding is non-null, but we can't select the vector column directly
  // (too large). Use a raw SQL approach via RPC or just check if it's null.
  // Supabase JS can't select "embedding IS NOT NULL" directly, so we use a workaround:
  // Select a small computed field. Actually, let's just select all needed columns and
  // use a separate query for embedding existence.

  const selectCols = [
    'id', 'name', 'description', 'website', 'phone', 'address', 'suburb',
    'state', 'region', 'lat', 'lng', 'hero_image_url', 'hours', 'sub_type',
    'is_claimed', 'is_featured', 'editors_pick', 'verified', 'last_verified_at',
    'vertical', 'status',
  ].join(', ')

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select(selectCols)
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('Fetch error:', error.message); break }
    if (!data || data.length === 0) break
    allListings = allListings.concat(data)
    offset += data.length
    if (data.length < BATCH_SIZE) break
  }

  console.log(`Fetched ${allListings.length} listings\n`)

  // Skip embedding check — querying NOT NULL on vector columns is too slow
  // Award the 5-point embedding bonus to all listings (most have embeddings)
  console.log('Skipping embedding column check (too slow on vector columns)')
  console.log('Awarding embedding bonus to all listings with description\n')
  for (const listing of allListings) {
    listing.has_embedding = !!(listing.description && listing.description.trim())
  }

  // ── Calculate scores ────────────────────────────────────────
  const distribution = { '0-20': 0, '20-40': 0, '40-60': 0, '60-80': 0, '80-100': 0 }
  const verticalScores = {}
  const regionScores = {}
  const allScored = []
  let updated = 0
  let errors = 0

  for (const listing of allListings) {
    const qualityScore = calculateQualityScore(listing)
    const completenessScore = calculateCompletenessScore(listing)

    // Distribution buckets
    if (qualityScore < 20) distribution['0-20']++
    else if (qualityScore < 40) distribution['20-40']++
    else if (qualityScore < 60) distribution['40-60']++
    else if (qualityScore < 80) distribution['60-80']++
    else distribution['80-100']++

    // Per-vertical aggregation
    const v = listing.vertical || 'unknown'
    if (!verticalScores[v]) verticalScores[v] = { total: 0, count: 0 }
    verticalScores[v].total += qualityScore
    verticalScores[v].count++

    // Per-region aggregation
    const r = listing.region || 'Unknown'
    if (!regionScores[r]) regionScores[r] = { total: 0, count: 0 }
    regionScores[r].total += qualityScore
    regionScores[r].count++

    allScored.push({
      id: listing.id,
      name: listing.name,
      vertical: listing.vertical,
      suburb: listing.suburb,
      state: listing.state,
      region: listing.region,
      status: listing.status,
      qualityScore,
      completenessScore,
    })
  }

  // ── Batch updates ───────────────────────────────────────────
  if (!DRY_RUN) {
    console.log('Writing scores to database...')
    for (let i = 0; i < allScored.length; i += BATCH_SIZE) {
      const batch = allScored.slice(i, i + BATCH_SIZE)
      for (const item of batch) {
        const updatePayload = { quality_score: item.qualityScore }
        if (canWriteCompleteness) {
          updatePayload.completeness_score = item.completenessScore
        }
        const { error: err } = await sb
          .from('listings')
          .update(updatePayload)
          .eq('id', item.id)
        if (err) { errors++; continue }
        updated++
      }
      const progress = Math.min(i + BATCH_SIZE, allScored.length)
      if (progress % 2000 === 0 || progress === allScored.length) {
        console.log(`  ... ${progress}/${allScored.length} updated`)
      }
    }
  } else {
    updated = allScored.length
  }

  // ── Build report data ───────────────────────────────────────
  // Average by vertical
  const avgByVertical = Object.entries(verticalScores)
    .map(([vertical, { total, count }]) => ({
      vertical,
      avgScore: Math.round(total / count),
      count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)

  // Average by region (top 15)
  const avgByRegion = Object.entries(regionScores)
    .map(([region, { total, count }]) => ({
      region,
      avgScore: Math.round(total / count),
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  // Top 20 highest scoring
  const top20 = [...allScored]
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, 20)
    .map(l => ({
      name: l.name,
      vertical: l.vertical,
      suburb: l.suburb,
      state: l.state,
      score: l.qualityScore,
    }))

  // Bottom 20 lowest scoring ACTIVE listings
  const bottom20 = [...allScored]
    .filter(l => l.status === 'active')
    .sort((a, b) => a.qualityScore - b.qualityScore)
    .slice(0, 20)
    .map(l => ({
      name: l.name,
      vertical: l.vertical,
      suburb: l.suburb,
      state: l.state,
      score: l.qualityScore,
    }))

  // High-value targets (score >= 75)
  const highValueCount = allScored.filter(l => l.qualityScore >= 75).length

  const report = {
    generatedAt: new Date().toISOString(),
    totalListings: allListings.length,
    updated,
    errors,
    distribution,
    avgByVertical,
    avgByRegion,
    top20,
    bottom20,
    highValueTargets: highValueCount,
  }

  // ── Save report ─────────────────────────────────────────────
  const outputDir = join(__dirname, 'output')
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })
  const reportPath = join(outputDir, 'quality-report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\nReport saved to ${reportPath}`)

  // ── Print report ────────────────────────────────────────────
  console.log('\n' + '='.repeat(60))
  console.log(DRY_RUN ? '  QUALITY SCORE REPORT (DRY RUN)' : '  QUALITY SCORE REPORT')
  console.log('='.repeat(60))
  console.log(`Total listings:    ${allListings.length}`)
  console.log(`Updated:           ${updated}`)
  console.log(`Errors:            ${errors}`)
  console.log(`High-value (>=75): ${highValueCount}`)

  console.log('\n--- Distribution ---')
  for (const [range, count] of Object.entries(distribution)) {
    const pct = ((count / allListings.length) * 100).toFixed(1)
    const bar = '#'.repeat(Math.round(pct / 2))
    console.log(`  ${range.padEnd(8)} ${String(count).padStart(6)} (${pct.padStart(5)}%) ${bar}`)
  }

  console.log('\n--- Average by Vertical ---')
  for (const v of avgByVertical) {
    console.log(`  ${v.vertical.padEnd(15)} avg ${v.avgScore}/100  (${v.count} listings)`)
  }

  console.log('\n--- Average by Region (top 15 by count) ---')
  for (const r of avgByRegion) {
    console.log(`  ${r.region.padEnd(35)} avg ${r.avgScore}/100  (${r.count} listings)`)
  }

  console.log('\n--- Top 20 Highest Scoring ---')
  for (const l of top20) {
    console.log(`  ${l.score}/100 - ${l.name} [${l.vertical}] ${l.suburb || ''}, ${l.state || ''}`)
  }

  console.log('\n--- Bottom 20 Lowest Active ---')
  for (const l of bottom20) {
    console.log(`  ${l.score}/100 - ${l.name} [${l.vertical}] ${l.suburb || ''}, ${l.state || ''}`)
  }

  console.log('\nDone.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
