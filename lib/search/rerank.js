/**
 * Cross-encoder reranking — the precision stage of a retrieve-then-rerank search.
 *
 * WHY. The hybrid RPC (search_listings_hybrid) is a strong RECALL stage: it
 * fuses a semantic arm (pgvector), a lexical arm (FTS + name boost) and a fuzzy
 * arm (trigram) via reciprocal-rank fusion. But RRF ranks by ARM POSITION, and
 * the lexical arm's position swings on exactly which stemmed tokens a phrasing
 * happens to contain. So "a brewery that uses ovens with wood" and "wood fired
 * oven brewery" — the same intent — returned the wood-fired brewery at rank 3 vs
 * rank 1. A bi-encoder retriever cannot close that gap: it embeds query and
 * document separately, with no token-level cross-attention.
 *
 * A CROSS-ENCODER reads the full query and the full document together and emits a
 * single calibrated relevance score. It is phrasing-robust by construction —
 * both phrasings of "wood-fired brewery" score the genuinely wood-fired brewery
 * highest. Running it over the top ~50 fused candidates reorders them by true
 * relevance. This is the standard SOTA two-stage architecture (cheap broad
 * retrieval → expensive precise rerank over a small candidate set).
 *
 * SAFETY. Best-effort and fail-open: disabled flag, no API key, budget exhausted,
 * timeout, rate-limit, or any error → the input order is returned UNCHANGED. The
 * reranker can never make search worse than the fused baseline, only break ties
 * the baseline got wrong. Gated by the same monthly Voyage budget governor as
 * embeddings, with a process-local circuit breaker and a two-tier cache
 * (in-process LRU + best-effort DB) so repeated/partial queries cost nothing.
 *
 * COST. rerank-2.5 is $0.05 / 1M tokens; tokens = query_toks·docs + Σ doc_toks.
 * Top-50 docs capped at ~700 chars ≈ (10·50)+(50·175) ≈ 9.3k tokens ≈ $0.0005
 * per uncached search. It runs ONLY on the text-query path of /api/search (never
 * on the per-keystroke autocomplete endpoint), so volume is bounded.
 */

import { createHash } from 'crypto'

const VOYAGE_RERANK_URL = 'https://api.voyageai.com/v1/rerank'
export const RERANK_MODEL = process.env.VOYAGE_RERANK_MODEL || 'rerank-2.5'

// How many of the fused candidates get the cross-encoder pass. Candidates beyond
// this keep their fused order (the long tail is rarely paged to, and reranking it
// would cost tokens for results almost no one sees).
const DEFAULT_TOP_N = 50
// Per-document character cap fed to the reranker. Name + sub_type + locality +
// the lead of the description is plenty of signal; the rest is token cost.
const MAX_DOC_CHARS = 700
// DB-cache staleness: re-rerank (and refresh) entries older than this so an
// edited venue description works its way back into the ordering.
const CACHE_TTL_DAYS = 14

/** Reranking is on by default; SEARCH_RERANK=0/false disables it without a deploy. */
export function rerankEnabled() {
  const v = process.env.SEARCH_RERANK
  return v !== '0' && v !== 'false'
}

/**
 * Build the document text a candidate is scored on. Mirrors the signals the
 * stored search_vector carries (name=A, sub_type+suburb=B, description=C) as flat
 * natural language the cross-encoder reads directly.
 */
export function buildRerankDocument(l) {
  const parts = []
  if (l?.name) parts.push(String(l.name))
  const sub = l?.sub_type ? String(l.sub_type).replace(/_/g, ' ') : ''
  const loc = [l?.suburb, l?.region, l?.state].filter(Boolean).join(', ')
  const meta = [sub, loc].filter(Boolean).join(' · ')
  if (meta) parts.push(meta)
  if (l?.description) parts.push(String(l.description).slice(0, MAX_DOC_CHARS))
  return parts.join('. ').slice(0, MAX_DOC_CHARS + 160)
}

// ── Process-local circuit breaker ────────────────────────────────────────────
// Once Voyage rate-limits or times out a rerank, skip reranking (straight to the
// fused order) for a short window rather than repeatedly paying the timeout.
let cooldownUntil = 0

