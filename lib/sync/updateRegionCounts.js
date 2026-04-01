import { getSupabaseAdmin } from '../supabase/clients.js'

/**
 * Update denormalized listing_count on each region.
 * Uses the region name matching against listing.region field.
 *
 * Note: This is a text-based match until GeoJSON polygons are added.
 * Once polygons exist, the spatial `listings_in_region` RPC can be used instead.
 */
export async function updateRegionCounts() {
  const master = getSupabaseAdmin()

  const { data: regions } = await master.from('regions').select('id, name, slug')
  if (!regions) return

  for (const region of regions) {
    // Match on region name (case-insensitive partial match)
    const { count } = await master
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .ilike('region', `%${region.name}%`)

    await master
      .from('regions')
      .update({ listing_count: count || 0 })
      .eq('id', region.id)
  }

  console.log(`[sync] Updated listing counts for ${regions.length} regions`)
}
