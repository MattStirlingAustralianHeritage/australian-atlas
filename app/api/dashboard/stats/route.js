import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'

/**
 * GET /api/dashboard/stats?listing_id=<uuid>
 *
 * Returns performance stats for a specific listing.
 * Requires auth (vendor or admin role via shared JWT).
 *
 * Response: { views_30d, views_total, trail_count, search_count, save_count }
 */
export async function GET(request) {
  // Verify JWT from Authorization header
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
    return NextResponse.json({ error: 'Vendor or admin role required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const listingId = searchParams.get('listing_id')

  if (!listingId) {
    return NextResponse.json({ error: 'listing_id query parameter is required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  try {
    // Verify the listing exists and is claimed
    const { data: listing, error: listingErr } = await sb
      .from('listings')
      .select('id, is_claimed')
      .eq('id', listingId)
      .single()

    if (listingErr || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [
      views30dRes,
      viewsTotalRes,
      trailCountRes,
      saveCountRes,
      searchCountRes,
    ] = await Promise.all([
      // Page views last 30 days
      sb
        .from('user_views')
        .select('id', { count: 'exact', head: true })
        .eq('listing_id', listingId)
        .gte('viewed_at', thirtyDaysAgo),

      // Page views all time
      sb
        .from('user_views')
        .select('id', { count: 'exact', head: true })
        .eq('listing_id', listingId),

      // Trail inclusions
      sb
        .from('trail_stops')
        .select('id', { count: 'exact', head: true })
        .eq('listing_id', listingId),

      // Saves count
      sb
        .from('user_saves')
        .select('id', { count: 'exact', head: true })
        .eq('listing_id', listingId),

      // Search appearances (last 30 days)
      sb
        .from('listing_search_appearances')
        .select('id', { count: 'exact', head: true })
        .eq('listing_id', listingId)
        .gte('appeared_at', thirtyDaysAgo),
    ])

    return NextResponse.json({
      views_30d: views30dRes.count || 0,
      views_total: viewsTotalRes.count || 0,
      trail_count: trailCountRes.count || 0,
      search_count: searchCountRes.count || 0,
      save_count: saveCountRes.count || 0,
    })
  } catch (err) {
    console.error('[dashboard/stats] Error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
