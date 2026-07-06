import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

function getStripe() {
  const Stripe = require('stripe')
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

export async function POST(request) {
  // Unauthenticated → throttle to stop PaymentIntent-creation spam against the
  // Stripe account.
  const rl = checkRateLimit(request, { keyPrefix: 'event-pi', maxRequests: 10, windowMs: 60_000 })
  if (rl) return rl
  try {
    const body = await request.json()
    const { eventName, submitterEmail } = body

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: 4900, // $49 AUD
      currency: 'aud',
      metadata: {
        type: 'event_listing',
        event_name: eventName,
        submitter_email: submitterEmail,
      },
      receipt_email: submitterEmail,
    })

    return NextResponse.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id })
  } catch (err) {
    console.error('[events] Payment intent error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
