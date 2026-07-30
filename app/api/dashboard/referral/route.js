import { NextResponse } from 'next/server'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { ensureReferralCode } from '@/lib/referrals'
import { filterPaidListingIds } from '@/lib/listing-gallery'

/**
 * GET /api/dashboard/referral
 *
 * Returns the referral codes for the caller's PAID claims (live standard rows
 * in listing_claims, judged by filterPaidListingIds so a lapsed comp counts as
 * free the moment its term ends), lazily minting the Stripe promotion code on
 * first request (lib/referrals.js — coupon 'atlas-referral-20', 20% off a
 * first year). Free claims carry no code: the referral programme is a paid perk.
 *
 * `code` is null when Stripe is unconfigured or minting failed — the
 * dashboard simply hides the block. Never influences any visitor-facing
 * surface; this is billing/marketing data only.
 *
 * Response: { referrals: [{ listing_id, listing_name, code }] }
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

  const sb = getSupabaseAdmin()

  try {
    // Only the caller's own claims — ownership is the claimed_by filter.
    const { data: ownClaims, error: claimsErr } = await sb
      .from('listing_claims')
      .select('id, listing_id, referral_code')
      .eq('claimed_by', user.id)
      .in('status', LIVE_CLAIM_STATUSES)

    if (claimsErr) throw claimsErr
    if (!ownClaims || ownClaims.length === 0) {
      return NextResponse.json({ referrals: [] })
    }

    // Which of those are PAID. This used to be a bare .eq('tier','standard'),
    // which reads the stored tier and so would keep minting coupons for a
    // comped Standard claim whose term had run out — until the 6h sweep wrote
    // the row back to 'free'. filterPaidListingIds is the read-time authority
    // on comp expiry (migration 261), so the coupon dies with the comp rather
    // than with the sweep. No behaviour change while every comp is perpetual.
    const paidListingIds = await filterPaidListingIds(
      sb,
      ownClaims.map(c => c.listing_id)
    )
    const claims = ownClaims.filter(c => paidListingIds.has(c.listing_id))
    if (claims.length === 0) {
      return NextResponse.json({ referrals: [] })
    }

    // Listing names/slugs for display + code derivation.
    const listingIds = [...new Set(claims.map(c => c.listing_id).filter(Boolean))]
    const { data: listings } = await sb
      .from('listings')
      .select('id, name, slug')
      .in('id', listingIds)
    const listingById = new Map((listings || []).map(l => [l.id, l]))

    const referrals = []
    for (const claim of claims) {
      const listing = listingById.get(claim.listing_id)
      const code = claim.referral_code || await ensureReferralCode({
        ...claim,
        listing_slug: listing?.slug || null,
      })
      referrals.push({
        listing_id: claim.listing_id,
        listing_name: listing?.name || null,
        code: code || null,
      })
    }

    return NextResponse.json({ referrals })
  } catch (err) {
    console.error('[dashboard/referral] Error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch referral codes' }, { status: 500 })
  }
}
