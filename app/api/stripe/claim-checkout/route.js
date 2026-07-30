import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { checkRateLimit } from '@/lib/rate-limit'

// Stripe secret keys are always sk_… (standard) or rk_… (restricted), live or test.
// A present-but-malformed value (the wrong string pasted into the env) would otherwise
// sail past a bare presence check and fail deep in the first Stripe call with an opaque
// 401 — exactly how an "armed but invalid" key masquerades as configured. Validate the
// shape up front so the failure is explicit and logged instead of silent.
const STRIPE_SECRET_KEY_RE = /^(sk|rk)_(live|test)_/

function getStripe() {
  const Stripe = require('stripe')
  return new Stripe((process.env.STRIPE_SECRET_KEY || '').trim())
}

export async function POST(request) {
  try {
    // Same gate as POST /api/claim: a paid claim is still a claim, and this
    // route creates a Stripe customer on every call. Unauthenticated it was
    // both an unbounded junk-customer generator and a way to start paying for
    // a listing from no identity at all.
    const rateLimited = checkRateLimit(request, { keyPrefix: 'claim-checkout', maxRequests: 5 })
    if (rateLimited) return rateLimited

    const authSb = await createAuthServerClient()
    const { data: { user: sessionUser } } = await authSb.auth.getUser()
    if (!sessionUser?.email) {
      return NextResponse.json(
        { error: 'Please sign in to claim a listing.', code: 'auth_required' },
        { status: 401 }
      )
    }

    const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim()
    if (!secretKey) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
    }
    if (!STRIPE_SECRET_KEY_RE.test(secretKey)) {
      console.error(
        '[claim-checkout] STRIPE_SECRET_KEY is set but is not a valid Stripe secret key ' +
        '(it must start with sk_live_/sk_test_/rk_live_/rk_test_). Fix the value in Vercel → ' +
        'Project Settings → Environment Variables (Production), then redeploy.'
      )
      return NextResponse.json(
        { error: 'Payment is temporarily unavailable. Please try the Free tier, or contact listings@australianatlas.com.au.' },
        { status: 503 }
      )
    }

    const stripe = getStripe()
    const { claimId, listingId, listingName, listingSlug, name } = await request.json()

    if (!listingId || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // The session's address, never a posted one: the grant lands on this
    // address, so letting the body choose it would let one account buy a
    // listing into another's hands.
    const sessionEmail = sessionUser.email.toLowerCase()

    // Accept either env-var name so the price lookup works regardless of which
    // naming convention is set in Vercel (STRIPE_STANDARD_PRICE_ID is the deployed one).
    const priceId = process.env.STRIPE_STANDARD_PRICE_ID || process.env.STRIPE_LISTING_PRICE_ID
    if (!priceId) {
      return NextResponse.json({ error: 'Standard pricing not configured' }, { status: 500 })
    }

    // Look up listing vertical for metadata
    const sb = getSupabaseAdmin()
    const { data: listing } = await sb
      .from('listings')
      .select('vertical')
      .eq('id', listingId)
      .single()

    // Never take money for a listing someone else already owns. Without this,
    // a second party could pay in full and then finalizeClaim would refuse the
    // grant ("owned by a different user"), leaving a $295 charge, an endlessly
    // retried webhook, and a manual refund.
    const { data: liveClaims } = await sb
      .from('listing_claims')
      .select('id, claimant_email')
      .eq('listing_id', listingId)
      .in('status', LIVE_CLAIM_STATUSES)
      .limit(1)
    const owner = liveClaims?.[0]
    if (owner && (owner.claimant_email || '').toLowerCase() !== sessionEmail) {
      return NextResponse.json(
        { error: 'This listing is already claimed by another account. Please contact listings@australianatlas.com.au if that is not right.' },
        { status: 409 }
      )
    }

    // Charge the signed-in address, and let Stripe own the customer record for
    // the session rather than minting a standalone customer per click.
    const customer = await stripe.customers.create({
      email: sessionEmail,
      name,
      metadata: {
        listing_id: String(listingId),
        listing_name: listingName || '',
        vertical: listing?.vertical || '',
      },
    })

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${siteUrl}/claim/success?paid=1`,
      cancel_url: `${siteUrl}/claim/${listingSlug}?cancelled=true`,
      metadata: {
        type: 'atlas_claim_checkout',
        claim_id: claimId ? String(claimId) : '',
        listing_id: String(listingId),
        listing_name: listingName || '',
        listing_slug: listingSlug || '',
        vertical: listing?.vertical || '',
        contact_email: sessionEmail,
        contact_name: name,
      },
      subscription_data: {
        metadata: {
          listing_id: String(listingId),
          listing_name: listingName || '',
          vertical: listing?.vertical || '',
          type: 'atlas_claim_checkout',
        },
      },
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (error) {
    console.error('[claim-checkout] Error:', error)
    return NextResponse.json(
      { error: 'Payment could not be started. Please try again, or contact listings@australianatlas.com.au.' },
      { status: 500 }
    )
  }
}
