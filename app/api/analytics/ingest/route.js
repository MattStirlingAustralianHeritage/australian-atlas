import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: CORS_HEADERS })
}

/**
 * POST /api/analytics/ingest
 *
 * Lightweight analytics endpoint called by verticals to report pageviews
 * and events. Designed for fire-and-forget client-side calls.
 *
 * Body:
 *   vertical    - 'sba', 'collection', 'craft', 'fine_grounds', 'rest', 'portal'
 *   page_path   - e.g. '/venue/mclaren-vale-winery'
 *   event_type  - 'pageview' (default), 'signup', 'claim_start', 'claim_complete', 'search'
 *   referrer    - (optional) referring URL
 *   device_type - (optional) 'desktop', 'mobile', 'tablet'
 *
 * Geographic data is resolved server-side from the request headers.
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const { vertical, page_path, event_type = 'pageview', referrer, device_type } = body

    if (!vertical || !page_path) {
      return NextResponse.json({ error: 'Missing vertical or page_path' }, { status: 400, headers: CORS_HEADERS })
    }

    // Resolve geographic data from Vercel headers (or CF headers)
    const geo = resolveGeo(request)

    const supabase = getSupabaseAdmin()
    await supabase.from('site_analytics').insert({
      vertical,
      page_path,
      event_type,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      lat: geo.lat,
      lng: geo.lng,
      referrer: referrer || null,
      device_type: device_type || null,
    })

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch {
    // Analytics should never break the user experience — fail silently
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  }
}

/**
 * Extract geographic data from Vercel Edge headers.
 * Falls back gracefully if headers aren't present.
 */
function resolveGeo(request) {
  const headers = request.headers

  // Vercel provides these headers on Edge/Serverless
  const country = headers.get('x-vercel-ip-country') || null
  const region = headers.get('x-vercel-ip-country-region') || null
  const city = headers.get('x-vercel-ip-city') ? decodeURIComponent(headers.get('x-vercel-ip-city')) : null
  const lat = headers.get('x-vercel-ip-latitude') ? parseFloat(headers.get('x-vercel-ip-latitude')) : null
  const lng = headers.get('x-vercel-ip-longitude') ? parseFloat(headers.get('x-vercel-ip-longitude')) : null

  return { country, region, city, lat, lng }
}
