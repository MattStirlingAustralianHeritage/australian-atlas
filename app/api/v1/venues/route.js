import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validateApiKey, logApiRequest } from '@/lib/api-auth'
import { LISTING_REGION_SELECT, resolveRegionParam } from '@/lib/regions'

/**
 * Public API: GET /api/v1/venues
 * Returns verified, active listings. Filterable by vertical, region, state.
 * Requires API key via x-api-key header or ?api_key= param.
 * Rate limited per API key tier.
 */

const PUBLIC_FIELDS = [
  'id', 'name', 'slug', 'vertical', 'category',
  'description', 'suburb', 'state', 'region',
  'lat', 'lng', 'hero_image_url', 'website_url',
  'is_claimed', 'is_featured',
  'created_at', 'updated_at',
  LISTING_REGION_SELECT,
].join(', ')

export async function GET(request) {
  const startTime = Date.now()
  const { searchParams } = new URL(request.url)

  // Auth
  const apiKey = request.headers.get('x-api-key') || searchParams.get('api_key')
  if (!apiKey) {
    return NextResponse.json(
      { error: 'API key required. Get one at australianatlas.com.au/developers' },
      { status: 401 }
    )
  }

  const keyRecord = await validateApiKey(apiKey)
  if (!keyRecord) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }
  if (keyRecord.rate_limited) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', limit: keyRecord.rate_limit, resets_at: keyRecord.requests_reset_at },
      { status: 429 }
    )
  }

  // Query params
  const vertical = searchParams.get('vertical')
  const region = searchParams.get('region')
  const state = searchParams.get('state')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const offset = parseInt(searchParams.get('offset') || '0')

  // Decision 2 dual-acceptance: accept slug-shaped or name-shaped ?region=
  // and filter by the canonical FK. No 301 redirect — programmatic API
  // clients shouldn't be redirected. Add deprecation header when name-shape
  // was used so external integrators can migrate to slug-shape.
  const { region: resolvedRegion, redirectNeeded } = await resolveRegionParam(region)

  const sb = getSupabaseAdmin()
  let query = sb
    .from('listings')
    .select(PUBLIC_FIELDS, { count: 'exact' })
    .eq('status', 'active')

  if (vertical) query = query.eq('vertical', vertical)
  if (resolvedRegion) {
    query = query.or(`region_computed_id.eq.${resolvedRegion.id},region_override_id.eq.${resolvedRegion.id}`)
  } else if (region) {
    // Param supplied but no canonical region matched — fall back to legacy text ilike
    query = query.ilike('region', `%${region}%`)
  }
  if (state) query = query.eq('state', state.toUpperCase())

  query = query.order('name').range(offset, offset + limit - 1)

  const { data, count, error } = await query

  const responseTime = Date.now() - startTime

  // Non-blocking log
  logApiRequest(keyRecord.id, '/api/v1/venues', 'GET', error ? 500 : 200, responseTime).catch(() => {})

  if (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  const headers = {
    'X-RateLimit-Limit': String(keyRecord.rate_limit),
    'X-RateLimit-Remaining': String(Math.max(0, keyRecord.rate_limit - (keyRecord.requests_today || 0) - 1)),
    'Cache-Control': 'public, max-age=300',
  }
  if (redirectNeeded && resolvedRegion) {
    // Deprecation signal — name-shaped param accepted, but slug-shaped is canonical.
    headers['X-Deprecated-Param'] = `region-by-name; canonical=region=${resolvedRegion.slug}`
  }

  return NextResponse.json({
    data,
    meta: {
      total: count,
      limit,
      offset,
      has_more: offset + limit < count,
    },
  }, { headers })
}
