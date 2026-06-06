import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createHash } from 'crypto'
import { LISTING_REGION_SELECT, resolveRegionParam } from '@/lib/regions'
import { getPublicVerticals, isVerticalPublic } from '@/lib/verticalUrl'
import { filterByVertical, relationHasVerticals } from '@/lib/listings/verticalFilter'
import { embedQueryCached } from '@/lib/embeddings/queryCache'
import { logSearchEvent } from '@/lib/search/log'
import { parseQueryLocation } from '@/lib/search/parseQuery'
import { resolveQueryRegion } from '@/lib/search/resolveQueryRegion'

const SELECT_FIELDS = `id, vertical, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, is_claimed, editors_pick, website, address, ${LISTING_REGION_SELECT}`

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
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  const vertical = searchParams.get('vertical') || null
  const state = searchParams.get('state') || null
  const region = searchParams.get('region') || null
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
      let detectedState = state || null    // reported to the UI (state chip)
      let detectedRegion = null
      let cleaned

      if (effectiveRegion) {
        cleaned = parseQueryLocation(q).cleaned
      } else {
        const qr = await resolveQueryRegion(sb, q)
        if (qr.region) {
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
        }
      }

      const { lit: queryEmbedding, error: voyageError } = await embedQueryCached(sb, cleaned)

      // Fetch enough ranked rows to satisfy the requested page, capped.
      const matchCount = Math.min(page * limit, 120)
      const { data, error } = await sb.rpc('search_listings_hybrid', {
        query_embedding: queryEmbedding,
        query_text: cleaned,
        filter_vertical: vertical,
        filter_state: filterState,
        filter_region: effectiveRegion,
        match_count: matchCount,
        similarity_floor: similarityFloor,
        include_way: isVerticalPublic('way') || vertical === 'way',
      })

      if (error) {
        console.error('[search] hybrid RPC error:', error.message)
        logSearchEvent(sb, {
          query_text: q, surface: 'front_door', result_count: 0, latency_ms: Date.now() - t0,
          vector_arm_fired: !!queryEmbedding, fell_back: !queryEmbedding,
          voyage_error: voyageError || error.message, zero_result: true,
        })
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const all = data || []
      const total = all.length
      const offset = (page - 1) * limit
      const listings = all.slice(offset, offset + limit).map(({ fused_score, ...rest }) => rest)

      trackSearchAppearances(listings)
      logSearch(request, { queryText: q, verticalFilter: vertical, resultCount: total })
      logSearchEvent(sb, {
        query_text: q, surface: 'front_door', result_count: total, latency_ms: Date.now() - t0,
        vector_arm_fired: !!queryEmbedding, fell_back: !queryEmbedding,
        voyage_error: voyageError, zero_result: total === 0,
      })

      return NextResponse.json({
        listings, total, page, limit,
        totalPages: Math.ceil(total / limit),
        detectedVertical: null, detectedState: detectedState || null, detectedRegion,
      })
    }

    // ── No text query: filtered browse ────────────────────────────────────
    let baseQuery = sb
      .from('listings_with_region')
      .select(SELECT_FIELDS, { count: 'exact' })
      .eq('status', 'active')
      .in('vertical', publicVerticals)

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
    })
  } catch (err) {
    console.error('[search] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
