#!/usr/bin/env node
// ============================================================
// Audit region assignments — read-only report
//
// Generates a comprehensive audit of region assignments across
// the listing database. Does NOT modify any data.
//
// Reports:
//   1. Listing counts per region (with polygon-based recount)
//   2. Known misassignment test cases (e.g. Rippon Lea)
//   3. Listings with no region assigned
//   4. Listings whose region doesn't match any known region name
//   5. Distribution by assignment method (polygon vs fallback)
//   6. Listings outside all region polygons
//
// Usage:
//   node --env-file=.env.local scripts/audit-region-assignments.mjs
//
// Flags:
//   --verbose   Show individual misassigned listings
//   --csv       Output region counts as CSV to stdout
// ============================================================

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const VERBOSE = process.argv.includes('--verbose')
const CSV = process.argv.includes('--csv')
const BATCH_SIZE = 500

// ── Metro bounding boxes ────────────────────────────────────
const METRO_AREAS = {
  Melbourne: {
    south: -37.95, west: 144.75, north: -37.62, east: 145.20,
    state: 'VIC',
  },
  Sydney: {
    south: -33.99, west: 151.03, north: -33.68, east: 151.35,
    state: 'NSW',
  },
  Brisbane: {
    south: -27.62, west: 152.88, north: -27.30, east: 153.18,
    state: 'QLD',
  },
  Adelaide: {
    south: -35.08, west: 138.48, north: -34.75, east: 138.78,
    state: 'SA',
  },
  Perth: {
    south: -32.00, west: 115.78, north: -31.82, east: 115.95,
    state: 'WA',
  },
  'Hobart City': {
    south: -42.96, west: 147.22, north: -42.82, east: 147.42,
    state: 'TAS',
  },
  Newcastle: {
    south: -33.00, west: 151.65, north: -32.85, east: 151.85,
    state: 'NSW',
  },
  Geelong: {
    south: -38.22, west: 144.28, north: -38.08, east: 144.44,
    state: 'VIC',
  },
  Wollongong: {
    south: -34.50, west: 150.82, north: -34.38, east: 150.95,
    state: 'NSW',
  },
}

// ── Known test cases ────────────────────────────────────────
// Listings that have been historically misassigned. Used to
// verify that the current assignments are correct.
const TEST_CASES = [
  {
    slug: 'rippon-lea-estate',
    vertical: 'collection',
    expectedRegion: 'Melbourne',
    description: 'Elsternwick mansion — inner Melbourne, was showing Yarra Valley',
  },
]

// ── Point-in-polygon (ray casting) ──────────────────────────
function pointInPolygon(lat, lng, geojson) {
  if (!geojson || geojson.type !== 'Polygon' || !geojson.coordinates) {
    return false
  }

  const ring = geojson.coordinates[0]
  if (!ring || ring.length < 4) return false

  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)

    if (intersect) inside = !inside
  }

  return inside
}

