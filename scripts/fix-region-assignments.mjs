#!/usr/bin/env node
// ============================================================
// Fix region assignments for all active listings
//
// The region field on many listings contains suburb names, street
// addresses, or incorrect regional assignments (e.g. inner Melbourne
// suburbs showing "Yarra Valley"). This script:
//
// 1. Loads all active listings with lat/lng coordinates
// 2. For each listing, determines the correct Atlas region using:
//    a. Metro bounding boxes (inner-city -> metro region)
//    b. Nearest region center point (non-metro areas)
// 3. Optionally uses Mapbox reverse geocoding to populate the
//    suburb field on listings that lack one
// 4. Compares to current region value and updates if different
//
// Usage:
//   node --env-file=.env.local scripts/fix-region-assignments.mjs --dry-run
//   node --env-file=.env.local scripts/fix-region-assignments.mjs
//   node --env-file=.env.local scripts/fix-region-assignments.mjs --fill-suburbs
//
// Flags:
//   --dry-run        Report changes without writing to DB
//   --fill-suburbs   Also reverse-geocode to populate empty suburb fields
//   --verbose        Print every listing checked
//
// Idempotent: safe to run multiple times. Only writes when region
// would actually change.
// ============================================================

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN
const DRY_RUN = process.argv.includes('--dry-run')
const FILL_SUBURBS = process.argv.includes('--fill-suburbs')
const VERBOSE = process.argv.includes('--verbose')
const BATCH_SIZE = 500
const DELAY_MS = 200 // 5 requests/second for Mapbox

// ── Metro bounding boxes ────────────────────────────────────
// Cover inner/middle suburbs of each capital city.
// Listings within these boxes get assigned to the metro region
// UNLESS they fall in an exclusion sub-region (e.g. Fremantle
// within the Perth box).
//
// Note: Perth is tricky because Fremantle (SW) and Swan Valley
// (NE) are distinct regions that overlap with the metro area.
// We use exclusion zones to keep those separate.
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
    // Tighter box: excludes Fremantle port area (south of -32.00) and
    // Swan Valley (east of 115.95). These are separate Atlas regions.
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

// Regions that should never be used as nearest-match targets
// because they're handled by bounding boxes instead
const METRO_REGION_NAMES = new Set([
  'Melbourne', 'Sydney', 'Brisbane', 'Adelaide', 'Perth',
  'Hobart City', 'Newcastle', 'Geelong', 'Wollongong',
])

// ── Known region aliases ────────────────────────────────────
// From updateRegionCounts.js — maps variant names to canonical
const REGION_ALIASES = {
  'Hobart': 'Hobart & Southern Tasmania',
  'Southern Tasmania': 'Hobart & Southern Tasmania',
  'Daylesford': 'Daylesford & Hepburn Springs',
  'Hepburn Springs': 'Daylesford & Hepburn Springs',
  'Hepburn': 'Daylesford & Hepburn Springs',
  'Fremantle': 'Fremantle & Swan Valley',
  'Swan Valley': 'Fremantle & Swan Valley',
  'Launceston': 'Launceston & Tamar Valley',
  'Tamar Valley': 'Launceston & Tamar Valley',
  'Byron Bay': 'Byron Bay',
  'Canberra': 'Canberra District',
  'Alice Springs': 'Alice Springs & Red Centre',
  'Red Centre': 'Alice Springs & Red Centre',
  'Darwin': 'Darwin & Top End',
  'Top End': 'Darwin & Top End',
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
  return { suburb: feat.text || null }
}

// ── Check metro bounding box ────────────────────────────────
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

  for (const r of regions) {
    // Skip metro regions — those are handled by bounding boxes
    if (METRO_REGION_NAMES.has(r.name)) continue

    // Prefer same-state, but don't require it (border regions)
    const statePenalty = (state && r.state !== state) ? 1.5 : 1.0
    const dist = haversine(lat, lng, r.center_lat, r.center_lng) * statePenalty

    if (dist < minDist) { minDist = dist; nearest = r }
  }

  // Only assign if reasonably close (within 200km)
  return nearest && minDist < 200 ? { name: nearest.name, dist: minDist } : null
}

// ── Resolve canonical region name ───────────────────────────
// Checks if the current region value matches a known alias
function resolveAlias(region) {
  if (!region) return null
  return REGION_ALIASES[region] || null
}

