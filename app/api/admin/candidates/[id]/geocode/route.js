import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { extractStateFromPlaceName } from '@/lib/geo/stateDerivation'

// ─────────────────────────────────────────────────────────────────────
// POST /api/admin/candidates/[id]/geocode
//
// Called when the reviewer blurs out of the address field on a
// candidate review card. Geocodes via Mapbox, persists the resulting
// lat/lng (and the reviewer's edited address/state) to the candidate
// row, and runs spatial-containment lookup against the regions
// polygon set so the UI can pre-fill the region dropdown.
//
// The candidate table doesn't have a trigger like listings does, so
// this endpoint stands in for the trigger by calling the
// `find_containing_region(lat, lng)` SQL function (migration 111),
// which uses the same st_contains logic and ordering as
// listings_recompute_region(). Behaviour stays consistent with how
// region_computed_id is populated automatically on listings.
//
// Body: { address, suburb?, state? }
// Response (always 200 unless validation fails):
//   {
//     lat: number | null,
//     lng: number | null,
//     place_name: string | null,
//     geocode_failed: boolean,
//     suggested_region_id: string | null,
//     suggested_region_name: string | null,
//   }
//
// Returns geocode_failed=true when Mapbox returns no result; the
// caller leaves both address and region as the reviewer entered them.
// Returns suggested_region_id=null when the geocoded point falls
// outside any polygonised region; the caller surfaces a manual-flag.
// ─────────────────────────────────────────────────────────────────────

async function geocodeAustralianAddress({ address, suburb, state }) {
  // At least one of {address, suburb} must be present so Mapbox has
  // something to geocode against. The reviewer flow allows blur of
  // either field individually — suburb-only is a valid query
  // ("Adelaide, SA, Australia" → centre of Adelaide).
  if (!address && !suburb) return null
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN
  if (!token) return null
  try {
    const parts = [address, suburb, state, 'Australia'].filter(Boolean)
    const query = parts.join(', ')
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=au&limit=1&access_token=${token}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const feature = data.features?.[0]
    if (!feature) return null
    return { lat: feature.center[1], lng: feature.center[0], place_name: feature.place_name || null }
  } catch {
    return null
  }
}

export async function POST(request, { params }) {
  const { id } = await params
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const address = (body.address || '').trim()
  const suburb = (body.suburb || '').trim() || null
  const state = (body.state || '').trim() || null

  // At least one of {address, suburb} must be present. Reviewer flow allows
  // blurring either field individually with the other still empty — e.g. the
  // reviewer types only the suburb and tabs out, expecting Mapbox to centre
  // on the suburb itself.
  if (!address && !suburb) {
    return NextResponse.json({ error: 'address or suburb is required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Persist the reviewer's edited address and state to the candidate row.
  // (suburb has no column on listing_candidates; it lives in form state
  // and is sent to the publish handler when the reviewer hits publish.)
  // Skip the persist when there's nothing to write — e.g. suburb-only call
  // with no address and no state would result in an empty patch.
  const persistPatch = {}
  if (address) persistPatch.address = address
  if (state) persistPatch.state = state
  if (Object.keys(persistPatch).length > 0) {
    await sb.from('listing_candidates').update(persistPatch).eq('id', id)
  }

  // Geocode.
  const geo = await geocodeAustralianAddress({ address, suburb, state })

  if (!geo) {
    return NextResponse.json({
      lat: null,
      lng: null,
      place_name: null,
      geocode_failed: true,
      suggested_region_id: null,
      suggested_region_name: null,
    })
  }

  // Persist lat/lng (and derived state when the reviewer didn't
  // explicitly provide one) to the candidate row.
  const geoPatch = { lat: geo.lat, lng: geo.lng }
  if (!state) {
    const derivedState = extractStateFromPlaceName(geo.place_name)
    if (derivedState) {
      geoPatch.state = derivedState
      console.log(`[geocode] Derived state ${derivedState} from place_name for candidate ${id}`)
    }
  }
  await sb
    .from('listing_candidates')
    .update(geoPatch)
    .eq('id', id)

  // Spatial-containment lookup. NULL when the point falls in any of the
  // 13 unpolygonised draft regions or outside any region entirely.
  const { data: matches } = await sb.rpc('find_containing_region', {
    p_lat: geo.lat,
    p_lng: geo.lng,
  })
  const region = matches?.[0] || null

  return NextResponse.json({
    lat: geo.lat,
    lng: geo.lng,
    place_name: geo.place_name,
    geocode_failed: false,
    suggested_region_id: region?.id || null,
    suggested_region_name: region?.name || null,
  })
}
