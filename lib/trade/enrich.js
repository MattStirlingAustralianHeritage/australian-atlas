/**
 * Atlas Trade — trade-readiness enrichment.
 *
 * CORE RULE: trade-readiness is ENRICHMENT on output, never a filter on the
 * candidate pool. Retrieval runs over the FULL curated network; this module only
 * decorates results/stops that belong to an operator who has opted in.
 *
 * "Opted in" = present in the trade_buildable_listings view (migration 170),
 * i.e. trade_welcome = true AND an active listing_claims row. Every trade read
 * path consumes that view rather than re-implementing the predicate.
 */
import { ATLAS_ATTRIBUTION } from './config'

export { ATLAS_ATTRIBUTION }

/**
 * Build a Map<listing_id, tradeFields> for the subset of the given listing ids
 * whose operators are trade-ready. Ids not in the map are NOT trade-ready and
 * should show standard listing info only.
 */
export async function getTradeEnrichment(sb, listingIds) {
  const ids = [...new Set((listingIds || []).filter(Boolean))]
  if (ids.length === 0) return new Map()

  const { data, error } = await sb
    .from('trade_buildable_listings')
    .select('id, trade_bespoke, trade_group, trade_group_size_max, trade_contact_before_booking, trade_rates_available')
    .in('id', ids)

  if (error) {
    // Enrichment is additive — a failure must never break retrieval/render.
    console.error('[trade/enrich] view query failed:', error.message)
    return new Map()
  }

  const map = new Map()
  for (const r of data || []) {
    map.set(r.id, {
      trade_ready: true,
      bespoke: !!r.trade_bespoke,
      group: !!r.trade_group,
      group_size_max: r.trade_group_size_max ?? null,
      contact_before_booking: !!r.trade_contact_before_booking,
      rates_available: !!r.trade_rates_available,
    })
  }
  return map
}

/** Decorate an array of rows (each with `id`) with a `trade` object when ready. */
export async function decorateWithTrade(sb, rows) {
  const enrichment = await getTradeEnrichment(sb, rows.map((r) => r.id))
  return rows.map((r) => ({
    ...r,
    trade: enrichment.get(r.id) || null,
    trade_ready: enrichment.has(r.id),
  }))
}
