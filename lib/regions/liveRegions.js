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
