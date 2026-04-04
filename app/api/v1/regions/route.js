import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validateApiKey, logApiRequest } from '@/lib/api-auth'

export async function GET(request) {
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

  const state = searchParams.get('state')
  const sb = getSupabaseAdmin()

  let query = sb
    .from('regions')
    .select('id, name, slug, state, description, center_lat, center_lng, listing_count')
    .eq('status', 'live')

  if (state) query = query.eq('state', state.toUpperCase())
  query = query.order('name')

  const { data, error } = await query

  const responseTime = Date.now() - startTime
  logApiRequest(keyRecord.id, '/api/v1/regions', 'GET', error ? 500 : 200, responseTime).catch(() => {})

  if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 })

  return NextResponse.json({ data, meta: { total: data?.length || 0 } }, {
    headers: { 'Cache-Control': 'public, max-age=600' },
  })
}
