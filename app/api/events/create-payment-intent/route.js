import { NextResponse } from 'next/server'

function getStripe() {
  const Stripe = require('stripe')
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

export async function POST(request) {
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
