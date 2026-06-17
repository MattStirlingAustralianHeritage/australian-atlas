import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { extractStateFromPlaceName } from '@/lib/geo/stateDerivation'
import { anchoredGeocode } from '@/lib/geo/anchoredGeocode'
import { resolveRegionForCoords } from '@/lib/geo/resolveRegionForCoords'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'

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

export async function POST(request, { params }) {
  // Admin-only: writes to listing_candidates via the service-role client.
  // (Every sibling candidate route already gates on checkAdmin; this one didn't.)
  if (!(await checkAdmin(await cookies()))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
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

  // Geocode with a locality anchor: the postcode/suburb validates the precise
  // result and supplies a town-level fallback for hard-to-address places
  // (reserves, islands, national parks) whose street string Mapbox can't
  // resolve — so the pin lands in the right town/region instead of a
  // same-named street hundreds of km away. See lib/geo/anchoredGeocode.js.
  const geo = await anchoredGeocode({ address, suburb, state })

  if (!geo) {
    return NextResponse.json({
      lat: null,
      lng: null,
      place_name: null,
      geocode_failed: true,
      precision: null,
      suggested_region_id: null,
      suggested_region_name: null,
    })
  }

  // Persist lat/lng (and derived state when the reviewer didn't
  // explicitly provide one) to the candidate row.
  const geoPatch = { lat: geo.lat, lng: geo.lng }
  if (!state) {
    const derivedState = geo.derivedState || extractStateFromPlaceName(geo.placeName)
    if (derivedState) {
      geoPatch.state = derivedState
      console.log(`[geocode] Derived state ${derivedState} from place_name for candidate ${id}`)
    }
  }
  await sb
    .from('listing_candidates')
    .update(geoPatch)
    .eq('id', id)

  // Region suggestion: spatial containment first, then nearest region centre
  // (state-filtered) so far-flung points outside every polygon — e.g. the far
  // south coast — still pre-fill a sensible region rather than nothing.
  const region = await resolveRegionForCoords(sb, geo.lat, geo.lng, {
    state: geoPatch.state || state || null,
  })

  return NextResponse.json({
    lat: geo.lat,
    lng: geo.lng,
    place_name: geo.placeName,
    geocode_failed: false,
    precision: geo.precision,
    suggested_region_id: region?.id || null,
    suggested_region_name: region?.name || null,
  })
}
