// Region-scoped analytics for the council product.
//
// Fallback implementation: full-fetch of the scoped pageviews window + JS
// aggregation with the SAME bot filter (isBot = UA patterns OR geo) the network
// dashboard uses. Migration 141's analytics_region_metrics RPC is the primary
// path (live in prod); computeRegionMetrics prefers it and falls back to this JS
// path if it's absent/erroring (so the two stay parity-checkable). Heavy logic
// lives in the pure aggregate* helpers so a verifier can assert on what ships.
//
// Region attribution (the trustworthy mapping, confirmed against prod):
//   • A listing belongs to a region via COALESCE(region_override_id,
//     region_computed_id) = regions.id — exposed by the listings_with_region
//     view as region_id. The legacy listings.region text column undercounts
//     badly and is NOT used.
//   • /regions/{slug} pageview  → that region directly.
//   • /place/{slug}  pageview   → listings.slug → the listing's region (above).
//     This is a "listing click".
// Test fixtures (slug ILIKE 'admin%') and needs_review venues are excluded so
// council numbers match public surfaces.

import { isBot } from '@/lib/analytics/aggregate'
import { excludeTestListings, excludeNeedsReview } from '@/lib/listings/publicFilter'

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

// Generic geographic words that must NOT be used to match search queries —
// "valley"/"coast" etc. match other regions (Yarra/Hunter/Barossa) and produce
// false attributions. The specific tokens that survive (e.g. "launceston",
// "tamar") plus the region's suburbs are what actually identify a region.
const GEO_STOPWORDS = new Set([
  'valley', 'coast', 'island', 'islands', 'city', 'region', 'regional',
  'north', 'south', 'east', 'west', 'northern', 'southern', 'eastern', 'western',
  'greater', 'ranges', 'range', 'hills', 'peninsula', 'great', 'central', 'high',
  'country', 'area', 'district', 'shire', 'council', 'tablelands', 'plains',
  'rivers', 'river', 'lakes', 'lake', 'bay', 'gulf', 'cape', 'mount', 'national',
  'park', 'and', 'the',
])

// Major-city names whose searches are dominated by the metro elsewhere. A
// suburb token matching one of these is dropped UNLESS the region itself is
// named after that city — so "Perth" (a town in the Launceston region) won't
// steal "jazz club perth" (Perth WA), while the Hobart region still matches
// "hobart" searches because "hobart" is in its name.
const AMBIGUOUS_CITY_NAMES = new Set([
  'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'hobart', 'darwin',
  'canberra', 'newcastle', 'wollongong', 'geelong', 'cairns', 'townsville',
  'launceston', 'ballarat', 'bendigo', 'gold', 'richmond',
])

