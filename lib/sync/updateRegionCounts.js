import { getSupabaseAdmin } from '../supabase/clients.js'

/**
 * Update denormalised listing_count on each region.
 *
 * Counts active listings whose effective region resolves to the row,
 * via the FK columns populated by the spatial-containment trigger
 * (region_computed_id) and admin overrides (region_override_id).
 * A listing belongs to a region if either FK matches; the precedence
 * (override-wins) only matters for display, not for counting.
 *
 * Replaces the legacy ilike + alias map (Phase 3 step 1, Batch 7).
 * The legacy text column listings.region is no longer consulted.
 */
export async function updateRegionCounts() {
  const master = getSupabaseAdmin()

  const { data: regions, error: regionsError } = await master
    .from('regions')
    .select('id, name, slug, min_listing_threshold')
  if (regionsError) {
    console.error('[sync] updateRegionCounts: failed to load regions:', regionsError.message)
    return
  }
  if (!regions) return

  for (const region of regions) {
    const { count, error: countError } = await master
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .or(`region_computed_id.eq.${region.id},region_override_id.eq.${region.id}`)

    if (countError) {
      console.error(`[sync] updateRegionCounts: count failed for ${region.slug}:`, countError.message)
      continue
    }

    const totalCount = count || 0
    const threshold = region.min_listing_threshold || 15

    await master
      .from('regions')
      .update({
        listing_count: totalCount,
        ...(totalCount >= threshold ? { status: 'live' } : {}),
      })
      .eq('id', region.id)
  }

  console.log(`[sync] Updated listing counts for ${regions.length} regions`)
}
