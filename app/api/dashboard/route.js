import { NextResponse } from 'next/server'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { LISTING_REGION_SELECT } from '@/lib/regions'
import { readGalleryEntries, filterPaidListingIds } from '@/lib/listing-gallery'
import { readHighlightsMap } from '@/lib/operator-highlights/read'
import { getTradeProfiles } from '@/lib/trade/profile'

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
const LISTING_SELECT = `id, name, slug, vertical, sub_type, sub_types, region, state, lat, lng, website, phone, address, hero_image_url, video_url, is_claimed, is_featured, status, description, hours, search_keywords, trade_welcome, trade_bespoke, trade_group, trade_group_size_max, trade_contact_before_booking, trade_rates_available, created_at, updated_at, ${LISTING_REGION_SELECT}`

// True if `userId` holds an active ownership claim on `listingId`.
async function ownsListing(sb, listingId, userId) {
  const { data } = await sb
    .from('listing_claims')
    .select('id')
    .eq('listing_id', listingId)
    .eq('claimed_by', userId)
    .in('status', LIVE_CLAIM_STATUSES)
    .limit(1)
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
      // No is_claimed filter: ownership IS the listing_claims row; the display
      // flag must never be able to lock an owner out of their own listing.
      const { data, error } = await sb
        .from('listings')
        .select(LISTING_SELECT)
        .eq('id', listingId)
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
        .in('status', LIVE_CLAIM_STATUSES)

      const ownedIds = [...new Set((claims || []).map((c) => c.listing_id))]
      if (ownedIds.length === 0) {
        return NextResponse.json({ listings: [] })
      }

      // No is_claimed filter — the active claim rows above ARE ownership.
      // (The sync once trampled is_claimed to false and this filter blanked
      // every operator's dashboard; never gate owners on display state.)
      const { data, error } = await sb
        .from('listings')
        .select(LISTING_SELECT)
        .in('id', ownedIds)
        .order('name')

      if (error) {
        console.error('Dashboard listings query error:', error)
        return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 })
      }
      listings = data || []
    }

    const ids = listings.map(l => l.id)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Batched, fail-soft reads shared by both paths: operator highlights (the
    // "right now" + hiring layer), extended trade profile (migration 204), and
    // the paid flag (one listing_claims query for the whole set — the old
    // per-listing isListingPaid calls cost a query each).
    const [highlightsMap, tradeProfiles, paidIds] = await Promise.all([
      readHighlightsMap(sb, ids),
      getTradeProfiles(sb, ids),
      filterPaidListingIds(sb, ids),
    ])

    // Gallery manifests are one storage download per listing, and only the
    // single-listing edit page renders them — the overview/My Listings cards
    // never do. Skip the downloads on the list path so an admin session (every
    // claimed listing) doesn't pay ~30 storage round-trips per load.
    const includeGallery = !!listingId
    const galleryByListing = new Map(
      includeGallery
        ? await Promise.all(listings.map(async l => [l.id, await readGalleryEntries(sb, l.id)]))
        : []
    )

    // Activity counts, batched: one row fetch per table for the whole set,
    // counted per listing in JS — replaces two count queries per listing.
    const [searchCounts, trailCounts] = await Promise.all([
      sb
        .from('listing_search_appearances')
        .select('listing_id')
        .in('listing_id', ids)
        .gte('appeared_at', thirtyDaysAgo)
        .limit(100000),
      sb
        .from('trail_stops')
        .select('listing_id')
        .in('listing_id', ids)
        .limit(100000),
    ]).then(results => results.map(({ data, error }) => {
      if (error) throw error
      const counts = new Map()
      for (const row of data || []) counts.set(row.listing_id, (counts.get(row.listing_id) || 0) + 1)
      return counts
    }))

    const enriched = listings.map(listing => {
      const galleryEntries = galleryByListing.get(listing.id) || []
      return {
        ...listing,
        // All gallery urls (incl. held/flagged) so the editor can show + manage
        // them, plus their moderation status for the per-photo badge. Public
        // surfaces use readGallery() which returns clean-only. Empty on the
        // list path — the edit page refetches its listing individually.
        gallery_image_urls: galleryEntries.map(e => e.url),
        gallery_moderation: galleryEntries.map(e => ({ url: e.url, status: e.status, reason: e.reason })),
        operator_highlights: highlightsMap.get(listing.id) || null,
        trade_profile: tradeProfiles.get(listing.id) || null,
        paid: paidIds.has(listing.id),
        stats: {
          search_appearances: searchCounts.get(listing.id) || 0,
          trail_inclusions: trailCounts.get(listing.id) || 0,
        },
      }
    })

    return NextResponse.json({ listings: enriched })
  } catch (err) {
    console.error('Dashboard API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
