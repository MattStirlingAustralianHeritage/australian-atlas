import { getSupabaseAdmin } from '../supabase/clients.js'

/**
 * Update denormalized listing_count on each region.
 *
 * Uses case-insensitive matching against the listings.region field,
 * with alias support for regions that go by multiple names.
 *
 * Once GeoJSON polygons are populated, switch to the spatial
 * listings_in_region() RPC for more accurate matching.
 */

// Known aliases → canonical region names
// Handles cases where verticals use slightly different region strings
const REGION_ALIASES = {
  'Hobart': 'Hobart & Southern Tasmania',
  'Southern Tasmania': 'Hobart & Southern Tasmania',
  'Daylesford': 'Daylesford & Hepburn Springs',
  'Hepburn Springs': 'Daylesford & Hepburn Springs',
  'Hepburn': 'Daylesford & Hepburn Springs',
  'Fremantle': 'Fremantle & Swan Valley',
  'Swan Valley': 'Fremantle & Swan Valley',
  'Launceston': 'Launceston & Tamar Valley',
  'Tamar Valley': 'Launceston & Tamar Valley',
  'Byron Bay': 'Byron Hinterland',
  'Canberra': 'Canberra District',
  'Alice Springs': 'Alice Springs & Red Centre',
  'Red Centre': 'Alice Springs & Red Centre',
  'Darwin': 'Darwin & Top End',
  'Top End': 'Darwin & Top End',
  // Metro suburb aliases — inner suburbs map to metro region
  'Fitzroy': 'Melbourne',
  'Collingwood': 'Melbourne',
  'Carlton': 'Melbourne',
  'South Melbourne': 'Melbourne',
  'Richmond': 'Melbourne',
  'Prahran': 'Melbourne',
  'St Kilda': 'Melbourne',
  'Brunswick': 'Melbourne',
  'Northcote': 'Melbourne',
  'Elsternwick': 'Melbourne',
  'South Yarra': 'Melbourne',
  'Footscray': 'Melbourne',
  'Surry Hills': 'Sydney',
  'Newtown': 'Sydney',
  'Paddington': 'Sydney',
  'Marrickville': 'Sydney',
  'Redfern': 'Sydney',
  'Glebe': 'Sydney',
  'Darlinghurst': 'Sydney',
  'Bondi': 'Sydney',
  'Fortitude Valley': 'Brisbane',
  'West End': 'Brisbane',
  'New Farm': 'Brisbane',
  'South Brisbane': 'Brisbane',
  'Leederville': 'Perth',
  'Northbridge': 'Perth',
  'Mount Lawley': 'Perth',
  'Subiaco': 'Perth',
}

export async function updateRegionCounts() {
  const master = getSupabaseAdmin()

  const { data: regions } = await master.from('regions').select('id, name, slug, min_listing_threshold')
  if (!regions) return

  // Build alias lookup: canonical → [aliases]
  const aliasReverse = {}
  for (const [alias, canonical] of Object.entries(REGION_ALIASES)) {
    if (!aliasReverse[canonical]) aliasReverse[canonical] = []
    aliasReverse[canonical].push(alias)
  }

  for (const region of regions) {
    // Build OR filter: match canonical name or any alias
    const terms = [region.name, ...(aliasReverse[region.name] || [])]

    // Use the primary name for the main count
    const { count: primaryCount } = await master
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .ilike('region', `%${region.name}%`)

    // Add alias matches (these are usually small numbers)
    let aliasCount = 0
    for (const alias of (aliasReverse[region.name] || [])) {
      // Only count aliases that DON'T overlap with the primary name
      // e.g. "Hobart" is a substring of "Hobart & Southern Tasmania" — skip
      if (region.name.toLowerCase().includes(alias.toLowerCase())) continue

      const { count } = await master
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .ilike('region', `%${alias}%`)

      aliasCount += (count || 0)
    }

    const totalCount = (primaryCount || 0) + aliasCount
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
