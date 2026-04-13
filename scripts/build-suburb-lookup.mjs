#!/usr/bin/env node
// ============================================================
// Build suburb-to-region lookup table
//
// For each unique suburb+state appearing in listings (parsed from
// address or reverse-geocoded from lat/lng), determines the correct
// Atlas region using:
//   1. Metro bounding boxes (inner-city suburbs -> metro region)
//   2. Nearest region center point (for non-metro suburbs)
//
// For listings that lack a suburb, uses Mapbox reverse geocoding
// on the lat/lng to determine the suburb first.
//
// Usage:
//   node --env-file=.env.local scripts/build-suburb-lookup.mjs [--dry-run]
//
// Requires: Migration 067 (suburb_region_lookup table)
// ============================================================

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN
const DRY_RUN = process.argv.includes('--dry-run')
const DELAY_MS = 200 // 5 requests/second for Mapbox
const BATCH_SIZE = 500

// ── Metro bounding boxes ────────────────────────────────────
// Expanded from fix-metro-regions.mjs to cover wider metro areas
const METRO_AREAS = {
  Melbourne: {
    south: -37.95,
    west: 144.75,
    north: -37.62,
    east: 145.20,
    state: 'VIC',
  },
  Sydney: {
    south: -33.99,
    west: 151.03,
    north: -33.68,
    east: 151.35,
    state: 'NSW',
  },
  Brisbane: {
    south: -27.62,
    west: 152.88,
    north: -27.30,
    east: 153.18,
    state: 'QLD',
  },
  Adelaide: {
    south: -35.08,
    west: 138.48,
    north: -34.75,
    east: 138.78,
    state: 'SA',
  },
  Perth: {
    south: -32.00,
    west: 115.78,
    north: -31.82,
    east: 115.95,
    state: 'WA',
  },
  'Hobart City': {
    south: -42.96,
    west: 147.22,
    north: -42.82,
    east: 147.42,
    state: 'TAS',
  },
  Newcastle: {
    south: -33.00,
    west: 151.65,
    north: -32.85,
    east: 151.85,
    state: 'NSW',
  },
  Geelong: {
    south: -38.22,
    west: 144.28,
    north: -38.08,
    east: 144.44,
    state: 'VIC',
  },
  Wollongong: {
    south: -34.50,
    west: 150.82,
    north: -34.38,
    east: 150.95,
    state: 'NSW',
  },
  'Canberra District': {
    south: -35.40,
    west: 149.00,
    north: -35.18,
    east: 149.25,
    state: 'ACT',
  },
  'Darwin & Top End': {
    south: -12.52,
    west: 130.80,
    north: -12.38,
    east: 130.92,
    state: 'NT',
  },
  'Gold Coast Hinterland': {
    south: -28.22,
    west: 153.30,
    north: -27.90,
    east: 153.55,
    state: 'QLD',
  },
}

// ── Haversine distance (km) ─────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Reverse geocode via Mapbox ──────────────────────────────
async function reverseGeocode(lat, lng) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=locality,place,neighborhood&country=au&limit=1&access_token=${MAPBOX_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const feat = data.features?.[0]
  if (!feat) return null
  return {
    suburb: feat.text || null,
    place_name: feat.place_name || '',
  }
}

// ── Determine metro region from coordinates ─────────────────
function getMetroRegion(lat, lng, state) {
  for (const [metroName, box] of Object.entries(METRO_AREAS)) {
    if (state && box.state !== state) continue
    if (lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east) {
      return metroName
    }
  }
  return null
}

