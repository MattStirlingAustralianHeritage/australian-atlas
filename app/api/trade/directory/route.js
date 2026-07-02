import { NextResponse } from 'next/server'
import { getTradeContext } from '@/lib/trade/server-auth'
import { queryDirectory } from '@/lib/trade/directory'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — structured directory (gated)
   ═══════════════════════════════════════════════════════════════════════
   GET → filterable browse over the curated network. Trade-readiness is
   enrichment; the pool narrows to trade-ready only when the buyer asks
   (trade=1) or filters on a trade-only attribute.                            */

export async function GET(request) {
  const { user, account, sb } = await getTradeContext()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

  const p = request.nextUrl.searchParams
  const result = await queryDirectory(sb, {
    q: p.get('q') || '',
    state: p.get('state') || '',
    vertical: p.get('vertical') || '',
    region: p.get('region') || '',
    tradeOnly: p.get('trade') === '1',
    bespoke: p.get('bespoke') === '1',
    rates: p.get('rates') === '1',
    coach: p.get('coach') === '1',
    famil: p.get('famil') === '1',
    groupMin: p.get('group_min') || 0,
    page: p.get('page') || 1,
  })

  return NextResponse.json(result)
}
