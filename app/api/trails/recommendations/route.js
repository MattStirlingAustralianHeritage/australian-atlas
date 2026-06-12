import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { recommendForTrail, recommendStarts } from '@/lib/trails/recommend'

/**
 * POST /api/trails/recommendations
 *
 * Suggest next stops for the trail builder.
 *
 * Body:
 *   stops: [{ id, latitude|lat, longitude|lng, vertical }]  — current trail
 *   bbox:  [lngMin, latMin, lngMax, latMax]                 — map viewport
 *
 * With stops → corridor recommendations (along-route / missing-anchor / vibe).
 * Without stops → strong starting points inside the viewport.
 *
 * POST (not GET) because the stop list doesn't belong in a URL; responses
 * are per-trail-state so there's nothing useful to cache anyway.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const rawStops = Array.isArray(body.stops) ? body.stops.slice(0, 30) : []
    const bbox = Array.isArray(body.bbox) && body.bbox.length === 4 ? body.bbox.map(Number) : null

    const stops = rawStops
      .map(s => ({
        id: s.id,
        lat: parseFloat(s.latitude ?? s.lat),
        lng: parseFloat(s.longitude ?? s.lng),
        vertical: s.vertical || null,
        name: typeof s.name === 'string' ? s.name.slice(0, 120) : null,
      }))
      .filter(s => s.id && Number.isFinite(s.lat) && Number.isFinite(s.lng))

    const sb = getSupabaseAdmin()

    let result
    if (stops.length > 0) {
      result = await recommendForTrail(sb, stops)
    } else if (bbox && bbox.every(Number.isFinite)) {
      result = await recommendStarts(sb, bbox)
    } else {
      result = { groups: [] }
    }

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[trails/recommendations] error:', err)
    return NextResponse.json({ groups: [], error: 'recommendations_failed' }, { status: 200 })
  }
}
