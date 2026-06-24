import { NextResponse } from 'next/server'
import { getTradeContext } from '@/lib/trade/server-auth'
import { tradeRetrieve } from '@/lib/trade/retrieve'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — natural-language candidate retrieval (gated)
   ═══════════════════════════════════════════════════════════════════════
   POST { query, region? } → ranked candidates from the FULL curated network
   (Voyage embed → pgvector + lexical hybrid). Trade-readiness is enrichment on
   each candidate, never a filter on the pool.                                 */

export async function POST(request) {
  const limited = checkRateLimit(request, { keyPrefix: 'trade-search', maxRequests: 40, windowMs: 60_000 })
  if (limited) return limited

  try {
    const { user, account, sb } = await getTradeContext()
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const query = (body.query || '').toString().slice(0, 300)
    const regionParam = body.region ? body.region.toString().slice(0, 120) : null

    if (!query.trim()) {
      return NextResponse.json({ error: 'Describe the tour you are building' }, { status: 400 })
    }

    const { candidates, detectedRegion, cleaned, fellBack } = await tradeRetrieve(sb, {
      query,
      regionParam,
      limit: 24,
    })

    return NextResponse.json({ candidates, detectedRegion, cleaned, fellBack, count: candidates.length })
  } catch (err) {
    console.error('[trade/search] error:', err)
    return NextResponse.json({ error: 'Search failed', detail: err.message }, { status: 500 })
  }
}
