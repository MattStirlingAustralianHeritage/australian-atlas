import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validateApiKey, logApiRequest } from '@/lib/api-auth'
import { LISTING_REGION_SELECT } from '@/lib/regions'
import { filterByVertical, relationHasVerticals } from '@/lib/listings/verticalFilter'
import { excludeNeedsReview, excludeTestListings } from '@/lib/listings/publicFilter'

const PUBLIC_FIELDS = [
  'id', 'name', 'slug', 'vertical', 'category',
  'description', 'suburb', 'state', 'region',
  'lat', 'lng', 'hero_image_url', 'website_url',
  'is_claimed', 'is_featured',
  'created_at', 'updated_at',
  LISTING_REGION_SELECT,
].join(', ')

export async function GET(request, { params }) {
  const startTime = Date.now()
  const { searchParams } = new URL(request.url)
  const apiKey = request.headers.get('x-api-key') || searchParams.get('api_key')

  if (!apiKey) {
    return NextResponse.json(
      { error: 'API key required. Get one at australianatlas.com.au/developers' },
      { status: 401 }
    )
  }

  const keyRecord = await validateApiKey(apiKey)
  if (!keyRecord) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  if (keyRecord.rate_limited) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const { slug } = await params
  const vertical = searchParams.get('vertical')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const offset = parseInt(searchParams.get('offset') || '0')

  const sb = getSupabaseAdmin()

  // Resolve region from slug
  const { data: region } = await sb
    .from('regions')
    .select('id, name, state, center_lat, center_lng')
    .eq('slug', slug)
    .single()

  if (!region) {
    return NextResponse.json({ error: 'Region not found' }, { status: 404 })
  }

  // Query listings by override-wins resolved region_id, via the
  // listings_with_region view (migration 125).
  let query = sb
    .from('listings_with_region')
    .select(PUBLIC_FIELDS, { count: 'exact' })
    .eq('status', 'active')
    .eq('region_id', region.id)
  // Public-surface hard rule: exclude needs_review + admin QA fixtures.
  query = excludeNeedsReview(excludeTestListings(query))

  if (vertical) query = filterByVertical(query, vertical, await relationHasVerticals(sb, 'listings_with_region'))
  query = query.order('is_featured', { ascending: false }).order('name').range(offset, offset + limit - 1)

  const { data, count, error } = await query

  const responseTime = Date.now() - startTime
  logApiRequest(keyRecord.id, `/api/v1/regions/${slug}/venues`, 'GET', error ? 500 : 200, responseTime).catch(() => {})

  if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 })

  return NextResponse.json({
    region: { name: region.name, state: region.state },
    data,
    meta: { total: count, limit, offset, has_more: offset + limit < count },
  }, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
