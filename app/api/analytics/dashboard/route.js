import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * GET /api/analytics/dashboard
 *
 * Admin-only endpoint that returns aggregated analytics for the dashboard.
 * Query params:
 *   range    - '7d', '30d', '90d', '1y' (default: '30d')
 *   vertical - filter by vertical slug (optional)
 *
 * Auth: Requires admin_auth cookie.
 */
export async function GET(request) {
  // Verify admin auth — support both current JWT cookie and legacy cookie
  const adminToken = request.cookies.get('atlas_admin')?.value
    || request.cookies.get('admin_auth')?.value
  if (!adminToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') || '30d'
  const vertical = searchParams.get('vertical') || null

  const rangeMap = { '7d': '7 days', '30d': '30 days', '90d': '90 days', '1y': '365 days' }
  const interval = rangeMap[range] || '30 days'

  const supabase = getSupabaseAdmin()

  // Run queries in parallel
  const [trafficRes, geoRes, timelineRes, topPagesRes] = await Promise.all([
    // 1. Traffic summary per vertical
    supabase.rpc('analytics_traffic_summary', { time_range: interval }),

    // 2. Geographic heatmap data
    supabase.rpc('analytics_geo_heatmap', {
      time_range: interval,
      filter_vertical: vertical,
    }),

    // 3. Timeline (daily pageviews for chart)
    supabase
      .from('site_analytics')
      .select('created_at, vertical')
      .eq('event_type', 'pageview')
      .gte('created_at', new Date(Date.now() - parseDays(range) * 86400000).toISOString())
      .order('created_at', { ascending: true })
      .limit(10000),

    // 4. Top pages
    getTopPages(supabase, interval, vertical),
  ])

  // Process timeline into daily buckets
  const timeline = bucketByDay(timelineRes.data || [])

  return NextResponse.json({
    traffic: trafficRes.data || [],
    geo: geoRes.data || [],
    timeline,
    topPages: topPagesRes,
    range,
    vertical,
  })
}

function parseDays(range) {
  const map = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }
  return map[range] || 30
}

function bucketByDay(rows) {
  const buckets = {}
  for (const row of rows) {
    const date = row.created_at.slice(0, 10) // YYYY-MM-DD
    const key = `${date}:${row.vertical}`
    if (!buckets[key]) {
      buckets[key] = { date, vertical: row.vertical, count: 0 }
    }
    buckets[key].count++
  }
  return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date))
}

async function getTopPages(supabase, interval, vertical) {
  // Raw SQL via RPC would be cleaner, but this works for now
  let query = supabase
    .from('site_analytics')
    .select('page_path, vertical')
    .eq('event_type', 'pageview')
    .gte('created_at', new Date(Date.now() - parseIntervalMs(interval)).toISOString())

  if (vertical) {
    query = query.eq('vertical', vertical)
  }

  const { data } = await query.limit(5000)
  if (!data) return []

  // Count by page_path
  const counts = {}
  for (const row of data) {
    const key = `${row.vertical}:${row.page_path}`
    if (!counts[key]) {
      counts[key] = { vertical: row.vertical, page_path: row.page_path, count: 0 }
    }
    counts[key].count++
  }

  return Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
}

function parseIntervalMs(interval) {
  const match = interval.match(/(\d+)\s*(days?)/)
  if (match) return parseInt(match[1]) * 86400000
  return 30 * 86400000
}
