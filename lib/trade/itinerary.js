/**
 * Atlas Trade — itinerary loading + stop enrichment (server-side, service-role).
 *
 * Loads a trade itinerary with its ordered stops, hydrated from live listing
 * data and decorated with trade-readiness (enrichment, never a pool filter).
 * Used by the published itinerary page, the owner builder fetch, and the PDF.
 */
import { getVerticalUrl, getVerticalLabel } from '@/lib/verticalUrl'
import { getTradeEnrichment } from './enrich'

export const MAX_TRADE_STOPS = 40

/**
 * Validate + normalise incoming stops into insertable rows, hydrating the
 * denormalised venue_* columns from the listings table (never trusting
 * client-supplied names). Unknown/invalid listing ids are skipped. `position`
 * is re-derived from order so the caller can't desync it.
 */
export async function buildStopRows(sb, itineraryId, stops) {
  const ids = [...new Set((stops || []).map((s) => s && s.listing_id).filter(Boolean))]
  if (ids.length === 0) return []

  const { data: listings } = await sb
    .from('listings')
    .select('id, name, vertical, slug')
    .in('id', ids)
  const byId = new Map((listings || []).map((l) => [l.id, l]))

  const rows = []
  let position = 0
  for (const s of stops) {
    const l = s && byId.get(s.listing_id)
    if (!l) continue
    rows.push({
      itinerary_id: itineraryId,
      listing_id: l.id,
      position: position++,
      notes: s.notes ? String(s.notes).slice(0, 600) : null,
      venue_name: l.name,
      venue_vertical: l.vertical,
      venue_slug: l.slug,
    })
    if (rows.length >= MAX_TRADE_STOPS) break
  }
  return rows
}

const STOP_LISTING_SELECT =
  'id, name, slug, vertical, sub_type, region, state, suburb, description, hero_image_url, website, lat, lng, status'

/**
 * Hydrate raw stop rows (listing_id, position, notes, denormalised venue_*) into
 * render-ready stops: live listing fields + trade enrichment. Falls back to the
 * denormalised columns if a listing has since been hidden/retired.
 */
export async function hydrateStops(sb, stopRows) {
  const rows = [...(stopRows || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  if (rows.length === 0) return []

  const listingIds = rows.map((s) => s.listing_id).filter(Boolean)

  const [{ data: listings }, enrichment] = await Promise.all([
    sb.from('listings').select(STOP_LISTING_SELECT).in('id', listingIds),
    getTradeEnrichment(sb, listingIds),
  ])

  const byId = new Map((listings || []).map((l) => [l.id, l]))

  return rows.map((s, i) => {
    const l = byId.get(s.listing_id) || null
    const vertical = (l && l.vertical) || s.venue_vertical || null
    const slug = (l && l.slug) || s.venue_slug || null
    const trade = enrichment.get(s.listing_id) || null
    return {
      id: s.id,
      position: s.position ?? i,
      notes: s.notes || null,
      listing_id: s.listing_id,
      name: (l && l.name) || s.venue_name || 'Listing',
      vertical,
      vertical_label: vertical ? getVerticalLabel(vertical) : null,
      sub_type: l ? l.sub_type : null,
      region: l ? l.region : null,
      state: l ? l.state : null,
      suburb: l ? l.suburb : null,
      description: l ? l.description : null,
      hero_image_url: l ? l.hero_image_url : null,
      website: l ? l.website : null,
      lat: l ? l.lat : null,
      lng: l ? l.lng : null,
      url: vertical && slug ? getVerticalUrl(vertical, slug) : null,
      // ENRICHMENT: trade fields only when the operator opted in (view predicate).
      trade_ready: !!trade,
      trade,
    }
  })
}

/**
 * Load a trade itinerary by id or slug, with hydrated, enriched stops.
 *   opts.id            — load by itinerary id (owner path)
 *   opts.slug          — load by slug (public path)
 *   opts.requireStatus — if set, the itinerary must have this status or null is returned
 *
 * Returns { itinerary, stops } or null.
 */
export async function loadItinerary(sb, { id = null, slug = null, requireStatus = null }) {
  if (!id && !slug) return null

  let query = sb.from('trade_itineraries').select('*')
  query = id ? query.eq('id', id) : query.eq('slug', slug)
  const { data: itinerary, error } = await query.maybeSingle()
  if (error) {
    console.error('[trade/itinerary] load failed:', error.message)
    return null
  }
  if (!itinerary) return null
  if (requireStatus && itinerary.status !== requireStatus) return null

  const { data: stopRows } = await sb
    .from('trade_itinerary_stops')
    .select('*')
    .eq('itinerary_id', itinerary.id)
    .order('position', { ascending: true })

  const stops = await hydrateStops(sb, stopRows || [])
  return { itinerary, stops }
}
