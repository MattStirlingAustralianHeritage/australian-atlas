import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

/**
 * GET /api/admin/dashboard-stats
 * Aggregated health metrics for the admin dashboard.
 */
export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sb = getSupabaseAdmin()

    const [
      totalRes,
      activeRes,
      hiddenRes,
      needsReviewRes,
      pendingClaimsRes,
      pendingCandidatesRes,
      humanisedRes,
      articlesRes,
      trailsRes,
      councilApplicationsRes,
      councilsActiveRes,
      pressEnquiriesRes,
      pressMembersRes,
      tradeApplicationsRes,
      tradeMembersRes,
      verticalCountsRes,
    ] = await Promise.all([
      // Total listings
      sb.from('listings').select('id', { count: 'exact', head: true }),
      // Active listings
      sb.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      // Hidden/inactive listings
      sb.from('listings').select('id', { count: 'exact', head: true }).neq('status', 'active'),
      // Needs review
      sb.from('listings').select('id', { count: 'exact', head: true }).eq('needs_review', true),
      // Pending claims
      sb.from('claims_review').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      // Pending candidates
      sb.from('listing_candidates').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      // Humanised count
      sb.from('listings').select('id', { count: 'exact', head: true }).eq('humanised', true),
      // Published articles
      sb.from('articles').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      // Published trails
      sb.from('trails').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      // New council applications awaiting review
      sb.from('council_enquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      // Active council accounts
      sb.from('council_accounts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      // New press access requests awaiting review
      sb.from('press_enquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      // Active press members
      sb.from('press_accounts').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('approved', true),
      // New trade beta sign-ups in the last 7 days (auto-provisioned — no gate)
      sb.from('trade_accounts').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
      // Active trade members
      sb.from('trade_accounts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      // Per-vertical active counts
      sb.from('listings').select('vertical').eq('status', 'active'),
    ])

    // Aggregate vertical counts
    const verticalCounts = {}
    if (verticalCountsRes.data) {
      for (const row of verticalCountsRes.data) {
        const v = row.vertical || 'unknown'
        verticalCounts[v] = (verticalCounts[v] || 0) + 1
      }
    }

    return NextResponse.json({
      total: totalRes.count || 0,
      active: activeRes.count || 0,
      hidden: hiddenRes.count || 0,
      needs_review: needsReviewRes.count || 0,
      pending_claims: pendingClaimsRes.count || 0,
      pending_candidates: pendingCandidatesRes.count || 0,
      humanised: humanisedRes.count || 0,
      published_articles: articlesRes.count || 0,
      published_trails: trailsRes.count || 0,
      council_applications_new: councilApplicationsRes.count || 0,
      councils_active: councilsActiveRes.count || 0,
      press_enquiries_new: pressEnquiriesRes.count || 0,
      press_members_active: pressMembersRes.count || 0,
      trade_applications_new: tradeApplicationsRes.count || 0,
      trade_members_active: tradeMembersRes.count || 0,
      vertical_counts: verticalCounts,
    })
  } catch (err) {
    console.error('[admin/dashboard-stats] Error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
