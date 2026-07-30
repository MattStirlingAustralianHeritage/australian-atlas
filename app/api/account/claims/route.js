import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'

// GET /api/account/claims
//
// Every claim this signed-in person has going, and where it is up to.
//
// Nothing showed an operator their own claim. They submitted one, saw a
// "we'll be in touch" page, and then it vanished: /account had no claim
// surface at all, and the dashboard 403s anyone who isn't yet a vendor. If the
// approval email was slow, went to spam, or the claim was parked awaiting
// verification, the only honest answer available to them was silence — so they
// either gave up or submitted again.
//
// Reads both tables because they answer different questions: claims_review is
// where the request is up to, listing_claims is whether they own it yet.

export async function GET() {
  const supabase = await createAuthServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const email = user.email.toLowerCase()
  const sb = getSupabaseAdmin()

  const [reviews, owned] = await Promise.all([
    sb.from('claims_review')
      .select('id, listing_id, vertical, status, tier, created_at, reviewed_at, listings(name, slug)')
      .eq('claimant_email', email)
      .order('created_at', { ascending: false })
      .limit(25),
    sb.from('listing_claims')
      .select('id, listing_id, status, tier, claimed_at, comp_expires_at, stripe_subscription_id, listings(name, slug)')
      .eq('claimed_by', user.id)
      .in('status', LIVE_CLAIM_STATUSES),
  ])

  if (reviews.error) {
    console.error('[account/claims] claims_review read failed:', reviews.error.message)
    return NextResponse.json({ error: 'Could not load your claims' }, { status: 500 })
  }

  const ownedByListing = new Map((owned.data || []).map(r => [r.listing_id, r]))

  // One entry per claim, with copy that is true at each stage. A claim the
  // person already owns is reported as owned even if its moderation row still
  // says something else — ownership is the fact that matters to them.
  const claims = (reviews.data || []).map(r => {
    const own = ownedByListing.get(r.listing_id)
    const state = own
      ? 'owned'
      : r.status === 'pending' ? 'in_review'
      : r.status === 'pending_verification' ? 'awaiting_email'
      : r.status === 'rejected' ? 'declined'
      : r.status === 'approved' ? 'approved_settling'
      : r.status

    return {
      id: r.id,
      listingId: r.listing_id,
      name: r.listings?.name || null,
      slug: r.listings?.slug || null,
      vertical: r.vertical,
      state,
      submittedAt: r.created_at,
      reviewedAt: r.reviewed_at,
      tier: own?.tier || null,
      dashboardUrl: own ? `/dashboard/listings/${r.listing_id}/edit` : null,
    }
  })

  // Ownership with no moderation row (a vertical-originated or legacy grant)
  // would otherwise be missing from a list that claims to be complete.
  for (const own of owned.data || []) {
    if (claims.some(c => c.listingId === own.listing_id)) continue
    claims.push({
      id: own.id,
      listingId: own.listing_id,
      name: own.listings?.name || null,
      slug: own.listings?.slug || null,
      vertical: null,
      state: 'owned',
      submittedAt: own.claimed_at,
      reviewedAt: null,
      tier: own.tier,
      dashboardUrl: `/dashboard/listings/${own.listing_id}/edit`,
    })
  }

  return NextResponse.json({ claims })
}
