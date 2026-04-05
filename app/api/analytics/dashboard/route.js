import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/dashboard
 *
 * Admin endpoint that returns aggregated analytics for the dashboard.
 * Query params:
 *   range    - '7d', '30d', '90d', '1y' (default: '30d')
 *   vertical - filter by vertical slug (optional)
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') || '30d'
  const vertical = searchParams.get('vertical') || null

  const days = parseDays(range)
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const interval = { '7d': '7 days', '30d': '30 days', '90d': '90 days', '1y': '365 days' }[range] || '30 days'

  const supabase = getSupabaseAdmin()

  // Run queries in parallel — use direct queries with RPC fallback
  const [trafficRes, geoRes, timelineRes, topPagesRes] = await Promise.all([
    // 1. Traffic summary per vertical
    getTrafficSummary(supabase, since, interval),

    // 2. Geographic heatmap data
    getGeoHeatmap(supabase, since, interval, vertical),

    // 3. Timeline (daily pageviews for chart)
    supabase
      .from('site_analytics')
      .select('created_at, vertical')
      .eq('event_type', 'pageview')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(10000),

    // 4. Top pages
    getTopPages(supabase, since, vertical),
  ])

  if (timelineRes.error) {
    console.error('Analytics timeline query error:', timelineRes.error)
  }

  // Process timeline into daily buckets
  const timeline = bucketByDay(timelineRes.data || [])

  return NextResponse.json({
    traffic: trafficRes || [],
    geo: geoRes || [],
    timeline,
    topPages: topPagesRes,
    range,
    vertical,
  })
}

/**
 * Get traffic summary per vertical.
 * Tries RPC first, falls back to direct query if the function doesn't exist.
 */
async function getTrafficSummary(supabase, since, interval) {
  // Try RPC first
  const { data, error } = await supabase.rpc('analytics_traffic_summary', { time_range: interval })
  if (!error && data) return data

  if (error) {
    console.error('analytics_traffic_summary RPC failed, using direct query:', error.message)
  }

  // Fallback: direct query aggregation
  const { data: rows, error: queryError } = await supabase
    .from('site_analytics')
    .select('vertical, event_type')
    .gte('created_at', since)

  if (queryError) {
    console.error('Traffic summary fallback query error:', queryError)
    return []
  }

  if (!rows || rows.length === 0) return []

  // Aggregate in JS
  const byVertical = {}
  for (const row of rows) {
    if (!byVertical[row.vertical]) {
      byVertical[row.vertical] = { vertical: row.vertical, total_pageviews: 0, total_signups: 0, total_claims: 0 }
    }
    if (row.event_type === 'pageview') byVertical[row.vertical].total_pageviews++
    if (row.event_type === 'signup') byVertical[row.vertical].total_signups++
    if (row.event_type === 'claim_complete') byVertical[row.vertical].total_claims++
  }

  return Object.values(byVertical).sort((a, b) => b.total_pageviews - a.total_pageviews)
}

/**
 * Get geographic heatmap data.
 * Tries RPC first, falls back to direct query if the function doesn't exist.
 */
async function getGeoHeatmap(supabase, since, interval, vertical) {
  // Try RPC first
  const { data, error } = await supabase.rpc('analytics_geo_heatmap', {
    time_range: interval,
    filter_vertical: vertical,
  })
  if (!error && data) return data

  if (error) {
    console.error('analytics_geo_heatmap RPC failed, using direct query:', error.message)
  }

  // Fallback: direct query
  let query = supabase
    .from('site_analytics')
    .select('city, region, country, lat, lng')
    .gte('created_at', since)
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (vertical) {
    query = query.eq('vertical', vertical)
  }

  const { data: rows, error: queryError } = await query.limit(5000)

  if (queryError) {
    console.error('Geo heatmap fallback query error:', queryError)
    return []
  }

  if (!rows || rows.length === 0) return []

  // Aggregate by location
  const byLocation = {}
  for (const row of rows) {
    const key = `${row.lat}:${row.lng}`
    if (!byLocation[key]) {
      byLocation[key] = { city: row.city, region: row.region, country: row.country, lat: row.lat, lng: row.lng, visit_count: 0 }
    }
    byLocation[key].visit_count++
  }

  return Object.values(byLocation)
    .sort((a, b) => b.visit_count - a.visit_count)
    .slice(0, 500)
}

function parseDays(range) {
  const map = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }
  return map[range] || 30
}

function bucketByDay(rows) {
  const buckets = {}
  for (const row of rows) {
    const date = row.created_at.slice(0, 10)
    const key = `${date}:${row.vertical}`
    if (!buckets[key]) {
      buckets[key] = { date, vertical: row.vertical, count: 0 }
    }
    buckets[key].count++
  }
  return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date))
}

async function getTopPages(supabase, since, vertical) {
  let query = supabase
    .from('site_analytics')
    .select('page_path, vertical')
    .eq('event_type', 'pageview')
    .gte('created_at', since)

  if (vertical) {
    query = query.eq('vertical', vertical)
  }

  const { data, error } = await query.limit(5000)
  if (error) {
    console.error('Top pages query error:', error)
    return []
  }
  if (!data) return []

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
