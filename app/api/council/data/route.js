import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { filterByVertical, relationHasVerticals } from '@/lib/listings/verticalFilter'
import { excludeTestListings, excludeNeedsReview } from '@/lib/listings/publicFilter'
import { validateCouncilSession } from '@/lib/council-session'
import { computeRegionMetricsBatch } from '@/lib/analytics/regionMetrics'

// Council reporting window. The pageviews dataset is young; 90 days captures the
// full history and matches a quarterly council reporting cadence.
const RANGE_DAYS = { '30d': 30, '90d': 90, '1y': 365 }
function sinceFromRange(range) {
  const days = RANGE_DAYS[range] || 90
  return new Date(Date.now() - days * 86400000).toISOString()
}

// GET: Fetch council dashboard data
export async function GET(req) {
  const cookie = req.cookies.get('council_session')
  const session = validateCouncilSession(cookie?.value)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') || 'overview'

  try {
    // Get council account
    const { data: council } = await sb
      .from('council_accounts')
      .select('id, name, tier, status, contact_email, logo_url, billing_cycle_end')
      .eq('id', session.councilId)
      .single()

    if (!council) {
      return NextResponse.json({ error: 'Council not found' }, { status: 404 })
    }

    // Get managed regions
    const { data: councilRegions } = await sb
      .from('council_regions')
      .select('*, regions(*)')
      .eq('council_id', council.id)

    const regions = (councilRegions || []).map(cr => ({
      ...cr.regions,
      role: cr.role,
    }))

    const regionSlugs = regions.map(r => r.slug)
    // Trustworthy region attribution is by FK (region_override_id |
    // region_computed_id), exposed as listings_with_region.region_id. The legacy
    // listings.region_slug column this route used does not exist on listings, so
    // every listing query here was erroring/empty.
    const regionIds = regions.map(r => r.id).filter(Boolean)

    if (view === 'overview') {
      // Get listing counts for managed regions (FK attribution, public-only).
      let totalListings = 0
      let listingsByVertical = {}

      if (regionIds.length > 0) {
        const rows = await fetchAllRegionListings(sb, regionIds, 'slug, vertical')
        // listings_with_region yields one row per (slug, vertical); count venues
        // by distinct slug so a cross-vertical venue isn't double-counted.
        totalListings = new Set(rows.map(l => l.slug)).size
        listingsByVertical = rows.reduce((acc, l) => {
          acc[l.vertical] = (acc[l.vertical] || 0) + 1
          return acc
        }, {})
      }

      // Get recent activity
      const { data: activity } = await sb
        .from('council_activity')
        .select('id, council_id, action, metadata, created_at')
        .eq('council_id', council.id)
        .order('created_at', { ascending: false })
        .limit(10)

      return NextResponse.json({
        council: {
          id: council.id,
          name: council.name,
          tier: council.tier,
          status: council.status,
          contact_email: council.contact_email,
          logo_url: council.logo_url,
          billing_cycle_end: council.billing_cycle_end,
        },
        regions,
        stats: {
          totalListings,
          totalRegions: regions.length,
          listingsByVertical,
        },
        activity: activity || [],
      })
    }

    if (view === 'listings') {
      if (regionIds.length === 0) {
        return NextResponse.json({ council, regions: [], listings: [] })
      }

      // Validate the region param against server-side assigned regions, then
      // resolve to its id for FK-based filtering via listings_with_region.
      const requestedRegion = searchParams.get('region')
      const region = (requestedRegion && regions.find(r => r.slug === requestedRegion)) || regions[0]
      const vertical = searchParams.get('vertical')
      const page = parseInt(searchParams.get('page') || '1')
      const perPage = 50

      let query = excludeNeedsReview(excludeTestListings(
        sb
          .from('listings_with_region')
          .select('id, name, vertical, status, suburb, state, website, hero_image_url, created_at', { count: 'exact' })
          .eq('region_id', region.id)
          .eq('status', 'active'),
      ))

      if (vertical) {
        query = filterByVertical(query, vertical, await relationHasVerticals(sb, 'listings_with_region'))
      }

      const { data: listings, count } = await query
        .order('name')
        .range((page - 1) * perPage, page * perPage - 1)

      return NextResponse.json({
        council,
        regions,
        listings: listings || [],
        totalListings: count || 0,
        page,
        perPage,
      })
    }

    if (view === 'analytics') {
      // Only available for partner+ tiers
      if (council.tier === 'explorer') {
        return NextResponse.json({
          council,
          regions,
          analytics: null,
          upgrade_required: true,
          message: 'Analytics is available on Partner and Enterprise tiers',
        })
      }

      const range = searchParams.get('range') || '90d'
      const since = sinceFromRange(range)

      if (regionIds.length === 0) {
        return NextResponse.json({
          council, regions, range, since,
          analytics: { views: 0, clicks: 0, searches: 0, regions: [] },
        })
      }

      // Real region-scoped metrics from pageviews + search_logs (bot-filtered),
      // computed once over shared windows and aggregated per managed region.
      const perRegion = await computeRegionMetricsBatch(sb, regions, { since, limit: 10 })

      // Network-card totals: sum across the council's regions.
      const totals = perRegion.reduce((acc, m) => {
        acc.views += m.regionPageViews
        acc.clicks += m.totalClicks
        acc.searches += m.topSearches.reduce((s, q) => s + q.count, 0)
        acc.newListings += m.newListings
        return acc
      }, { views: 0, clicks: 0, searches: 0, newListings: 0 })

      return NextResponse.json({
        council,
        regions,
        range,
        since,
        analytics: {
          views: totals.views,
          clicks: totals.clicks,
          searches: totals.searches,
          newListings: totals.newListings,
          period: range,
          regions: perRegion,
        },
      })
    }

    if (view === 'content') {
      // Only available for partner+ tiers
      if (council.tier === 'explorer') {
        return NextResponse.json({
          council,
          regions,
          content: [],
          upgrade_required: true,
        })
      }

      const { data: content } = await sb
        .from('council_content')
        .select('id, council_id, title, body, content_type, status, created_at, updated_at')
        .eq('council_id', council.id)
        .order('updated_at', { ascending: false })

      return NextResponse.json({
        council,
        regions,
        content: content || [],
      })
    }

    return NextResponse.json({ council, regions })
  } catch (err) {
    console.error('Council data error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Fetch all active, public listings across the given region ids (FK attribution
 * via listings_with_region), paginating past PostgREST's 1000-row cap so totals
 * aren't silently truncated.
 */
async function fetchAllRegionListings(sb, regionIds, select) {
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await excludeNeedsReview(excludeTestListings(
      sb.from('listings_with_region')
        .select(select)
        .eq('status', 'active')
        .in('region_id', regionIds),
    )).order('slug', { ascending: true }).range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}
