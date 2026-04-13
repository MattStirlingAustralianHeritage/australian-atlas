#!/usr/bin/env node

/**
 * Audit collections for cross-vertical diversity.
 *
 * Rules:
 *   - Collections should span at least 3 verticals
 *   - No single vertical should represent more than 40% of listings
 *
 * Special handling for "Sydney Makers":
 *   If found failing, auto-fix by selecting a diverse mix of 8 Sydney-area
 *   listings across Found, Corner, Fine Grounds, Culture, and Craft verticals
 *   with quality_score >= 50, max 3 from any single vertical.
 *
 * Usage:
 *   node --env-file=.env.local scripts/audit-collections.mjs
 *   node --env-file=.env.local scripts/audit-collections.mjs --fix
 */

import { createClient } from '@supabase/supabase-js'

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(MASTER_URL, MASTER_KEY)

const doFix = process.argv.includes('--fix')

const VERT_LABELS = {
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

const MAX_VERTICAL_PERCENT = 0.40
const MIN_VERTICALS = 3

// Sydney-area bounding box (approximate greater Sydney metro)
const SYDNEY_BOUNDS = {
  minLat: -34.2,
  maxLat: -33.5,
  minLng: 150.6,
  maxLng: 151.5,
}

// The verticals to draw from for Sydney Makers fix
const SYDNEY_MAKERS_VERTICALS = ['found', 'corner', 'fine_grounds', 'collection', 'craft']
const SYDNEY_MAKERS_TARGET_COUNT = 8
const SYDNEY_MAKERS_MAX_PER_VERTICAL = 3

async function main() {
  console.log('\n=== COLLECTION CROSS-VERTICAL AUDIT ===\n')
  console.log(`Mode: ${doFix ? 'FIX' : 'REPORT ONLY'}`)
  console.log('')

  // Step 1: Fetch all collections
  const { data: collections, error: collErr } = await sb
    .from('collections')
    .select('id, title, slug, listing_ids, vertical, region, published')
    .order('title')

  if (collErr) {
    console.error('Error fetching collections:', collErr.message)
    process.exit(1)
  }

  if (!collections || collections.length === 0) {
    console.log('No collections found.')
    process.exit(0)
  }

  console.log(`Found ${collections.length} collection(s)\n`)

  const results = []

  for (const coll of collections) {
    const listingIds = coll.listing_ids || []

    if (listingIds.length === 0) {
      results.push({
        collection: coll,
        verticalCounts: {},
        totalListings: 0,
        pass: false,
        issues: ['No listings in collection'],
      })
      continue
    }

    // Step 2: Fetch listings for this collection
    const { data: listings, error: listErr } = await sb
      .from('listings')
      .select('id, name, vertical, quality_score')
      .in('id', listingIds)
      .eq('status', 'active')

    if (listErr) {
      console.error(`  Error fetching listings for "${coll.title}":`, listErr.message)
      continue
    }

    // Step 3: Count verticals
    const verticalCounts = {}
    for (const l of (listings || [])) {
      const v = l.vertical || 'unknown'
      verticalCounts[v] = (verticalCounts[v] || 0) + 1
    }

    const totalListings = listings?.length || 0
    const uniqueVerticals = Object.keys(verticalCounts).length
    const issues = []

    // Step 4: Check vertical distribution
    for (const [vert, count] of Object.entries(verticalCounts)) {
      const pct = count / totalListings
      if (pct > MAX_VERTICAL_PERCENT) {
        issues.push(
          `${VERT_LABELS[vert] || vert} is ${(pct * 100).toFixed(0)}% (${count}/${totalListings}) — exceeds 40% limit`
        )
      }
    }

    if (uniqueVerticals < MIN_VERTICALS && totalListings >= MIN_VERTICALS) {
      issues.push(
        `Only ${uniqueVerticals} vertical(s) represented — need at least ${MIN_VERTICALS}`
      )
    }

    const pass = issues.length === 0

    results.push({
      collection: coll,
      verticalCounts,
      totalListings,
      uniqueVerticals,
      pass,
      issues,
    })
  }

  // ── Report ──────────────────────────────────────────────────
  console.log('─── RESULTS ─────────────────────────────────────\n')

  let passCount = 0
  let failCount = 0

  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL'
    const marker = r.pass ? '' : ' !!!'
    console.log(`  [${status}] ${r.collection.title}${marker}`)
    console.log(`    Listings: ${r.totalListings} | Verticals: ${r.uniqueVerticals || 0}`)

    // Show vertical breakdown
    const breakdown = Object.entries(r.verticalCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([v, c]) => `${VERT_LABELS[v] || v}: ${c}`)
      .join(', ')
    if (breakdown) {
      console.log(`    Breakdown: ${breakdown}`)
    }

    if (!r.pass) {
      for (const issue of r.issues) {
        console.log(`    Issue: ${issue}`)
      }

      // Suggest which verticals to add
      const presentVerticals = new Set(Object.keys(r.verticalCounts))
      const allVerticals = Object.keys(VERT_LABELS)
      const missingVerticals = allVerticals.filter(v => !presentVerticals.has(v))
      if (missingVerticals.length > 0) {
        const suggestions = missingVerticals.map(v => VERT_LABELS[v] || v).join(', ')
        console.log(`    Suggestion: Add listings from: ${suggestions}`)
      }

      failCount++
    } else {
      passCount++
    }

    console.log('')
  }

  // ── Fix Sydney Makers ───────────────────────────────────────
  if (doFix) {
    const sydneyMakers = results.find(
      r => r.collection.slug === 'sydney-makers' && !r.pass
    )

    if (sydneyMakers) {
      console.log('─── FIXING "Sydney Makers" ──────────────────────\n')
      await fixSydneyMakers(sydneyMakers.collection)
    } else if (results.find(r => r.collection.slug === 'sydney-makers')) {
      console.log('  "Sydney Makers" already passes cross-vertical check.\n')
    }
  }

  // ── Summary ─────────────────────────────────────────────────
  console.log('─── SUMMARY ─────────────────────────────────────\n')
  console.log(`  Total collections: ${results.length}`)
  console.log(`  Passing:           ${passCount}`)
  console.log(`  Failing:           ${failCount}`)
  console.log('\nDone.\n')
}

