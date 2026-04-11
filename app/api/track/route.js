import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/track
 *
 * Dead-simple pageview tracker. One table, one insert, no frills.
 * Geographic data from Vercel headers. Always returns 200.
 */
export async function POST(request) {
  try {
    const { vertical, path, referrer, device, visitor_id } = await request.json()
    if (!path) return NextResponse.json({ ok: true })

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

    const { error } = await sb.from('pageviews').insert({
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
    })

    if (error) {
      console.error('[/api/track] Insert failed:', error.message, error.code)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/track] Error:', err.message)
    return NextResponse.json({ ok: true })
  }
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
