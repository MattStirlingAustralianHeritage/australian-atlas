import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// Tier -> Stripe price mapping (set in Vercel env vars)
const TIER_PRICE_MAP = {
  starter: process.env.OPERATOR_STRIPE_STARTER_PRICE_ID,
  pro: process.env.OPERATOR_STRIPE_PRO_PRICE_ID,
}

export async function POST(request) {
  try {
    // ── Authenticate via Supabase session ─────────────────────
    const supabase = await createAuthServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const sb = getSupabaseAdmin()

    const { data: operator, error: opError } = await sb
      .from('operator_accounts')
      .select('id, business_name, contact_email, stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    if (opError || !operator) {
      return NextResponse.json({ error: 'Operator account not found' }, { status: 401 })
    }

    const { tier } = await request.json()

    if (!tier || !TIER_PRICE_MAP[tier]) {
      return NextResponse.json(
        { error: 'Invalid tier. Must be starter or pro.' },
        { status: 400 }
      )
    }

    const priceId = TIER_PRICE_MAP[tier]
    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price not configured for ${tier} tier. Contact support.` },
        { status: 503 }
      )
    }

    // ── Create or reuse Stripe customer ──────────────────────
    const Stripe = require('stripe')
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

    let customerId = operator.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: operator.contact_email,
        name: operator.business_name,
        metadata: {
          operator_id: operator.id,
          type: 'operator',
        },
      })
      customerId = customer.id

      // Persist for future use
      await sb
        .from('operator_accounts')
        .update({ stripe_customer_id: customerId })
        .eq('id', operator.id)
    }

    // ── Create checkout session ──────────────────────────────
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${siteUrl}/operators/dashboard?subscribed=1`,
      cancel_url: `${siteUrl}/operators/dashboard?cancelled=1`,
      metadata: {
        type: 'operator_checkout',
        operator_id: operator.id,
        tier,
      },
      subscription_data: {
        metadata: {
          type: 'operator_checkout',
          operator_id: operator.id,
          operator_name: operator.business_name,
          tier,
        },
      },
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: checkoutSession.url, sessionId: checkoutSession.id })
  } catch (err) {
    console.error('[operators/checkout] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
