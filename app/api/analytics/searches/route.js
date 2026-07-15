import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeSearchInsights } from '@/lib/analytics/searchInsights'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/searches
 *
 * "What people are searching for." Aggregates the full window of `search_events`
 * (bot/template probes and more-like-this lookups excluded) into top queries,
 * zero-result gaps, volume and a zero-result rate. Heavy lifting lives in
 * @/lib/analytics/searchInsights so the verification harness asserts on the exact
 * logic that ships here.
 *
 * Query params:
 *   range - '7d', '30d', '90d', '1y' (default: '30d')
 */
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }

export async function GET(request) {
  // Admin-only: raw user search queries are sensitive network intelligence.
  if (!(await checkAdmin(await cookies()))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') || '30d'
  const days = RANGE_DAYS[range] || 30
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  try {
    const t0 = Date.now()
    const insights = await computeSearchInsights(sb, { since })

    console.log(JSON.stringify({
      event: 'analytics_searches',
      range, since,
      totalSearches: insights.totalSearches,
      distinctQueries: insights.distinctQueries,
      zeroResultRate: insights.zeroResultRate,
      windowTotal: insights.windowTotal,
      ms: Date.now() - t0,
    }))

    return NextResponse.json({ ...insights, range })
  } catch (err) {
    console.error(JSON.stringify({ event: 'analytics_searches_error', range, error: err.message }))
    return NextResponse.json({
      totalSearches: 0, distinctQueries: 0, zeroResultSearches: 0, zeroResultRate: 0,
      voyageErrors: 0, avgLatencyMs: null, topQueries: [], zeroResultQueries: [],
      surfaces: [], timeline: [], range,
    })
  }
}