async function fixSydneyMakers(collection) {
  // Fetch all active Sydney-area listings across target verticals with quality_score >= 50
  const { data: candidates, error } = await sb
    .from('listings')
    .select('id, name, vertical, quality_score, lat, lng, region, state')
    .eq('status', 'active')
    .in('vertical', SYDNEY_MAKERS_VERTICALS)
    .gte('quality_score', 50)
    .in('state', ['NSW'])
    .order('quality_score', { ascending: false })

  if (error) {
    console.error('  Error fetching Sydney-area listings:', error.message)
    return
  }

  if (!candidates || candidates.length === 0) {
    console.log('  No qualifying Sydney-area listings found.')
    return
  }

  // Filter to listings in/near Sydney by coordinates (if available) or by state
  const sydneyListings = candidates.filter(l => {
    if (l.lat && l.lng) {
      const lat = parseFloat(l.lat)
      const lng = parseFloat(l.lng)
      return (
        lat >= SYDNEY_BOUNDS.minLat &&
        lat <= SYDNEY_BOUNDS.maxLat &&
        lng >= SYDNEY_BOUNDS.minLng &&
        lng <= SYDNEY_BOUNDS.maxLng
      )
    }
    // If no coords, accept NSW listings with Sydney-related regions
    const region = (l.region || '').toLowerCase()
    return region.includes('sydney') || region.includes('inner west') ||
           region.includes('eastern suburbs') || region.includes('northern beaches')
  })

  console.log(`  Found ${sydneyListings.length} qualifying Sydney-area listings`)

  // Group by vertical
  const byVertical = {}
  for (const l of sydneyListings) {
    if (!byVertical[l.vertical]) byVertical[l.vertical] = []
    byVertical[l.vertical].push(l)
  }

  console.log('  Available by vertical:')
  for (const [v, items] of Object.entries(byVertical)) {
    console.log(`    ${(VERT_LABELS[v] || v).padEnd(14)} ${items.length} listings`)
  }

  // Select a diverse mix: round-robin across verticals, max 3 per vertical
  const selected = []
  const verticalUsed = {}
  const verticals = Object.keys(byVertical)

  // Sort verticals so we pick from less-represented ones first
  let round = 0
  while (selected.length < SYDNEY_MAKERS_TARGET_COUNT && round < 10) {
    for (const v of verticals) {
      if (selected.length >= SYDNEY_MAKERS_TARGET_COUNT) break
      const used = verticalUsed[v] || 0
      if (used >= SYDNEY_MAKERS_MAX_PER_VERTICAL) continue
      const available = byVertical[v]
      if (used >= available.length) continue

      selected.push(available[used])
      verticalUsed[v] = used + 1
    }
    round++
  }

  if (selected.length === 0) {
    console.log('  Could not select any listings for Sydney Makers.')
    return
  }

  console.log(`\n  Selected ${selected.length} listings:`)
  for (const l of selected) {
    console.log(`    ${(VERT_LABELS[l.vertical] || l.vertical).padEnd(14)} ${l.name} (qs=${l.quality_score})`)
  }

  // Update the collection
  const newIds = selected.map(l => l.id)
  const { error: updateErr } = await sb
    .from('collections')
    .update({ listing_ids: newIds })
    .eq('id', collection.id)

  if (updateErr) {
    console.error(`\n  ERROR updating collection: ${updateErr.message}`)
  } else {
    console.log(`\n  Successfully updated "Sydney Makers" with ${newIds.length} diverse listings.`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
