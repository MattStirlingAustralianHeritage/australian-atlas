import { NextResponse } from 'next/server'
import { getTradeContext } from '@/lib/trade/server-auth'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — shortlists collection (gated, account-scoped)
   ═══════════════════════════════════════════════════════════════════════
   GET  → the account's shortlists with item counts.
   POST → create a shortlist ({ name, listing_ids? } — ids seed the list).    */

export async function GET() {
  const { user, account, sb } = await getTradeContext()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

  const { data: lists } = await sb
    .from('trade_shortlists')
    .select('id, name, created_at, updated_at')
    .eq('trade_account_id', account.id)
    .order('updated_at', { ascending: false })

  const ids = (lists || []).map((l) => l.id)
  const counts = new Map()
  if (ids.length) {
    const { data: items } = await sb
      .from('trade_shortlist_items')
      .select('shortlist_id')
      .in('shortlist_id', ids)
    for (const it of items || []) counts.set(it.shortlist_id, (counts.get(it.shortlist_id) || 0) + 1)
  }

  return NextResponse.json({
    shortlists: (lists || []).map((l) => ({ ...l, item_count: counts.get(l.id) || 0 })),
  })
}

export async function POST(request) {
  try {
    const { user, account, sb } = await getTradeContext()
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const name = (body.name || '').toString().trim().slice(0, 120)
    if (!name) return NextResponse.json({ error: 'Give the shortlist a name' }, { status: 400 })

    const { data: shortlist, error } = await sb
      .from('trade_shortlists')
      .insert({ trade_account_id: account.id, name })
      .select('*')
      .single()
    if (error) {
      console.error('[trade/shortlists] insert error:', error.message)
      return NextResponse.json({ error: 'Could not create the shortlist' }, { status: 500 })
    }

    // Optional seed items (e.g. "save these 6 from the directory").
    const seedIds = Array.isArray(body.listing_ids) ? body.listing_ids.filter(Boolean).slice(0, 200) : []
    if (seedIds.length) {
      const rows = seedIds.map((listing_id, i) => ({ shortlist_id: shortlist.id, listing_id, position: i }))
      const { error: itemErr } = await sb.from('trade_shortlist_items').insert(rows)
      if (itemErr) console.error('[trade/shortlists] seed items error:', itemErr.message)
    }

    return NextResponse.json({ shortlist, item_count: seedIds.length }, { status: 201 })
  } catch (err) {
    console.error('[trade/shortlists] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
