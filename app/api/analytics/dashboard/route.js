import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/dashboard
 *
 * Rebuilt from scratch. Queries the `pageviews` table directly.
 * No RPC functions, no complex aggregation — just simple queries.
 *
 * Query params:
 *   range    - '7d', '30d', '90d', '1y' (default: '30d')
 *   vertical - filter by vertical slug (optional)
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') || '30d'
  const vertical = searchParams.get('vertical') || null

  const days = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[range] || 30
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    // All queries in parallel
    const [allRows, geoRows] = await Promise.all([
      // 1. All pageviews in range (for traffic + timeline + top pages + unique visitors)
      sb
        .from('pageviews')
        .select('ts, vertical, path, visitor_id')
        .gte('ts', since)
        .then(r => r.data || []),

      // 2. Geo data (only rows with coordinates)
      (() => {
        let q = sb
          .from('pageviews')
          .select('city, region, country, lat, lng')
          .gte('ts', since)
          .not('lat', 'is', null)
          .not('lng', 'is', null)
        if (vertical) q = q.eq('vertical', vertical)
        return q.limit(5000).then(r => r.data || [])
      })(),
    ])

    // Filter by vertical if specified (for traffic/timeline/topPages)
    const filtered = vertical ? allRows.filter(r => r.vertical === vertical) : allRows

    // Traffic: aggregate by vertical (pageviews + unique visitors)
    const trafficMap = {}
    const trafficVisitors = {} // { vertical: Set<visitor_id> }
    const allVisitors = new Set()
    for (const row of allRows) {
      if (!trafficMap[row.vertical]) {
        trafficMap[row.vertical] = { vertical: row.vertical, total_pageviews: 0, unique_visitors: 0 }
        trafficVisitors[row.vertical] = new Set()
      }
      trafficMap[row.vertical].total_pageviews++
      if (row.visitor_id) {
        trafficVisitors[row.vertical].add(row.visitor_id)
        allVisitors.add(row.visitor_id)
      }
    }
    for (const [v, visitors] of Object.entries(trafficVisitors)) {
      trafficMap[v].unique_visitors = visitors.size
    }
    const traffic = Object.values(trafficMap).sort((a, b) => b.total_pageviews - a.total_pageviews)
    const totalUniqueVisitors = allVisitors.size

    // Timeline: bucket by day
    const timelineMap = {}
    for (const row of filtered) {
      const date = row.ts.slice(0, 10)
      const key = `${date}:${row.vertical}`
      if (!timelineMap[key]) {
        timelineMap[key] = { date, vertical: row.vertical, count: 0 }
      }
      timelineMap[key].count++
    }
    const timeline = Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date))

    // Top pages
    const pageMap = {}
    for (const row of filtered) {
      const key = `${row.vertical}:${row.path}`
      if (!pageMap[key]) {
        pageMap[key] = { vertical: row.vertical, page_path: row.path, count: 0 }
      }
      pageMap[key].count++
    }
    const topPages = Object.values(pageMap).sort((a, b) => b.count - a.count).slice(0, 20)

    // Geo: aggregate by location
    const geoMap = {}
    for (const row of geoRows) {
      const key = `${row.lat}:${row.lng}`
      if (!geoMap[key]) {
        geoMap[key] = { city: row.city, region: row.region, country: row.country, lat: row.lat, lng: row.lng, visit_count: 0 }
      }
      geoMap[key].visit_count++
    }
    const geo = Object.values(geoMap).sort((a, b) => b.visit_count - a.visit_count).slice(0, 500)

    return NextResponse.json({ traffic, geo, timeline, topPages, totalUniqueVisitors, range, vertical })
  } catch (err) {
    console.error('[analytics/dashboard] Error:', err.message)
    return NextResponse.json({ traffic: [], geo: [], timeline: [], topPages: [], range, vertical })
  }
}