// ── In-process LRU (hot queries within a warm serverless instance) ───────────
// The /search page fires a debounced search as the user types; an LRU collapses
// that burst (and identical concurrent searches) to a single API call.
const LRU_MAX = 300
const lru = new Map() // cacheKey → { [listingId]: score }
function lruGet(k) {
  const v = lru.get(k)
  if (v) { lru.delete(k); lru.set(k, v) } // refresh recency
  return v
}
function lruSet(k, v) {
  lru.set(k, v)
  if (lru.size > LRU_MAX) lru.delete(lru.keys().next().value)
}

/** Enforce the monthly Voyage budget before spending. Fail-open in raw-node
 *  scripts where the '@/' alias / governor isn't available. */
async function budgetReserve(estTokens) {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/clients')
    const { reserve, estimateVoyageCost } = await import('@/lib/budget/governor')
    const sb = getSupabaseAdmin()
    const estCost = estimateVoyageCost(estTokens)
    const ok = await reserve(sb, 'voyage', estCost)
    return { ok, sb, estCost }
  } catch {
    return { ok: true, sb: null, estCost: 0 }
  }
}

/**
 * Low-level Voyage rerank call. Returns the API `results` array
 * ([{ index, relevance_score }], sorted by score desc) or null on any failure.
 * Never throws.
 */
async function callVoyageRerank(query, documents, { timeoutMs = 2500, model = RERANK_MODEL } = {}) {
  if (Date.now() < cooldownUntil) return null
  const key = process.env.VOYAGE_API_KEY
  if (!key) return null

  // Reranker token estimate: query·docs + Σ docs (≈4 chars/token).
  const qTok = Math.ceil((query.length || 0) / 4)
  const docTok = documents.reduce((s, d) => s + Math.ceil((d.length || 0) / 4), 0)
  const estTokens = qTok * documents.length + docTok
  const budget = await budgetReserve(estTokens)
  if (!budget.ok) return null

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(VOYAGE_RERANK_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, documents, model, truncation: true }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (res.status === 429 || res.status >= 500) {
      cooldownUntil = Date.now() + 20000
      return null
    }
    if (!res.ok) return null
    const data = await res.json()
    // Voyage rerank response: { data: [{ index, relevance_score }], usage: { total_tokens } }.
    const results = data?.data
    if (!Array.isArray(results) || !results.length) return null
    // Reconcile the budget reservation with actual token usage (best-effort).
    const totalTokens = data?.usage?.total_tokens
    if (budget.sb && totalTokens) {
      try {
        const { estimateVoyageCost, reconcile } = await import('@/lib/budget/governor')
        await reconcile(budget.sb, 'voyage', estimateVoyageCost(totalTokens) - budget.estCost)
      } catch { /* best-effort */ }
    }
    return results
  } catch (e) {
    clearTimeout(timer)
    const m = String((e && e.message) || '')
    if (/429|rate limit|timeout|abort/i.test(m)) cooldownUntil = Date.now() + 20000
    return null
  }
}

/**
 * Rerank a fused candidate list by cross-encoder relevance to `queryText` (the
 * cleaned vibe text — location words already enforced as filters upstream).
 *
 * Reorders the top `topN` candidates by relevance score; the tail keeps its fused
 * order and is appended unchanged. Candidates the reranker didn't score keep
 * their relative position (stable). Returns { listings, reranked }.
 *
 * `sb` (optional) backs a best-effort DB cache (search_rerank_cache) keyed by the
 * cleaned query + model, so a repeated search costs no API call. Pass null to
 * skip the DB cache (raw-node eval still uses the in-process LRU + live API).
 */
