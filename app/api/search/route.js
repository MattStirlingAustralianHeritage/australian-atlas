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
import { resolveQueryPlace, geocodePlace, looksLikePlaceQuery } from '@/lib/search/resolveQueryPlace'
import { detectVerticalIntent } from '@/lib/search/verticalIntent'
import { relevanceFloorFor } from '@/lib/search/relevanceFloor'
import { rerankSearchResults } from '@/lib/search/rerank'
import { checkRateLimit } from '@/lib/rate-limit'
import { translateSearchQuery } from '@/lib/search/translateQuery'

// Largest candidate pool the RPC ranks per request. Pagination/dedup/total are
// computed over this fixed pool so `total` is stable across pages (it does NOT
// grow page-to-page) and deep pages never claim phantom results. Broad queries
// that fill the pool are reported as "capped" so the UI can show "120+".
const RESULT_POOL = 120

// ── Place-aware search (towns / suburbs the curated maps don't cover) ─────────
// A query that resolves to a real locality pivots from token/semantic ranking to
// a geographic search around that locality's centroid. Radius scales inversely
// with venue density: a venue-rich town stays tight (its own venues fill the
// page), a sparse town widens to gather its surroundings.
function pickRadiusKm(n) {
  if (n >= 12) return 25
  if (n >= 4) return 40
  return 60
}
// Radius for the "category in <town>" case (bounding box on the hybrid RPC) and
// for the geocoder fallback (towns we hold no venues in — cast a wider net).
const VIBE_RADIUS_KM = 50
const GEOCODE_RADIUS_KM = 130
// Below this many in-box hits, a "category in <town>" search broadens to the
// town's state so the user is never stranded by an over-tight box.
const MIN_BOX_RESULTS = 4
// A detected atlas needs at least this many rows in the pool before we lead with
// it (and show its banner) — otherwise the keyword matched but the results are
// really cross-atlas, and leading/labelling would over-claim.
const MIN_LEAD_ROWS = 3

// How many of the fused recall pool get the cross-encoder rerank pass (the
// precision stage). 80 covers the first ~3 pages; the tail keeps fused order.
const RERANK_TOP_N = parseInt(process.env.SEARCH_RERANK_TOPN || '80', 10)

/** Lat/lng bounding box (degrees) for a radius in km around a centre point. */
function boxAround(lat, lng, km) {
  const dLat = km / 111
  const dLng = km / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01))
  return { lat_min: lat - dLat, lat_max: lat + dLat, lng_min: lng - dLng, lng_max: lng + dLng }
}

/** Does a hybrid row clear its vertical's calibrated relevance floor? */
function isStrongRow(r) {
  return typeof r?.similarity === 'number' && r.similarity >= relevanceFloorFor(r?.vertical)
}

/** Distance-ordered neighbours of a point, restricted to public verticals. */
async function proximityRows(sb, { lat, lng, radiusKm, vertical }) {
  const { data, error } = await sb.rpc('nearby_listings', {
    center_lat: lat, center_lng: lng, radius_km: radiusKm,
    filter_vertical: vertical || null, max_results: RESULT_POOL,
  })
  if (error) return []
  // nearby_listings doesn't apply vertical-publication gating — drop gated rows.
  return (data || []).filter((r) => isVerticalPublic(r.vertical))
}

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

/** Stable re-rank that LEADS with the detected atlas: rows of `vertical` first
 *  (in their existing relevance order), then everything else (likewise). Cross-
 *  atlas matches are kept, not dropped — they just follow the obvious atlas. */
function leadWithVertical(rows, vertical) {
  if (!vertical) return rows
  const lead = [], rest = []
  for (const r of rows) (r.vertical === vertical ? lead : rest).push(r)
  return lead.concat(rest)
}

/** Sub_type facet counts over the ranked pool, most common first (top 12). When
 *  a `leadVertical` is set, its sub_types sort ahead of the rest so the type bar
 *  leads with the obvious atlas ("Boutique Hotel · Cottage · Bnb …") rather than
 *  the most numerous cross-atlas type. */
