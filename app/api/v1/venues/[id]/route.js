import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validateApiKey, logApiRequest } from '@/lib/api-auth'

const PUBLIC_FIELDS = [
  'id', 'name', 'slug', 'vertical', 'category',
  'description', 'suburb', 'state', 'region',
  'lat', 'lng', 'hero_image_url', 'website_url',
  'is_claimed', 'is_featured',
  'created_at', 'updated_at',
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

  const { id } = await params
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('listings')
    .select(PUBLIC_FIELDS)
    .eq('id', id)
    .eq('status', 'active')
    .single()

  const responseTime = Date.now() - startTime
  logApiRequest(keyRecord.id, `/api/v1/venues/${id}`, 'GET', data ? 200 : 404, responseTime).catch(() => {})

  if (error || !data) {
    return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
  }

  return NextResponse.json({ data }, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
