import { NextResponse } from 'next/server'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifySharedToken } from '@/lib/shared-auth'
import { batchListingStats } from '@/lib/dashboard/listingStats'

/**
 * GET /api/dashboard/stats/batch — performance stats for EVERY listing the
 * caller owns, in one request.
 *
 * Auth: Bearer token (atlas shared JWT), vendor or admin role. Ownership is
 * derived server-side exactly like /api/dashboard (listing_claims.claimed_by
 * = user, status active; admins see all claimed listings) — the client sends
 * no listing ids, so it can be fired in parallel with /api/dashboard.
 *
 * Response: { stats: { [listingId]: <same shape as /api/dashboard/stats> } }
 *
 * Replaces the layout's one-request-per-listing fan-out, which cost an admin
 * session ~30 serverless invocations and ~90 pageview scans per load.
 */
export async function GET(request) {
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

  const sb = getSupabaseAdmin()

  try {
    let listings = []

    if (user.role === 'admin') {
      // Admin bypass: every claimed listing — mirrors /api/dashboard.
      const { data, error } = await sb
        .from('listings')
        .select('id, slug, vertical')
        .eq('is_claimed', true)
      if (error) throw error
      listings = data || []
    } else {
      // Vendor: only listings they own (live claim rows — past_due is dunning
      // grace, still owned). Never gate owners on is_claimed — listing_claims
      // IS the ownership truth. Mirrors /api/dashboard.
      const { data: claims } = await sb
        .from('listing_claims')
        .select('listing_id')
        .eq('claimed_by', user.id)
        .in('status', LIVE_CLAIM_STATUSES)

      const ownedIds = [...new Set((claims || []).map(c => c.listing_id))]
      if (ownedIds.length === 0) {
        return NextResponse.json({ stats: {} })
      }

      const { data, error } = await sb
        .from('listings')
        .select('id, slug, vertical')
        .in('id', ownedIds)
      if (error) throw error
      listings = data || []
    }

    if (listings.length === 0) {
      return NextResponse.json({ stats: {} })
    }

    const statsMap = await batchListingStats(sb, listings)
    return NextResponse.json({ stats: Object.fromEntries(statsMap) })
  } catch (err) {
    console.error('[dashboard/stats/batch] Error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
