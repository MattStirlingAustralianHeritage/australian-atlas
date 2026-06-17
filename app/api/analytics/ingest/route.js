import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { isBotRow } from '@/lib/analytics/aggregate'

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
 * Lightweight analytics endpoint called by verticals to report pageviews.
 * Designed for fire-and-forget client-side calls.
 *
 * Writes to the live `pageviews` table — the single source of truth read by
 * the analytics dashboard and the council region metrics. (This route
 * previously inserted into `site_analytics`, a table that does not exist, so
 * every vertical pageview was silently dropped. Repointed to `pageviews`,
 * mapping the payload to its real columns.)
 *
 * Body:
 *   vertical    - 'sba', 'collection', 'craft', 'fine_grounds', 'rest', 'portal'
 *   page_path   - e.g. '/place/mclaren-vale-winery' (mapped to pageviews.path)
 *   event_type  - 'pageview' (default). pageviews is a pageview-only table; any
 *                 non-pageview event_type is accepted but not persisted (there is
 *                 no destination table), and reported back as skipped.
 *   referrer    - (optional) referring URL
 *   device_type - (optional) 'desktop', 'mobile', 'tablet' (mapped to pageviews.device)
 *   visitor_id  - (optional) anonymous visitor id for unique-visitor counts
 *
 * Geographic data is resolved server-side from the request headers, and (after
 * migration 141) is_bot is classified at write time via the same geo heuristic
 * used by the dashboard's historical backfill.
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const { vertical, page_path, event_type = 'pageview', referrer, device_type, visitor_id } = body

    if (!vertical || !page_path) {
      return NextResponse.json({ error: 'Missing vertical or page_path' }, { status: 400, headers: CORS_HEADERS })
    }

    // pageviews holds pageviews only. Non-pageview events have no destination
    // table — acknowledge without dropping silently into a void.
    if (event_type && event_type !== 'pageview') {
      return NextResponse.json({ ok: true, skipped: 'non_pageview_event' }, { headers: CORS_HEADERS })
    }

    // Resolve geographic data from Vercel headers (or CF headers)
    const geo = resolveGeo(request)
    const user_agent = request.headers.get('user-agent') || null

    // Base payload — columns that exist on pageviews regardless of migration 141.
    const base = {
      vertical,
      path: page_path,
      referrer: referrer || null,
      device: device_type || null,
      visitor_id: visitor_id || null,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      lat: geo.lat,
      lng: geo.lng,
    }

    const supabase = getSupabaseAdmin()

    // After migration 141, pageviews carries user_agent + is_bot. is_bot is
    // classified at write time with the SAME geo-only heuristic (isBotRow) as
    // 141's historical backfill AND as every read path (the RPC reads the stored
    // is_bot column; the JS fallback recomputes isBotRow) — so all three agree
    // exactly, for historical and future rows alike. user_agent is stored for
    // later analysis but deliberately not used for is_bot, which would make the
    // stored column diverge from the recompute. Try the enriched insert first;
    // if those columns aren't present yet (141 not applied), fall back to the
    // base payload so pageviews are never dropped.
    const enriched = { ...base, user_agent, is_bot: isBotRow(geo) }
    let { error } = await supabase.from('pageviews').insert(enriched)
    if (error && isMissingColumnError(error)) {
      ;({ error } = await supabase.from('pageviews').insert(base))
    }

    if (error) {
      console.error('[analytics/ingest] Insert failed:', error.message, error.code, error.details)
    }

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch (err) {
    // Analytics should never break the user experience — log and fail silently
    console.error('Analytics ingest error:', err)
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  }
}

/** True when an insert failed because a referenced column doesn't exist (pre-141). */
function isMissingColumnError(error) {
  // PostgREST: PGRST204 (column not found in schema cache); Postgres: 42703.
  return error?.code === 'PGRST204' || error?.code === '42703' ||
    /column .* does not exist|could not find the .* column/i.test(error?.message || '')
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