function buildFacets(rows, leadVertical) {
  const counts = new Map()
  const subTypeVertical = new Map()   // sub_type → owning vertical (prefer the lead)
  for (const r of rows) {
    if (!r.sub_type) continue
    counts.set(r.sub_type, (counts.get(r.sub_type) || 0) + 1)
    if (!subTypeVertical.has(r.sub_type) || r.vertical === leadVertical) {
      subTypeVertical.set(r.sub_type, r.vertical)
    }
  }
  const subTypes = [...counts.entries()]
    .map(([key, count]) => ({ key, count, lead: !!leadVertical && subTypeVertical.get(key) === leadVertical }))
    .sort((a, b) => (Number(b.lead) - Number(a.lead)) || (b.count - a.count))
    .slice(0, 12)
    .map(({ key, count }) => ({ key, count }))
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
const SELECT_FIELDS = `id, vertical, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, is_claimed, editors_pick, website, presence_type, ${LISTING_REGION_SELECT}`

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
  // Korean launch: a Korean query is translated to English here, before any
  // region/place/vertical resolution or embedding — the entire English search
  // pipeline below then runs unchanged. English queries pass through untouched
  // (no Hangul → no-op) and fail-open on any translation error.
  const qRaw = (searchParams.get('q') || '').trim()
  const q = await translateSearchQuery(qRaw, searchParams.get('lang'))
  const vertical = searchParams.get('vertical') || null
  const state = searchParams.get('state') || null
  const region = searchParams.get('region') || null
  const subType = searchParams.get('sub_type') || null   // facet refine
  const noBind = searchParams.get('bind') === '0'         // ignore region/suburb auto-binding
  const noVerticalBind = searchParams.get('vbind') === '0' // ignore atlas (vertical) auto-detection
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
      //   3. a state/city or curated suburb → state/suburb filter (parseQueryLocation)
      //   4. a TOWN/SUBURB we hold venues in → geographic pivot around its
      //      centroid (resolveQueryPlace, the gazetteer). This is what makes
      //      "apollo bay" return Apollo Bay's venues + neighbours instead of
      //      Byron Bay listings 1,300km away.
      // The matched location phrase is stripped from the text the arms rank on.
      let effectiveRegion = filterRegion
      let filterState = state || null      // passed to the RPC
      let filterSuburb = null              // suburb-granular filter
      let detectedState = state || null    // reported to the UI (state chip)
      let detectedRegion = null
      let detectedSuburb = null            // reported to the UI (suburb chip)
      let detectedPlace = null             // resolved town/suburb (UI chip + distance origin)
      let geoBox = null                    // bounding box for a "category in <town>" search
      let placePivot = false               // bare town → distance-ordered proximity browse
      let cleaned

      // `bind=0` (the user dismissed the "in <place>" chip) skips auto-binding
      // anything named in the query, so results broaden back out.
      const qr = (effectiveRegion || noBind) ? null : await resolveQueryRegion(sb, q)
      if (effectiveRegion) {
        cleaned = parseQueryLocation(q).cleaned
      } else if (qr && qr.region) {
        effectiveRegion = qr.region.id
        filterState = null               // the named region IS the constraint
        detectedState = qr.region.state  // light up the region's state chip
        detectedRegion = { slug: qr.region.slug, name: qr.region.name, state: qr.region.state }
        cleaned = qr.cleaned
      } else {
        const parsed = parseQueryLocation(q)
        if (parsed.state) {
          filterState = state || parsed.state
          detectedState = filterState
          cleaned = parsed.cleaned
          // Suburb-granular tier: a named suburb ("Brewery in Richmond") filters
          // to that suburb, not just its state (falls back to state below if empty).
          if (parsed.suburb && !state) {
            filterSuburb = parsed.suburb
            detectedSuburb = parsed.suburb
          }
        } else {
          // Nothing curated matched → try the data-driven locality gazetteer.
          const pr = noBind ? null : await resolveQueryPlace(sb, q)
          if (pr && pr.place) {
            const p = pr.place
            detectedPlace = {
              label: p.suburb, suburb: p.suburb, state: p.state, region: p.region,
              lat: p.lat, lng: p.lng, n: p.n, source: 'gazetteer',
            }
            detectedState = state || p.state || null
            cleaned = pr.cleaned
            if (cleaned) {
              // "<category> in <town>" → rank the vibe inside a box around the town.
              filterState = state || p.state || null
              geoBox = boxAround(p.lat, p.lng, VIBE_RADIUS_KM)
            } else {
              // Bare town → proximity browse (nearest venues first).
              placePivot = true
            }
          } else {
            filterState = state || parsed.state
            detectedState = filterState
            cleaned = parsed.cleaned
          }
        }
      }

      // ── Detected atlas (vertical) intent ─────────────────────────────────
      // When the query obviously implies ONE atlas ("quiet farm stay" → Rest,
      // "specialty coffee" → Fine Grounds, "vintage shops" → Found), we still
      // retrieve across EVERY atlas but LEAD the results with that atlas (see the
      // stable re-rank below) — so the obvious vertical dominates the top while
      // genuinely-relevant cross-atlas matches (a farm-gate, a winery with rooms)
      // remain in the pool and reachable. A soft boost, not an exclusive filter.
      // Skipped when the caller already pinned a vertical, dismissed the focus
      // (vbind=0), or the whole query was a bare place (placePivot — no category
      // signal to act on).
      let detectedVertical = null
      if (!vertical && !noVerticalBind && !placePivot) {
        const intent = detectVerticalIntent(q)
        if (intent && isVerticalPublic(intent.vertical)) detectedVertical = intent.vertical
      }

      // Events lane — runs concurrently with the embedding + hybrid retrieval.
      // Raw q (not `cleaned`): the events FTS vector includes suburb/state, so
      // location words help rather than hurt. Failure never breaks search.
      const eventsPromise = searchEvents(sb, {
        query: q, state: filterState, vertical, limit: 4,
      }).catch(() => [])

      const includeWay = isVerticalPublic('way') || vertical === 'way'
      let queryEmbedding = null
      let voyageError = null
      let all

      if (placePivot && detectedPlace) {
        // ── Bare town → distance-ordered proximity browse ────────────────────
        // The whole query was a place we hold venues in. Rank by nearness, not
        // by text — the user wants what's in & around that town, nearest first.
        all = await proximityRows(sb, {
          lat: detectedPlace.lat, lng: detectedPlace.lng,
          radiusKm: pickRadiusKm(detectedPlace.n), vertical,
        })
      } else {
        // ── Text query → hybrid retrieval (optionally boxed to a town) ───────
        const embedded = await embedQueryCached(sb, cleaned)
        queryEmbedding = embedded.lit
        voyageError = embedded.error

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
          include_way: includeWay,
          ...(geoBox || {}),
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

        all = data || []
        // A suburb filter that found nothing → retry state-only so the user isn't stranded.
        if (filterSuburb && all.length === 0) {
          const { data: stateData } = await sb.rpc('search_listings_hybrid', {
            query_embedding: queryEmbedding, query_text: cleaned, filter_vertical: vertical,
            filter_state: filterState, filter_region: effectiveRegion, filter_suburb: null,
            match_count: RESULT_POOL, similarity_floor: similarityFloor, include_way: includeWay,
          })
          if (stateData && stateData.length) { all = stateData; detectedSuburb = null }
        }
        // A box around a town that's too sparse ("brewery in <tiny town>") →
        // broaden to the town's state so the user still gets the best matches.
        if (geoBox && all.length < MIN_BOX_RESULTS) {
          const { data: wideData } = await sb.rpc('search_listings_hybrid', {
            query_embedding: queryEmbedding, query_text: cleaned, filter_vertical: vertical,
            filter_state: filterState, filter_region: effectiveRegion, filter_suburb: null,
            match_count: RESULT_POOL, similarity_floor: similarityFloor, include_way: includeWay,
          })
          if (wideData && wideData.length > all.length) all = wideData
        }

        // ── Tier C: geocoder fallback for a town we hold NO venues in ────────
        // Only when NOTHING bound the query to a location (no region/state/
        // suburb/gazetteer place), the query looks like a bare place, AND
        // ranking surfaced nothing strong (e.g. "Roma" → romance bookshops).
        // Geocode the place and show the nearest independent venues to it.
        // Bounded to this failing tail so common queries never pay the geocode
        // round-trip, and a query already scoped to a region (e.g. "byron bay")
        // keeps its existing region results untouched.
        const unbound = !detectedPlace && !effectiveRegion && !filterState && !filterSuburb
        if (unbound && looksLikePlaceQuery(q) && !all.some(isStrongRow)) {
          const geo = await geocodePlace(q)
          if (geo) {
            const near = await proximityRows(sb, {
              lat: geo.lat, lng: geo.lng, radiusKm: GEOCODE_RADIUS_KM, vertical,
            })
            if (near.length) {
              all = near
              detectedPlace = { label: geo.label, state: geo.state, lat: geo.lat, lng: geo.lng, source: 'geocoded' }
              detectedState = state || geo.state || detectedState
            }
          }
        }
      }
      // Admin/QA fixtures + needs_review venues never surface publicly (row-level),
      // then collapse the same venue cross-listed across verticals to one card.
      all = dedupeBySlug(all.filter(isPublicListing))

      // ── Precision rerank (cross-encoder) ─────────────────────────────────
      // Reorder the recall pool by TRUE relevance to the query vibe. RRF ranks
      // by arm POSITION, and the lexical arm's position swings on exactly which
      // stemmed tokens a phrasing contains — so "a brewery that uses ovens with
      // wood" and "wood fired oven brewery" returned the same venue at different
      // ranks. A cross-encoder reads query + document together and is phrasing-
      // robust, so paraphrases of one intent converge. Skipped for proximity
      // browses (distance-ordered — no text vibe to score) and fully fail-open:
      // any error/disabled/over-budget keeps the fused order (see lib/search/rerank).
      const proximityResult = placePivot || (detectedPlace && detectedPlace.source === 'geocoded')
      let reranked = false
      if (!proximityResult && cleaned) {
        const rr = await rerankSearchResults(sb, cleaned, all, { topN: RERANK_TOP_N })
        all = rr.listings
        reranked = rr.reranked
      }
      // Drop the focus if the detected atlas is barely represented — the keyword
      // matched but the results are really cross-atlas, so don't lead/label it.
      if (detectedVertical &&
          all.reduce((c, r) => c + (r.vertical === detectedVertical ? 1 : 0), 0) < MIN_LEAD_ROWS) {
        detectedVertical = null
      }
      // Soft vertical boost: lead the pool with the detected atlas (cross-atlas
      // matches kept, just below). Applied AFTER dedupe so a venue cross-listed
      // in the detected atlas is collapsed to the right card first.
      all = leadWithVertical(all, detectedVertical)
      const capped = all.length >= RESULT_POOL     // pool full → there may be more ("120+")
      // Facet counts over the full ranked pool (before the sub_type refine),
      // leading with the detected atlas's types when one was detected.
      const facets = buildFacets(all, detectedVertical)
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
        voyage_error: voyageError, zero_result: total === 0, reranked,
        // Result-impression log (search_result_impressions): the FINAL page of
        // listings actually sent to the client, offset so positions are the
        // global rank. Fire-and-forget inside the helper — never blocks search.
        impressions: listings, impressions_offset: offset,
      })

      return NextResponse.json({
        listings, total, capped, facets, subType, didYouMean, page, limit, reranked,
        totalPages: Math.ceil(total / limit),
        detectedVertical, detectedState: detectedState || null, detectedRegion, detectedSuburb,
        // Place-aware search: the resolved town/suburb the results are scoped to
        // (gazetteer match or geocoded). Drives the "in <town>" chip + distances.
        detectedPlace: detectedPlace
          ? { label: detectedPlace.label, state: detectedPlace.state || null, region: detectedPlace.region || null,
              lat: detectedPlace.lat, lng: detectedPlace.lng, source: detectedPlace.source,
              proximity: placePivot || detectedPlace.source === 'geocoded' }
          : null,
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
