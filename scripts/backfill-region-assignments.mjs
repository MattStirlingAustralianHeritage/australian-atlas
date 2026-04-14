#!/usr/bin/env node
// ============================================================
// Backfill region assignments using spatial polygon matching
//
// Improved version of fix-region-assignments.mjs that uses
// GeoJSON polygons stored in regions.geojson (seeded by
// seed-region-polygons.mjs) for point-in-polygon matching
// instead of relying solely on bounding boxes and nearest-
// center-point heuristics.
//
// Algorithm:
//   1. Load all region polygons from the DB
//   2. For each active listing with lat/lng:
//      a. Find all regions whose polygon contains the point
//      b. If exactly one match, use it
//      c. If multiple matches (overlapping polygons), pick the
//         smallest polygon (most specific region)
//      d. If no polygon match, fall back to metro bounding box
//         then nearest-center-point (same as fix-region-assignments)
//   3. Compare to current assignment, update if different
//
// Usage:
//   node --env-file=.env.local scripts/backfill-region-assignments.mjs --dry-run
//   node --env-file=.env.local scripts/backfill-region-assignments.mjs
//
// Flags:
//   --dry-run   Report changes without writing to DB
//   --verbose   Print every listing checked
//   --limit=N   Only process first N listings (for testing)
//
// Idempotent: safe to run multiple times.
// ============================================================

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DRY_RUN = process.argv.includes('--dry-run')
const VERBOSE = process.argv.includes('--verbose')
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 0
const BATCH_SIZE = 500

// ── Metro bounding boxes (fallback) ─────────────────────────
// Used when no polygon contains the point. Same as
// fix-region-assignments.mjs for consistency.
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
  'Canberra District': {
    south: -35.40, west: 149.00, north: -35.18, east: 149.25,
    state: 'ACT',
  },
  'Darwin & Top End': {
    south: -12.52, west: 130.80, north: -12.38, east: 130.92,
    state: 'NT',
  },
  'Gold Coast Hinterland': {
    south: -28.22, west: 153.30, north: -27.90, east: 153.55,
    state: 'QLD',
  },
}

// Metro region names (excluded from nearest-center fallback)
const METRO_REGION_NAMES = new Set([
  'Melbourne', 'Sydney', 'Brisbane', 'Adelaide', 'Perth',
  'Hobart City', 'Newcastle', 'Geelong', 'Wollongong',
])

// ── Point-in-polygon (ray casting) ──────────────────────────
// Works with GeoJSON Polygon coordinates (array of rings,
// first ring is exterior). Handles simple polygons well.
function pointInPolygon(lat, lng, geojson) {
  if (!geojson || geojson.type !== 'Polygon' || !geojson.coordinates) {
    return false
  }

  const ring = geojson.coordinates[0] // exterior ring
  if (!ring || ring.length < 4) return false

  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1] // [lng, lat] in GeoJSON
    const xj = ring[j][0], yj = ring[j][1]

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)

    if (intersect) inside = !inside
  }

  return inside
}