function placeSlugFromPath(path) {
  // '/place/{slug}' → slug. Tolerates trailing segment/query.
  if (!path || !path.startsWith('/place/')) return null
  return path.slice('/place/'.length).split(/[/?#]/)[0] || null
}

function normCity(c) {
  return (c || '').trim()
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Build the case-insensitive whole-word matcher for a region's search terms. */
export function buildSearchTermMatcher(regionName, suburbs) {
  const nameTokens = (regionName || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !GEO_STOPWORDS.has(t))
  const nameTokenSet = new Set(nameTokens)
  const suburbTokens = (suburbs || [])
    .flatMap((s) => {
      const sub = (s || '').toLowerCase().trim()
      if (sub.length < 4 || GEO_STOPWORDS.has(sub)) return []
      // Drop a suburb that is an ambiguous major-city name unless the region is
      // named after it (e.g. "Perth" TAS in the Launceston region is dropped;
      // "hobart" survives for the Hobart region).
      if (AMBIGUOUS_CITY_NAMES.has(sub) && !nameTokenSet.has(sub)) return []
      return [sub]
    })
  // Sanitize to alphanumerics + space so the term list is regex-safe in both the
  // JS matcher and the SQL RPC (which builds a \m(...)\M pattern from it).
  const terms = [...new Set([...nameTokens, ...suburbTokens])]
    .map((t) => t.replace(/[^a-z0-9 ]/g, '').trim())
    .filter(Boolean)
  if (terms.length === 0) return { terms, test: () => false }
  const re = new RegExp(`\\b(${terms.map(escapeRe).join('|')})\\b`, 'i')
  return { terms, test: (q) => (q ? re.test(q) : false) }
}

// ── Scoped, id-stable paginated fetch (mirrors lib/analytics/aggregate.js) ────
// pageviews.id is a monotonic serial → a total order that tiles cleanly. We scope
// by a path prefix so a region call never drags the whole table into memory.
const PV_COLS = 'id, ts, vertical, path, visitor_id, city, region, country, lat, lng, user_agent'

async function fetchScopedPageviews(sb, { since, pathPrefix, pageSize = 1000, concurrency = 8 }) {
  const base = () => sb.from('pageviews').select(PV_COLS, { count: 'exact', head: false }).gte('ts', since).like('path', `${pathPrefix}%`)
  const { count, error: countErr } = await sb
    .from('pageviews').select('id', { count: 'exact', head: true })
    .gte('ts', since).like('path', `${pathPrefix}%`)
  if (countErr) throw countErr
  const total = count || 0
  const pages = Math.ceil(total / pageSize)
  const rows = []
  for (let start = 0; start < pages; start += concurrency) {
    const batch = []
    for (let p = start; p < Math.min(start + concurrency, pages); p++) {
      const from = p * pageSize
      batch.push(
        base().order('id', { ascending: true }).range(from, from + pageSize - 1)
          .then(({ data, error }) => { if (error) throw error; return data || [] }),
      )
    }
    for (const part of await Promise.all(batch)) rows.push(...part)
  }
  return rows
}

// ── Pure aggregation (no I/O) so the verifier asserts on exactly what ships ──

export function aggregateRegionMetrics({
  region, listings, placeRows, regionRows, searchRows, since, limit = 10,
}) {
  const slugMeta = new Map()
  const suburbs = new Set()
  const sinceMs = since ? Date.parse(since) : 0
  for (const l of listings) {
    if (!l.slug) continue
    if (!slugMeta.has(l.slug)) slugMeta.set(l.slug, { name: l.name, verticals: new Set(), minCreated: Infinity })
    const m = slugMeta.get(l.slug)
    m.verticals.add(l.vertical)
    if (l.created_at) m.minCreated = Math.min(m.minCreated, Date.parse(l.created_at))
    if (l.suburb) suburbs.add(l.suburb.trim())
  }
  // listings_with_region returns one row per (slug, vertical) pair; count venues
  // by distinct slug so a cross-vertical venue isn't double-counted. "New this
  // period" is likewise per-venue (earliest row in the window), so it can never
  // exceed the total.
  const totalListings = slugMeta.size
  let newListings = 0
  for (const m of slugMeta.values()) {
    if (m.minCreated !== Infinity && m.minCreated >= sinceMs) newListings++
  }

  // Region-page views (humans).
  const humanRegionRows = regionRows.filter((r) => !isBot(r))
  const regionPageViews = humanRegionRows.length

  // Listing clicks: human /place/{slug} views whose slug is in this region.
  const clicksBySlug = new Map()
  const humanPlaceInRegion = []
  for (const r of placeRows) {
    if (isBot(r)) continue
    const slug = placeSlugFromPath(r.path)
    if (!slug || !slugMeta.has(slug)) continue
    humanPlaceInRegion.push(r)
    clicksBySlug.set(slug, (clicksBySlug.get(slug) || 0) + 1)
  }
  const totalClicks = humanPlaceInRegion.length
  const topListings = [...clicksBySlug.entries()]
    .map(([slug, clicks]) => {
      const m = slugMeta.get(slug)
      // Sorted to match the RPC, whose array_agg(DISTINCT) returns verticals
      // alphabetically — keeps primary vertical + label identical across paths.
      const verts = [...m.verticals].sort()
      return {
        slug, clicks, name: m.name,
        vertical: verts[0] || null,
        verticalLabel: verts.map((v) => VERTICAL_LABELS[v] || v).join(' · '),
      }
    })
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit)

  // Visitor origin: where the region's human traffic comes from (place-clicks in
  // region + region-page views), grouped by normalised city.
  const originMap = new Map()
  for (const r of [...humanPlaceInRegion, ...humanRegionRows]) {
    // Domestic origin only — parity with computeRegionMetricsRPC. Foreign-resolved
    // rows are noise/bots the geo filter misses; a council report shows AU markets.
    if (r.country !== 'AU') continue
    const city = normCity(r.city)
    if (!city) continue
    const key = `${city.toLowerCase()}|${(r.region || '').toLowerCase()}|${(r.country || '').toLowerCase()}`
    let o = originMap.get(key)
    if (!o) { o = { city, area: r.region || null, country: r.country || null, count: 0 }; originMap.set(key, o) }
    o.count++
  }
  const visitorOrigin = [...originMap.values()].sort((a, b) => b.count - a.count).slice(0, limit)

  // Top search queries that name this region or its towns (whole-word match).
  const matcher = buildSearchTermMatcher(region?.name, [...suburbs])
  const searchCounts = new Map()
  for (const s of searchRows) {
    const q = (s.query_text || '').trim()
    if (!q || !matcher.test(q)) continue
    const key = q.toLowerCase()
    let e = searchCounts.get(key)
    if (!e) { e = { query: q, count: 0 }; searchCounts.set(key, e) }
    e.count++
  }
  const topSearches = [...searchCounts.values()].sort((a, b) => b.count - a.count).slice(0, limit)

  return {
    regionPageViews,
    totalClicks,
    topListings,
    visitorOrigin,
    topSearches,
    newListings,
    totalListings,
    searchTerms: matcher.terms,
  }
}

/**
 * Compute region-scoped metrics for the council product.
 *
 * @param {object} sb     - service-role Supabase client
 * @param {object} region - { id, slug, name, state }
 * @param {object} opts   - { since: ISO string, limit?: number }
 */
// RPC availability is probed once. null = unknown, false = analytics_region_metrics
// not present (pre-141) → use the JS path. Mirrors relationHasVerticals' pattern.
let _regionRpcAvailable = null

function isRpcMissing(error) {
  return error?.code === 'PGRST202' || error?.code === '42883' ||
    /could not find the function|function .* does not exist/i.test(error?.message || '')
}

/** Distinct suburbs for a region (for search-term building). Cheap, FK-scoped. */
async function fetchRegionSuburbs(sb, regionId) {
  const { data, error } = await sb
    .from('listings_with_region')
    .select('suburb')
    .eq('region_id', regionId)
    .eq('status', 'active')
    .not('suburb', 'is', null)
    .limit(5000)
  if (error) throw error
  return [...new Set((data || []).map((r) => (r.suburb || '').trim()).filter(Boolean))]
}

/** RPC-backed region metrics (migration 141's analytics_region_metrics). */
export async function computeRegionMetricsRPC(sb, region, { since, limit = 10 } = {}) {
  const suburbs = await fetchRegionSuburbs(sb, region.id)
  const { terms } = buildSearchTermMatcher(region.name, suburbs)
  const { data, error } = await sb.rpc('analytics_region_metrics', {
    p_region_id: region.id,
    p_region_slug: region.slug,
    p_start_ts: since,
    p_terms: terms,
    p_max_rows: limit,
  })
  if (error) throw error
  const m = data || {}
  const labelVerticals = (vs) => (vs || []).map((v) => VERTICAL_LABELS[v] || v).join(' · ')
  return {
    region: { id: region.id, slug: region.slug, name: region.name, state: region.state },
    since,
    generatedAt: new Date().toISOString(),
    source: 'rpc',
    regionPageViews: Number(m.region_page_views || 0),
    totalClicks: Number(m.total_clicks || 0),
    totalListings: Number(m.total_listings || 0),
    newListings: Number(m.new_listings || 0),
    topListings: (m.top_listings || []).map((l) => ({
      slug: l.slug, clicks: Number(l.clicks || 0), name: l.name,
      vertical: (l.verticals || [])[0] || null, verticalLabel: labelVerticals(l.verticals),
    })),
    // Council reports show DOMESTIC visitor origin only. Foreign-resolved rows
    // (VPN/scraper/datacenter-adjacent traffic the geo bot-filter misses because
    // they carry a resolved city + clean UA — e.g. Hyderabad IN, Stirling GB)
    // are noise for an Australian regional council and erode trust in the report.
    // Mirrored in aggregateRegionMetrics (JS path) so RPC and JS stay parity-checkable.
    visitorOrigin: (m.visitor_origin || [])
      .filter((o) => o.country === 'AU')
      .map((o) => ({ city: o.city, area: o.area, country: o.country, count: Number(o.count || 0) })),
    topSearches: (m.top_searches || []).map((s) => ({ query: s.query, count: Number(s.count || 0) })),
    searchTerms: terms,
  }
}

/**
 * Region metrics, preferring the server-side RPC and falling back to the
 * verified JS aggregation if the RPC is unavailable (pre-141) or errors. Both
 * paths return the identical shape.
 */
export async function computeRegionMetrics(sb, region, { since, limit = 10 } = {}) {
  if (!region?.id || !region?.slug) return emptyMetrics(region, since)
  if (_regionRpcAvailable !== false) {
    try {
      const out = await computeRegionMetricsRPC(sb, region, { since, limit })
      _regionRpcAvailable = true
      return out
    } catch (err) {
      if (isRpcMissing(err)) _regionRpcAvailable = false
      // else transient — fall back this once, keep RPC enabled for next time.
    }
  }
  return computeRegionMetricsJS(sb, region, { since, limit })
}

async function computeRegionMetricsJS(sb, region, { since, limit = 10, shared } = {}) {
  if (!region?.id || !region?.slug) {
    return emptyMetrics(region, since)
  }

  // Region's active, public listings (FK attribution via listings_with_region)
  // plus the scoped pageviews/search windows. `shared` lets a multi-region
  // caller (the council dashboard) fetch the heavy /place/ + search windows once
  // and reuse them across regions instead of re-fetching per region.
  const [listings, placeRows, regionRows, searchRows] = await Promise.all([
    fetchRegionListings(sb, region.id),
    shared?.placeRows ? Promise.resolve(shared.placeRows) : fetchScopedPageviews(sb, { since, pathPrefix: '/place/' }),
    shared?.regionRows ? Promise.resolve(shared.regionRows) : fetchScopedPageviews(sb, { since, pathPrefix: '/regions/' }),
    shared?.searchRows ? Promise.resolve(shared.searchRows) : fetchSearchLogs(sb, since),
  ])

  // Region-page rows can over-match a sibling slug sharing the prefix
  // (/regions/hobart vs /regions/hobart-city); keep exact + sub-path only.
  const exact = `/regions/${region.slug}`
  const regionRowsScoped = regionRows.filter(
    (r) => r.path === exact || r.path.startsWith(`${exact}/`),
  )

  const agg = aggregateRegionMetrics({
    region, listings, placeRows, regionRows: regionRowsScoped, searchRows, since, limit,
  })

  return {
    region: { id: region.id, slug: region.slug, name: region.name, state: region.state },
    since,
    generatedAt: new Date().toISOString(),
    source: 'interim_js',
    ...agg,
  }
}

/**
 * Metrics for several regions at once. Fetches the shared, region-agnostic
 * windows (all /place/ clicks, all /regions/ views, all search logs) a single
 * time, then aggregates each region against them. Returns one metrics object
 * per input region (same shape as computeRegionMetrics).
 */
export async function computeRegionMetricsBatch(sb, regions, { since, limit = 10 } = {}) {
  const valid = (regions || []).filter((r) => r?.id && r?.slug)
  if (valid.length === 0) return []

  // Prefer the server-side RPC (one cheap aggregation per region). If it's
  // unavailable (pre-141), fall back to a single shared full-fetch of the
  // /place/ + /regions/ + search windows aggregated per region in JS — far
  // cheaper than re-fetching those windows once per region.
  if (_regionRpcAvailable !== false) {
    try {
      const out = await Promise.all(valid.map((r) => computeRegionMetricsRPC(sb, r, { since, limit })))
      _regionRpcAvailable = true
      return out
    } catch (err) {
      if (isRpcMissing(err)) _regionRpcAvailable = false
      // else transient — fall through to the JS path for this request.
    }
  }

  const [placeRows, regionRows, searchRows] = await Promise.all([
    fetchScopedPageviews(sb, { since, pathPrefix: '/place/' }),
    fetchScopedPageviews(sb, { since, pathPrefix: '/regions/' }),
    fetchSearchLogs(sb, since),
  ])
  const shared = { placeRows, regionRows, searchRows }
  return Promise.all(valid.map((region) => computeRegionMetricsJS(sb, region, { since, limit, shared })))
}

/**
 * Distinct human visitors (anonymous visitor_id) attributed to a region over the
 * window — the report's "unique visitors" stat. The region-scoped RPC
 * (analytics_region_metrics) returns views/clicks/top-listings but not a distinct
 * count, so this computes it read-only over the SAME attribution the RPC uses
 * (region-page views + place-clicks whose slug is a region listing), bot-excluded.
 * No DDL — works against the live schema as-is.
 */
export async function computeRegionSessions(sb, region, { since } = {}) {
  if (!region?.id || !region?.slug) return 0
  const [listings, placeRows, regionRows] = await Promise.all([
    fetchRegionListings(sb, region.id),
    fetchScopedPageviews(sb, { since, pathPrefix: '/place/' }),
    fetchScopedPageviews(sb, { since, pathPrefix: '/regions/' }),
  ])
  const slugs = new Set(listings.map((l) => l.slug).filter(Boolean))
  const visitors = new Set()

  const exact = `/regions/${region.slug}`
  for (const r of regionRows) {
    if (isBot(r) || !r.visitor_id) continue
    if (r.path === exact || r.path.startsWith(`${exact}/`)) visitors.add(r.visitor_id)
  }
  for (const r of placeRows) {
    if (isBot(r) || !r.visitor_id) continue
    const slug = placeSlugFromPath(r.path)
    if (slug && slugs.has(slug)) visitors.add(r.visitor_id)
  }
  return visitors.size
}

function emptyMetrics(region, since) {
  return {
    region: region ? { id: region.id, slug: region.slug, name: region.name, state: region.state } : null,
    since, generatedAt: new Date().toISOString(), source: 'interim_js',
    regionPageViews: 0, totalClicks: 0, topListings: [], visitorOrigin: [],
    topSearches: [], newListings: 0, totalListings: 0, searchTerms: [],
  }
}

async function fetchRegionListings(sb, regionId) {
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await excludeNeedsReview(excludeTestListings(
      sb.from('listings_with_region')
        .select('slug, name, vertical, suburb, created_at')
        .eq('status', 'active')
        .eq('region_id', regionId),
    )).order('slug', { ascending: true }).range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}

async function fetchSearchLogs(sb, since) {
  // Paginate the full window (id-stable) — the RPC scans every matching row, so
  // an unordered cap would diverge once in-window search volume grows.
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('search_logs')
      .select('query_text, created_at')
      .gte('created_at', since)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}
