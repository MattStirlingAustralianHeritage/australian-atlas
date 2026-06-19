// Shared analytics aggregation for GET /api/analytics/dashboard and its verifier.
//
// Root cause this replaces: the route fetched pageviews with no .limit()/.order(),
// so PostgREST capped the result at 1000 oldest rows and every metric was computed
// over that capped slice — Total Pageviews stuck at exactly 1000 in every window,
// unique visitors inverted as the window grew, vertical mix incoherent. This module
// fetches the FULL window via id-stable parallel pagination, excludes
// datacenter/null-geo bot traffic, and aggregates. The route and the verification
// harness import the same functions so what is asserted is what ships.
//
// Bot classification (isBot) is user-agent patterns OR the geo heuristic. Both
// migration 141 (is_bot/user_agent + SQL-side aggregation RPCs) and 178 (the
// is_bot_ua classifier + corrective backfill) are applied in prod. The RPC path
// reads the stored is_bot column; this JS fallback recomputes the SAME predicate
// over the stored user_agent, so the two stay parity-checkable.

export const DATACENTER_CITIES = new Set([
  'Singapore', 'Ashburn', 'Council Bluffs', 'Dallas', 'Dublin', 'The Dalles', 'Boardman',
])

// Mirrors migration 141's backfill. A row is a bot when it is non-AU AND has no
// resolved city (null-geo: covers null-country and the cloud regions that geo-IP
// only resolves to a country, e.g. AWS Singapore showing country=SG / city=null)
// OR its city is a known datacenter origin. AU traffic is never flagged — including
// AU rows with no city (legit mobile visitors without fine geo).
export function isBotRow(row) {
  if (row.country === 'AU') return false
  const city = (row.city || '').trim()
  return city === '' || DATACENTER_CITIES.has(city)
}

