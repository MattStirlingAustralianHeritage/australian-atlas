import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * POST /api/search/click — record which search result a user clicked, with its
 * rank, so /admin/insights can measure CTR-at-rank (the prerequisite for honestly
 * A/B-testing ranking changes). Fire-and-forget from the client (sendBeacon);
 * always returns 204 so it never blocks navigation.
 */
export async function POST(request) {
  // Cheap abuse guard — this writes a row per call.
  const limited = checkRateLimit(request, { keyPrefix: 'search-click', maxRequests: 120, windowMs: 60_000 })
  if (limited) return new NextResponse(null, { status: 204 })

  try {
    const body = await request.json().catch(() => ({}))
    const query = typeof body.query === 'string' ? body.query.slice(0, 200) : null
    const slug = typeof body.slug === 'string' ? body.slug.slice(0, 200) : null
    if (!slug) return new NextResponse(null, { status: 204 })

    const sb = getSupabaseAdmin()
    sb.from('search_click_events').insert({
      query_text: query,
      listing_id: typeof body.listingId === 'string' ? body.listingId : null,
      slug,
      vertical: typeof body.vertical === 'string' ? body.vertical.slice(0, 40) : null,
      rank: Number.isFinite(body.rank) ? Math.trunc(body.rank) : null,
      surface: body.surface === 'vibe' ? 'vibe' : 'front_door',
    }).then(() => {}).catch(() => {})
  } catch { /* silent — analytics must never break navigation */ }

  return new NextResponse(null, { status: 204 })
}
