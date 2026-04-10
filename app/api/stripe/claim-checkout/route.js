import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

function getStripe() {
  const Stripe = require('stripe')
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

export async function POST(request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
    }

    const stripe = getStripe()
    const { claimId, listingId, listingName, listingSlug, name, email } = await request.json()

    if (!listingId || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const priceId = process.env.STRIPE_STANDARD_PRICE_ID
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
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
