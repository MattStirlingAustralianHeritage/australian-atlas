import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { searchEvents } from '@/lib/events'
import { createHash } from 'crypto'
import { LISTING_REGION_SELECT, resolveRegionParam } from '@/lib/regions'
import { getPublicVerticals, isVerticalPublic } from '@/lib/verticalUrl'
import { filterByVertical, relationHasVerticals } from '@/lib/listings/verticalFilter'
import { excludeTestListings, excludeNeedsReview, isPublicListing } from '@/lib/listings/publicFilter'
import { embedQueryCached } from '@/lib/embeddings/queryCache'
import { logSearchEvent } from '@/lib/search/log'
import { parseQueryLocation } from '@/lib/search/parseQuery'
import { resolveQueryRegion } from '@/lib/search/resolveQueryRegion'
import { checkRateLimit } from '@/lib/rate-limit'

// Largest candidate pool the RPC ranks per request. Pagination/dedup/total are
// computed over this fixed pool so `total` is stable across pages (it does NOT
// grow page-to-page) and deep pages never claim phantom results. Broad queries
// that fill the pool are reported as "capped" so the UI can show "120+".
const RESULT_POOL = 120

/** Cap a free-text query before it is persisted (PII / retention guard). */
function clampQuery(s) {
  return (s || '').slice(0, 200)
}

/** Resolve a promise but never wait longer than `ms` (fallback value on timeout). */
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

/** Collapse rows that share a slug (same venue cross-listed across verticals),
 *  keeping the highest-ranked row and recording the other verticals as `also_in`. */
function dedupeBySlug(rows) {
  const bySlug = new Map()
  const out = []
  for (const r of rows) {
    const key = r.slug || r.id
    const existing = bySlug.get(key)
    if (existing) {
      if (r.vertical && !existing.also_in.includes(r.vertical) && r.vertical !== existing.vertical) {
        existing.also_in.push(r.vertical)
      }
      continue
    }
    const row = { ...r, also_in: [] }
    bySlug.set(key, row)
    out.push(row)
  }
  return out
}

