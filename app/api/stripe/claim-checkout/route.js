import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

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
    const { claimId, listingId, listingName, listingSlug, name, email } = await request.json()

    if (!listingId || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

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

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email,
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
      success_url: `${siteUrl}/claim/success`,
      cancel_url: `${siteUrl}/claim/${listingSlug}?cancelled=true`,
      metadata: {
        type: 'atlas_claim_checkout',
        claim_id: claimId ? String(claimId) : '',
        listing_id: String(listingId),
        listing_name: listingName || '',
        listing_slug: listingSlug || '',
        vertical: listing?.vertical || '',
        contact_email: email,
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
