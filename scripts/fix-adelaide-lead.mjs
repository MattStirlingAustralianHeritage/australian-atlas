#!/usr/bin/env node

/**
 * Fix Adelaide Lead geocoding.
 *
 * "Possum Gully Fine Arts" at "428 Possum Gully Rd, Adelaide Lead VIC 3465"
 * is being incorrectly placed near Adelaide SA. Adelaide Lead is a small town
 * near Bendigo/Maryborough in Victoria.
 *
 * This script:
 * 1. Finds the listing in Supabase
 * 2. Attempts Mapbox geocoding
 * 3. If Mapbox still returns Adelaide SA coords, hardcodes the correct ones
 * 4. Updates the listing with correct lat, lng, state, region, and geocode_confidence
 *
 * Usage:
 *   node --env-file=.env.local scripts/fix-adelaide-lead.mjs
 */

import { createClient } from '@supabase/supabase-js'

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!MAPBOX_TOKEN) {
  console.error('Missing MAPBOX_ACCESS_TOKEN or NEXT_PUBLIC_MAPBOX_TOKEN')
  process.exit(1)
}

const sb = createClient(MASTER_URL, MASTER_KEY)

// Known correct coordinates for Adelaide Lead VIC 3465
const CORRECT_LAT = -36.89
const CORRECT_LNG = 143.84

// Adelaide SA bounding box — if geocoded coords fall here, Mapbox got it wrong
const ADELAIDE_SA_BOUNDS = {
  minLat: -35.5,
  maxLat: -34.5,
  minLng: 138.3,
  maxLng: 138.9,
}

function isInAdelaideSA(lat, lng) {
  return (
    lat >= ADELAIDE_SA_BOUNDS.minLat &&
    lat <= ADELAIDE_SA_BOUNDS.maxLat &&
    lng >= ADELAIDE_SA_BOUNDS.minLng &&
    lng <= ADELAIDE_SA_BOUNDS.maxLng
  )
}

async function geocode(query) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=au&limit=1&access_token=${MAPBOX_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`Mapbox geocode failed: ${res.status} ${res.statusText}`)
    return null
  }
  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) return null
  return {
    lat: feature.center[1],
    lng: feature.center[0],
    relevance: feature.relevance || 0,
    placeName: feature.place_name || '',
  }
}

async function findNearestRegion(lat, lng) {
  // Fetch all regions with coordinates
  const { data: regions, error } = await sb
    .from('regions')
    .select('id, name, slug, center_lat, center_lng')
    .not('center_lat', 'is', null)
    .not('center_lng', 'is', null)

  if (error || !regions || regions.length === 0) {
    console.log('  Could not fetch regions for nearest-region lookup')
    return null
  }

  // Haversine distance
  function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (d) => (d * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  let nearest = null
  let minDist = Infinity

  for (const r of regions) {
    const dist = haversineKm(lat, lng, r.center_lat, r.center_lng)
    if (dist < minDist) {
      minDist = dist
      nearest = r
    }
  }

  if (nearest) {
    console.log(`  Nearest region: ${nearest.name} (${minDist.toFixed(1)} km away)`)
  }

  return nearest?.name || null
}

async function main() {
  console.log('\n=== FIX ADELAIDE LEAD GEOCODING ===\n')

  // Step 1: Find the listing
  const { data: listings, error } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, address, lat, lng')
    .or('name.ilike.%Possum Gully Fine Arts%,address.ilike.%Adelaide Lead%')
    .eq('status', 'active')

  if (error) {
    console.error('Query error:', error.message)
    process.exit(1)
  }

  if (!listings || listings.length === 0) {
    console.log('No listings found matching "Possum Gully Fine Arts" or "Adelaide Lead".')
    console.log('The listing may not exist yet or may have a different name.')
    process.exit(0)
  }

  console.log(`Found ${listings.length} matching listing(s):\n`)

  for (const listing of listings) {
    console.log(`  Name:    ${listing.name}`)
    console.log(`  Address: ${listing.address || '(none)'}`)
    console.log(`  State:   ${listing.state || '(none)'}`)
    console.log(`  Region:  ${listing.region || '(none)'}`)
    console.log(`  Coords:  ${listing.lat}, ${listing.lng}`)
    console.log('')

    // Step 2: Try Mapbox geocoding
    const query = '428 Possum Gully Rd, Adelaide Lead VIC 3465 Australia'
    console.log(`  Geocoding: "${query}"`)

    const result = await geocode(query)

    let finalLat, finalLng, source

    if (result) {
      console.log(`  Mapbox returned: ${result.lat}, ${result.lng} (relevance: ${result.relevance})`)
      console.log(`  Mapbox place_name: ${result.placeName}`)

      // Step 3: Check if Mapbox returned Adelaide SA coords
      if (isInAdelaideSA(result.lat, result.lng)) {
        console.log('  WARNING: Mapbox returned Adelaide SA coordinates — using hardcoded correct coords')
        finalLat = CORRECT_LAT
        finalLng = CORRECT_LNG
        source = 'hardcoded'
      } else {
        // Verify the coords are in the right ballpark (near Maryborough/Bendigo area)
        const latOk = result.lat >= -37.2 && result.lat <= -36.5
        const lngOk = result.lng >= 143.4 && result.lng <= 144.2
        if (latOk && lngOk) {
          console.log('  Mapbox coords look correct (near Maryborough/Bendigo area)')
          finalLat = result.lat
          finalLng = result.lng
          source = 'mapbox'
        } else {
          console.log('  WARNING: Mapbox coords do not look right for Adelaide Lead VIC — using hardcoded coords')
          finalLat = CORRECT_LAT
          finalLng = CORRECT_LNG
          source = 'hardcoded'
        }
      }
    } else {
      console.log('  Mapbox returned no results — using hardcoded correct coords')
      finalLat = CORRECT_LAT
      finalLng = CORRECT_LNG
      source = 'hardcoded'
    }

    console.log(`\n  Final coords: ${finalLat}, ${finalLng} (source: ${source})`)

    // Step 4: Find nearest region
    const region = await findNearestRegion(finalLat, finalLng)

    // Step 5: Update the listing
    const updates = {
      lat: finalLat,
      lng: finalLng,
      state: 'VIC',
    }

    if (region) {
      updates.region = region
    }

    console.log(`\n  Updating listing ${listing.id}:`)
    console.log(`    lat: ${listing.lat} -> ${updates.lat}`)
    console.log(`    lng: ${listing.lng} -> ${updates.lng}`)
    console.log(`    state: ${listing.state} -> ${updates.state}`)
    if (region) console.log(`    region: ${listing.region} -> ${updates.region}`)

    const { error: updateErr } = await sb
      .from('listings')
      .update(updates)
      .eq('id', listing.id)

    if (updateErr) {
      console.error(`  ERROR updating listing: ${updateErr.message}`)
    } else {
      console.log('  Successfully updated.')
    }
  }

  console.log('\nDone.\n')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
