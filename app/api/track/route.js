import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isBotRow, isBotUA } from '@/lib/analytics/aggregate'

/**
 * POST /api/track
 *
 * Dead-simple pageview tracker (portal PageTracker). One table, one insert.
 * Geographic data from Vercel headers.
 *
 * Writes to `pageviews` with bot classification at write time: is_bot =
 * isBotUA(user_agent) || isBotRow(geo) — the canonical predicate shared with
 * /api/analytics/ingest and the read paths (migrations 141 + 178). This route
 * previously stored NEITHER user_agent NOR is_bot, so post-141 datacenter/crawler
 * pageviews defaulted to is_bot=false and leaked into council "human" traffic
 * (e.g. Singapore surfacing as a top visitor-origin). Now tagged at the source.
 */
export async function POST(request) {
  try {
    const { vertical, path, referrer, device, visitor_id } = await request.json()
    if (!path) return NextResponse.json({ ok: false, error: 'missing_path' }, { status: 400 })

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const country = request.headers.get('x-vercel-ip-country') || null
    const region = request.headers.get('x-vercel-ip-country-region') || null
    const city = request.headers.get('x-vercel-ip-city')
      ? decodeURIComponent(request.headers.get('x-vercel-ip-city'))
      : null
    const lat = request.headers.get('x-vercel-ip-latitude')
      ? parseFloat(request.headers.get('x-vercel-ip-latitude'))
      : null
    const lng = request.headers.get('x-vercel-ip-longitude')
      ? parseFloat(request.headers.get('x-vercel-ip-longitude'))
      : null
    const user_agent = request.headers.get('user-agent') || null

    const base = {
      vertical: vertical || 'portal',
      path,
      referrer: referrer || null,
      device: device || null,
      visitor_id: visitor_id || null,
      country,
      region,
      city,
      lat,
      lng,
    }
    // Tag bots at write time so the stored is_bot column the RPCs read is correct.
    const enriched = { ...base, user_agent, is_bot: isBotUA(user_agent) || isBotRow({ country, city }) }
    let { error } = await sb.from('pageviews').insert(enriched)
    if (error && isMissingColumnError(error)) {
      ;({ error } = await sb.from('pageviews').insert(base))
    }

    // Fail LOUDLY — never return ok on a failed write. A prior regression silently
    // dropped pageviews into a non-existent table and reported success; that class
    // of bug must surface. PageTracker fires fire-and-forget (fetch ignores the
    // body; 500 is not a network reject), so a non-2xx never breaks the page.
    if (error) {
      console.error('[/api/track] Insert failed:', error.message, error.code, error.details)
      return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/track] Error:', err?.message, err)
    const status = err instanceof SyntaxError ? 400 : 500
    return NextResponse.json({ ok: false, error: 'track_error' }, { status })
  }
}

/** True when an insert failed because a referenced column doesn't exist (pre-141). */
function isMissingColumnError(error) {
  return error?.code === 'PGRST204' || error?.code === '42703' ||
    /column .* does not exist|could not find the .* column/i.test(error?.message || '')
}

export async function OPTIONS() {
  return NextResponse.json(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
