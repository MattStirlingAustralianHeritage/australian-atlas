import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

const SELECT_COLS = 'id, vertical, source_id, name, slug, description, region, state, lat, lng, website, phone, address, hero_image_url, is_claimed, is_featured, is_market, status, editors_pick, created_at, updated_at'

// Approximate bounding boxes per Australian state
const STATE_BOUNDS = {
  NSW: { minLat: -37.5, maxLat: -28.2, minLng: 141.0, maxLng: 153.6 },
  VIC: { minLat: -39.2, maxLat: -34.0, minLng: 140.9, maxLng: 150.0 },
  QLD: { minLat: -29.2, maxLat: -10.7, minLng: 138.0, maxLng: 153.5 },
  SA:  { minLat: -38.1, maxLat: -26.0, minLng: 129.0, maxLng: 141.0 },
  WA:  { minLat: -35.2, maxLat: -13.7, minLng: 112.9, maxLng: 129.0 },
  TAS: { minLat: -43.7, maxLat: -39.6, minLng: 143.8, maxLng: 148.4 },
  ACT: { minLat: -35.9, maxLat: -35.1, minLng: 148.7, maxLng: 149.4 },
  NT:  { minLat: -26.0, maxLat: -10.9, minLng: 129.0, maxLng: 138.0 },
}

function isMisplaced(listing) {
  const { lat, lng, state } = listing
  if (!lat || !lng || !state) return false
  const b = STATE_BOUNDS[state]
  if (!b) return false
  return lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng
}

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

    // ─── Special: misplaced filter ────────────────────────
    // Fetches all listings with coordinates and checks against state bounding boxes
    if (status === 'misplaced') {
      let mQuery = sb.from('listings').select(SELECT_COLS)
        .eq('status', 'active')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .not('state', 'is', null)

      if (vertical) mQuery = mQuery.eq('vertical', vertical)
      if (region) mQuery = mQuery.eq('region', region)
      if (search) {
        mQuery = mQuery.or(`name.ilike.%${search}%,description.ilike.%${search}%,address.ilike.%${search}%`)
      }

      const { data: allWithCoords, error: mError } = await mQuery
      if (mError) throw mError

      const misplaced = (allWithCoords || []).filter(isMisplaced)
      const total = misplaced.length
      const from = page * limit
      const paged = misplaced.slice(from, from + limit)

      return NextResponse.json({ listings: paged, total, page, limit })
    }

    // ─── Standard query ───────────────────────────────────
    let query = sb.from('listings').select(SELECT_COLS, { count: 'exact' })

    if (vertical) query = query.eq('vertical', vertical)
    if (region) query = query.eq('region', region)
    if (status) {
      const statuses = status.split(',').map(s => s.trim())
      if (statuses.length === 1) {
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
