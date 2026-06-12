import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getPublicVerticals } from '@/lib/verticalUrl'
import { relationHasVerticals } from '@/lib/listings/verticalFilter'

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

    // Only ship listings for verticals that are publicly live. This is the
    // authoritative no-leak boundary — gated verticals (e.g. Way until go-live)
    // never reach the client payload. The flag is read server-side here.
    const publicVerticals = getPublicVerticals()

    // Cross-vertical (142): ship `verticals` when present so the client can show
    // a cross-listed pin under either vertical's filter. Forward-compatible —
    // omitted until the column exists; the client falls back to the scalar.
    const hasVerticals = await relationHasVerticals(sb, 'listings')

    // Single query — sub_type is already on the listings table from sync
    const allListings = await fetchAllPages(
      sb, 'listings',
      `id, vertical, ${hasVerticals ? 'verticals, ' : ''}name, slug, description, region, state, lat, lng, is_featured, sub_type`,
      [q => q.eq('status', 'active'), q => q.in('vertical', publicVerticals), q => q.not('lat', 'is', null), q => q.not('lng', 'is', null)]
    )

    return NextResponse.json(
      { listings: allListings, total: allListings.length },
      // The pin payload is the heaviest fetch on / and /map and only changes
      // on sync. Let the CDN absorb repeat loads; SWR keeps it fresh enough.
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } }
    )
  } catch (err) {
    console.error('[map] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
