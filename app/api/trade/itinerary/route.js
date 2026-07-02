import { NextResponse } from 'next/server'
import { getTradeContext } from '@/lib/trade/server-auth'
import { generateShareSlug } from '@/lib/plan-a-stay/share-util'
import { buildStopRows } from '@/lib/trade/itinerary'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — itineraries collection (gated, account-scoped)
   ═══════════════════════════════════════════════════════════════════════
   GET  → the account's itineraries (with stop counts).
   POST → create an itinerary + its ordered stops, optionally published.       */

export async function GET() {
  const { user, account, sb } = await getTradeContext()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

  const { data: itins } = await sb
    .from('trade_itineraries')
    .select('id, slug, title, region, status, created_at, updated_at')
    .eq('trade_account_id', account.id)
    .order('updated_at', { ascending: false })

  // Attach stop counts.
  const ids = (itins || []).map((i) => i.id)
  const counts = new Map()
  if (ids.length) {
    const { data: stops } = await sb
      .from('trade_itinerary_stops')
      .select('itinerary_id')
      .in('itinerary_id', ids)
    for (const s of stops || []) counts.set(s.itinerary_id, (counts.get(s.itinerary_id) || 0) + 1)
  }

  return NextResponse.json({
    itineraries: (itins || []).map((i) => ({ ...i, stop_count: counts.get(i.id) || 0 })),
  })
}

export async function POST(request) {
  try {
    const { user, account, sb } = await getTradeContext()
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const title = (body.title || '').toString().trim().slice(0, 200)
    const intentText = body.intent_text ? body.intent_text.toString().slice(0, 600) : null
    const region = body.region ? body.region.toString().slice(0, 120) : null
    const clientName = body.client_name ? body.client_name.toString().trim().slice(0, 120) || null : null
    const coverNote = body.cover_note ? body.cover_note.toString().trim().slice(0, 1200) || null : null
    const status = body.status === 'published' ? 'published' : 'draft'
    const stops = Array.isArray(body.stops) ? body.stops : []

    if (!title) return NextResponse.json({ error: 'Give the itinerary a title' }, { status: 400 })
    if (status === 'published' && stops.length === 0) {
      return NextResponse.json({ error: 'Add at least one stop before publishing' }, { status: 400 })
    }

    // Insert the itinerary (retry slug on the rare unique collision).
    let itinerary = null
    for (let attempt = 0; attempt < 4 && !itinerary; attempt++) {
      const slug = generateShareSlug(title)
      const { data, error } = await sb
        .from('trade_itineraries')
        .insert({ slug, trade_account_id: account.id, title, intent_text: intentText, region, status, client_name: clientName, cover_note: coverNote })
        .select('*')
        .single()
      if (!error) { itinerary = data; break }
      if (error.code !== '23505') {
        console.error('[trade/itinerary] insert error:', error.message)
        return NextResponse.json({ error: 'Failed to save itinerary', detail: error.message }, { status: 500 })
      }
    }
    if (!itinerary) return NextResponse.json({ error: 'Could not allocate a unique link' }, { status: 500 })

    // Insert stops.
    const stopRows = await buildStopRows(sb, itinerary.id, stops)
    if (stopRows.length) {
      const { error: stopErr } = await sb.from('trade_itinerary_stops').insert(stopRows)
      if (stopErr) {
        console.error('[trade/itinerary] stop insert error:', stopErr.message)
        return NextResponse.json({ error: 'Failed to save stops', detail: stopErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      id: itinerary.id,
      slug: itinerary.slug,
      status: itinerary.status,
      url: `/trade/itinerary/${itinerary.slug}`,
      stop_count: stopRows.length,
    }, { status: 201 })
  } catch (err) {
    console.error('[trade/itinerary] POST error:', err)
    return NextResponse.json({ error: 'Internal server error', detail: err.message }, { status: 500 })
  }
}
