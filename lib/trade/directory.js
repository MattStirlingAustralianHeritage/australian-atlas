/**
 * Atlas Trade — structured product directory.
 *
 * The browse/filter complement to the NL builder search: state, vertical,
 * region, text, group size, and trade-logistics filters over the curated
 * network. The pool is the FULL public network (trade-readiness stays
 * enrichment, per the core rule) — except when the buyer explicitly asks for
 * trade-ready product or filters on a trade-only attribute, in which case the
 * trade_buildable_listings view (the sole trade-ready predicate) defines the
 * candidate set.
 */
import { excludeTestListings, excludeNeedsReview } from '@/lib/listings/publicFilter'
import { getVerticalUrl, getVerticalLabel } from '@/lib/verticalUrl'
import { getTradeEnrichment } from './enrich'
import { getTradeProfiles } from './profile'

export const DIRECTORY_PAGE_SIZE = 24

const DIRECTORY_SELECT =
  'id, name, slug, vertical, sub_type, region, state, suburb, description, hero_image_url, lat, lng'

/** Strip PostgREST or() metacharacters from user text before interpolation. */
function safeIlikeTerm(s) {
  return String(s || '').replace(/[,()\\%]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Query the directory.
 *
 * filters: {
 *   q, state, vertical, region        — standard attributes
 *   tradeOnly                         — restrict to trade-ready venues
 *   groupMin                          — welcomes groups of at least N
 *   bespoke, rates                    — trade flags (imply tradeOnly)
 *   coach, famil                      — trade profile flags (imply tradeOnly)
 *   page                              — 1-based
 * }
 *
 * Returns { items, total, page, pageSize }. Every item carries trade
 * enrichment (`trade`, `trade_ready`) and, for trade-ready rows, the
 * logistics half of the profile (never the contact channel — that stays on
 * the fact sheet).
 */
export async function queryDirectory(sb, filters = {}) {
  const page = Math.max(1, parseInt(filters.page, 10) || 1)
  const pageSize = DIRECTORY_PAGE_SIZE

  const wantsTradeAttr =
    filters.bespoke || filters.rates || filters.coach || filters.famil || Number(filters.groupMin) > 0
  const tradeOnly = !!filters.tradeOnly || wantsTradeAttr

  // Resolve the trade-ready candidate set when the query is trade-scoped.
  let tradeIds = null
  if (tradeOnly) {
    let viewQ = sb
      .from('trade_buildable_listings')
      .select('id, trade_bespoke, trade_group, trade_group_size_max, trade_rates_available')
    if (filters.bespoke) viewQ = viewQ.eq('trade_bespoke', true)
    if (filters.rates) viewQ = viewQ.eq('trade_rates_available', true)
    const groupMin = Number(filters.groupMin) || 0
    if (groupMin > 0) {
      // Welcomes groups, and either states no ceiling or a ceiling >= the ask.
      viewQ = viewQ.eq('trade_group', true).or(`trade_group_size_max.is.null,trade_group_size_max.gte.${groupMin}`)
    }
    const { data: viewRows, error: viewErr } = await viewQ
    if (viewErr) {
      console.error('[trade/directory] view query failed:', viewErr.message)
      return { items: [], total: 0, page, pageSize }
    }
    tradeIds = (viewRows || []).map((r) => r.id)

    // Profile-level filters (coach access, famils) narrow the set further.
    if (tradeIds.length && (filters.coach || filters.famil)) {
      const profiles = await getTradeProfiles(sb, tradeIds)
      tradeIds = tradeIds.filter((id) => {
        const p = profiles.get(id)
        if (!p) return false
        if (filters.coach && !p.coach_access) return false
        if (filters.famil && !p.famil_open) return false
        return true
      })
    }
    if (tradeIds.length === 0) return { items: [], total: 0, page, pageSize }
  }

  let q = sb.from('listings').select(DIRECTORY_SELECT, { count: 'exact' }).eq('status', 'active')
  q = excludeTestListings(excludeNeedsReview(q))
  if (tradeIds) q = q.in('id', tradeIds)
  if (filters.state) q = q.eq('state', String(filters.state).toUpperCase())
  if (filters.vertical) q = q.eq('vertical', filters.vertical)
  if (filters.region) q = q.ilike('region', `%${safeIlikeTerm(filters.region)}%`)
  const term = safeIlikeTerm(filters.q)
  if (term) q = q.or(`name.ilike.%${term}%,suburb.ilike.%${term}%,region.ilike.%${term}%,sub_type.ilike.%${term}%`)

  const from = (page - 1) * pageSize
  q = q.order('quality_score', { ascending: false, nullsFirst: false }).order('name').range(from, from + pageSize - 1)

  const { data, count, error } = await q
  if (error) {
    console.error('[trade/directory] listings query failed:', error.message)
    return { items: [], total: 0, page, pageSize }
  }

  // Cross-vertical listings appear once per vertical — dedupe by slug within
  // the page (same convention as tradeRetrieve). The page may run slightly
  // short of pageSize as a result; total stays the raw count.
  const seen = new Set()
  const rows = (data || []).filter((r) => {
    if (!r.slug) return true
    if (seen.has(r.slug)) return false
    seen.add(r.slug)
    return true
  })
  const ids = rows.map((r) => r.id)
  const [enrichment, profiles] = await Promise.all([
    getTradeEnrichment(sb, ids),
    getTradeProfiles(sb, ids),
  ])

  const items = rows.map((r) => {
    const trade = enrichment.get(r.id) || null
    const p = trade ? profiles.get(r.id) : null
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      vertical: r.vertical,
      vertical_label: getVerticalLabel(r.vertical),
      sub_type: r.sub_type ? String(r.sub_type).replace(/_/g, ' ') : null,
      region: r.region,
      state: r.state,
      suburb: r.suburb,
      excerpt: r.description ? String(r.description).slice(0, 200) : null,
      hero_image_url: r.hero_image_url,
      lat: r.lat,
      lng: r.lng,
      url: getVerticalUrl(r.vertical, r.slug),
      trade_ready: !!trade,
      trade,
      // Logistics only — the trade contact channel never leaves the fact sheet.
      logistics: p
        ? {
            notice_days: p.notice_days ?? null,
            coach_access: !!p.coach_access,
            famil_open: !!p.famil_open,
            languages: Array.isArray(p.languages) ? p.languages : [],
          }
        : null,
    }
  })

  return { items, total: count ?? items.length, page, pageSize }
}
