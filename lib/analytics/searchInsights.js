// Search insights for the Network Analytics page — "what people are searching for".
//
// Reads `search_events` (supabase/migrations/148_search_events.sql): one row per
// search across every instrumented surface (front_door | vibe | ask | plan |
// itinerary | similar), carrying the raw query text, result count and a
// zero_result flag. This module aggregates it into top queries, the queries that
// return nothing (content gaps worth filling), search volume and a zero-result
// rate.
//
// Robustness: like lib/analytics/aggregate.js, this paginates the FULL window
// rather than trusting a single PostgREST call — which silently caps at 1000
// rows and would understate every metric once traffic grows past that in a
// window. The route and its verifier import the same pure `aggregateSearches`
// so what is asserted is what ships.

// The `similar` surface logs a listing UUID as query_text (it is a more-like-this
// lookup, not something a human typed) so it never belongs in "what people
// searched". Crawlers also probe the search endpoint with the schema.org
// SearchAction template placeholder `{search_term_string}`; drop that and any
// other purely `{...}`-templated non-query.
export function isRealQuery(row) {
  if (!row) return false
  if (row.surface === 'similar') return false
  const q = (row.query_text || '').trim()
  if (!q) return false
  if (/^\{.*\}$/.test(q)) return false
  return true
}

// Representative display casing: the most-seen raw spelling for a normalised key
// (so "Brewery"/"brewery"/"BREWERY" collapse but render as whichever form users
// actually typed most).
function modeKey(counts) {
  let best = null, bestN = -1
  for (const [k, n] of Object.entries(counts)) if (n > bestN) { best = k; bestN = n }
  return best
}

const SELECT_COLS = 'id, query_text, surface, result_count, zero_result, latency_ms, voyage_error, created_at'

// Stable parallel pagination over the window. search_events.id is a uuid (unique
// but not monotonic) — unique is enough for a deterministic total order that
// tiles cleanly across range requests.
export async function fetchSearchRows(sb, since, { pageSize = 1000, concurrency = 8 } = {}) {
  const { count, error: countErr } = await sb
    .from('search_events')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
  if (countErr) throw countErr

  const windowTotal = count || 0
  const pages = Math.ceil(windowTotal / pageSize)
  const rows = []

  for (let start = 0; start < pages; start += concurrency) {
    const batch = []
    for (let p = start; p < Math.min(start + concurrency, pages); p++) {
      const from = p * pageSize
      batch.push(
        sb.from('search_events').select(SELECT_COLS).gte('created_at', since)
          .order('id', { ascending: true }).range(from, from + pageSize - 1)
          .then(({ data, error }) => { if (error) throw error; return data || [] }),
      )
    }
    for (const part of await Promise.all(batch)) rows.push(...part)
  }
  return { rows, windowTotal }
}

// Aggregate already-fetched rows. Pure (no I/O) so the verifier asserts directly.
export function aggregateSearches(rows) {
  const real = rows.filter(isRealQuery)
  const totalSearches = real.length

  // Group by normalised query text.
  const qmap = {}
  for (const r of real) {
    const key = r.query_text.trim().toLowerCase()
    let m = qmap[key]
    if (!m) m = qmap[key] = { display: {}, count: 0, zero: 0, lastTs: '', lastCount: null }
    m.count++
    const disp = r.query_text.trim()
    m.display[disp] = (m.display[disp] || 0) + 1
    if (r.zero_result) m.zero++
    // Track the most recent result_count so the panel can show what a query
    // returns *today* (content may have been added since earlier searches).
    if (r.created_at && r.created_at > m.lastTs) { m.lastTs = r.created_at; m.lastCount = r.result_count }
  }

  const queries = Object.values(qmap).map(m => ({
    query: modeKey(m.display),
    count: m.count,
    zero_count: m.zero,
    last_result_count: m.lastCount,
  }))

  const topQueries = [...queries]
    .sort((a, b) => b.count - a.count || a.query.localeCompare(b.query))
    .slice(0, 25)

  // Queries that came up empty — the actionable list: real demand the network
  // can't yet answer. Ranked by how often the empty result recurred.
  const zeroResultQueries = queries
    .filter(q => q.zero_count > 0)
    .sort((a, b) => b.zero_count - a.zero_count || b.count - a.count || a.query.localeCompare(b.query))
    .slice(0, 25)

  const zeroResultSearches = real.filter(r => r.zero_result).length
  const zeroResultRate = totalSearches ? zeroResultSearches / totalSearches : 0
  const voyageErrors = real.filter(r => r.voyage_error).length
  const latencies = real.map(r => r.latency_ms).filter(n => typeof n === 'number')
  const avgLatencyMs = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null

  // Where searches originate (front door vs vibe vs concierge vs itinerary).
  const surfaceMap = {}
  for (const r of real) { const s = r.surface || 'unknown'; surfaceMap[s] = (surfaceMap[s] || 0) + 1 }
  const surfaces = Object.entries(surfaceMap)
    .map(([surface, count]) => ({ surface, count }))
    .sort((a, b) => b.count - a.count)

  // Daily search volume (UTC day buckets).
  const dayMap = {}
  for (const r of real) {
    if (!r.created_at) continue
    const date = r.created_at.slice(0, 10)
    if (!dayMap[date]) dayMap[date] = { date, count: 0, zero: 0 }
    dayMap[date].count++
    if (r.zero_result) dayMap[date].zero++
  }
  const timeline = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))

  return {
    totalSearches,
    distinctQueries: queries.length,
    zeroResultSearches,
    zeroResultRate,
    voyageErrors,
    avgLatencyMs,
    topQueries,
    zeroResultQueries,
    surfaces,
    timeline,
  }
}

export async function computeSearchInsights(sb, { since }) {
  const { rows, windowTotal } = await fetchSearchRows(sb, since)
  return { ...aggregateSearches(rows), windowTotal }
}
