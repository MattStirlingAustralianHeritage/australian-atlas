#!/usr/bin/env node
// ============================================================
// Geocoding Watchdog Backfill
// Validates geocoding accuracy for all active listings that
// have not yet been checked (geocode_confidence IS NULL).
//
// Usage: node --env-file=.env.local scripts/geocoding-watchdog-backfill.js
// ============================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!MAPBOX_TOKEN) {
  console.error('Missing NEXT_PUBLIC_MAPBOX_TOKEN / MAPBOX_ACCESS_TOKEN')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Haversine distance (km) ────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Suburb normalisation ───────────────────────────────────────
function normaliseLocality(name) {
  if (!name) return ''
  let s = name.trim().toLowerCase()
  s = s.replace(/\bst\b/g, 'saint')
  s = s.replace(/\bmt\b/g, 'mount')
  s = s.replace(/\bpt\b/g, 'point')
  s = s.replace(/\bft\b/g, 'fort')
  s = s.replace(/\b(city|town|village|heights|junction|north|south|east|west)\b/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

// ── Reverse geocode via Mapbox ─────────────────────────────────
async function reverseGeocode(lat, lng) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=locality,place,neighborhood&access_token=${MAPBOX_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) return null
  return {
    locality: feature.text || '',
    placeName: feature.place_name || '',
    center: feature.center,
  }
}

// ── Validate a single listing ──────────────────────────────────
function evaluate(listing, geoResult) {
  if (!geoResult) {
    return {
      confidence: 'low',
      warning: `No reverse geocode result for coordinates (${listing.lat}, ${listing.lng})`,
    }
  }

  const mapboxLocality = geoResult.locality
  const [mapboxLng, mapboxLat] = geoResult.center
  const distance = haversineKm(listing.lat, listing.lng, mapboxLat, mapboxLng)

  const normSuburb = normaliseLocality(listing.suburb)
  const normMapbox = normaliseLocality(mapboxLocality)

  const localityMatch =
    normSuburb.length > 0 &&
    normMapbox.length > 0 &&
    (normSuburb.includes(normMapbox) || normMapbox.includes(normSuburb))

  if (distance > 5 || !localityMatch) {
    return {
      confidence: 'low',
      warning: `Coordinates are ${distance.toFixed(1)}km from ${listing.suburb}. Reverse geocode: ${mapboxLocality}`,
    }
  }

  return { confidence: 'high', warning: null }
}

// ── Fetch all eligible listings ────────────────────────────────
async function fetchListings() {
  const PAGE_SIZE = 500
  let all = []
  let offset = 0

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, lat, lng, suburb, state, address')
      .eq('status', 'active')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .is('geocode_confidence', null)
      .order('name')
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      console.error('Fetch error:', error.message)
      break
    }
    if (!data || data.length === 0) break
    all = all.concat(data)
    offset += data.length
    if (data.length < PAGE_SIZE) break
  }

  return all
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  console.log('Geocoding Watchdog Backfill')
  console.log('=' .repeat(50))

  const listings = await fetchListings()
  console.log(`Found ${listings.length} listings to validate\n`)

  if (listings.length === 0) {
    console.log('Nothing to do.')
    return
  }

  let highCount = 0
  let lowCount = 0
  let errorCount = 0
  let processed = 0

  for (const listing of listings) {
    try {
      const geoResult = await reverseGeocode(listing.lat, listing.lng)
      const { confidence, warning } = evaluate(listing, geoResult)

      const { error: updateErr } = await sb
        .from('listings')
        .update({
          geocode_confidence: confidence,
          geocode_warning: warning,
        })
        .eq('id', listing.id)

      if (updateErr) {
        console.error(`  UPDATE ERROR [${listing.name}]: ${updateErr.message}`)
        errorCount++
      } else if (confidence === 'high') {
        highCount++
      } else {
        lowCount++
        console.log(`  LOW: ${listing.name} — ${warning}`)
      }
    } catch (err) {
      errorCount++
      console.error(`  ERROR [${listing.name}]: ${err.message}`)
    }

    processed++

    // Progress log every 50 listings
    if (processed % 50 === 0) {
      console.log(`  ... ${processed}/${listings.length} processed (${highCount} high, ${lowCount} low, ${errorCount} errors)`)
    }

    // 200ms delay between requests (Mapbox rate limit)
    await new Promise((r) => setTimeout(r, 200))
  }

  // ── Summary ──────────────────────────────────────────────────
  console.log('\n' + '=' .repeat(50))
  console.log('BACKFILL COMPLETE')
  console.log('=' .repeat(50))
  console.log(`Total processed: ${processed}`)
  console.log(`High confidence:  ${highCount}`)
  console.log(`Low confidence:   ${lowCount}`)
  console.log(`Errors:           ${errorCount}`)
  console.log('\nDone.')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
