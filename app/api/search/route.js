import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const vertical = searchParams.get('vertical') || null
  const state = searchParams.get('state') || null
  const region = searchParams.get('region') || null
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10), 10000)
  const offset = (page - 1) * limit

  const sb = getSupabaseAdmin()

  let query = sb
    .from('listings')
    .select('id, vertical, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, is_claimed, website', { count: 'exact' })
    .eq('status', 'active')
    .order('is_featured', { ascending: false })
    .order('name')
    .range(offset, offset + limit - 1)

  if (vertical) query = query.eq('vertical', vertical)
  if (state) query = query.eq('state', state)
  if (region) query = query.eq('region', region)
  if (q) query = query.ilike('name', `%${q}%`)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    listings: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  })
}
