import { NextResponse } from 'next/server'
import { getTradeContext } from '@/lib/trade/server-auth'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — single enquiry (gated, owner-scoped)
   ═══════════════════════════════════════════════════════════════════════
   PATCH → buyer-maintained status: sent → answered / closed.                 */

const STATUSES = ['sent', 'answered', 'closed']

export async function PATCH(request, { params }) {
  const { user, account, sb } = await getTradeContext()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

  const { data: enquiry } = await sb
    .from('trade_enquiries')
    .select('id, trade_account_id')
    .eq('id', params.id)
    .maybeSingle()
  if (!enquiry) return NextResponse.json({ error: 'Enquiry not found' }, { status: 404 })
  if (enquiry.trade_account_id !== account.id) {
    return NextResponse.json({ error: 'You do not own this enquiry' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  if (!STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data: updated, error } = await sb
    .from('trade_enquiries')
    .update({ status: body.status })
    .eq('id', params.id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ enquiry: updated })
}