// Spec's user-agent crawler/HTTP-client patterns (case-insensitive substring).
// MUST stay in sync with is_bot_ua() in supabase/migrations/178. This is the
// authoritative bot signal the council product needs — geo alone misses declared
// crawlers (ClaudeBot, GPTBot, ahrefs, headless Chrome, curl/wget) arriving from
// non-datacenter or AU-resolved IPs.
export const BOT_UA_PATTERNS = [
  'bot', 'crawl', 'spider', 'slurp', 'googlebot', 'bingbot', 'duckduckbot',
  'baiduspider', 'yandex', 'ahrefs', 'semrush', 'mj12bot', 'dotbot',
  'headless', 'lighthouse', 'python-requests', 'axios', 'curl', 'wget', 'java/',
]
const BOT_UA_RE = new RegExp(BOT_UA_PATTERNS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')

/** True when a user-agent string matches a known crawler / HTTP-client pattern. */
export function isBotUA(userAgent) {
  return !!userAgent && BOT_UA_RE.test(userAgent)
}

// Canonical bot predicate: UA pattern OR geo heuristic. The write path stores
// is_bot with this same definition, and the RPCs read that stored column — so
// every path (RPC, JS recompute, write) agrees. Historical rows have no
// user_agent, so isBotUA is false for them and this reduces to the geo rule,
// keeping pre-178 numbers stable.
export function isBot(row) {
  return isBotUA(row.user_agent) || isBotRow(row)
}

// Stable parallel pagination. pageviews.id is a monotonic serial, so ordering by id
// is a total order that tiles cleanly across range requests (ordering by ts alone
// has ties that can drop/duplicate rows at page boundaries).
export async function fetchWindowRows(sb, since, { pageSize = 1000, concurrency = 8 } = {}) {
  const { count, error: countErr } = await sb
    .from('pageviews')
    .select('id', { count: 'exact', head: true })
    .gte('ts', since)
  if (countErr) throw countErr

  const windowTotal = count || 0
  const pages = Math.ceil(windowTotal / pageSize)
  const cols = 'ts, vertical, path, visitor_id, city, region, country, lat, lng, user_agent'
  const rows = []

  for (let start = 0; start < pages; start += concurrency) {
    const batch = []
    for (let p = start; p < Math.min(start + concurrency, pages); p++) {
      const from = p * pageSize
      batch.push(
        sb.from('pageviews').select(cols).gte('ts', since)
          .order('id', { ascending: true }).range(from, from + pageSize - 1)
          .then(({ data, error }) => { if (error) throw error; return data || [] }),
      )
    }
    for (const part of await Promise.all(batch)) rows.push(...part)
  }
  return { rows, windowTotal }
}

function modeKey(counts) {
  let best = null, bestN = -1
  for (const [k, n] of Object.entries(counts)) if (n > bestN) { best = k; bestN = n }
  return best
}

// Aggregate already-fetched rows. Pure (no I/O) so the verifier asserts on it directly.
export function aggregate(rows, { vertical = null } = {}) {
  const humans = rows.filter(r => !isBot(r))
  const botRows = rows.length - humans.length

  // Traffic by vertical — network-wide regardless of the vertical filter, matching
  // the dashboard, which highlights one vertical while still showing the full mix.
  const trafficMap = {}
  const trafficVisitors = {}
  const allVisitors = new Set()
  for (const r of humans) {
    const v = r.vertical || 'unknown'
    if (!trafficMap[v]) { trafficMap[v] = { vertical: v, total_pageviews: 0, unique_visitors: 0 }; trafficVisitors[v] = new Set() }
    trafficMap[v].total_pageviews++
    if (r.visitor_id) { trafficVisitors[v].add(r.visitor_id); allVisitors.add(r.visitor_id) }
  }
  for (const v of Object.keys(trafficMap)) trafficMap[v].unique_visitors = trafficVisitors[v].size
  const traffic = Object.values(trafficMap).sort((a, b) => b.total_pageviews - a.total_pageviews)
  const totalUniqueVisitors = allVisitors.size

  const scoped = vertical ? humans.filter(r => (r.vertical || 'unknown') === vertical) : humans

  // Timeline: UTC day buckets per vertical.
  const timelineMap = {}
  for (const r of scoped) {
    if (!r.ts) continue
    const date = r.ts.slice(0, 10)
    const v = r.vertical || 'unknown'
    const key = `${date}:${v}`
    if (!timelineMap[key]) timelineMap[key] = { date, vertical: v, count: 0 }
    timelineMap[key].count++
  }
  const timeline = Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date))

  // Top pages.
  const pageMap = {}
  for (const r of scoped) {
    const v = r.vertical || 'unknown'
    const key = `${v}:${r.path || ''}`
    if (!pageMap[key]) pageMap[key] = { vertical: v, page_path: r.path || '', count: 0 }
    pageMap[key].count++
  }
  const topPages = Object.values(pageMap).sort((a, b) => b.count - a.count).slice(0, 20)

  // Top locations, normalised (case/whitespace-folded so "Melbourne" and
  // "melbourne " collapse). Representative display casing via mode; map centroid
  // via averaged coordinates.
  const locMap = {}
  for (const r of scoped) {
    if (r.lat == null || r.lng == null) continue
    const key = `${(r.city || '').trim().toLowerCase()}|${(r.region || '').trim().toLowerCase()}|${(r.country || '').trim().toLowerCase()}`
    let m = locMap[key]
    if (!m) m = locMap[key] = { city: {}, region: {}, country: {}, latSum: 0, lngSum: 0, n: 0, visit_count: 0 }
    m.visit_count++
    m.latSum += Number(r.lat); m.lngSum += Number(r.lng); m.n++
    const cd = (r.city || '').trim(); if (cd) m.city[cd] = (m.city[cd] || 0) + 1
    const rd = (r.region || '').trim(); if (rd) m.region[rd] = (m.region[rd] || 0) + 1
    const nd = (r.country || '').trim(); if (nd) m.country[nd] = (m.country[nd] || 0) + 1
  }
  const geo = Object.values(locMap).map(m => ({
    city: modeKey(m.city), region: modeKey(m.region), country: modeKey(m.country),
    lat: m.n ? m.latSum / m.n : null, lng: m.n ? m.lngSum / m.n : null, visit_count: m.visit_count,
  })).sort((a, b) => b.visit_count - a.visit_count).slice(0, 500)

  return { traffic, geo, timeline, topPages, totalUniqueVisitors, humanRows: humans.length, botRows }
}