export async function rerankSearchResults(sb, queryText, listings, opts = {}) {
  const q = (queryText || '').trim()
  if (!rerankEnabled() || !q || !Array.isArray(listings) || listings.length < 2) {
    return { listings, reranked: false }
  }

  const topN = Math.min(opts.topN || DEFAULT_TOP_N, listings.length)
  const head = listings.slice(0, topN)
  const tail = listings.slice(topN)
  const cacheKey = createHash('sha256').update(`${q.toLowerCase()}::${RERANK_MODEL}`).digest('hex')

  // 1. In-process LRU.
  let scores = lruGet(cacheKey)

  // 2. Best-effort DB cache. Ignore rows older than the TTL so a venue's edited
  //    description propagates into the ordering within CACHE_TTL_DAYS.
  if (!scores && sb) {
    try {
      const staleBefore = new Date(Date.now() - CACHE_TTL_DAYS * 86400_000).toISOString()
      const { data } = await sb
        .from('search_rerank_cache')
        .select('scores')
        .eq('query_hash', cacheKey)
        .gte('created_at', staleBefore)
        .maybeSingle()
      if (data?.scores && typeof data.scores === 'object') scores = data.scores
    } catch { /* cache miss */ }
  }

  const haveAll = scores && head.every((l) => Object.prototype.hasOwnProperty.call(scores, l.id))

  // 3. Cache miss (or new candidates entered the head) → score via Voyage.
  if (!haveAll) {
    const docs = head.map(buildRerankDocument)
    const results = await callVoyageRerank(q.toLowerCase(), docs, opts)
    if (results) {
      const merged = { ...(scores || {}) }
      for (const r of results) {
        const l = head[r.index]
        if (l) merged[l.id] = r.relevance_score
      }
      scores = merged
      lruSet(cacheKey, scores)
      if (sb) {
        try {
          await sb.from('search_rerank_cache').upsert(
            { query_hash: cacheKey, model: RERANK_MODEL, scores, created_at: new Date().toISOString() },
            { onConflict: 'query_hash' }
          )
        } catch { /* non-fatal */ }
      }
    } else if (!scores) {
      // No fresh scores and nothing cached → leave the fused order untouched.
      return { listings, reranked: false }
    }
  }

  // 4. Tier-blended reorder. Order the head by rerank-relevance TIER, breaking
  //    near-ties by business signal (claimed → quality) then the original fused
  //    position. The cross-encoder fixes gross errors (a name-coincidence match
  //    like "Stone & Wood" lands a whole tier below genuine wood-fired breweries).
  //    Unscored items (a new candidate entered the head between cache writes)
  //    sink to the end of the head in their fused order.
  //    Each scored row also carries its raw score out as `rerank_score` — the
  //    calibrated, cross-atlas-comparable strength signal downstream stages
  //    (the "Top result" badge, strong map pins) gate on. The business boost
  //    below moves ONLY the ordering; rerank_score stays the true relevance so
  //    the badge/strength gates remain honest.
  const tierWidth = opts.tierWidth || 0.05
  // Verified-operator lift. A claimed/operator-owned or editor-picked venue earns
  // a small tier promotion so a genuinely on-topic, operator-verified listing
  // isn't stranded below unclaimed scraped rows of the same relevance band — the
  // whole point of the claim flow is that these are the venues we most want
  // surfaced, and the pure neural score gives them no preference on its own.
  // Two tiers (≈0.10 rerank score, the width of the "strong" band above the 0.55
  // floor) is calibrated so a claimed venue that is ITSELF a strong match can
  // reach the top group, but one the cross-encoder scored clearly weaker cannot
  // leapfrog genuinely-better results (verified on live pools: claimed rows that
  // rose to #1 for "sourdough bakery" / "bookshop" / "farm stay" were all on-topic;
  // named-institution and specific-venue queries were untouched). Tunable/off by
  // ENV without a deploy. Unscored rows (t === -Infinity) never receive the lift.
  const claimedBump = Number.isFinite(parseFloat(process.env.SEARCH_CLAIMED_TIER_BUMP))
    ? parseFloat(process.env.SEARCH_CLAIMED_TIER_BUMP) : 2
  const isVerified = (l) => l?.is_claimed === true || l?.editors_pick === true
  const baseTierOf = (id) =>
    typeof scores[id] === 'number' ? Math.floor(scores[id] / tierWidth) : -Infinity
  const tierOf = (l) => {
    const t = baseTierOf(l.id)
    return t === -Infinity ? t : t + (isVerified(l) ? claimedBump : 0)
  }
  const decorated = head.map((l, i) => ({ l, i, t: tierOf(l) }))
  decorated.sort((a, b) =>
    (b.t - a.t) ||
    (Number(isVerified(b.l)) - Number(isVerified(a.l))) ||
    ((b.l.quality_score || 0) - (a.l.quality_score || 0)) ||
    (a.i - b.i)
  )
  const scoredHead = decorated.map((d) =>
    typeof scores[d.l.id] === 'number' ? { ...d.l, rerank_score: scores[d.l.id] } : d.l
  )
  return { listings: scoredHead.concat(tail), reranked: true }
}
