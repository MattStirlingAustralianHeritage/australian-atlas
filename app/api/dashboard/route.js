import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { LISTING_REGION_SELECT } from '@/lib/regions'
import { readGallery, isListingPaid } from '@/lib/listing-gallery'
import { readHighlightsMap } from '@/lib/operator-highlights/read'

/**
 * GET /api/dashboard — Fetch dashboard data for the operator's OWNED listings.
 *
 * Auth: Bearer token (atlas shared JWT) in Authorization header.
 *
 * Query params:
 *   listing_id (optional) — fetch data for a specific listing
 *
 * Ownership is keyed on listing_claims.claimed_by = the authenticated user id:
 * a vendor sees only listings they own, across whatever verticals they own.
 * Admins bypass ownership and see all claimed listings.
 */

// Columns the dashboard renders per listing (+ resolved region fields).
const LISTING_SELECT = `id, name, slug, vertical, sub_type, sub_types, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, status, description, hours, created_at, updated_at, ${LISTING_REGION_SELECT}`

// True if `userId` holds an active ownership claim on `listingId`.
async function ownsListing(sb, listingId, userId) {
  const { data } = await sb
    .from('listing_claims')
    .select('id')
    .eq('listing_id', listingId)
    .eq('claimed_by', userId)
    .eq('status', 'active')
    .maybeSingle()
  return !!data
}

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
    const isAdmin = user.role === 'admin'

    if (listingId) {
      // Fetch a specific listing — non-admins must OWN it (active claim row).
      const { data, error } = await sb
        .from('listings')
        .select(LISTING_SELECT)
        .eq('id', listingId)
        .eq('is_claimed', true)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      }
      if (!isAdmin && !(await ownsListing(sb, listingId, user.id))) {
        // Don't disclose listings the caller doesn't own.
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      }
      listings = [data]
    } else if (isAdmin) {
      // Admin bypass: every claimed listing.
      const { data, error } = await sb
        .from('listings')
        .select(LISTING_SELECT)
        .eq('is_claimed', true)
        .order('name')

      if (error) {
        console.error('Dashboard listings query error:', error)
        return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 })
      }
      listings = data || []
    } else {
      // Vendor: only listings they own — listing_claims.claimed_by = uid, active.
      // Vertical membership no longer grants visibility (it exposed every claimed
      // listing in the vertical, including other operators').
      const { data: claims } = await sb
        .from('listing_claims')
        .select('listing_id')
        .eq('claimed_by', user.id)
        .eq('status', 'active')

      const ownedIds = [...new Set((claims || []).map((c) => c.listing_id))]
      if (ownedIds.length === 0) {
        return NextResponse.json({ listings: [] })
      }

      const { data, error } = await sb
        .from('listings')
        .select(LISTING_SELECT)
        .in('id', ownedIds)
        .eq('is_claimed', true)
        .order('name')

      if (error) {
        console.error('Dashboard listings query error:', error)
        return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 })
      }
      listings = data || []
    }

    // Operator highlights (the "right now" + hiring layer) — one batched,
    // migration-tolerant read for all listings, merged in below.
    const highlightsMap = await readHighlightsMap(sb, listings.map(l => l.id))

    // Enrich each listing with scores and activity stats
    const enriched = await Promise.all(listings.map(async (listing) => {
      // Completeness score
      const { data: scoreData } = await sb
        .from('listing_scores')
        .select('score, missing_fields, improvement_note, calculated_at')
        .eq('listing_id', listing.id)
        .single()

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { count: searchCount } = await sb
        .from('listing_search_appearances')
        .select('id', { count: 'exact', head: true })
        .eq('listing_id', listing.id)
        .gte('appeared_at', thirtyDaysAgo)

      // Trail appearances (count of trail_stops referencing this listing)
      const { count: trailCount } = await sb
        .from('trail_stops')
        .select('id', { count: 'exact', head: true })
        .eq('listing_id', listing.id)

      // Gallery (paid perk) + paid flag, so the editor can render/gate the
      // photo manager. gallery_image_urls is a storage manifest, not a column.
      const [gallery, paid] = await Promise.all([
        readGallery(sb, listing.id),
        isListingPaid(sb, listing.id),
      ])

      return {
        ...listing,
        gallery_image_urls: gallery,
        operator_highlights: highlightsMap.get(listing.id) || null,
        paid,
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
