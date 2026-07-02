import { NextResponse } from 'next/server'
import { getTradeContext } from '@/lib/trade/server-auth'
import { loadItinerary, buildStopRows } from '@/lib/trade/itinerary'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — single itinerary (gated, owner-scoped)
   ═══════════════════════════════════════════════════════════════════════
   GET    → own itinerary with hydrated, trade-enriched stops.
   PATCH  → update title / region / intent / status / stops.
   DELETE → remove the itinerary (and its stops via cascade).

   Cross-account access returns 403 (mirrors the Phase 1 ownership posture):
   the itinerary's trade_account_id must equal the caller's account.           */

/** Load the itinerary and assert the caller owns it. Returns { itinerary } or a
 *  NextResponse error to return directly. */
async function ownedItinerary(sb, account, id) {
  const { data: itinerary, error } = await sb
    .from('trade_itineraries')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return { error: NextResponse.json({ error: 'Lookup failed' }, { status: 500 }) }
  if (!itinerary) return { error: NextResponse.json({ error: 'Itinerary not found' }, { status: 404 }) }
  if (itinerary.trade_account_id !== account.id) {
    // Do not leak existence detail across accounts — but the spec wants a 403.
    return { error: NextResponse.json({ error: 'You do not own this itinerary' }, { status: 403 }) }
  }
  return { itinerary }
}

export async function GET(_request, { params }) {
  const { user, account, sb } = await getTradeContext()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

  const owned = await ownedItinerary(sb, account, params.id)
  if (owned.error) return owned.error

  const loaded = await loadItinerary(sb, { id: params.id })
  return NextResponse.json(loaded)
}

export async function PATCH(request, { params }) {
  try {
    const { user, account, sb } = await getTradeContext()
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

    const owned = await ownedItinerary(sb, account, params.id)
    if (owned.error) return owned.error

    const body = await request.json().catch(() => ({}))
    const patch = { updated_at: new Date().toISOString() }
    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 200)
    if (typeof body.intent_text === 'string') patch.intent_text = body.intent_text.slice(0, 600) || null
    if (typeof body.region === 'string') patch.region = body.region.slice(0, 120) || null
    if (typeof body.client_name === 'string') patch.client_name = body.client_name.trim().slice(0, 120) || null
    if (typeof body.cover_note === 'string') patch.cover_note = body.cover_note.trim().slice(0, 1200) || null
    if (body.status && ['draft', 'published', 'archived'].includes(body.status)) patch.status = body.status

    const { error: updErr } = await sb
      .from('trade_itineraries')
      .update(patch)
      .eq('id', params.id)
    if (updErr) {
      console.error('[trade/itinerary/:id] update error:', updErr.message)
      return NextResponse.json({ error: 'Update failed', detail: updErr.message }, { status: 500 })
    }

    // Replace stops wholesale when provided (add/swap/reorder/remove all collapse
    // to "here is the new ordered list").
    if (Array.isArray(body.stops)) {
      const stopRows = await buildStopRows(sb, params.id, body.stops)
      await sb.from('trade_itinerary_stops').delete().eq('itinerary_id', params.id)
      if (stopRows.length) {
        const { error: stopErr } = await sb.from('trade_itinerary_stops').insert(stopRows)
        if (stopErr) {
          console.error('[trade/itinerary/:id] stop replace error:', stopErr.message)
          return NextResponse.json({ error: 'Failed to save stops', detail: stopErr.message }, { status: 500 })
        }
      }
    }

    const loaded = await loadItinerary(sb, { id: params.id })
    return NextResponse.json({
      ...loaded,
      url: `/trade/itinerary/${owned.itinerary.slug}`,
    })
  } catch (err) {
    console.error('[trade/itinerary/:id] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error', detail: err.message }, { status: 500 })
  }
}

export async function DELETE(_request, { params }) {
  const { user, account, sb } = await getTradeContext()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

  const owned = await ownedItinerary(sb, account, params.id)
  if (owned.error) return owned.error

  const { error } = await sb.from('trade_itineraries').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
