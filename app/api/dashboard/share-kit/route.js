import { NextResponse } from 'next/server'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { isListingPaid } from '@/lib/listing-gallery'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendShareKit } from '@/lib/agents/operator-amplification-agent'

/**
 * POST /api/dashboard/share-kit
 * Body: { listing_id }
 *
 * Re-sends the operator amplification share kit (social captions, newsletter
 * paragraph, listing URL) for a listing the caller OWNS (active claim row;
 * admins bypass). Paid perk: requires an active `standard` claim.
 *
 * Rate limit: 1 per listing per 24h, enforced against the durable
 * listings.share_kit_sent_at timestamp (the agent re-stamps it on every send,
 * so it survives serverless instance churn). A small in-memory IP limiter
 * guards against rapid-fire on top.
 *
 * Response: { ok: true } | { error }
 */

const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000

export async function POST(request) {
  // Cheap belt against rapid-fire clicks (per-instance only).
  const limited = checkRateLimit(request, { keyPrefix: 'share-kit', windowMs: 60_000, maxRequests: 5 })
  if (limited) return limited

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

  let body = {}
  try { body = await request.json() } catch { /* non-JSON body */ }
  const listingId = body.listing_id

  if (!listingId) {
    return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  try {
    const { data: listing, error: listingErr } = await sb
      .from('listings')
      .select('id, name, slug, share_kit_sent_at')
      .eq('id', listingId)
      .single()

    if (listingErr || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // The share kit is private to the owner: require an active claim (admins
    // bypass). The claim also supplies the canonical recipient address.
    const { data: claim } = await sb
      .from('listing_claims')
      .select('id, claimant_email')
      .eq('listing_id', listingId)
      .eq('claimed_by', user.id)
      .in('status', LIVE_CLAIM_STATUSES)
      .limit(1)
      .maybeSingle()

    if (!claim && user.role !== 'admin') {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Paid perk: an active `standard` claim (same signal as the gallery).
    const paid = await isListingPaid(sb, listingId)
    if (!paid) {
      return NextResponse.json(
        { error: 'The share kit resend is part of the Standard tier. Upgrade to unlock it.' },
        { status: 403 }
      )
    }

    // 1/day per listing — share_kit_sent_at is re-stamped on every send.
    if (listing.share_kit_sent_at) {
      const elapsed = Date.now() - new Date(listing.share_kit_sent_at).getTime()
      if (elapsed >= 0 && elapsed < RESEND_WINDOW_MS) {
        const retryAfterSec = Math.ceil((RESEND_WINDOW_MS - elapsed) / 1000)
        return NextResponse.json(
          { error: 'Your share kit was sent within the last day. Try again tomorrow.' },
          { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
        )
      }
    }

    const recipientEmail = claim?.claimant_email || user.email
    const result = await sendShareKit(listingId, recipientEmail, user.name, { force: true })

    if (!result?.ok) {
      return NextResponse.json(
        { error: 'We couldn’t send your share kit. Please try again, or email listings@australianatlas.com.au.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[dashboard/share-kit] Error:', err.message)
    return NextResponse.json({ error: 'Failed to resend share kit' }, { status: 500 })
  }
}
