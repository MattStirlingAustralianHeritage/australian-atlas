#!/usr/bin/env node

/**
 * Fix metro region assignments.
 *
 * Many inner-city listings are incorrectly assigned to nearby regional areas
 * (e.g. Rippon Lea Estate in Elsternwick showing "Yarra Valley") because:
 * 1. The source vertical had wrong sub_region data
 * 2. No metro regions existed to assign them to
 *
 * This script:
 * 1. Defines metro bounding boxes for Australian capital cities
 * 2. Finds listings whose coordinates fall within a metro area
 *    but whose current region doesn't match the metro name
 * 3. Reassigns them to the correct metro region
 *
 * Usage:
 *   node --env-file=.env.local scripts/fix-metro-regions.mjs [--dry-run]
 *
 * Requires: Migration 063 (metro regions) to be applied first.
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const dryRun = process.argv.includes('--dry-run')

// Metro bounding boxes: [south, west, north, east]
// These cover the inner/middle suburbs of each city — NOT the full metro area.
// Listings outside these boxes but near the city are left as-is (they're likely
// in legitimate suburban/peri-urban regions).
const METRO_AREAS = {
  Melbourne: {
    south: -37.92,
    west: 144.85,
    north: -37.72,
    east: 145.10,
    state: 'VIC',
    // Known regional regions that overlap — if a listing is inside this box
    // AND assigned to one of these, it's almost certainly wrong
    wrongRegions: [
      'Yarra Valley', 'Mornington Peninsula', 'Macedon Ranges',
      'Bellarine Peninsula', 'Daylesford', 'Daylesford & Hepburn Springs',
      'Great Ocean Road', 'Gippsland', 'Central Victoria',
    ],
  },
  Sydney: {
    south: -33.95,
    west: 151.10,
    north: -33.78,
    east: 151.30,
    state: 'NSW',
    wrongRegions: [
      'Blue Mountains', 'Southern Highlands', 'Hunter Valley',
      'Central Coast', 'South Coast NSW', 'Shoalhaven',
    ],
  },
  Brisbane: {
    south: -27.55,
    west: 152.92,
    north: -27.38,
    east: 153.12,
    state: 'QLD',
    wrongRegions: [
      'Gold Coast Hinterland', 'Sunshine Coast Hinterland',
      'Noosa Hinterland', 'Scenic Rim', 'Toowoomba & Darling Downs',
    ],
  },
  Adelaide: {
    south: -35.02,
    west: 138.52,
    north: -34.82,
    east: 138.72,
    state: 'SA',
    wrongRegions: [
      'Adelaide Hills', 'McLaren Vale', 'Barossa Valley',
      'Clare Valley', 'Flinders Ranges',
    ],
  },
  Perth: {
    south: -32.02,
    west: 115.78,
    north: -31.88,
    east: 115.92,
    state: 'WA',
    wrongRegions: [
      'Fremantle & Swan Valley', 'Margaret River', 'Great Southern',
    ],
  },
  'Hobart City': {
    south: -42.92,
    west: 147.28,
    north: -42.84,
    east: 147.38,
    state: 'TAS',
    wrongRegions: [
      'Hobart & Southern Tasmania', 'Bruny Island',
      'East Coast Tasmania', 'Cradle Country',
    ],
  },
  Newcastle: {
    south: -32.97,
    west: 151.72,
    north: -32.88,
    east: 151.82,
    state: 'NSW',
    wrongRegions: [
      'Hunter Valley', 'Central Coast', 'Port Stephens',
    ],
  },
}

async function main() {
  console.log(`Metro Region Fixer${dryRun ? ' (DRY RUN)' : ''}\n`)

  let totalFixed = 0
  let totalSkipped = 0

  for (const [metroName, box] of Object.entries(METRO_AREAS)) {
    console.log(`\n=== ${metroName} ===`)
    console.log(`  Bounding box: ${box.south},${box.west} → ${box.north},${box.east}`)

    // Find all active listings within this metro bounding box
    const { data: listings, error } = await supabase
      .from('listings')
      .select('id, name, slug, vertical, region, state, lat, lng, address')
      .eq('status', 'active')
      .eq('state', box.state)
      .gte('lat', box.south)
      .lte('lat', box.north)
      .gte('lng', box.west)
      .lte('lng', box.east)
      .not('lat', 'is', null)
      .not('lng', 'is', null)

    if (error) {
      console.error(`  Error fetching: ${error.message}`)
      continue
    }

    if (!listings || listings.length === 0) {
      console.log('  No listings in bounding box')
      continue
    }

    console.log(`  Found ${listings.length} listings in bounding box`)

    // Filter to those with wrong regions
    const needsFix = listings.filter(l => {
      // Already correct
      if (l.region === metroName) return false

      // No region — should be assigned
      if (!l.region) return true

      // Has a known-wrong regional region
      if (box.wrongRegions.some(wr => l.region === wr)) return true

      return false
    })

    // Also find listings with null region
    const nullRegion = listings.filter(l => !l.region)
    const wrongRegion = needsFix.filter(l => l.region && l.region !== metroName)

    console.log(`  ${nullRegion.length} with null region`)
    console.log(`  ${wrongRegion.length} with wrong regional region`)

    if (needsFix.length === 0) {
      console.log('  All regions correct, skipping')
      continue
    }

    // Report what will change
    const regionCounts = {}
    for (const l of needsFix) {
      const from = l.region || '(null)'
      regionCounts[from] = (regionCounts[from] || 0) + 1
    }
    console.log('  Region reassignments:')
    for (const [from, count] of Object.entries(regionCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${from} → ${metroName}: ${count} listings`)
    }

    // Show sample listings being fixed
    const samples = needsFix.slice(0, 5)
    console.log('  Sample listings:')
    for (const l of samples) {
      console.log(`    "${l.name}" (${l.vertical}) — ${l.region || '(null)'} → ${metroName}`)
      if (l.address) console.log(`      Address: ${l.address}`)
    }
    if (needsFix.length > 5) {
      console.log(`    ... and ${needsFix.length - 5} more`)
    }

    if (!dryRun) {
      // Batch update
      const ids = needsFix.map(l => l.id)
      const BATCH_SIZE = 100
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE)
        const { error: updateError } = await supabase
          .from('listings')
          .update({ region: metroName })
          .in('id', batch)

        if (updateError) {
          console.error(`  Error updating batch: ${updateError.message}`)
        } else {
          console.log(`  Updated batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} listings`)
        }
      }
      totalFixed += needsFix.length
    } else {
      console.log(`  Would fix ${needsFix.length} listings`)
      totalSkipped += needsFix.length
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  if (dryRun) {
    console.log(`DRY RUN COMPLETE: ${totalSkipped} listings would be reassigned`)
    console.log('Run without --dry-run to apply changes')
  } else {
    console.log(`COMPLETE: ${totalFixed} listings reassigned to metro regions`)
  }
}

main().catch(console.error)
