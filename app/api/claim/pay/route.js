import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'

// Stripe secret keys are always sk_… / rk_… (live or test). Validate the shape
// up front so a present-but-malformed value fails explicitly (mirrors claim-checkout).
const STRIPE_SECRET_KEY_RE = /^(sk|rk)_(live|test)_/

function getStripe() {
  const Stripe = require('stripe')
  return new Stripe((process.env.STRIPE_SECRET_KEY || '').trim())
}

// GET /api/claim/pay?claim=<claims_review.id>
//
// Durable "activate Standard" pay link, used in the approval email. Every click
// mints a FRESH Stripe Checkout session and 302s the browser to it — so the link
// never goes stale and there is no fragile #fragment to lose (the browser makes a
// real navigation to session.url). On payment the webhook (type
// 'atlas_claim_checkout') resolves the claim by claim_id and grantClaim upgrades
// the operator's active free listing_claims row to Standard in place.
//
// No auth: the link is keyed by an opaque claim UUID and only starts a checkout —
// completing it needs a card, and the grant always lands on the claim's
// claimant_email (never the payer), so a shared link can only benefit the operator.
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'
  const redirect = (path) => NextResponse.redirect(`${siteUrl}${path}`, { status: 303 })

  const claimId = new URL(request.url).searchParams.get('claim')
  if (!claimId) return redirect('/for-venues')

  const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim()
  if (!secretKey || !STRIPE_SECRET_KEY_RE.test(secretKey)) {
    console.error('[claim/pay] STRIPE_SECRET_KEY missing or malformed — cannot start checkout')
    return redirect('/for-venues?pay=unavailable')
  }
  const priceId = process.env.STRIPE_STANDARD_PRICE_ID || process.env.STRIPE_LISTING_PRICE_ID
  if (!priceId) {
    console.error('[claim/pay] Standard price id not configured')
    return redirect('/for-venues?pay=unavailable')
  }

  const sb = getSupabaseAdmin()
  const { data: claim } = await sb
    .from('claims_review')
    .select('id, listing_id, vertical, claimant_name, claimant_email')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim?.listing_id || !claim?.claimant_email) return redirect('/for-venues')

  const { data: listing } = await sb
    .from('listings')
    .select('id, name, slug, vertical')
    .eq('id', claim.listing_id)
    .maybeSingle()

  // Already on Standard? Don't open a duplicate checkout — send them to manage
  // it. Live = active OR past_due: a dunning-window Standard claim still has a
  // subscription, and a second checkout here would double-bill the operator.
  const { data: liveStandard } = await sb
    .from('listing_claims')
    .select('id')
    .eq('listing_id', claim.listing_id)
    .in('status', LIVE_CLAIM_STATUSES)
    .eq('tier', 'standard')
    .limit(1)
  if (liveStandard?.length) return redirect('/dashboard?already=standard')

  try {
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      customer_email: claim.claimant_email,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${siteUrl}/claim/success?paid=1`,
      cancel_url: `${siteUrl}/claim/${listing?.slug || ''}?cancelled=true`,
      allow_promotion_codes: true,
      metadata: {
        type: 'atlas_claim_checkout',
        claim_id: String(claim.id),
        listing_id: String(claim.listing_id),
        listing_name: listing?.name || '',
        listing_slug: listing?.slug || '',
        vertical: listing?.vertical || claim.vertical || '',
        contact_email: claim.claimant_email,
        contact_name: claim.claimant_name || '',
      },
      subscription_data: {
        metadata: {
          listing_id: String(claim.listing_id),
          listing_name: listing?.name || '',
          vertical: listing?.vertical || claim.vertical || '',
          type: 'atlas_claim_checkout',
        },
      },
    })
    return NextResponse.redirect(session.url, { status: 303 })
  } catch (err) {
    console.error('[claim/pay] Checkout create failed:', err.message)
    return redirect('/for-venues?pay=error')
  }
}
