import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'

/**
 * GET /api/dashboard — Fetch dashboard data for a vendor's claimed listings.
 *
 * Auth: Bearer token (atlas shared JWT) in Authorization header.
 *
 * Query params:
 *   listing_id (optional) — fetch data for a specific listing
 *
 * If no listing_id is provided, attempts to find all claimed listings
 * where the listing's source vertical matches the vendor's vendor_verticals.
 * Since the master DB doesn't have vendor_user_id on listings yet,
 * this uses an email-based lookup via the profiles table.
 */
export async function GET(request) {
  // Verify JWT
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '') || ''
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { valid, user } = await verifySharedToken(token)
  if (!valid || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  if (user.role !== 'vendor' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Vendor role required' }, { status: 403 })
  }

  const sb = getSupabaseAdmin()
  const { searchParams } = new URL(request.url)
  const listingId = searchParams.get('listing_id')

  try {
    let listings = []

    if (listingId) {
      // Fetch a specific listing
      const { data, error } = await sb
        .from('listings')
        .select('id, name, slug, vertical, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, status, description, hours, created_at, updated_at')
        .eq('id', listingId)
        .eq('is_claimed', true)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      }
      listings = [data]
    } else {
      // Fetch all claimed listings for verticals this vendor operates in
      const vendorVerticals = user.verticals || {}
      const activeVerticals = Object.entries(vendorVerticals)
        .filter(([, active]) => active)
        .map(([v]) => v)

      if (activeVerticals.length === 0) {
        return NextResponse.json({ listings: [], message: 'No active verticals found for this vendor' })
      }

      // Get claimed listings in vendor's verticals
      // TODO: Once vendor_user_id is added to listings, filter by that directly
      const { data, error } = await sb
        .from('listings')
        .select('id, name, slug, vertical, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, status, description, hours, created_at, updated_at')
        .eq('is_claimed', true)
        .in('vertical', activeVerticals)
        .order('name')

      if (error) {
        console.error('Dashboard listings query error:', error)
        return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 })
      }
      listings = data || []
    }

    // Enrich each listing with scores and activity stats
    const enriched = await Promise.all(listings.map(async (listing) => {
      // Completeness score
      const { data: scoreData } = await sb
        .from('listing_scores')
        .select('score, missing_fields, improvement_note, calculated_at')
        .eq('listing_id', listing.id)
        .single()

      // Search appearances (last 30 days)
      // Count search_logs where query_text matches listing name (case-insensitive partial match)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { count: searchCount } = await sb
        .from('search_logs')
        .select('id', { count: 'exact', head: true })
        .ilike('query_text', `%${listing.name.split(' ')[0]}%`)
        .gte('created_at', thirtyDaysAgo)

      // Trail appearances (count of trail_stops referencing this listing)
      const { count: trailCount } = await sb
        .from('trail_stops')
        .select('id', { count: 'exact', head: true })
        .eq('listing_id', listing.id)

      return {
        ...listing,
        score: scoreData || null,
        stats: {
          search_appearances: searchCount || 0,
          trail_inclusions: trailCount || 0,
          views: null, // Coming soon — requires per-listing pageview tracking
        },
      }
    }))

    return NextResponse.json({ listings: enriched })
  } catch (err) {
    console.error('Dashboard API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
