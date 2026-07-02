import { NextResponse } from 'next/server'
import { getTradeContext } from '@/lib/trade/server-auth'
import { loadFactSheet } from '@/lib/trade/factsheet'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — product fact sheet data (gated)
   ═══════════════════════════════════════════════════════════════════════
   GET → the trade one-pager for a trade-ready venue. Includes the
   trade-only contact channel — hence the gate. 404 for venues that are
   not public or not trade-ready.                                            */

export async function GET(_request, { params }) {
  const { user, account, sb } = await getTradeContext()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

  const sheet = await loadFactSheet(sb, { slug: params.slug })
  if (!sheet) return NextResponse.json({ error: 'No trade fact sheet for this venue' }, { status: 404 })

  return NextResponse.json({ sheet })
}
