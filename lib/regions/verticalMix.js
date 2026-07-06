import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { localizeVerticalKicker } from '@/lib/i18n/listingLabels'
import { VERTICAL_ACCENTS } from '@/lib/verticalUrl'

export const VERTICAL_SHORT_LABELS = {
  sba: 'Small Batch',
  fine_grounds: 'Fine Grounds',
  collection: 'Culture',
  craft: 'Craft',
  rest: 'Rest',
  field: 'Field',
  corner: 'Corner',
  found: 'Found',
  table: 'Table',
  way: 'Way',
}

// Per-region category mix for the region index cards (/regions, /explore) —
// one paged sweep over active listings (PostgREST caps responses at 1000
// rows), aggregated to { region_id: { vertical: count } } and cached for an
// hour.
export const getRegionVerticalMixCached = unstable_cache(
  async () => {
    const sb = getSupabaseAdmin()
    const mix = {}
    for (let page = 0; page < 20; page++) {
      const { data, error } = await sb
        .from('listings_with_region')
        .select('region_id, vertical')
        .eq('status', 'active')
        .not('region_id', 'is', null)
        .order('id', { ascending: true })
        .range(page * 1000, page * 1000 + 999)
      if (error) throw error
      for (const row of data || []) {
        if (!mix[row.region_id]) mix[row.region_id] = {}
        mix[row.region_id][row.vertical] = (mix[row.region_id][row.vertical] || 0) + 1
      }
      if (!data || data.length < 1000) break
    }
    if (Object.keys(mix).length === 0) throw new Error('empty vertical mix — refusing to cache')
    return mix
  },
  ['regions-index-vertical-mix'],
  { revalidate: 3600 }
)

// Top-3 category chips for a RegionIndexCard, already localized.
export function regionCardChips(region, verticalMix, locale) {
  const counts = verticalMix[region.id] || {}
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([v, count]) => ({
      key: v,
      label: localizeVerticalKicker(v, VERTICAL_SHORT_LABELS[v] || v, locale),
      count,
      color: VERTICAL_ACCENTS[v] || '#888',
    }))
}