// ── Determine correct region for a listing ──────────────────
function determineRegion(listing, regions, validRegionNames) {
  const { lat, lng, state, region: currentRegion } = listing

  // 1. If current region is already a valid region name, keep it.
  //    This preserves correct assignments like "Fremantle & Swan Valley"
  //    for Fremantle venues, even if they fall within a metro bounding box.
  if (currentRegion && validRegionNames.has(currentRegion)) {
    return { region: currentRegion, method: 'existing_valid' }
  }

  // 2. Check if current region is a known alias and resolve it
  const alias = resolveAlias(currentRegion)
  if (alias && validRegionNames.has(alias)) {
    return { region: alias, method: 'alias_resolved' }
  }

  // 3. Check metro bounding box (for listings with junk/null region values)
  const metro = getMetroRegion(lat, lng, state)
  if (metro) return { region: metro, method: 'metro_bbox' }

  // 4. Fall back to nearest region center point
  const nearest = nearestRegion(lat, lng, regions, state)
  if (nearest) return { region: nearest.name, method: 'nearest', dist: nearest.dist }

  // 5. Give up
  return { region: null, method: 'unresolved' }
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log(`Region Assignment Fixer${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log(`Fill suburbs: ${FILL_SUBURBS ? 'yes' : 'no'}\n`)

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

  const validRegionNames = new Set(regions.map(r => r.name))
  console.log(`Loaded ${regions.length} regions\n`)

  // Fetch all active listings
  let allListings = []
  let offset = 0

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, slug, vertical, suburb, state, lat, lng, address, region')
      .eq('status', 'active')
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('Fetch error:', error.message); break }
    if (!data || data.length === 0) break
    allListings = allListings.concat(data)
    offset += data.length
    if (data.length < BATCH_SIZE) break
  }

  console.log(`Fetched ${allListings.length} active listings\n`)

  // Stats
  let totalChecked = 0
  let totalCorrected = 0
  let totalSkipped = 0
  let totalNoCoords = 0
  let totalUnresolved = 0
  let suburbsFilled = 0
  let geocodeCalls = 0

  const changeSummary = {} // "oldRegion -> newRegion" -> count
  const methodCounts = { metro_bbox: 0, existing_valid: 0, alias_resolved: 0, nearest: 0, unresolved: 0 }
  const corrections = [] // Detailed log of changes

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

    // Determine correct region
    const result = determineRegion(listing, regions, validRegionNames)
    methodCounts[result.method] = (methodCounts[result.method] || 0) + 1

    if (!result.region) {
      totalUnresolved++
      if (VERBOSE) {
        console.log(`  UNRESOLVED: ${listing.name} (${listing.lat}, ${listing.lng})`)
      }
      continue
    }

    // Check if region needs to change
    const oldRegion = listing.region || '(null)'
    const newRegion = result.region

    if (oldRegion === newRegion) {
      totalSkipped++
      continue
    }

    // Build update payload
    const update = { region: newRegion }

    // Optionally fill suburb via reverse geocoding
    if (FILL_SUBURBS && !listing.suburb && MAPBOX_TOKEN) {
      try {
        const geo = await reverseGeocode(listing.lat, listing.lng)
        if (geo?.suburb) {
          update.suburb = geo.suburb
          suburbsFilled++
        }
        geocodeCalls++
        await new Promise(r => setTimeout(r, DELAY_MS))
      } catch (err) {
        // Geocode failed, continue without suburb
      }
    }

    // Log the change
    const changeKey = `${oldRegion} -> ${newRegion}`
    changeSummary[changeKey] = (changeSummary[changeKey] || 0) + 1
    corrections.push({
      name: listing.name,
      vertical: listing.vertical,
      old: oldRegion,
      new: newRegion,
      method: result.method,
    })

    if (VERBOSE) {
      console.log(`  ${listing.name}: ${oldRegion} -> ${newRegion} [${result.method}]`)
    }

    // Write to DB (unless dry run)
    if (!DRY_RUN) {
      const { error: updateErr } = await sb
        .from('listings')
        .update(update)
        .eq('id', listing.id)

      if (updateErr) {
        console.error(`  WRITE ERROR: ${listing.name} — ${updateErr.message}`)
        continue
      }
    }

    totalCorrected++
  }

  // ── Report ──────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70))
  console.log(DRY_RUN ? 'DRY RUN SUMMARY' : 'SUMMARY')
  console.log('='.repeat(70))
  console.log(`Total checked:    ${totalChecked}`)
  console.log(`Total corrected:  ${totalCorrected}`)
  console.log(`Already correct:  ${totalSkipped}`)
  console.log(`No coordinates:   ${totalNoCoords}`)
  console.log(`Unresolved:       ${totalUnresolved}`)
  if (FILL_SUBURBS) {
    console.log(`Suburbs filled:   ${suburbsFilled}`)
    console.log(`Geocode calls:    ${geocodeCalls}`)
  }

  console.log(`\nAssignment method breakdown:`)
  for (const [method, count] of Object.entries(methodCounts)) {
    if (count > 0) console.log(`  ${method}: ${count}`)
  }

  if (Object.keys(changeSummary).length > 0) {
    console.log(`\nRegion changes (old -> new):`)
    const sorted = Object.entries(changeSummary).sort((a, b) => b[1] - a[1])
    for (const [change, count] of sorted) {
      console.log(`  ${change}: ${count}`)
    }
  }

  // Print all individual corrections
  if (corrections.length > 0 && corrections.length <= 500) {
    console.log(`\nAll corrections:`)
    for (const c of corrections) {
      console.log(`  ${c.name}: ${c.old} -> ${c.new}`)
    }
  } else if (corrections.length > 500) {
    console.log(`\nFirst 200 corrections (${corrections.length} total):`)
    for (const c of corrections.slice(0, 200)) {
      console.log(`  ${c.name}: ${c.old} -> ${c.new}`)
    }
    console.log(`  ... and ${corrections.length - 200} more`)
  }

  console.log('\nDone.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
