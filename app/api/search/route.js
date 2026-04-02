import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const vertical = searchParams.get('vertical') || null
  const state = searchParams.get('state') || null
  const region = searchParams.get('region') || null
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10), 100)
  const offset = (page - 1) * limit

  const sb = getSupabaseAdmin()

  try {
    // If there's a text query, use full-text search
    if (q && q.trim()) {
      const query = q.trim()

      const [{ data: ftsData, error: ftsError }, { data: countData, error: countError }] =
        await Promise.all([
          sb.rpc('search_listings', {
            query,
            vertical_filter: vertical || null,
            state_filter: state || null,
            result_limit: limit,
            result_offset: offset,
          }),
          sb.rpc('search_listings_count', {
            query,
            vertical_filter: vertical || null,
            state_filter: state || null,
          }),
        ])

      if (ftsError) {
        console.error('[search] FTS error:', ftsError.message)
        return NextResponse.json({ error: ftsError.message }, { status: 500 })
      }

      const listings = ftsData || []
      const total = countError ? listings.length : (countData ?? 0)

      return NextResponse.json({
        listings,
        total: Math.max(total, listings.length),
        page,
        limit,
        totalPages: Math.ceil(Math.max(total, listings.length) / limit),
      })
    }

    // No text query — standard listing fetch with filters
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
  } catch (err) {
    console.error('[search] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
