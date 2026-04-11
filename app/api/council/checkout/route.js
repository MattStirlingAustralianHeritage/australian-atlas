// app/api/council/checkout/route.js
// Creates a Stripe checkout session for council tier subscription.
// Requires authenticated council session (council_session cookie).

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validateCouncilSession } from '@/lib/council-session'

// Tier → Stripe price mapping (set in Vercel env vars)
const TIER_PRICE_MAP = {
  explorer: process.env.STRIPE_COUNCIL_EXPLORER_PRICE_ID,
  partner: process.env.STRIPE_COUNCIL_PARTNER_PRICE_ID,
  enterprise: process.env.STRIPE_COUNCIL_ENTERPRISE_PRICE_ID,
}

export async function POST(request) {
  try {
    // ── Authenticate council session ─────────────────────────
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('council_session')
    const session = validateCouncilSession(sessionCookie?.value)

    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { tier } = await request.json()

    if (!tier || !TIER_PRICE_MAP[tier]) {
      return NextResponse.json(
        { error: 'Invalid tier. Must be explorer, partner, or enterprise.' },
        { status: 400 }
      )
    }

    const priceId = TIER_PRICE_MAP[tier]
    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price not configured for ${tier} tier` },
        { status: 500 }
      )
    }

    // ── Fetch council record ─────────────────────────────────
    const sb = getSupabaseAdmin()
    const { data: council, error: fetchError } = await sb
      .from('council_accounts')
      .select('id, name, contact_email, stripe_customer_id')
      .eq('id', session.councilId)
      .single()

    if (fetchError || !council) {
      return NextResponse.json({ error: 'Council not found' }, { status: 404 })
    }

    // ── Create or reuse Stripe customer ──────────────────────
    const Stripe = require('stripe')
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

    let customerId = council.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: council.contact_email,
        name: council.name,
        metadata: {
          council_id: council.id,
          type: 'council',
        },
      })
      customerId = customer.id

      // Persist for future use
      await sb
        .from('council_accounts')
        .update({ stripe_customer_id: customerId })
        .eq('id', council.id)
    }

    // ── Create checkout session ──────────────────────────────
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${siteUrl}/council?subscribed=1&tier=${tier}`,
      cancel_url: `${siteUrl}/council?cancelled=1`,
      metadata: {
        type: 'council_checkout',
        council_id: council.id,
        tier,
      },
      subscription_data: {
        metadata: {
          council_id: council.id,
          council_name: council.name,
          tier,
          type: 'council_checkout',
        },
      },
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: checkoutSession.url, sessionId: checkoutSession.id })
  } catch (err) {
    console.error('[council/checkout] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
