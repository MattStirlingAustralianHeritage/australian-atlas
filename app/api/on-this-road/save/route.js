import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createHash, randomBytes } from 'crypto'

/** Generate an anonymous session id from user-agent + date (no PII) */
function getSessionId(request) {
  const ua = request.headers.get('user-agent') || 'unknown'
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256').update(`${ua}:${day}`).digest('hex').slice(0, 16)
}

/** Turn a title into a URL-friendly slug with random suffix */
function makeSlug(title) {
  const base = (title || 'trip')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  const suffix = randomBytes(2).toString('hex') // 4 hex chars
  return `${base}-${suffix}`
}

/** Generate a random 8-char alphanumeric short code */
function makeShortCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  const bytes = randomBytes(8)
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length]
  }
  return code
}

export async function POST(request) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.title || !body.start_name || !body.end_name) {
      return NextResponse.json(
        { error: 'Missing required fields: title, start_name, end_name' },
        { status: 400 }
      )
    }

    if (!body.days || !Array.isArray(body.days) || body.days.length === 0) {
      return NextResponse.json(
        { error: 'At least one day with stops is required' },
        { status: 400 }
      )
    }

    const slug = makeSlug(body.title)
    const short_code = makeShortCode()
    const session_id = getSessionId(request)

    const row = {
      slug,
      short_code,
      session_id,
      title: body.title,
      intro: body.intro || null,
      start_name: body.start_name,
      end_name: body.end_name,
      start_coords: body.start_coords || null,
      end_coords: body.end_coords || null,
      route_geometry: body.route_geometry || null,
      return_route_geometry: body.return_route_geometry || null,
      departure_timing: body.departure_timing || null,
      trip_length: body.trip_length || null,
      detour_tolerance: body.detour_tolerance || null,
      preferences: body.preferences || [],
      is_surprise_me: body.is_surprise_me ?? false,
      is_return_different: body.is_return_different ?? false,
      days: body.days,
      route_distance_km: body.route_distance_km || null,
      route_duration_minutes: body.route_duration_minutes || null,
      total_listings_found: body.total_listings_found || 0,
      coverage_gaps: body.coverage_gaps || null,
    }

    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('road_trips')
      .insert(row)
      .select('slug, short_code')
      .single()

    if (error) {
      console.error('[on-this-road/save] Supabase insert error:', error.message)
      return NextResponse.json(
        { error: 'Failed to save trip' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      slug: data.slug,
      short_code: data.short_code,
      url: `/trip/${data.slug}`,
    })
  } catch (err) {
    console.error('[on-this-road/save] Unexpected error:', err.message)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
