import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validateCouncilSession } from '@/lib/council-session'

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
      .select('*')
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

    if (view === 'overview') {
      // Get listing counts for managed regions
      let totalListings = 0
      let listingsByVertical = {}

      if (regionSlugs.length > 0) {
        const { data: listings } = await sb
          .from('listings')
          .select('id, vertical, region_slug')
          .eq('status', 'active')
          .in('region_slug', regionSlugs)

        totalListings = listings?.length || 0
        listingsByVertical = (listings || []).reduce((acc, l) => {
          acc[l.vertical] = (acc[l.vertical] || 0) + 1
          return acc
        }, {})
      }

      // Get recent activity
      const { data: activity } = await sb
        .from('council_activity')
        .select('*')
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
      if (regionSlugs.length === 0) {
        return NextResponse.json({ council, regions: [], listings: [] })
      }

      // Always validate region param against server-side assigned regions
      const requestedRegion = searchParams.get('region')
      const regionSlug = (requestedRegion && regionSlugs.includes(requestedRegion))
        ? requestedRegion
        : regionSlugs[0]
      const vertical = searchParams.get('vertical')
      const page = parseInt(searchParams.get('page') || '1')
      const perPage = 50

      let query = sb
        .from('listings')
        .select('id, name, vertical, status, region_slug, suburb, state, website, hero_image_url, listing_type, created_at', { count: 'exact' })
        .eq('region_slug', regionSlug)
        .eq('status', 'active')

      if (vertical) {
        query = query.eq('vertical', vertical)
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

      if (regionSlugs.length === 0) {
        return NextResponse.json({ council, regions, analytics: { views: 0, clicks: 0, searches: 0 } })
      }

      // Get analytics for the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      const { data: analyticsData } = await sb
        .from('listing_analytics')
        .select('event_type, region_slug, created_at')
        .in('region_slug', regionSlugs)
        .gte('created_at', thirtyDaysAgo)

      const analytics = (analyticsData || []).reduce((acc, e) => {
        acc[e.event_type] = (acc[e.event_type] || 0) + 1
        return acc
      }, {})

      return NextResponse.json({
        council,
        regions,
        analytics: {
          views: analytics.view || 0,
          clicks: analytics.click || 0,
          searches: analytics.search_appearance || 0,
          period: '30d',
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
        .select('*')
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
