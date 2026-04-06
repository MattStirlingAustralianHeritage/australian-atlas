import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

const SELECT_COLS = 'id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, status, editors_pick, created_at, updated_at'

export async function GET(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const vertical = searchParams.get('vertical') || null
  const region = searchParams.get('region') || null
  const status = searchParams.get('status') || null
  const search = searchParams.get('search') || null
  const sort = searchParams.get('sort') || 'updated_at_desc'
  const page = parseInt(searchParams.get('page') || '0', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100)

  try {
    const sb = getSupabaseAdmin()

    // Build query
    let query = sb.from('listings').select(SELECT_COLS, { count: 'exact' })

    if (vertical) query = query.eq('vertical', vertical)
    if (region) query = query.eq('region', region)
    if (status) {
      const statuses = status.split(',').map(s => s.trim())
      if (statuses.length === 1) {
        // Handle special filters
        if (statuses[0] === 'claimed') query = query.eq('is_claimed', true)
        else if (statuses[0] === 'unclaimed') query = query.eq('is_claimed', false)
        else query = query.eq('status', statuses[0])
      } else {
        query = query.in('status', statuses)
      }
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,address.ilike.%${search}%`)
    }

    // Sort
    const [sortCol, sortDir] = sort.split('_').length === 3
      ? [sort.split('_').slice(0, 2).join('_'), sort.split('_')[2]]
      : [sort.replace(/_(?:asc|desc)$/, ''), sort.endsWith('_asc') ? 'asc' : 'desc']
    query = query.order(sortCol, { ascending: sortDir === 'asc' })

    // Paginate
    const from = page * limit
    query = query.range(from, from + limit - 1)

    const { data, error, count } = await query

    if (error) throw error

    return NextResponse.json({ listings: data || [], total: count || 0, page, limit })
  } catch (err) {
    console.error('[admin/listings/GET] Error:', err.message)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }
}
