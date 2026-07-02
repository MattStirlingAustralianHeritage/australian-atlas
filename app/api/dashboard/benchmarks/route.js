import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { isListingPaid } from '@/lib/listing-gallery'

/**
 * GET /api/dashboard/benchmarks?listingId=<uuid>
 *
 * Anonymised peer benchmarks for a listing the caller OWNS (active claim row;
 * admins bypass) — a paid (Standard-plan) perk. Calls the SECURITY DEFINER
 * RPC `listing_peer_benchmarks` (migration 211), which compares the listing
 * against its cohort: active listings sharing the same vertical AND state.
 * The RPC returns aggregates only — no other listing's identity ever leaves
 * the database.
 *
 * This is REPORTING ONLY, private to the owner. Nothing here influences
 * search, map or discover ranking, or any visitor-facing ordering.
 *
 * Response (owner, paid, cohort >= 8):
 * {
 *   paid: true,
 *   listing: { id, name },
 *   cohort_size, vertical, state,
 *   metrics: {
 *     search_appearances: { you, median, p75, percentile },  // last 30 days
 *     saves:              { you, median, p75, percentile },  // all-time
 *     trail_inclusions:   { you, median, p75, percentile }   // all-time
 *   }
 * }
 * percentile = share of the cohort with a count <= yours (0–100).
 *
 * Response (owner, paid, cohort < 8):
 *   { paid: true, listing: { id, name }, cohort_too_small: true, cohort_size: N }
 *
 * Response (owner, unpaid): { paid: false, locked: true } — 200, so the
 * dashboard can render the locked state (same behaviour as
 * /api/dashboard/ai-visibility).
 */

export async function GET(request) {
  // Verify JWT from Authorization header
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '') || ''
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { valid, user } = await verifySharedToken(token)
  if (!valid || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  if (user.role !== 'vendor' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Vendor or admin role required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const listingId = searchParams.get('listingId')

  if (!listingId) {
    return NextResponse.json({ error: 'listingId query parameter is required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  try {
    const { data: listing, error: listingErr } = await sb
      .from('listings')
      .select('id, name')
      .eq('id', listingId)
      .single()

    if (listingErr || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Benchmarks are private to the owner: require an active claim (admins
    // bypass) — same discipline as /api/dashboard/stats.
    if (user.role !== 'admin') {
      const { data: claim } = await sb
        .from('listing_claims')
        .select('id')
        .eq('listing_id', listingId)
        .eq('claimed_by', user.id)
        .eq('status', 'active')
        .maybeSingle()
      if (!claim) {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      }
    }

    // Paid gate: peer benchmarks are a Standard-plan feature. Owners on a
    // free claim get a lock marker (not an error) so the dashboard can render
    // the locked state. Admins bypass for support.
    const paid = await isListingPaid(sb, listingId)
    if (!paid && user.role !== 'admin') {
      return NextResponse.json({ paid: false, locked: true })
    }

    const { data: benchmarks, error: rpcErr } = await sb.rpc('listing_peer_benchmarks', {
      p_listing_id: listingId,
    })
    if (rpcErr) throw rpcErr

    if (!benchmarks || benchmarks.error === 'listing_not_found') {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    return NextResponse.json({
      paid: true,
      listing: { id: listing.id, name: listing.name },
      ...benchmarks,
    })
  } catch (err) {
    console.error('[dashboard/benchmarks] Error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch benchmarks' }, { status: 500 })
  }
}
