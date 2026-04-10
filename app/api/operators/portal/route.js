import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function POST() {
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
      .select('id, stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    if (opError || !operator) {
      return NextResponse.json({ error: 'Operator account not found' }, { status: 401 })
    }

    if (!operator.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found. Subscribe to a plan first.' },
        { status: 400 }
      )
    }

    // ── Create Stripe billing portal session ─────────────────
    const Stripe = require('stripe')
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: operator.stripe_customer_id,
      return_url: `${siteUrl}/operators/dashboard`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (err) {
    console.error('[operators/portal] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
