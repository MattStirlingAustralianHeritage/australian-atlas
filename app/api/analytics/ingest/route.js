import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { isBotRow, isBotUA } from '@/lib/analytics/aggregate'

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
 * Geographic data is resolved server-side from the request headers. is_bot is
 * classified at write time as isBotUA(user_agent) || isBotRow(geo) — the same
 * canonical predicate the read paths use (migrations 141 + 178).
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

    // pageviews carries user_agent + is_bot (migration 141). is_bot is classified
    // at write time with the canonical predicate isBotUA(user_agent) || isBotRow(geo)
    // (migration 178) — declared crawlers caught by UA, datacenter/null-geo origins
    // by geo. The RPC reads the stored is_bot column; the JS fallback recomputes the
    // SAME predicate over the stored user_agent, so all paths agree. Try the enriched
    // insert first; if user_agent/is_bot aren't present (a DB without 141), fall back
    // to the base payload so pageviews are never dropped.
    const enriched = { ...base, user_agent, is_bot: isBotUA(user_agent) || isBotRow(geo) }
    let { error } = await supabase.from('pageviews').insert(enriched)
    if (error && isMissingColumnError(error)) {
      ;({ error } = await supabase.from('pageviews').insert(base))
    }

    // Fail LOUDLY. A prior regression silently inserted into a non-existent
    // `site_analytics` table and returned ok:true, so every vertical pageview was
    // dropped undetected for weeks. Never report ok on a failed write again — log
    // the full error server-side and return non-2xx. Trackers fire-and-forget
    // (fetch ignores the body; 500 is not a network reject) so this never breaks UX.
    if (error) {
      console.error('[analytics/ingest] Insert failed:', error.message, error.code, error.details)
      return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 500, headers: CORS_HEADERS })
    }

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch (err) {
    console.error('[analytics/ingest] Error:', err?.message, err)
    // Malformed JSON is a client error; anything else is a server fault. Either
    // way, do NOT return ok — surface the failure.
    const status = err instanceof SyntaxError ? 400 : 500
    return NextResponse.json({ ok: false, error: 'ingest_error' }, { status, headers: CORS_HEADERS })
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
