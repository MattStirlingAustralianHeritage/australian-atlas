#!/usr/bin/env node
// ============================================================
// Seed region GeoJSON polygons into the regions table
//
// Creates approximate polygon boundaries for each Atlas region
// using two strategies:
//   1. Metro regions: polygon from the existing bounding boxes
//      defined in fix-region-assignments.mjs
//   2. Rural/regional regions: circular polygon generated from
//      center_lat/center_lng with an estimated radius based on
//      known regional extent
//
// These polygons enable the PostGIS RPC functions
// listings_in_region() and region_stats() (migration 007)
// which use ST_Contains against regions.geojson.
//
// Usage:
//   node --env-file=.env.local scripts/seed-region-polygons.mjs --dry-run
//   node --env-file=.env.local scripts/seed-region-polygons.mjs
//
// Flags:
//   --dry-run   Report polygons without writing to DB
//   --force     Overwrite existing GeoJSON values
//   --verbose   Print each polygon summary
//
// Idempotent: safe to run multiple times. Skips regions that
// already have GeoJSON unless --force is used.
// ============================================================

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')
const VERBOSE = process.argv.includes('--verbose')

// ── Metro bounding boxes ────────────────────────────────────
// Same boxes used in fix-region-assignments.mjs. These define
// the polygon corners for metro regions.
const METRO_BOXES = {
  Melbourne: {
    south: -37.95, west: 144.75, north: -37.62, east: 145.20,
  },
  Sydney: {
    south: -33.99, west: 151.03, north: -33.68, east: 151.35,
  },
  Brisbane: {
    south: -27.62, west: 152.88, north: -27.30, east: 153.18,
  },
  Adelaide: {
    south: -35.08, west: 138.48, north: -34.75, east: 138.78,
  },
  Perth: {
    south: -32.00, west: 115.78, north: -31.82, east: 115.95,
  },
  'Hobart City': {
    south: -42.96, west: 147.22, north: -42.82, east: 147.42,
  },
  Newcastle: {
    south: -33.00, west: 151.65, north: -32.85, east: 151.85,
  },
  Geelong: {
    south: -38.22, west: 144.28, north: -38.08, east: 144.44,
  },
  Wollongong: {
    south: -34.50, west: 150.82, north: -34.38, east: 150.95,
  },
}

// ── Regional radius estimates (km) ─────────────────────────
// Approximate radius for each non-metro region. If not listed,
// defaults to DEFAULT_RADIUS_KM. These are rough estimates
// calibrated to cover the main venue cluster for each region.
const REGION_RADII = {
  'Mornington Peninsula':       25,
  'Barossa Valley':             20,
  'Yarra Valley':               30,
  'Byron Hinterland':           25,
  'Blue Mountains':             30,
  'Adelaide Hills':             25,
  'Margaret River':             40,
  'Hunter Valley':              35,
  'Daylesford & Hepburn Springs': 15,
  'Hobart & Southern Tasmania': 50,
  'Grampians':                  40,
  'Flinders Ranges':            60,
  'Noosa Hinterland':           25,
  'Sunshine Coast Hinterland':  30,
  'Kangaroo Island':            45,
  'Bruny Island':               25,
  'Tamar Valley':               30,
  'Central Victoria':           50,
  'Great Ocean Road':           60,
  'McLaren Vale':               20,
  'Bellarine Peninsula':        20,
  'Southern Highlands':         30,
  'Shoalhaven':                 40,
  'Gold Coast Hinterland':      30,
  'Macedon Ranges':             25,
  'Clare Valley':               30,
  'Cradle Country':             50,
  'Fremantle & Swan Valley':    25,
  'Canberra District':          25,
  'Northern Rivers':            40,
  'East Coast Tasmania':        50,
  'Launceston & Tamar Valley':  30,
  'Darwin & Top End':           40,
  'Alice Springs & Red Centre': 80,
  'Central Coast':              30,
  'Orange & Central West':      40,
  'South Coast NSW':            60,
  'Gippsland':                  60,
  'Murray River':               60,
  'Cairns & Tropical North':    50,
  'Scenic Rim':                 35,
  'Toowoomba & Darling Downs':  40,
  'Limestone Coast':            50,
  'Riverland':                  50,
  'Great Southern':             50,
  'Broome & Kimberley':         80,
  'Byron Bay':                  20,
}
const DEFAULT_RADIUS_KM = 35

