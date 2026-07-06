import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * All live regions, cached across requests (the root layout reads auth
 * cookies, so every route renders dynamically and per-page `revalidate`
 * never yields cached HTML — unstable_cache is the working amortisation
 * pattern on this codebase, see app/page.js).
 *
 * Drafts are still being seeded and archived regions have been merged away;
 * neither is public (the anon RLS policy on `regions` says the same).
 */
export const getLiveRegionsCached = unstable_cache(
  async () => {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from('regions')
      .select('id, name, slug, state, listing_count, center_lat, center_lng, map_zoom')
      .eq('status', 'live')
      .order('state')
      .order('name')
    // A transient DB failure must not poison the cache with an empty page.
    if (!data || data.length === 0) throw new Error('empty regions — refusing to cache')
    return data
  },
  ['live-regions'],
  { revalidate: 3600 }
)

const EARTH_RADIUS_KM = 6371

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

const CAPITALS = [
  { city: 'Melbourne', lat: -37.8136, lng: 144.9631 },
  { city: 'Sydney', lat: -33.8688, lng: 151.2093 },
  { city: 'Brisbane', lat: -27.4698, lng: 153.0251 },
  { city: 'Adelaide', lat: -34.9285, lng: 138.6007 },
  { city: 'Perth', lat: -31.9505, lng: 115.8605 },
  { city: 'Hobart', lat: -42.8821, lng: 147.3272 },
  { city: 'Darwin', lat: -12.4634, lng: 130.8456 },
  { city: 'Canberra', lat: -35.2809, lng: 149.1300 },
]

/**
 * Nearest capital city to a region centroid — straight-line km, purely
 * factual (no drive-time guessing). Null when the region has no centroid.
 */
export function nearestCapital(region) {
  if (region?.center_lat == null || region?.center_lng == null) return null
  let best = null
  for (const c of CAPITALS) {
    const km = haversineKm(region.center_lat, region.center_lng, c.lat, c.lng)
    if (!best || km < best.km) best = { city: c.city, km }
  }
  return best
}

/**
 * Nearest live regions to the given one, by centroid distance.
 * Returns [{ ...region, distance_km }] sorted nearest-first.
 */
export function nearbyRegions(region, allRegions, { limit = 4, maxKm = 350 } = {}) {
  if (region?.center_lat == null || region?.center_lng == null) return []
  return (allRegions || [])
    .filter(r =>
      r.id !== region.id &&
      r.center_lat != null && r.center_lng != null &&
      (r.listing_count || 0) > 0
    )
    .map(r => ({
      ...r,
      distance_km: haversineKm(region.center_lat, region.center_lng, r.center_lat, r.center_lng),
    }))
    .filter(r => r.distance_km <= maxKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limit)
}
