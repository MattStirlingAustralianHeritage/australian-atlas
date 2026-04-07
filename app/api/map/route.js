import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// Cache for 5 minutes via ISR — avoids Vercel timeout on every request
export const revalidate = 300

async function fetchAllPages(sb, table, selectCols, filters = []) {
  const PAGE_SIZE = 1000
  let all = []
  let page = 0
  while (true) {
    let query = sb.from(table).select(selectCols).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    for (const f of filters) query = f(query)
    const { data, error } = await query
    if (error) { console.error(`[map] ${table} page ${page} error:`, error.message); break }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE_SIZE) break
    page++
  }
  return all
}

export async function GET() {
  try {
    const sb = getSupabaseAdmin()

    // Single query — sub_type is already on the listings table from sync
    const allListings = await fetchAllPages(
      sb, 'listings',
      'id, vertical, name, slug, description, region, state, lat, lng, is_featured, sub_type',
      [q => q.eq('status', 'active'), q => q.not('lat', 'is', null), q => q.not('lng', 'is', null)]
    )

    return NextResponse.json({ listings: allListings, total: allListings.length })
  } catch (err) {
    console.error('[map] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