// ── Approximate polygon area (for tie-breaking) ─────────────
// Shoelace formula on the exterior ring. Returns absolute area
// in square degrees (not meaningful as area, but fine for
// comparing which polygon is smaller/more specific).
function polygonArea(geojson) {
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

// ── Haversine distance (km) ─────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Metro bounding box check (fallback) ─────────────────────
function getMetroRegion(lat, lng, state) {
  for (const [metroName, box] of Object.entries(METRO_AREAS)) {
    if (state && box.state !== state) continue
    if (lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east) {
      return metroName
    }
  }
  return null
}

// ── Nearest region center (fallback) ────────────────────────
function nearestRegion(lat, lng, regions, state) {
  let nearest = null, minDist = Infinity

  for (const r of regions) {
    if (METRO_REGION_NAMES.has(r.name)) continue
    if (!r.center_lat || !r.center_lng) continue

    const statePenalty = (state && r.state !== state) ? 1.5 : 1.0
    const dist = haversine(lat, lng, r.center_lat, r.center_lng) * statePenalty

    if (dist < minDist) { minDist = dist; nearest = r }
  }

  return nearest && minDist < 200 ? { name: nearest.name, dist: minDist } : null
}

// ── Determine region for a listing ──────────────────────────
function determineRegion(lat, lng, state, regionsWithPolygons, allRegions) {
  // Strategy 1: Spatial polygon containment
  const containing = []
  for (const r of regionsWithPolygons) {
    if (pointInPolygon(lat, lng, r.geojson)) {
      containing.push(r)
    }
  }

  if (containing.length === 1) {
    return { region: containing[0].name, method: 'polygon' }
  }

  if (containing.length > 1) {
    // Multiple polygons contain this point — pick the smallest
    // (most specific) polygon. This handles cases like a listing
    // being inside both "Melbourne" bbox and "Yarra Valley" circle.
    containing.sort((a, b) => polygonArea(a.geojson) - polygonArea(b.geojson))
    return { region: containing[0].name, method: 'polygon_smallest' }
  }

  // Strategy 2: Metro bounding box fallback
  const metro = getMetroRegion(lat, lng, state)
  if (metro) return { region: metro, method: 'metro_bbox_fallback' }

  // Strategy 3: Nearest center point fallback
  const nearest = nearestRegion(lat, lng, allRegions, state)
  if (nearest) return { region: nearest.name, method: 'nearest_fallback', dist: nearest.dist }

  return { region: null, method: 'unresolved' }
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log(`Region Assignment Backfill (Spatial)${DRY_RUN ? ' (DRY RUN)' : ''}`)
  if (LIMIT) console.log(`Limit: ${LIMIT} listings`)
  console.log()

  // Load all regions
  const { data: regions, error: regErr } = await sb
    .from('regions')
    .select('id, name, slug, state, center_lat, center_lng, geojson')
    .order('name')

  if (regErr || !regions) {
    console.error('Failed to load regions:', regErr?.message)
    process.exit(1)
  }

  const regionsWithPolygons = regions.filter(r => r.geojson)
  const validRegionNames = new Set(regions.map(r => r.name))

  console.log(`Loaded ${regions.length} regions (${regionsWithPolygons.length} with polygons)\n`)

  if (regionsWithPolygons.length === 0) {
    console.error('No regions have GeoJSON polygons. Run seed-region-polygons.mjs first.')
    process.exit(1)
  }

  // Snapshot listing counts per region BEFORE changes
  const beforeCounts = {}
  const { data: beforeData } = await sb
    .from('listings')
    .select('region')
    .eq('status', 'active')

  if (beforeData) {
    for (const l of beforeData) {
      const r = l.region || '(unassigned)'
      beforeCounts[r] = (beforeCounts[r] || 0) + 1
    }
  }

  // Fetch all active listings
  let allListings = []
  let offset = 0

  while (true) {
    const query = sb
      .from('listings')
      .select('id, name, slug, vertical, suburb, state, lat, lng, region')
      .eq('status', 'active')
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1)

    const { data, error } = await query

    if (error) { console.error('Fetch error:', error.message); break }
    if (!data || data.length === 0) break
    allListings = allListings.concat(data)
    offset += data.length
    if (data.length < BATCH_SIZE) break
    if (LIMIT && allListings.length >= LIMIT) break
  }

  if (LIMIT && allListings.length > LIMIT) {
    allListings = allListings.slice(0, LIMIT)
  }

  console.log(`Fetched ${allListings.length} active listings\n`)

  // Stats
  let totalChecked = 0
  let totalCorrected = 0
  let totalNoCoords = 0
  let totalUnresolved = 0

  const methodCounts = {}
  const changeSummary = {} // "old -> new" -> count
  const corrections = []
  const correctionsByRegion = {} // region -> count

  // Known test cases to watch for
  const WATCH_LIST = ['rippon-lea-estate']

  for (const listing of allListings) {
    totalChecked++

    if (totalChecked % 500 === 0) {
      console.log(`  ... ${totalChecked}/${allListings.length} checked, ${totalCorrected} corrected`)
    }

    // Skip listings without coordinates
    if (!listing.lat || !listing.lng) {
      totalNoCoords++
      continue
    }

    // Determine correct region via polygon matching
    const result = determineRegion(
      listing.lat, listing.lng, listing.state,
      regionsWithPolygons, regions
    )

    methodCounts[result.method] = (methodCounts[result.method] || 0) + 1

    if (!result.region) {
      totalUnresolved++
      if (VERBOSE) {
        console.log(`  UNRESOLVED: ${listing.name} (${listing.lat}, ${listing.lng})`)
      }
      continue
    }

    // Compare with current region
    const oldRegion = listing.region || '(unassigned)'
    const newRegion = result.region

    // Watch list: always log these
    if (WATCH_LIST.includes(listing.slug)) {
      console.log(`  WATCH: ${listing.name} — current: "${oldRegion}", computed: "${newRegion}" [${result.method}]`)
    }

    if (oldRegion === newRegion) continue

    // The computed region differs from the current assignment
    const changeKey = `${oldRegion} -> ${newRegion}`
    changeSummary[changeKey] = (changeSummary[changeKey] || 0) + 1
    correctionsByRegion[newRegion] = (correctionsByRegion[newRegion] || 0) + 1

    corrections.push({
      id: listing.id,
      name: listing.name,
      slug: listing.slug,
      vertical: listing.vertical,
      old: oldRegion,
      new: newRegion,
      method: result.method,
    })

    if (VERBOSE) {
      console.log(`  ${listing.name}: ${oldRegion} -> ${newRegion} [${result.method}]`)
    }

    // Write to DB
    if (!DRY_RUN) {
      const { error: updateErr } = await sb
        .from('listings')
        .update({ region: newRegion })
        .eq('id', listing.id)

      if (updateErr) {
        console.error(`  WRITE ERROR: ${listing.name} — ${updateErr.message}`)
        continue
      }
    }

    totalCorrected++
  }

  // Snapshot listing counts per region AFTER changes
  const afterCounts = { ...beforeCounts }
  if (!DRY_RUN) {
    // Re-count from DB
    const { data: afterData } = await sb
      .from('listings')
      .select('region')
      .eq('status', 'active')

    if (afterData) {
      for (const key of Object.keys(afterCounts)) afterCounts[key] = 0
      for (const l of afterData) {
        const r = l.region || '(unassigned)'
        afterCounts[r] = (afterCounts[r] || 0) + 1
      }
    }
  } else {
    // Simulate after counts from corrections
    for (const c of corrections) {
      afterCounts[c.old] = (afterCounts[c.old] || 0) - 1
      afterCounts[c.new] = (afterCounts[c.new] || 0) + 1
    }
  }

  // ── Report ──────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70))
  console.log(DRY_RUN ? 'DRY RUN REPORT' : 'BACKFILL REPORT')
  console.log('='.repeat(70))
  console.log(`Total checked:    ${totalChecked}`)
  console.log(`Total corrected:  ${totalCorrected}`)
  console.log(`No coordinates:   ${totalNoCoords}`)
  console.log(`Unresolved:       ${totalUnresolved}`)

  console.log('\nAssignment method breakdown:')
  for (const [method, count] of Object.entries(methodCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${method}: ${count}`)
  }

  if (Object.keys(changeSummary).length > 0) {
    console.log('\nRegion reassignments (old -> new):')
    const sorted = Object.entries(changeSummary).sort((a, b) => b[1] - a[1])
    for (const [change, count] of sorted) {
      console.log(`  ${change}: ${count}`)
    }
  }

  if (Object.keys(correctionsByRegion).length > 0) {
    console.log('\nCorrections by target region:')
    const sorted = Object.entries(correctionsByRegion).sort((a, b) => b[1] - a[1])
    for (const [region, count] of sorted) {
      console.log(`  ${region}: ${count} listings reassigned here`)
    }
  }

  // Before/after comparison for regions that changed
  const changedRegions = new Set()
  for (const c of corrections) {
    changedRegions.add(c.old)
    changedRegions.add(c.new)
  }

  if (changedRegions.size > 0) {
    console.log('\nListing count changes (before -> after):')
    const regionChanges = []
    for (const r of changedRegions) {
      const before = beforeCounts[r] || 0
      const after = afterCounts[r] || 0
      if (before !== after) {
        regionChanges.push({ region: r, before, after, delta: after - before })
      }
    }
    regionChanges.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    for (const rc of regionChanges) {
      const sign = rc.delta > 0 ? '+' : ''
      console.log(`  ${rc.region}: ${rc.before} -> ${rc.after} (${sign}${rc.delta})`)
    }
  }

  // Individual corrections (capped at 200)
  if (corrections.length > 0 && corrections.length <= 200) {
    console.log('\nAll corrections:')
    for (const c of corrections) {
      console.log(`  ${c.name} (${c.vertical}): ${c.old} -> ${c.new} [${c.method}]`)
    }
  } else if (corrections.length > 200) {
    console.log(`\nFirst 100 corrections (${corrections.length} total):`)
    for (const c of corrections.slice(0, 100)) {
      console.log(`  ${c.name} (${c.vertical}): ${c.old} -> ${c.new} [${c.method}]`)
    }
    console.log(`  ... and ${corrections.length - 100} more`)
  }

  console.log('\nDone.')
  if (DRY_RUN) {
    console.log('Run without --dry-run to apply changes.')
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
