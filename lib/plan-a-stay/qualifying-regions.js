import { getSupabaseAdmin } from '@/lib/supabase/clients'

/* ═══════════════════════════════════════════════════════════════════════
   Qualifying regions for Plan-a-Stay
   ═══════════════════════════════════════════════════════════════════════
   Returns regions with ≥ THRESHOLD active, visitable Rest listings,
   ordered by listing count descending (deepest coverage first).

   Uses the listings_with_region view (coalesce override/computed)
   so region assignment is consistent with the rest of the platform.

   Single source of truth — consumed by:
     • /plan-a-stay-v2 page (server prop for the client component)
     • /api/plan-a-stay/regions (public JSON endpoint)
     • /api/plan-a-stay/regions-geojson (polygon map data)          */

const THRESHOLD = 5

/**
 * @returns {Promise<Array<{ name: string, state: string, slug: string, listing_count: number, lat: number|null, lng: number|null }>>}
 */
export async function getQualifyingRegions() {
  const sb = getSupabaseAdmin()

  // 1. All active, visitable Rest listings with resolved region
  const { data: listings, error: listErr } = await sb
    .from('listings_with_region')
    .select('region_id')
    .eq('vertical', 'rest')
    .eq('status', 'active')
    .eq('visitable', true)

  if (listErr) {
    console.error('[qualifying-regions] listings query error:', listErr.message)
    return []
  }

  // 2. All regions (id → name, state, slug)
  const { data: regions, error: regErr } = await sb
    .from('regions')
    .select('id, name, state, slug, center_lat, center_lng')

  if (regErr) {
    console.error('[qualifying-regions] regions query error:', regErr.message)
    return []
  }

  const regionMap = new Map()
  regions.forEach(r => regionMap.set(r.id, r))

  // 3. Count per region
  const counts = new Map()
  listings.forEach(l => {
    if (!l.region_id) return
    counts.set(l.region_id, (counts.get(l.region_id) || 0) + 1)
  })

  // 4. Filter ≥ threshold, attach count, sort by count desc
  const qualifying = []
  for (const [regionId, count] of counts) {
    if (count < THRESHOLD) continue
    const r = regionMap.get(regionId)
    if (!r) continue
    qualifying.push({
      name: r.name,
      state: r.state,
      slug: r.slug,
      listing_count: count,
      lat: r.center_lat ?? null,
      lng: r.center_lng ?? null,
    })
  }

  qualifying.sort((a, b) => b.listing_count - a.listing_count)

  return qualifying
}
