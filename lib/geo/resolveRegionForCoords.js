// ─────────────────────────────────────────────────────────────────────────────
// Resolve the region a coordinate belongs to.
//
// The listings table has a trigger (migration 097) that sets region_computed_id
// by PostGIS polygon containment on every lat/lng write. But several regions are
// unpolygonised, and some live polygons don't reach their full extent — e.g. the
// "South Coast NSW" polygon stops short of the far south coast, so Narooma
// (-36.22, 150.13) is contained by NO polygon and computes to NULL. A listing
// with a NULL computed region and no override renders with no region label.
//
// This helper mirrors the trigger's containment check, then falls back to the
// nearest region centre (same state, within a sane radius) so the caller can
// populate region_override_id and guarantee a label. The text `listings.region`
// column is display-dead (see lib/regions/getListingRegion.js) — region must be
// expressed through the FK columns, which is what callers of this helper do.
// ─────────────────────────────────────────────────────────────────────────────

import { haversineKm } from './anchoredGeocode.js'

/**
 * @param {object} sb       Supabase admin client.
 * @param {number} lat
 * @param {number} lng
 * @param {object} [opts]
 * @param {string} [opts.state]        Listing state code — restricts the nearest-centre fallback to that state.
 * @param {number} [opts.maxNearestKm] Max distance (km) for the nearest-centre fallback. Default 200.
 * @returns {Promise<null | { id: string, name: string, state: string|null, source: 'computed'|'nearest', distKm: number }>}
 */
export async function resolveRegionForCoords(sb, lat, lng, opts = {}) {
  const { state = null, maxNearestKm = 200 } = opts
  if (lat == null || lng == null) return null

  // 1. Polygon containment — identical logic to the listings trigger.
  try {
    const { data: contained } = await sb.rpc('find_containing_region', { p_lat: lat, p_lng: lng })
    if (contained?.[0]) {
      return { id: contained[0].id, name: contained[0].name, state: contained[0].state ?? null, source: 'computed', distKm: 0 }
    }
  } catch {
    // RPC missing/unavailable → fall through to nearest-centre.
  }

  // 2. Nearest region centre (state-filtered when known).
  let query = sb
    .from('regions')
    .select('id, name, state, center_lat, center_lng, status')
    .not('center_lat', 'is', null)
    .not('center_lng', 'is', null)
    .in('status', ['live', 'draft'])
  if (state) query = query.eq('state', state)
  const { data: regions } = await query

  let best = null
  let min = Infinity
  for (const r of regions || []) {
    const d = haversineKm(lat, lng, r.center_lat, r.center_lng)
    if (d < min) {
      min = d
      best = r
    }
  }

  if (best && min <= maxNearestKm) {
    return { id: best.id, name: best.name, state: best.state ?? null, source: 'nearest', distKm: min }
  }
  return null
}
