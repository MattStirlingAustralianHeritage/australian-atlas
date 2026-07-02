import { NextResponse } from 'next/server'
import { getTradeContext } from '@/lib/trade/server-auth'
import { getVerticalUrl, getVerticalLabel } from '@/lib/verticalUrl'
import { decorateWithTrade } from '@/lib/trade/enrich'

export const runtime = 'nodejs'

/* ═══════════════════════════════════════════════════════════════════════
   Atlas Trade — single shortlist (gated, owner-scoped)
   ═══════════════════════════════════════════════════════════════════════
   GET    → the shortlist with hydrated, trade-enriched items.
   PATCH  → rename ({ name }) and/or mutate items ({ add: [ids], remove: [ids] }).
   DELETE → remove the shortlist (items cascade).

   Cross-account access returns 403, mirroring the itinerary routes.          */

async function ownedShortlist(sb, account, id) {
  const { data: shortlist, error } = await sb
    .from('trade_shortlists')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return { error: NextResponse.json({ error: 'Lookup failed' }, { status: 500 }) }
  if (!shortlist) return { error: NextResponse.json({ error: 'Shortlist not found' }, { status: 404 }) }
  if (shortlist.trade_account_id !== account.id) {
    return { error: NextResponse.json({ error: 'You do not own this shortlist' }, { status: 403 }) }
  }
  return { shortlist }
}

async function hydrateItems(sb, shortlistId) {
  const { data: items } = await sb
    .from('trade_shortlist_items')
    .select('id, listing_id, note, position, created_at')
    .eq('shortlist_id', shortlistId)
    .order('position', { ascending: true })

  const listingIds = (items || []).map((i) => i.listing_id)
  if (listingIds.length === 0) return []

  const { data: listings } = await sb
    .from('listings')
    .select('id, name, slug, vertical, sub_type, region, state, suburb, hero_image_url, lat, lng')
    .in('id', listingIds)
  const byId = new Map((listings || []).map((l) => [l.id, l]))

  const rows = (items || [])
    .map((it) => {
      const l = byId.get(it.listing_id)
      if (!l) return null
      return {
        item_id: it.id,
        id: l.id,
        note: it.note,
        name: l.name,
        slug: l.slug,
        vertical: l.vertical,
        vertical_label: getVerticalLabel(l.vertical),
        sub_type: l.sub_type,
        region: l.region,
        state: l.state,
        suburb: l.suburb,
        hero_image_url: l.hero_image_url,
        lat: l.lat,
        lng: l.lng,
        url: getVerticalUrl(l.vertical, l.slug),
      }
    })
    .filter(Boolean)

  return decorateWithTrade(sb, rows)
}

export async function GET(_request, { params }) {
  const { user, account, sb } = await getTradeContext()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

  const owned = await ownedShortlist(sb, account, params.id)
  if (owned.error) return owned.error

  const items = await hydrateItems(sb, params.id)
  return NextResponse.json({ shortlist: owned.shortlist, items })
}

export async function PATCH(request, { params }) {
  try {
    const { user, account, sb } = await getTradeContext()
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

    const owned = await ownedShortlist(sb, account, params.id)
    if (owned.error) return owned.error

    const body = await request.json().catch(() => ({}))

    if (typeof body.name === 'string' && body.name.trim()) {
      await sb
        .from('trade_shortlists')
        .update({ name: body.name.trim().slice(0, 120) })
        .eq('id', params.id)
    }

    const removeIds = Array.isArray(body.remove) ? body.remove.filter(Boolean) : []
    if (removeIds.length) {
      await sb
        .from('trade_shortlist_items')
        .delete()
        .eq('shortlist_id', params.id)
        .in('listing_id', removeIds)
    }

    const addIds = Array.isArray(body.add) ? body.add.filter(Boolean).slice(0, 200) : []
    if (addIds.length) {
      const { data: existing } = await sb
        .from('trade_shortlist_items')
        .select('listing_id, position')
        .eq('shortlist_id', params.id)
      const have = new Set((existing || []).map((e) => e.listing_id))
      let position = Math.max(-1, ...(existing || []).map((e) => e.position ?? 0)) + 1
      const rows = addIds
        .filter((id) => !have.has(id))
        .map((listing_id) => ({ shortlist_id: params.id, listing_id, position: position++ }))
      if (rows.length) {
        const { error: addErr } = await sb.from('trade_shortlist_items').insert(rows)
        if (addErr) {
          console.error('[trade/shortlists/:id] add error:', addErr.message)
          return NextResponse.json({ error: 'Could not add to the shortlist' }, { status: 500 })
        }
      }
    }

    const items = await hydrateItems(sb, params.id)
    const { data: fresh } = await sb.from('trade_shortlists').select('*').eq('id', params.id).single()
    return NextResponse.json({ shortlist: fresh, items })
  } catch (err) {
    console.error('[trade/shortlists/:id] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request, { params }) {
  const { user, account, sb } = await getTradeContext()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (!account) return NextResponse.json({ error: 'Trade beta account required' }, { status: 403 })

  const owned = await ownedShortlist(sb, account, params.id)
  if (owned.error) return owned.error

  const { error } = await sb.from('trade_shortlists').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