// ── Find nearest region by center point ─────────────────────
function nearestRegion(lat, lng, regions, state) {
  let nearest = null, minDist = Infinity

  // Prefer same-state regions, but fall back to any
  const sameState = regions.filter(r => r.state === state)
  const candidates = sameState.length > 0 ? sameState : regions

  for (const r of candidates) {
    // Skip metro regions from nearest-match — those are handled by bounding boxes
    const isMetro = ['Melbourne', 'Sydney', 'Brisbane', 'Adelaide', 'Perth',
      'Hobart City', 'Newcastle', 'Geelong', 'Wollongong'].includes(r.name)
    if (isMetro) continue

    const dist = haversine(lat, lng, r.center_lat, r.center_lng)
    if (dist < minDist) { minDist = dist; nearest = r }
  }

  return nearest ? { name: nearest.name, dist: minDist } : null
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  if (!MAPBOX_TOKEN) {
    console.error('Missing Mapbox token (NEXT_PUBLIC_MAPBOX_TOKEN or MAPBOX_ACCESS_TOKEN)')
    process.exit(1)
  }

  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===')

  // Load all regions with center coordinates
  const { data: regions, error: regErr } = await sb
    .from('regions')
    .select('name, state, center_lat, center_lng')
    .not('center_lat', 'is', null)
    .not('center_lng', 'is', null)

  if (regErr || !regions) {
    console.error('Failed to load regions:', regErr?.message)
    process.exit(1)
  }
  console.log(`Loaded ${regions.length} regions with coordinates`)

  // Fetch all active listings with coordinates
  let allListings = []
  let offset = 0

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, suburb, state, lat, lng, address, region')
      .eq('status', 'active')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('Fetch error:', error.message); break }
    if (!data || data.length === 0) break
    allListings = allListings.concat(data)
    offset += data.length
    if (data.length < BATCH_SIZE) break
  }

  console.log(`Fetched ${allListings.length} active listings with coordinates\n`)

  // Group listings by approximate location to reduce reverse geocoding calls
  // Use a grid of ~1km cells
  const locationGrid = new Map() // "lat_lng" -> { lat, lng, state, listings[] }

  for (const l of allListings) {
    // Round to ~1km precision
    const gridLat = Math.round(l.lat * 100) / 100
    const gridLng = Math.round(l.lng * 100) / 100
    const key = `${gridLat}_${gridLng}_${l.state || ''}`

    if (!locationGrid.has(key)) {
      locationGrid.set(key, {
        lat: l.lat,
        lng: l.lng,
        state: l.state,
        listings: [],
      })
    }
    locationGrid.get(key).listings.push(l)
  }

  console.log(`Grouped into ${locationGrid.size} location cells\n`)

  // For each cell, determine suburb + region
  const suburbMap = new Map() // "suburb|state" -> { suburb, state, region, lat, lng }
  let geocodeCalls = 0
  let metroCells = 0
  let nearestCells = 0
  let failedCells = 0
  let processed = 0

  for (const [key, cell] of locationGrid) {
    processed++
    if (processed % 100 === 0) {
      console.log(`  ... ${processed}/${locationGrid.size} cells processed (${geocodeCalls} geocode calls)`)
    }

    const { lat, lng, state: cellState } = cell

    // Step 1: Check metro bounding box
    const metroRegion = getMetroRegion(lat, lng, cellState)

    // Step 2: Determine suburb name
    // First check if any listing in this cell has a suburb already
    let suburb = null
    for (const l of cell.listings) {
      if (l.suburb) { suburb = l.suburb; break }
    }

    // If no suburb, reverse geocode
    if (!suburb) {
      try {
        const geo = await reverseGeocode(lat, lng)
        if (geo?.suburb) suburb = geo.suburb
        geocodeCalls++
        await new Promise(r => setTimeout(r, DELAY_MS))
      } catch (err) {
        // Geocode failed, skip
      }
    }

    // Step 3: Determine region
    let region
    if (metroRegion) {
      region = metroRegion
      metroCells++
    } else {
      // Use nearest region center point
      const nearest = nearestRegion(lat, lng, regions, cellState)
      if (nearest) {
        region = nearest.name
        nearestCells++
      } else {
        failedCells++
        continue
      }
    }

    // Step 4: Store in map (if we have a suburb name)
    if (suburb && cellState) {
      const lookupKey = `${suburb}|${cellState}`
      if (!suburbMap.has(lookupKey)) {
        suburbMap.set(lookupKey, { suburb, state: cellState, region, lat, lng })
      }
    }
  }

  console.log(`\nProcessing complete:`)
  console.log(`  Metro cells: ${metroCells}`)
  console.log(`  Nearest-region cells: ${nearestCells}`)
  console.log(`  Failed cells: ${failedCells}`)
  console.log(`  Geocode API calls: ${geocodeCalls}`)
  console.log(`  Unique suburb+state entries: ${suburbMap.size}`)

  // Upsert into suburb_region_lookup table
  if (!DRY_RUN && suburbMap.size > 0) {
    console.log(`\nUpserting ${suburbMap.size} entries into suburb_region_lookup...`)

    const entries = Array.from(suburbMap.values())
    const UPSERT_BATCH = 100

    for (let i = 0; i < entries.length; i += UPSERT_BATCH) {
      const batch = entries.slice(i, i + UPSERT_BATCH)
      const { error: upsertErr } = await sb
        .from('suburb_region_lookup')
        .upsert(batch, { onConflict: 'suburb,state' })

      if (upsertErr) {
        console.error(`  Upsert batch error: ${upsertErr.message}`)
      }
    }

    console.log('  Done.')
  }

  // Print region distribution
  const regionDist = {}
  for (const entry of suburbMap.values()) {
    regionDist[entry.region] = (regionDist[entry.region] || 0) + 1
  }
  console.log(`\nSuburbs by region:`)
  Object.entries(regionDist)
    .sort((a, b) => b[1] - a[1])
    .forEach(([r, c]) => console.log(`  ${r}: ${c} suburbs`))

  // Print sample entries
  console.log(`\nSample entries:`)
  const samples = Array.from(suburbMap.values()).slice(0, 20)
  for (const s of samples) {
    console.log(`  ${s.suburb}, ${s.state} -> ${s.region}`)
  }

  console.log('\nDone.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
