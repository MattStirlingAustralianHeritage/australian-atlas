import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { compStatus } from '@/lib/claims/comp.mjs'

/**
 * GET /api/admin/claims/search?q=...
 *
 * Locate ANY listing from the claims desk, not just the ones with a claim in
 * the review queue. The queue only ever showed the ~100 most recent claims, so
 * a venue that was claimed months ago — or never claimed at all — was
 * unreachable from this page even though its commercial state is managed here.
 *
 * Matches on venue name, address, slug, listing id (paste a UUID), and
 * claimant email (across both the ownership rows and the review queue), then
 * returns each listing with the commercial truth attached: the live
 * listing_claims row (tier, comp term, Stripe binding) and the most recent
 * claims_review row.
 *
 * Auth: admin cookie, same as the rest of /api/admin/claims.
 */

export const dynamic = 'force-dynamic'

const RESULT_LIMIT = 25
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PostgREST's .or() is a comma/parenthesis-delimited mini-language and ilike
// treats % and _ as wildcards. Anything the admin types is data, so strip the
// characters that would otherwise change the shape of the query.
function sanitisePattern(raw) {
  return String(raw).replace(/[,()%_*\\"']/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rawQuery = (searchParams.get('q') || '').trim()

  if (rawQuery.length < 2) {
    return NextResponse.json({ results: [], query: rawQuery, truncated: false })
  }

  const sb = getSupabaseAdmin()

  try {
    const listings = new Map() // id → listing row, insertion-ordered

    // ── 1. Exact listing id ──
    if (UUID_RE.test(rawQuery)) {
      const { data } = await sb
        .from('listings')
        .select('id, name, vertical, slug, region, state, address, status, is_claimed')
        .eq('id', rawQuery)
        .maybeSingle()
      if (data) listings.set(data.id, data)
    }

    const pattern = sanitisePattern(rawQuery)

    // ── 2. Claimant email — search the people, not just the places ──
    // Both sides: an operator who owns listings (listing_claims) and one who
    // only ever applied (claims_review). Runs whenever the term looks like part
    // of an email address.
    const emailListingIds = new Set()
    if (pattern && rawQuery.includes('@')) {
      const [{ data: ownRows }, { data: reviewRows }] = await Promise.all([
        sb.from('listing_claims').select('listing_id').ilike('claimant_email', `%${pattern}%`).limit(RESULT_LIMIT),
        sb.from('claims_review').select('listing_id').ilike('claimant_email', `%${pattern}%`).limit(RESULT_LIMIT),
      ])
      for (const r of [...(ownRows || []), ...(reviewRows || [])]) {
        if (r.listing_id) emailListingIds.add(r.listing_id)
      }
      if (emailListingIds.size > 0) {
        const { data } = await sb
          .from('listings')
          .select('id, name, vertical, slug, region, state, address, status, is_claimed')
          .in('id', [...emailListingIds].slice(0, RESULT_LIMIT))
        for (const l of data || []) if (!listings.has(l.id)) listings.set(l.id, l)
      }
    }

    // ── 3. Venue name / address / slug ──
    if (pattern && listings.size < RESULT_LIMIT) {
      const { data, error } = await sb
        .from('listings')
        .select('id, name, vertical, slug, region, state, address, status, is_claimed')
        .or(`name.ilike.%${pattern}%,address.ilike.%${pattern}%,slug.ilike.%${pattern}%`)
        .order('name', { ascending: true })
        .limit(RESULT_LIMIT + 1)
      if (error) throw error
      for (const l of data || []) if (!listings.has(l.id)) listings.set(l.id, l)
    }

    const rows = [...listings.values()]
    const truncated = rows.length > RESULT_LIMIT
    const page = rows.slice(0, RESULT_LIMIT)
    const listingIds = page.map(l => l.id)

    if (listingIds.length === 0) {
      return NextResponse.json({ results: [], query: rawQuery, truncated: false })
    }

    // ── 4. Attach the commercial truth ──
    const [{ data: claimRows }, { data: reviewRows }] = await Promise.all([
      sb.from('listing_claims')
        .select('id, listing_id, tier, status, claimant_email, stripe_subscription_id, comp_expires_at, comp_granted_at, comp_note, source_review_id, claimed_at')
        .in('listing_id', listingIds)
        .in('status', LIVE_CLAIM_STATUSES),
      sb.from('claims_review')
        .select('id, listing_id, status, claimant_email, claimant_name, tier, created_at, reviewed_at')
        .in('listing_id', listingIds)
        .order('created_at', { ascending: false }),
    ])

    // Prefer the 'active' row if a listing somehow carries both (the partial
    // unique index only covers 'active', so active + past_due can coexist).
    const claimByListing = new Map()
    for (const c of claimRows || []) {
      const existing = claimByListing.get(c.listing_id)
      if (!existing || (existing.status !== 'active' && c.status === 'active')) {
        claimByListing.set(c.listing_id, c)
      }
    }
    // Rows arrive newest-first, so the first one seen per listing is the latest.
    const reviewByListing = new Map()
    for (const r of reviewRows || []) {
      if (!reviewByListing.has(r.listing_id)) reviewByListing.set(r.listing_id, r)
    }

    const now = new Date()
    const results = page.map(l => {
      const claim = claimByListing.get(l.id) || null
      const review = reviewByListing.get(l.id) || null
      return {
        listingId: l.id,
        name: l.name,
        vertical: l.vertical,
        slug: l.slug,
        region: l.region,
        state: l.state,
        address: l.address,
        listingStatus: l.status,
        isClaimed: l.is_claimed,
        claim: claim && {
          id: claim.id,
          tier: claim.tier,
          status: claim.status,
          claimantEmail: claim.claimant_email,
          hasStripeSubscription: !!claim.stripe_subscription_id,
          compExpiresAt: claim.comp_expires_at,
          compGrantedAt: claim.comp_granted_at,
          compNote: claim.comp_note,
          claimedAt: claim.claimed_at,
          ...compStatus(claim, now),
        },
        review: review && {
          id: review.id,
          status: review.status,
          claimantEmail: review.claimant_email,
          claimantName: review.claimant_name,
          requestedTier: review.tier,
          createdAt: review.created_at,
        },
      }
    })

    return NextResponse.json({ results, query: rawQuery, truncated })
  } catch (err) {
    console.error('[admin/claims/search] error:', err.message)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
