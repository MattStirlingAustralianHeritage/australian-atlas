import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeDashboardPreferRpc } from '@/lib/analytics/aggregate'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/dashboard
 *
 * Aggregates the full window of `pageviews` (not the PostgREST-capped first 1000
 * rows) with bot traffic excluded. Heavy lifting lives in @/lib/analytics/aggregate
 * so the verification harness asserts on the exact logic that ships here.
 *
 * Query params:
 *   range    - '7d', '30d', '90d', '1y' (default: '30d')
 *   vertical - filter timeline / top pages / locations by vertical slug (optional)
 */
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }

export async function GET(request) {
  // Admin-only: this returns network-wide business intelligence over the
  // service-role key. Previously unauthenticated.
  if (!(await checkAdmin(await cookies()))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') || '30d'
  const vertical = searchParams.get('vertical') || null

  const days = RANGE_DAYS[range] || 30
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  try {
    const t0 = Date.now()
    const [
      { traffic, geo, timeline, topPages, totalUniqueVisitors, windowTotal, humanRows, botRows, source },
      { totalSignups, totalClaims },
    ] = await Promise.all([
      computeDashboardPreferRpc(sb, { since, vertical }),
      conversionTotals(sb, since),
    ])

    console.log(JSON.stringify({
      event: 'analytics_dashboard',
      range, vertical, since, source,
      windowTotal, humanRows, botRows,
      totalUniqueVisitors, totalSignups, totalClaims, verticals: traffic.length,
      ms: Date.now() - t0,
    }))

    return NextResponse.json({ traffic, geo, timeline, topPages, totalUniqueVisitors, totalSignups, totalClaims, range, vertical })
  } catch (err) {
    console.error(JSON.stringify({ event: 'analytics_dashboard_error', range, vertical, error: err.message }))
    return NextResponse.json({ traffic: [], geo: [], timeline: [], topPages: [], totalUniqueVisitors: 0, totalSignups: 0, totalClaims: 0, range, vertical })
  }
}

/**
 * Network conversion KPIs over the dashboard window. pageviews is a pageview-only
 * table, so these come from their own tables: signups = profiles created in window,
 * claims completed = listing_claims that reached `active` (the grantClaim terminal
 * state), timed by claimed_at. Two cheap exact head-counts. The summary cards
 * previously read v.total_signups / v.total_claims off the per-vertical traffic
 * rows — fields the aggregation never produced — so both always rendered 0.
 * A failing count must not zero the whole dashboard; degrade each independently.
 */
async function conversionTotals(sb, since) {
  const [signupRes, claimsRes] = await Promise.all([
    sb.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since),
    sb.from('listing_claims').select('id', { count: 'exact', head: true }).eq('status', 'active').gte('claimed_at', since),
  ])
  if (signupRes.error) console.error(JSON.stringify({ event: 'analytics_signups_error', error: signupRes.error.message }))
  if (claimsRes.error) console.error(JSON.stringify({ event: 'analytics_claims_error', error: claimsRes.error.message }))
  return { totalSignups: signupRes.count || 0, totalClaims: claimsRes.count || 0 }
}
