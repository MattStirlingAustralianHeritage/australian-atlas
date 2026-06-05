import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { LISTING_REGION_SELECT } from '@/lib/regions'
import { readGallery, isListingPaid } from '@/lib/listing-gallery'

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
  const isAdmin = user.role === 'admin'

  try {
    let listings = []

    // Ownership is per-listing via listing_claims.claimed_by — the auth uid, carried
    // as the token's `sub` (→ user.id). A vendor sees ONLY listings they own; admins
    // are unrestricted. (Previously this was vertical-scoped, so any vendor in a
    // vertical could read every claimed listing in that vertical.)
    let ownedIds = null // null = unrestricted (admin)
    if (!isAdmin) {
      const { data: claims, error: claimsErr } = await sb
        .from('listing_claims')
        .select('listing_id')
        .eq('claimed_by', user.id)
        .eq('status', 'active')
      if (claimsErr) {
        console.error('Dashboard ownership query error:', claimsErr)
        return NextResponse.json({ error: 'Failed to resolve ownership' }, { status: 500 })
      }
      ownedIds = (claims || []).map(c => c.listing_id)
    }

    if (listingId) {
      // Vendors may only fetch a listing they own.
      if (ownedIds && !ownedIds.includes(listingId)) {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      }
      const { data, error } = await sb
        .from('listings')
        .select(`id, name, slug, vertical, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, status, description, hours, created_at, updated_at, ${LISTING_REGION_SELECT}`)
        .eq('id', listingId)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      }
      listings = [data]
    } else {
      // Vendor with no owned claims → empty (not an error).
      if (ownedIds && ownedIds.length === 0) {
        return NextResponse.json({ listings: [] })
      }

      let query = sb
        .from('listings')
        .select(`id, name, slug, vertical, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, status, description, hours, created_at, updated_at, ${LISTING_REGION_SELECT}`)
        .order('name')
      if (ownedIds) query = query.in('id', ownedIds)         // vendor: only owned
      else query = query.eq('is_claimed', true)              // admin: all claimed

      const { data, error } = await query
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