export async function computeDashboard(sb, { since, vertical = null }) {
  const { rows, windowTotal } = await fetchWindowRows(sb, since)
  return { ...aggregate(rows, { vertical }), windowTotal }
}

// ── Server-side RPC path (migration 141) ─────────────────────────────────────
// Same output shape as computeDashboard, but aggregation runs in Postgres
// (is_bot = false) instead of fetching the whole window into JS. Falls back to
// the JS path when the RPCs aren't present yet — see computeDashboardPreferRpc.

let _dashRpcAvailable = null

function _isRpcMissing(error) {
  return error?.code === 'PGRST202' || error?.code === '42883' ||
    /could not find the function|function .* does not exist/i.test(error?.message || '')
}

export async function computeDashboardRPC(sb, { since, vertical = null }) {
  const [trafficRes, uniqRes, timelineRes, pagesRes, locsRes, countRes] = await Promise.all([
    sb.rpc('analytics_traffic_by_vertical', { start_ts: since }),
    sb.rpc('analytics_unique_visitors', { start_ts: since }),
    sb.rpc('analytics_timeline', { start_ts: since, filter_vertical: vertical }),
    sb.rpc('analytics_top_pages', { start_ts: since, filter_vertical: vertical, max_rows: 20 }),
    sb.rpc('analytics_top_locations', { start_ts: since, filter_vertical: vertical, max_rows: 500 }),
    sb.from('pageviews').select('id', { count: 'exact', head: true }).gte('ts', since),
  ])
  for (const r of [trafficRes, uniqRes, timelineRes, pagesRes, locsRes]) if (r.error) throw r.error
  const traffic = (trafficRes.data || []).map((t) => ({
    vertical: t.vertical, total_pageviews: Number(t.total_pageviews), unique_visitors: Number(t.unique_visitors),
  }))
  const totalUniqueVisitors = Number(uniqRes.data || 0)
  const timeline = (timelineRes.data || []).map((t) => ({ date: t.date, vertical: t.vertical, count: Number(t.count) }))
  const topPages = (pagesRes.data || []).map((p) => ({ vertical: p.vertical, page_path: p.page_path, count: Number(p.count) }))
  const geo = (locsRes.data || []).map((g) => ({
    city: g.city, region: g.region, country: g.country, lat: g.lat, lng: g.lng, visit_count: Number(g.visit_count),
  }))
  const humanRows = traffic.reduce((s, t) => s + t.total_pageviews, 0)
  // If the count head-request errored, fall back to humanRows so botRows is 0
  // rather than negative; clamp defensively regardless.
  const windowTotal = countRes.count ?? humanRows
  return { traffic, geo, timeline, topPages, totalUniqueVisitors, windowTotal, humanRows, botRows: Math.max(0, windowTotal - humanRows) }
}

/** Prefer the RPC path; fall back to the JS path if the RPCs are absent/erroring. */
export async function computeDashboardPreferRpc(sb, opts) {
  if (_dashRpcAvailable !== false) {
    try {
      const out = await computeDashboardRPC(sb, opts)
      _dashRpcAvailable = true
      return { ...out, source: 'rpc' }
    } catch (err) {
      if (_isRpcMissing(err)) _dashRpcAvailable = false
      // else transient — fall back this once.
    }
  }
  return { ...(await computeDashboard(sb, opts)), source: 'interim_js' }
}
