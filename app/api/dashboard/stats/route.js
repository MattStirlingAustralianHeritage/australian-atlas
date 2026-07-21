import { NextResponse } from 'next/server'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'

/**
 * GET /api/dashboard/stats?listing_id=<uuid>
 *
 * Returns performance stats for a listing the caller OWNS (active claim row;
 * admins bypass). Requires auth (vendor or admin role via shared JWT).
 *
 * Views come from the canonical `pageviews` table (bot-filtered), matched to
 * the listing's public pages: its detail page on the vertical site (path ends
 * in /{slug}, scoped to that vertical) plus the portal place page
 * (/place/{slug}, including locale-prefixed variants like /ko/place/{slug}).
 * The legacy `user_views` table was never written to — every operator saw 0.
 *
 * Response:
 * {
 *   views_30d, views_prev_30d, views_total, unique_visitors_30d,
 *   trail_count, search_count, save_count,
 *   daily_views: [{ date: 'YYYY-MM-DD', views }],   // last 30 days
 *   top_locations: [{ label, count }],               // last 30 days, top 5
 *   devices: { mobile, desktop, other }              // last 30 days
 * }
 */

// PostgREST .or() embeds values raw; only build the path filter for slugs that
// can't break the expression. Kebab-case covers every real slug.
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/i

function pageviewFilter(listing) {
  if (!listing.slug || !SAFE_SLUG.test(listing.slug) || !SAFE_SLUG.test(listing.vertical || '')) return null
  return `and(vertical.eq.${listing.vertical},path.like.*/${listing.slug}),and(vertical.eq.portal,path.like.*place/${listing.slug})`
}

// Human pageviews for this listing in [since, until). Returns rows (ts, meta)
// capped at `limit` newest-first — per-listing traffic is far below the cap.
async function fetchListingViews(sb, filter, { since, until, columns = 'ts', limit = 5000 }) {
  let q = sb
    .from('pageviews')
    .select(columns)
    .or(filter)
    .not('is_bot', 'is', true)
    .gte('ts', since)
    .order('ts', { ascending: false })
    .limit(limit)
  if (until) q = q.lt('ts', until)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

async function countListingViews(sb, filter, { since, until } = {}) {
  let q = sb
    .from('pageviews')
    .select('id', { count: 'exact', head: true })
    .or(filter)
    .not('is_bot', 'is', true)
  if (since) q = q.gte('ts', since)
  if (until) q = q.lt('ts', until)
  const { count, error } = await q
  if (error) throw error
  return count || 0
}

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10)
}

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
    const { data: listing, error: listingErr } = await sb
      .from('listings')
      .select('id, slug, vertical, is_claimed')
      .eq('id', listingId)
      .single()

    if (listingErr || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Stats are private to the owner: require an active claim (admins bypass).
    // Without this, any vendor could read any listing's performance numbers.
    if (user.role !== 'admin') {
      const { data: claim } = await sb
        .from('listing_claims')
        .select('id')
        .eq('listing_id', listingId)
        .eq('claimed_by', user.id)
        .in('status', LIVE_CLAIM_STATUSES)
        .limit(1)
        .maybeSingle()
      if (!claim) {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      }
    }

    const now = Date.now()
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString()

    const filter = pageviewFilter(listing)

    const [
      viewRows,
      viewsPrev30d,
      viewsTotal,
      trailCountRes,
      saveCountRes,
      searchCountRes,
    ] = await Promise.all([
      // Current-period rows: one fetch powers count, uniques, daily series,
      // locations and device split.
      filter
        ? fetchListingViews(sb, filter, {
            since: thirtyDaysAgo,
            columns: 'ts, visitor_id, city, region, country, device',
          })
        : Promise.resolve([]),

      // Previous 30-day window, for the trend delta.
      filter ? countListingViews(sb, filter, { since: sixtyDaysAgo, until: thirtyDaysAgo }) : Promise.resolve(0),

      // All-time views.
      filter ? countListingViews(sb, filter) : Promise.resolve(0),

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

    // Daily series — every one of the last 30 days present, zero-filled.
    const daily = new Map()
    for (let i = 29; i >= 0; i--) {
      daily.set(dayKey(now - i * 24 * 60 * 60 * 1000), 0)
    }
    const visitors = new Set()
    const locations = new Map()
    const devices = { mobile: 0, desktop: 0, other: 0 }

    for (const row of viewRows) {
      const key = dayKey(row.ts)
      if (daily.has(key)) daily.set(key, daily.get(key) + 1)
      if (row.visitor_id) visitors.add(row.visitor_id)

      if (row.city || row.country) {
        // "Melbourne, VIC" for Australian traffic, "Auckland, NZ" for overseas.
        const label = row.country === 'AU'
          ? [row.city, row.region].filter(Boolean).join(', ')
          : [row.city, row.country].filter(Boolean).join(', ')
        if (label) locations.set(label, (locations.get(label) || 0) + 1)
      }

      if (row.device === 'mobile') devices.mobile += 1
      else if (row.device === 'desktop') devices.desktop += 1
      else devices.other += 1
    }

    const topLocations = [...locations.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }))

    return NextResponse.json({
      views_30d: viewRows.length,
      views_prev_30d: viewsPrev30d,
      views_total: viewsTotal,
      unique_visitors_30d: visitors.size,
      trail_count: trailCountRes.count || 0,
      search_count: searchCountRes.count || 0,
      save_count: saveCountRes.count || 0,
      daily_views: [...daily.entries()].map(([date, views]) => ({ date, views })),
      top_locations: topLocations,
      devices,
    })
  } catch (err) {
    console.error('[dashboard/stats] Error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