// ── Generate a circular polygon ─────────────────────────────
// Creates a GeoJSON Polygon with N vertices approximating a
// circle of the given radius around the center point.
function circlePolygon(centerLat, centerLng, radiusKm, numPoints = 32) {
  const coords = []
  const earthRadius = 6371 // km

  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI
    // Offset in degrees (approximate, good enough for our purposes)
    const dLat = (radiusKm / earthRadius) * (180 / Math.PI) * Math.cos(angle)
    const dLng = (radiusKm / earthRadius) * (180 / Math.PI) * Math.sin(angle) /
      Math.cos(centerLat * Math.PI / 180)

    coords.push([
      Math.round((centerLng + dLng) * 10000) / 10000,
      Math.round((centerLat + dLat) * 10000) / 10000,
    ])
  }

  return {
    type: 'Polygon',
    coordinates: [coords],
  }
}

// ── Generate a rectangular polygon from bounding box ────────
function boxPolygon(south, west, north, east) {
  return {
    type: 'Polygon',
    coordinates: [[
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south], // close the ring
    ]],
  }
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log(`Region Polygon Seeder${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log(`Force overwrite: ${FORCE ? 'yes' : 'no'}\n`)

  // Load all regions
  const { data: regions, error: regErr } = await sb
    .from('regions')
    .select('id, name, slug, state, center_lat, center_lng, geojson')
    .order('name')

  if (regErr || !regions) {
    console.error('Failed to load regions:', regErr?.message)
    process.exit(1)
  }

  console.log(`Loaded ${regions.length} regions\n`)

  let seeded = 0
  let skipped = 0
  let noCoords = 0
  const results = []

  for (const region of regions) {
    // Skip if already has GeoJSON and not forcing
    if (region.geojson && !FORCE) {
      skipped++
      if (VERBOSE) console.log(`  SKIP (has geojson): ${region.name}`)
      continue
    }

    // Check if this is a metro region with a bounding box
    const metroBox = METRO_BOXES[region.name]

    let geojson
    let method

    if (metroBox) {
      // Metro: use bounding box as polygon
      geojson = boxPolygon(metroBox.south, metroBox.west, metroBox.north, metroBox.east)
      method = 'bounding_box'
    } else if (region.center_lat && region.center_lng) {
      // Regional: generate circular polygon from center + radius
      const radiusKm = REGION_RADII[region.name] || DEFAULT_RADIUS_KM
      geojson = circlePolygon(region.center_lat, region.center_lng, radiusKm)
      method = `circle_${radiusKm}km`
    } else {
      // No coordinates available
      noCoords++
      if (VERBOSE) console.log(`  NO COORDS: ${region.name}`)
      continue
    }

    results.push({
      name: region.name,
      slug: region.slug,
      method,
      vertexCount: geojson.coordinates[0].length,
    })

    if (VERBOSE) {
      console.log(`  ${region.name}: ${method} (${geojson.coordinates[0].length} vertices)`)
    }

    // Write to DB
    if (!DRY_RUN) {
      const { error: updateErr } = await sb
        .from('regions')
        .update({ geojson })
        .eq('id', region.id)

      if (updateErr) {
        console.error(`  WRITE ERROR: ${region.name} — ${updateErr.message}`)
        continue
      }
    }

    seeded++
  }

  // ── Report ──────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60))
  console.log(DRY_RUN ? 'DRY RUN SUMMARY' : 'SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total regions:      ${regions.length}`)
  console.log(`Polygons seeded:    ${seeded}`)
  console.log(`Skipped (existing): ${skipped}`)
  console.log(`No coordinates:     ${noCoords}`)

  // Method breakdown
  const methodCounts = {}
  for (const r of results) {
    methodCounts[r.method] = (methodCounts[r.method] || 0) + 1
  }
  console.log('\nMethod breakdown:')
  for (const [method, count] of Object.entries(methodCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${method}: ${count}`)
  }

  // List all seeded regions
  if (results.length > 0) {
    console.log('\nSeeded regions:')
    for (const r of results) {
      console.log(`  ${r.name} — ${r.method}`)
    }
  }

  console.log('\nDone.')
  if (DRY_RUN) {
    console.log('Run without --dry-run to write polygons to the database.')
  } else {
    console.log('PostGIS functions listings_in_region() and region_stats() are now active.')
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
