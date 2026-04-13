import { getSupabaseAdmin } from '../supabase/clients.js'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

// ── Australian postcode-to-state mapping ──────────────────────
const POSTCODE_RANGES = [
  { state: 'NSW', ranges: [[1000, 2599], [2619, 2899], [2921, 2999]] },
  { state: 'VIC', ranges: [[3000, 3999], [8000, 8999]] },
  { state: 'QLD', ranges: [[4000, 4999], [9000, 9999]] },
  { state: 'SA',  ranges: [[5000, 5799], [5800, 5999]] },
  { state: 'WA',  ranges: [[6000, 6797], [6800, 6999]] },
  { state: 'TAS', ranges: [[7000, 7999]] },
  { state: 'NT',  ranges: [[800, 899], [900, 999]] },
  { state: 'ACT', ranges: [[200, 299], [2600, 2618], [2900, 2920]] },
]

// State bounding boxes for coordinate-to-state lookup
const STATE_BOUNDS = {
  NSW: { minLat: -37.6, maxLat: -28.1, minLng: 140.9, maxLng: 153.7 },
  VIC: { minLat: -39.3, maxLat: -33.9, minLng: 140.8, maxLng: 150.1 },
  QLD: { minLat: -29.3, maxLat: -10.0, minLng: 137.9, maxLng: 153.6 },
  SA:  { minLat: -38.2, maxLat: -25.9, minLng: 128.9, maxLng: 141.1 },
  WA:  { minLat: -35.3, maxLat: -13.6, minLng: 112.8, maxLng: 129.1 },
  TAS: { minLat: -43.8, maxLat: -39.5, minLng: 143.7, maxLng: 148.5 },
  ACT: { minLat: -36.0, maxLat: -35.0, minLng: 148.6, maxLng: 149.5 },
  NT:  { minLat: -26.1, maxLat: -10.0, minLng: 128.9, maxLng: 138.1 },
}

function stateFromPostcode(postcode) {
  const num = parseInt(postcode, 10)
  if (isNaN(num)) return null
  for (const { state, ranges } of POSTCODE_RANGES) {
    for (const [min, max] of ranges) {
      if (num >= min && num <= max) return state
    }
  }
  return null
}

function extractPostcodeFromAddress(address) {
  if (!address) return null
  const match = address.match(/\b(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s*(\d{4})\b/i)
  if (match) return match[1]
  const endMatch = address.match(/\b(\d{4})\s*$/)
  if (endMatch) return endMatch[1]
  const ntMatch = address.match(/\b(0\d{3})\b/)
  if (ntMatch) return ntMatch[1]
  return null
}

function stateFromCoords(lat, lng) {
  for (const [state, b] of Object.entries(STATE_BOUNDS)) {
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
      return state
    }
  }
  return null
}

// ── Haversine distance (km) ────────────────────────────────────
export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Suburb normalisation for comparison ────────────────────────
// Handles common Australian variations: "St" ↔ "Saint", "Mt" ↔ "Mount",
// "Pt" ↔ "Point", and trims generic suffixes like "City", "Town", etc.
function normaliseLocality(name) {
  if (!name) return ''
  let s = name.trim().toLowerCase()
  // Expand common abbreviations
  s = s.replace(/\bst\b/g, 'saint')
  s = s.replace(/\bmt\b/g, 'mount')
  s = s.replace(/\bpt\b/g, 'point')
  s = s.replace(/\bft\b/g, 'fort')
  s = s.replace(/\bgreat\b/g, 'great') // no-op, just for clarity
  // Strip generic suffixes that Mapbox may include/exclude
  s = s.replace(/\b(city|town|village|heights|junction|north|south|east|west)\b/g, '')
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

// ── Reverse geocode via Mapbox ─────────────────────────────────
async function reverseGeocode(lat, lng) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=locality,place,neighborhood&access_token=${MAPBOX_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Mapbox reverse geocode failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) return null
  return {
    locality: feature.text || '',
    placeName: feature.place_name || '',
    center: feature.center, // [lng, lat]
  }
}

// ── Main validation function ───────────────────────────────────
/**
 * Validate the geocoding accuracy of a listing by reverse-geocoding
 * its coordinates and comparing to the stated suburb/locality.
 *
 * Updates geocode_confidence and geocode_warning on the listing row.
 *
 * @param {{ id: string, name: string, lat: number, lng: number, suburb: string, state: string, address?: string }} listing
 * @returns {{ confidence: 'high'|'low'|null, warning: string|null }}
 */
export async function validateGeocode(listing) {
  const { id, name, lat, lng, suburb } = listing

  // Nothing to validate without coordinates
  if (lat == null || lng == null) {
    return { confidence: null, warning: null }
  }

  if (!MAPBOX_TOKEN) {
    throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN is not set')
  }

  const result = await reverseGeocode(lat, lng)

  // Mapbox returned no features — can't validate
  if (!result) {
    const outcome = {
      confidence: 'low',
      warning: `No reverse geocode result for coordinates (${lat}, ${lng})`,
    }
    await persistResult(id, outcome)
    return outcome
  }

  const mapboxLocality = result.locality
  const [mapboxLng, mapboxLat] = result.center
  const distance = haversineKm(lat, lng, mapboxLat, mapboxLng)

  // Compare localities (case-insensitive, with abbreviation expansion)
  const normSuburb = normaliseLocality(suburb)
  const normMapbox = normaliseLocality(mapboxLocality)

  // Consider a match if one contains the other (handles "Melbourne" matching
  // "Melbourne CBD" or "South Melbourne" being close enough to "Melbourne")
  const localityMatch =
    normSuburb.length > 0 &&
    normMapbox.length > 0 &&
    (normSuburb.includes(normMapbox) || normMapbox.includes(normSuburb))

  if (distance > 5 || !localityMatch) {
    const outcome = {
      confidence: 'low',
      warning: `Coordinates are ${distance.toFixed(1)}km from ${suburb}. Reverse geocode: ${mapboxLocality}`,
    }
    await persistResult(id, outcome)
    return outcome
  }

  // ── State boundary check (postcode vs geocoded state) ───────
  const address = listing.address || ''
  const postcode = extractPostcodeFromAddress(address)

  if (postcode) {
    const expectedState = stateFromPostcode(postcode)
    const geocodedState = stateFromCoords(lat, lng)

    if (expectedState && geocodedState && expectedState !== geocodedState) {
      const outcome = {
        confidence: 'low',
        warning: `State mismatch: address postcode ${postcode} suggests ${expectedState} but coordinates are in ${geocodedState}`,
      }
      await persistResult(id, outcome)
      return outcome
    }
  }

  // Distance <= 5km, localities match, and state boundary check passed
  const outcome = { confidence: 'high', warning: null }
  await persistResult(id, outcome)
  return outcome
}

// ── Persist result to Supabase ─────────────────────────────────
async function persistResult(listingId, { confidence, warning }) {
  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from('listings')
    .update({
      geocode_confidence: confidence,
      geocode_warning: warning,
    })
    .eq('id', listingId)

  if (error) {
    console.error(
      `[geocoding-watchdog] Failed to update listing ${listingId}:`,
      error.message
    )
  }
}
