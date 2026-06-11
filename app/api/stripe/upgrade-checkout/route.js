import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'

// Operator-initiated "unlock editing" payment for a listing already claimed on
// the FREE tier. Distinct from /api/stripe/claim-checkout (which pairs with a
// pending claims_review): here an active free listing_claims row already exists,
// so the Stripe success metadata is typed 'atlas_upgrade_checkout' and the
// webhook upgrades that row in place (free → standard) via grantClaim.
//
// Auth: the dashboard shared JWT (Bearer). The caller must own an active claim on
// the listing (or be an admin). We never trust a listing_id from the client
// without re-checking ownership against listing_claims.

function getStripe() {
  const Stripe = require('stripe')
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

export async function POST(request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '') || ''
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { valid, user } = await verifySharedToken(token)
    if (!valid || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
    if (user.role !== 'vendor' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Vendor role required' }, { status: 403 })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const listingId = body.listing_id
    if (!listingId) {
      return NextResponse.json({ error: 'Missing listing_id' }, { status: 400 })
    }

    // Match the deployed naming (STRIPE_STANDARD_PRICE_ID in Vercel), with the
    // STRIPE_LISTING_PRICE_ID fallback used by /api/stripe/claim-checkout.
    const priceId = process.env.STRIPE_STANDARD_PRICE_ID || process.env.STRIPE_LISTING_PRICE_ID
    if (!priceId) {
      return NextResponse.json({ error: 'Listing price not configured' }, { status: 500 })
    }

    const sb = getSupabaseAdmin()

    // Re-derive ownership + commercial state from listing_claims (never the client).
    const { data: claim } = await sb
      .from('listing_claims')
      .select('id, listing_id, vertical, tier, claimed_by, claimant_email')
      .eq('listing_id', listingId)
      .eq('status', 'active')
      .maybeSingle()

    if (!claim) {
      return NextResponse.json({ error: 'No active claim found for this listing' }, { status: 404 })
    }
    if (user.role !== 'admin' && claim.claimed_by !== user.id) {
      return NextResponse.json({ error: 'You do not own this listing' }, { status: 403 })
    }
    if (claim.tier === 'standard') {
      return NextResponse.json({ error: 'This listing is already on the Standard plan' }, { status: 409 })
    }

    const { data: listing } = await sb
      .from('listings')
      .select('name, slug, vertical')
      .eq('id', listingId)
      .maybeSingle()

    const email = claim.claimant_email || user.email
    const vertical = claim.vertical || listing?.vertical || ''
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'
    const stripe = getStripe()

    const customer = await stripe.customers.create({
      email,
      name: user.name || email,
      metadata: {
        listing_id: String(listingId),
        listing_name: listing?.name || '',
        vertical,
      },
    })

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${siteUrl}/dashboard/listings/${listingId}/edit?upgraded=1`,
      cancel_url: `${siteUrl}/dashboard/listings/${listingId}/edit?upgrade_cancelled=1`,
      metadata: {
        type: 'atlas_upgrade_checkout',
        claim_id: String(claim.id),
        listing_id: String(listingId),
        listing_name: listing?.name || '',
        listing_slug: listing?.slug || '',
        vertical,
        contact_email: email,
        contact_name: user.name || '',
      },
      subscription_data: {
        metadata: {
          listing_id: String(listingId),
          listing_name: listing?.name || '',
          vertical,
          type: 'atlas_upgrade_checkout',
        },
      },
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (error) {
    console.error('[upgrade-checkout] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