// ── Haversine distance (km) ─────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Metro bounding box check ────────────────────────────────
function getMetroRegion(lat, lng, state) {
  for (const [metroName, box] of Object.entries(METRO_AREAS)) {
    if (state && box.state !== state) continue
    if (lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east) {
      return metroName
    }
  }
  return null
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log('Region Assignment Audit')
  console.log('='.repeat(70))
  console.log()

  // Load all regions
  const { data: regions, error: regErr } = await sb
    .from('regions')
    .select('id, name, slug, state, center_lat, center_lng, geojson, listing_count, status')
    .order('name')

  if (regErr || !regions) {
    console.error('Failed to load regions:', regErr?.message)
    process.exit(1)
  }

  const validRegionNames = new Set(regions.map(r => r.name))
  const regionsWithPolygons = regions.filter(r => r.geojson)
  const regionsWithoutPolygons = regions.filter(r => !r.geojson)

  console.log(`Total regions: ${regions.length}`)
  console.log(`  With polygons: ${regionsWithPolygons.length}`)
  console.log(`  Without polygons: ${regionsWithoutPolygons.length}`)

  if (regionsWithoutPolygons.length > 0) {
    console.log('\n  Regions missing polygons:')
    for (const r of regionsWithoutPolygons) {
      console.log(`    ${r.name} (${r.state || 'no state'})`)
    }
  }

  // Fetch all active listings
  let allListings = []
  let offset = 0

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, slug, vertical, suburb, state, lat, lng, region')
      .eq('status', 'active')
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('Fetch error:', error.message); break }
    if (!data || data.length === 0) break
    allListings = allListings.concat(data)
    offset += data.length
    if (data.length < BATCH_SIZE) break
  }

  console.log(`\nTotal active listings: ${allListings.length}`)

  // ── Section 1: Current region distribution ─────────────────
  console.log('\n' + '='.repeat(70))
  console.log('SECTION 1: Current Region Distribution')
  console.log('='.repeat(70))

  const currentCounts = {}
  let noRegion = 0
  let invalidRegion = 0
  const invalidRegionNames = {}
  let noCoords = 0

  for (const l of allListings) {
    if (!l.region) {
      noRegion++
      continue
    }

    currentCounts[l.region] = (currentCounts[l.region] || 0) + 1

    if (!validRegionNames.has(l.region)) {
      invalidRegion++
      invalidRegionNames[l.region] = (invalidRegionNames[l.region] || 0) + 1
    }

    if (!l.lat || !l.lng) noCoords++
  }

  const sortedCounts = Object.entries(currentCounts)
    .sort((a, b) => b[1] - a[1])

  if (CSV) {
    console.log('\nregion,current_count,valid')
    for (const [region, count] of sortedCounts) {
      console.log(`"${region}",${count},${validRegionNames.has(region) ? 'yes' : 'no'}`)
    }
  } else {
    console.log(`\n  Listings with region:    ${allListings.length - noRegion}`)
    console.log(`  Listings without region: ${noRegion}`)
    console.log(`  Invalid region names:    ${invalidRegion}`)
    console.log(`  Missing coordinates:     ${noCoords}`)

    console.log('\n  Listings per region:')
    for (const [region, count] of sortedCounts) {
      const valid = validRegionNames.has(region) ? '' : ' [INVALID]'
      console.log(`    ${region}: ${count}${valid}`)
    }
  }

  // Show invalid region values
  if (Object.keys(invalidRegionNames).length > 0) {
    console.log('\n  Invalid region values (not in regions table):')
    for (const [name, count] of Object.entries(invalidRegionNames).sort((a, b) => b[1] - a[1])) {
      console.log(`    "${name}": ${count} listings`)
    }
  }

  // ── Section 2: Spatial audit ──────────────────────────────
  console.log('\n' + '='.repeat(70))
  console.log('SECTION 2: Spatial Polygon Audit')
  console.log('='.repeat(70))

  if (regionsWithPolygons.length === 0) {
    console.log('\n  No region polygons available. Run seed-region-polygons.mjs first.')
  } else {
    // For each listing with coords, check polygon containment
    const spatialCounts = {} // region -> count (based on polygon)
    let inPolygon = 0
    let outsideAll = 0
    let matchesCurrent = 0
    let wouldChange = 0
    const mismatches = []

    const listingsWithCoords = allListings.filter(l => l.lat && l.lng)
    console.log(`\n  Checking ${listingsWithCoords.length} listings with coordinates...`)

    for (const l of listingsWithCoords) {
      // Find containing polygon(s)
      const containing = []
      for (const r of regionsWithPolygons) {
        if (pointInPolygon(l.lat, l.lng, r.geojson)) {
          containing.push(r)
        }
      }

      if (containing.length > 0) {
        inPolygon++
        // Pick smallest polygon (most specific)
        const best = containing.length === 1 ? containing[0] :
          containing.sort((a, b) => {
            const areaA = polygonAreaSimple(a.geojson)
            const areaB = polygonAreaSimple(b.geojson)
            return areaA - areaB
          })[0]

        spatialCounts[best.name] = (spatialCounts[best.name] || 0) + 1

        if (l.region === best.name) {
          matchesCurrent++
        } else {
          wouldChange++
          mismatches.push({
            name: l.name,
            slug: l.slug,
            vertical: l.vertical,
            suburb: l.suburb,
            currentRegion: l.region || '(none)',
            spatialRegion: best.name,
            lat: l.lat,
            lng: l.lng,
          })
        }
      } else {
        outsideAll++

        // Check if it would be caught by metro fallback
        const metro = getMetroRegion(l.lat, l.lng, l.state)
        if (metro) {
          spatialCounts[metro] = (spatialCounts[metro] || 0) + 1
          if (l.region !== metro) {
            wouldChange++
            mismatches.push({
              name: l.name,
              slug: l.slug,
              vertical: l.vertical,
              suburb: l.suburb,
              currentRegion: l.region || '(none)',
              spatialRegion: metro + ' (metro fallback)',
              lat: l.lat,
              lng: l.lng,
            })
          }
        }
      }
    }

    console.log(`  Inside a polygon:     ${inPolygon}`)
    console.log(`  Outside all polygons: ${outsideAll}`)
    console.log(`  Match current region: ${matchesCurrent}`)
    console.log(`  Would change:         ${wouldChange}`)

    // Show spatial vs current comparison
    if (!CSV) {
      console.log('\n  Spatial region counts (polygon-based):')
      const sortedSpatial = Object.entries(spatialCounts)
        .sort((a, b) => b[1] - a[1])
      for (const [region, count] of sortedSpatial) {
        const current = currentCounts[region] || 0
        const delta = count - current
        const deltaStr = delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta})` : ''
        console.log(`    ${region}: ${count}${deltaStr}`)
      }
    }

    // Show mismatches
    if (mismatches.length > 0) {
      const showCount = VERBOSE ? mismatches.length : Math.min(30, mismatches.length)
      console.log(`\n  Mismatched assignments (${mismatches.length} total, showing ${showCount}):`)
      for (const m of mismatches.slice(0, showCount)) {
        console.log(`    ${m.name} (${m.vertical})`)
        console.log(`      Current: "${m.currentRegion}" -> Spatial: "${m.spatialRegion}"`)
        if (m.suburb) console.log(`      Suburb: ${m.suburb}`)
      }
      if (!VERBOSE && mismatches.length > showCount) {
        console.log(`    ... and ${mismatches.length - showCount} more (use --verbose to see all)`)
      }
    }
  }

  // ── Section 3: Known test cases ───────────────────────────
  console.log('\n' + '='.repeat(70))
  console.log('SECTION 3: Known Test Cases')
  console.log('='.repeat(70))

  for (const tc of TEST_CASES) {
    const { data: listing } = await sb
      .from('listings')
      .select('id, name, slug, vertical, region, lat, lng, suburb, state')
      .eq('slug', tc.slug)
      .eq('vertical', tc.vertical)
      .single()

    if (!listing) {
      console.log(`\n  ${tc.slug}: NOT FOUND`)
      continue
    }

    const isCorrect = listing.region === tc.expectedRegion
    const status = isCorrect ? 'PASS' : 'FAIL'

    console.log(`\n  [${status}] ${listing.name}`)
    console.log(`    Slug: ${listing.slug} (${listing.vertical})`)
    console.log(`    Current region: "${listing.region || '(none)'}"`)
    console.log(`    Expected region: "${tc.expectedRegion}"`)
    console.log(`    Coordinates: ${listing.lat}, ${listing.lng}`)
    if (listing.suburb) console.log(`    Suburb: ${listing.suburb}, ${listing.state}`)
    console.log(`    Note: ${tc.description}`)

    // Also check what polygon would assign
    if (regionsWithPolygons.length > 0 && listing.lat && listing.lng) {
      const containing = regionsWithPolygons.filter(r =>
        pointInPolygon(listing.lat, listing.lng, r.geojson)
      )
      if (containing.length > 0) {
        console.log(`    Polygon match: ${containing.map(r => r.name).join(', ')}`)
      } else {
        const metro = getMetroRegion(listing.lat, listing.lng, listing.state)
        console.log(`    Polygon match: none (metro fallback: ${metro || 'none'})`)
      }
    }
  }

  // ── Section 4: Summary ────────────────────────────────────
  console.log('\n' + '='.repeat(70))
  console.log('SUMMARY')
  console.log('='.repeat(70))
  console.log(`Total active listings:  ${allListings.length}`)
  console.log(`Assigned to region:     ${allListings.length - noRegion}`)
  console.log(`No region:              ${noRegion}`)
  console.log(`Invalid region name:    ${invalidRegion}`)
  console.log(`Missing coordinates:    ${noCoords}`)
  console.log(`Regions with polygons:  ${regionsWithPolygons.length}/${regions.length}`)

  // Denormalized count vs actual count comparison
  console.log('\n  Denormalized vs actual listing counts:')
  let countMismatches = 0
  for (const r of regions) {
    const actual = currentCounts[r.name] || 0
    if (r.listing_count !== actual) {
      countMismatches++
      console.log(`    ${r.name}: denormalized=${r.listing_count}, actual=${actual}`)
    }
  }
  if (countMismatches === 0) {
    console.log('    All denormalized counts match actual counts.')
  }

  console.log('\nDone.')
}

// Simple polygon area (shoelace) for tie-breaking
function polygonAreaSimple(geojson) {
  if (!geojson || geojson.type !== 'Polygon') return Infinity
  const ring = geojson.coordinates[0]
  if (!ring || ring.length < 4) return Infinity
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1]
    area -= ring[i][0] * ring[j][1]
  }
  return Math.abs(area) / 2
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
