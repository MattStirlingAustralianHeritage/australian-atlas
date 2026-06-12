import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// POST /api/dashboard/billing-portal
//
// Opens a Stripe customer-billing-portal session for the signed-in venue
// owner so they can view invoices, update their card, or cancel — the
// counterpart of app/api/operators/portal/route.js for listing claims.
// Billing state lives on listing_claims (tier='standard' rows carry
// stripe_customer_id, written by the checkout webhook).
export async function POST() {
  try {
    const supabase = await createAuthServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const sb = getSupabaseAdmin()

    // Most recent active paid claim owned by this user. Older claims may
    // predate claimed_by stamping, so fall back to the claimant email.
    let { data: claims } = await sb
      .from('listing_claims')
      .select('stripe_customer_id, claimed_at')
      .eq('claimed_by', user.id)
      .eq('status', 'active')
      .not('stripe_customer_id', 'is', null)
      .order('claimed_at', { ascending: false })
      .limit(1)

    if ((!claims || claims.length === 0) && user.email) {
      const { data: emailClaims } = await sb
        .from('listing_claims')
        .select('stripe_customer_id, claimed_at')
        .eq('claimant_email', user.email)
        .eq('status', 'active')
        .not('stripe_customer_id', 'is', null)
        .order('claimed_at', { ascending: false })
        .limit(1)
      claims = emailClaims
    }

    const customerId = claims?.[0]?.stripe_customer_id
    if (!customerId) {
      return NextResponse.json(
        { error: 'no_billing_account' },
        { status: 404 }
      )
    }

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'Billing is not configured' }, { status: 503 })
    }

    const Stripe = require('stripe')
    const stripe = new Stripe(secretKey)

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/dashboard/subscription`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (err) {
    console.error('[dashboard/billing-portal] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