/** Sub_type facet counts over the ranked pool, most common first (top 12). */
function buildFacets(rows) {
  const counts = new Map()
  for (const r of rows) {
    if (!r.sub_type) continue
    counts.set(r.sub_type, (counts.get(r.sub_type) || 0) + 1)
  }
  const subTypes = [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
  return { subTypes }
}

/** On a zero-result query, fuzzy-match the raw text (no filters) to suggest a
 *  correction — surfaces the venue a typo'd query was reaching for. */
async function fuzzySuggest(sb, q) {
  if (!q || q.length < 3) return null
  try {
    const { data } = await sb.rpc('search_listings_hybrid', {
      query_embedding: null, query_text: q, match_count: 1,
      include_way: isVerticalPublic('way'),
    })
    const hit = (data || []).find(isPublicListing)
    return hit ? hit.name : null
  } catch { return null }
}

// NOTE: `address` is deliberately NOT selected — search must not leak street
// addresses (esp. for address_on_request venues). The place page shows address
// (gated on the privacy flag); search results never do.
const SELECT_FIELDS = `id, vertical, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, is_claimed, editors_pick, website, ${LISTING_REGION_SELECT}`

// Calibrated in Phase 7 (see report). Admits clearly-relevant semantic matches,
// rejects off-topic queries. Overridable per request via ?floor=.
const SIMILARITY_FLOOR = 0.48

/** Generate an anonymous session id from user-agent + date (no PII) */
function getSessionId(request) {
  const ua = request.headers.get('user-agent') || 'unknown'
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256').update(`${ua}:${day}`).digest('hex').slice(0, 16)
}

/** Fire-and-forget legacy search log (search_logs) — kept for existing analytics. */
function logSearch(request, { queryText, verticalFilter, resultCount }) {
  try {
    const sb = getSupabaseAdmin()
    sb.from('search_logs').insert({
      query_text: queryText,
      vertical_filter: verticalFilter || null,
      result_count: resultCount,
      session_id: getSessionId(request),
    }).then(() => {}).catch(() => {})
  } catch { /* silent */ }
}

/** Fire-and-forget: record which claimed listings appeared in search results */
function trackSearchAppearances(listings) {
  try {
    const claimedIds = listings.filter((l) => l.is_claimed).map((l) => l.id)
    if (!claimedIds.length) return
    const sb = getSupabaseAdmin()
    const rows = claimedIds.map((id) => ({ listing_id: id }))
    sb.from('listing_search_appearances').insert(rows).then(() => {}).catch(() => {})
  } catch { /* silent */ }
}

/**
 * GET /api/search
 *
 * With ?q=: hybrid retrieval via the canonical search_listings_hybrid RPC —
 * lexical (FTS + name boost) fused with semantic (pgvector) via RRF, ranked in
 * Postgres. The query is embedded with Voyage (input_type "query", cached); on a
 * Voyage failure/rate-limit the embedding is null and the RPC degrades to the
 * lexical arm. No client-side scoring, no 500-row candidate cap.
 *
 * Without ?q=: a filtered browse ordered by claimed/featured/recency.
 */
export async function GET(request) {
  // Per-IP rate limit. This route calls Voyage + the full-scan hybrid RPC on
  // every request; the front door also fires on typing — an unthrottled client
  // can exhaust the Voyage free tier (the 2026-06-06 429 cascade) and spike the
  // DB. Ceiling is generous enough for debounced typing, low enough to curb abuse.
  const limited = checkRateLimit(request, { keyPrefix: 'search', maxRequests: 60, windowMs: 60_000 })
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  const vertical = searchParams.get('vertical') || null
  const state = searchParams.get('state') || null
  const region = searchParams.get('region') || null
  const subType = searchParams.get('sub_type') || null   // facet refine
  const noBind = searchParams.get('bind') === '0'         // ignore region/suburb auto-binding
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1)
  const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10), 100)
  const floorParam = parseFloat(searchParams.get('floor'))
  const similarityFloor = Number.isFinite(floorParam) ? floorParam : SIMILARITY_FLOOR

  const sb = getSupabaseAdmin()
  const t0 = Date.now()

  const publicVerticals = getPublicVerticals()

  // A request for a gated vertical (e.g. Way pre-launch) must never leak.
  if (vertical && !isVerticalPublic(vertical)) {
    return NextResponse.json({ listings: [], total: 0, page, limit, totalPages: 0, detectedVertical: null, detectedState: null })
  }

  // Dual-accept slug- or name-shaped ?region=; resolve to a regions row and
  // filter by the override-wins region id (COALESCE semantics in the view/RPC).
  const { region: resolvedRegion } = await resolveRegionParam(region)
  const filterRegion = resolvedRegion?.id || null

  try {
    // ── Text query: hybrid retrieval (ranks in Postgres) ──────────────────
    if (q) {
      // Resolve the location constraint from the free-text query. Precedence:
      //   1. explicit ?region= (resolvedRegion → filterRegion) — caller wins
      //   2. a region NAMED in the query → enforce as a HARD region filter, so
      //      "coffee in the Mornington Peninsula" is that region, not all of VIC
      //   3. otherwise a state/city → state-level filter (parseQueryLocation)
      // The matched location phrase is stripped from the text the arms rank on.
      let effectiveRegion = filterRegion
      let filterState = state || null      // passed to the RPC
      let filterSuburb = null              // suburb-granular filter
      let detectedState = state || null    // reported to the UI (state chip)
      let detectedRegion = null
      let detectedSuburb = null            // reported to the UI (suburb chip)
      let cleaned

      // `bind=0` (the user dismissed the "in <region>" chip) skips auto-binding
      // a region/suburb named in the query, so results broaden to the state.
      const qr = (effectiveRegion || noBind) ? null : await resolveQueryRegion(sb, q)
      if (effectiveRegion) {
        cleaned = parseQueryLocation(q).cleaned
      } else {
        if (qr && qr.region) {
          effectiveRegion = qr.region.id
          filterState = null               // the named region IS the constraint
          detectedState = qr.region.state  // light up the region's state chip
          detectedRegion = { slug: qr.region.slug, name: qr.region.name, state: qr.region.state }
          cleaned = qr.cleaned
        } else {
          const parsed = parseQueryLocation(q)
          filterState = state || parsed.state
          detectedState = filterState
          cleaned = parsed.cleaned
          // Suburb-granular tier: a named suburb ("Brewery in Richmond") filters
          // to that suburb, not just its state (falls back to state below if empty).
          if (parsed.suburb && !state) {
            filterSuburb = parsed.suburb
            detectedSuburb = parsed.suburb
          }
        }
      }

      // Events lane — runs concurrently with the embedding + hybrid retrieval.
      // Raw q (not `cleaned`): the events FTS vector includes suburb/state, so
      // location words help rather than hurt. Failure never breaks search.
      const eventsPromise = searchEvents(sb, {
        query: q, state: filterState, vertical, limit: 4,
      }).catch(() => [])

      const { lit: queryEmbedding, error: voyageError } = await embedQueryCached(sb, cleaned)

      // Rank a fixed candidate pool (NOT page*limit) so total/pagination are
      // stable across pages and dedup happens over the whole result set.
      const { data, error } = await sb.rpc('search_listings_hybrid', {
        query_embedding: queryEmbedding,
        query_text: cleaned,
        filter_vertical: vertical,
        filter_state: filterState,
        filter_region: effectiveRegion,
        filter_suburb: filterSuburb,
        match_count: RESULT_POOL,
        similarity_floor: similarityFloor,
        include_way: isVerticalPublic('way') || vertical === 'way',
      })

      if (error) {
        console.error('[search] hybrid RPC error:', error.message)
        logSearchEvent(sb, {
          query_text: clampQuery(q), surface: 'front_door', result_count: 0, latency_ms: Date.now() - t0,
          vector_arm_fired: !!queryEmbedding, fell_back: !queryEmbedding,
          voyage_error: voyageError || error.message, zero_result: true,
        })
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      let all = data || []
      // A suburb filter that found nothing → retry state-only so the user isn't stranded.
      if (filterSuburb && all.length === 0) {
        const { data: stateData } = await sb.rpc('search_listings_hybrid', {
          query_embedding: queryEmbedding, query_text: cleaned, filter_vertical: vertical,
          filter_state: filterState, filter_region: effectiveRegion, filter_suburb: null,
          match_count: RESULT_POOL, similarity_floor: similarityFloor,
          include_way: isVerticalPublic('way') || vertical === 'way',
        })
        if (stateData && stateData.length) { all = stateData; detectedSuburb = null }
      }
      // Admin/QA fixtures + needs_review venues never surface publicly (row-level),
      // then collapse the same venue cross-listed across verticals to one card.
      all = dedupeBySlug(all.filter(isPublicListing))
      const capped = all.length >= RESULT_POOL     // pool full → there may be more ("120+")
      // Facet counts over the full ranked pool (before the sub_type refine).
      const facets = buildFacets(all)
      // Optional sub_type facet refine.
      const filtered = subType ? all.filter((l) => l.sub_type === subType) : all
      const total = filtered.length
      const offset = (page - 1) * limit
      // Strip internal scoring AND `address` — search must not leak street addresses.
      const listings = filtered.slice(offset, offset + limit).map(({ fused_score, address, ...rest }) => rest)

      // Zero results → fuzzy "did you mean" against the raw query (no filters).
      const didYouMean = total === 0 ? await fuzzySuggest(sb, q) : null

      trackSearchAppearances(listings)
      logSearch(request, { queryText: clampQuery(q), verticalFilter: vertical, resultCount: total })
      logSearchEvent(sb, {
        query_text: clampQuery(q), surface: 'front_door', result_count: total, latency_ms: Date.now() - t0,
        vector_arm_fired: !!queryEmbedding, fell_back: !queryEmbedding,
        voyage_error: voyageError, zero_result: total === 0,
      })

      return NextResponse.json({
        listings, total, capped, facets, subType, didYouMean, page, limit,
        totalPages: Math.ceil(total / limit),
        detectedVertical: null, detectedState: detectedState || null, detectedRegion, detectedSuburb,
        // Events are a secondary lane — never let a slow events query block results.
        events: await withTimeout(eventsPromise, 1200, []),
      })
    }

    // ── No text query: filtered browse ────────────────────────────────────
    // Events lane for browse: soonest upcoming events under the same filters
    // ("what's on" when no query is typed). Failure never breaks search.
    const eventsPromise = searchEvents(sb, {
      query: null, state: state || null, vertical, limit: 4,
    }).catch(() => [])

    let baseQuery = excludeNeedsReview(excludeTestListings(
      sb
        .from('listings_with_region')
        .select(SELECT_FIELDS, { count: 'exact' })
        .eq('status', 'active')
        .in('vertical', publicVerticals)
    ))

    if (vertical) baseQuery = filterByVertical(baseQuery, vertical, await relationHasVerticals(sb, 'listings_with_region'))
    if (state) baseQuery = baseQuery.eq('state', state)
    if (resolvedRegion) baseQuery = baseQuery.eq('region_id', resolvedRegion.id)
    else if (region) baseQuery = baseQuery.eq('region', region)

    const offset = (page - 1) * limit
    baseQuery = baseQuery
      .order('is_claimed', { ascending: false })
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await baseQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    trackSearchAppearances(data || [])
    if (vertical || state || region) {
      logSearch(request, { queryText: vertical || state || region || '', verticalFilter: vertical, resultCount: (data || []).length })
    }

    return NextResponse.json({
      listings: data || [], total: count || 0, page, limit,
      totalPages: Math.ceil((count || 0) / limit),
      events: await withTimeout(eventsPromise, 1200, []),
    })
  } catch (err) {
    console.error('[search] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
