#!/usr/bin/env node
// ============================================================
// Calculate quality scores for all listings (0-100)
// Usage: node --env-file=.env.local scripts/calculate-quality-scores.mjs [--dry-run]
// ============================================================

import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const DRY_RUN = process.argv.includes('--dry-run')
const BATCH_SIZE = 500

/**
 * Quality score rubric (0-100):
 *   Verified coordinates within 2km of address  → 20pts
 *   Description of 50+ words                    → 20pts
 *   Working website URL                         → 20pts
 *   Correct region assignment                   → 15pts
 *   Subcategory set                             → 10pts
 *   Hero image present                          → 10pts
 *   Phone number present                        → 5pts
 */
function calculateScore(listing) {
  let score = 0
  const breakdown = []

  // 1. Coordinates present and not obviously wrong (20pts)
  if (listing.lat && listing.lng &&
      listing.lat >= -44 && listing.lat <= -10 &&
      listing.lng >= 112 && listing.lng <= 154) {
    score += 20
    breakdown.push('coords:20')
  }

  // 2. Description of 50+ words (20pts)
  const wordCount = (listing.description || '').trim().split(/\s+/).filter(Boolean).length
  if (wordCount >= 50) {
    score += 20
    breakdown.push('desc:20')
  } else if (wordCount >= 20) {
    score += 10
    breakdown.push('desc:10')
  }

  // 3. Website URL present (20pts)
  if (listing.website && listing.website.startsWith('http')) {
    score += 20
    breakdown.push('website:20')
  }

  // 4. Region assigned (15pts)
  if (listing.region && listing.region.length > 0) {
    score += 15
    breakdown.push('region:15')
  }

  // 5. Subcategory set (10pts)
  if (listing.sub_type && listing.sub_type.length > 0) {
    score += 10
    breakdown.push('subtype:10')
  }

  // 6. Hero image present (10pts)
  if (listing.hero_image_url && listing.hero_image_url.startsWith('http')) {
    score += 10
    breakdown.push('image:10')
  }

  // 7. Phone number present (5pts)
  if (listing.phone && listing.phone.length >= 8) {
    score += 5
    breakdown.push('phone:5')
  }

  return { score, breakdown }
}

/**
 * Completeness score — distinct from quality, surfaces to operators
 */
function calculateCompleteness(listing) {
  const checks = [
    { name: 'Description', met: (listing.description || '').trim().split(/\s+/).length >= 20 },
    { name: 'Photo', met: !!listing.hero_image_url },
    { name: 'Website', met: !!listing.website },
    { name: 'Address', met: !!listing.address },
    { name: 'Region', met: !!listing.region },
    { name: 'Phone', met: !!listing.phone },
    { name: 'Subcategory', met: !!listing.sub_type },
    { name: 'Hours', met: !!listing.hours },
    { name: 'Coordinates', met: !!(listing.lat && listing.lng) },
    { name: 'State', met: !!listing.state },
  ]
  const met = checks.filter(c => c.met).length
  return Math.round((met / checks.length) * 100)
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===')

  let allListings = []
  let offset = 0

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, description, website, region, state, sub_type, hero_image_url, phone, lat, lng, address, hours, is_claimed, is_featured')
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('Fetch error:', error.message); break }
    if (!data || data.length === 0) break
    allListings = allListings.concat(data)
    offset += data.length
    if (data.length < BATCH_SIZE) break
  }

  console.log(`Fetched ${allListings.length} listings\n`)

  const distribution = { '0-19': 0, '20-39': 0, '40-59': 0, '60-79': 0, '80-100': 0 }
  let updated = 0
  let errors = 0

  for (let i = 0; i < allListings.length; i += BATCH_SIZE) {
    const batch = allListings.slice(i, i + BATCH_SIZE)
    const updates = batch.map(listing => {
      const { score } = calculateScore(listing)
      const completeness = calculateCompleteness(listing)

      if (score < 20) distribution['0-19']++
      else if (score < 40) distribution['20-39']++
      else if (score < 60) distribution['40-59']++
      else if (score < 80) distribution['60-79']++
      else distribution['80-100']++

      return { id: listing.id, quality_score: score, completeness_score: completeness }
    })

    if (!DRY_RUN) {
      // Batch update using individual updates (Supabase doesn't support bulk upsert on id efficiently)
      for (const u of updates) {
        const { error: err } = await sb
          .from('listings')
          .update({ quality_score: u.quality_score, completeness_score: u.completeness_score })
          .eq('id', u.id)
        if (err) { errors++; continue }
        updated++
      }
    } else {
      updated += updates.length
    }

    if ((i + BATCH_SIZE) % 2000 === 0) {
      console.log(`  ... ${Math.min(i + BATCH_SIZE, allListings.length)}/${allListings.length} processed`)
    }
  }

  console.log('\n' + '═'.repeat(50))
  console.log(DRY_RUN ? 'DRY RUN SUMMARY' : 'SUMMARY')
  console.log('═'.repeat(50))
  console.log(`Total listings:   ${allListings.length}`)
  console.log(`Updated:          ${updated}`)
  console.log(`Errors:           ${errors}`)
  console.log(`\nQuality score distribution:`)
  for (const [range, count] of Object.entries(distribution)) {
    const pct = ((count / allListings.length) * 100).toFixed(1)
    const bar = '█'.repeat(Math.round(pct / 2))
    console.log(`  ${range.padEnd(7)} ${String(count).padStart(5)} (${pct.padStart(5)}%) ${bar}`)
  }

  // Top 10 highest quality
  const scored = allListings.map(l => ({ name: l.name, vertical: l.vertical, ...calculateScore(l) }))
  scored.sort((a, b) => b.score - a.score)
  console.log(`\nTop 10 highest quality:`)
  for (const s of scored.slice(0, 10)) {
    console.log(`  ${s.score}/100 — ${s.name} [${s.breakdown.join(', ')}]`)
  }

  // Bottom 10
  console.log(`\nBottom 10 lowest quality:`)
  for (const s of scored.slice(-10).reverse()) {
    console.log(`  ${s.score}/100 — ${s.name} [${s.breakdown.join(', ')}]`)
  }

  console.log('\nDone.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
