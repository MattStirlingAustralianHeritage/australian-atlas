import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeDashboard } from '@/lib/analytics/aggregate'

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
    const { traffic, geo, timeline, topPages, totalUniqueVisitors, windowTotal, humanRows, botRows } =
      await computeDashboard(sb, { since, vertical })

    console.log(JSON.stringify({
      event: 'analytics_dashboard',
      range, vertical, since,
      windowTotal, humanRows, botRows,
      totalUniqueVisitors, verticals: traffic.length,
      ms: Date.now() - t0,
    }))

    return NextResponse.json({ traffic, geo, timeline, topPages, totalUniqueVisitors, range, vertical })
  } catch (err) {
    console.error(JSON.stringify({ event: 'analytics_dashboard_error', range, vertical, error: err.message }))
    return NextResponse.json({ traffic: [], geo: [], timeline: [], topPages: [], totalUniqueVisitors: 0, range, vertical })
  }
}
