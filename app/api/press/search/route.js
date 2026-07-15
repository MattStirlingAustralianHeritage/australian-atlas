import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { validatePressSession, PRESS_SESSION_COOKIE } from '@/lib/press-session'
import { getFollowedRegions } from '@/lib/press/insights'
import { isVerticalPublic } from '@/lib/verticalUrl'
import { isPublicListing } from '@/lib/listings/publicFilter'
import { embedQueryCached } from '@/lib/embeddings/queryCache'
import { rerankSearchResults } from '@/lib/search/rerank'
import { looksDescriptive, expandDescriptiveQuery } from '@/lib/search/vibeExpand'
import { relevanceFloorFor } from '@/lib/search/relevanceFloor'
import { logSearchEvent } from '@/lib/search/log'
import { checkRateLimit } from '@/lib/rate-limit'

// Story search — the site's semantic ("vibe") retrieval, put to work for
// journalists. Same engine as the public front door: Voyage query embedding
// (cached, budget-guarded, fail-open to lexical), the search_listings_hybrid
// RPC (FTS + pgvector fused by RRF in Postgres), the cross-encoder rerank,
// and the descriptive-recall expansion — so "a bakery run by the same family
// for generations" finds the venue that IS that story, not just keyword hits.
//
// Press-shaped on top of it:
//   • results split into the member's followed regions vs the wider network
//   • each hit carries STORY HOOKS computed from real columns — anniversary
//     this year, founded year, heritage significance, newly listed, an
//     upcoming event, editors' pick, owner-claimed (introduction available)
//   • every query is logged to search_events with surface 'newsroom' so the
//     admin Search Insights dashboard sees what journalists are hunting for.
//
// GET /api/press/search?q=...&scope=followed|all — session-gated.

export const maxDuration = 60

const RESULT_POOL = 120
const SIMILARITY_FLOOR = 0.48
const RERANK_TOP_N = 80
const RERANK_STRONG_FLOOR = parseFloat(process.env.SEARCH_STRONG_RERANK_FLOOR || '0.55')
const ENRICH_TOP_N = 40      // rows that get hooks (one batch query each for listings + events)
const FOLLOWED_MAX = 24
const BEYOND_MAX = 12

// Round founding anniversaries worth a diary note (mirrors insights.js).
const ANNIVERSARY_YEARS = new Set([10, 20, 25, 30, 40, 50, 75, 100, 125, 150, 175, 200])

function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Collapse rows that share a slug (same venue cross-listed across verticals). */
function dedupeBySlug(rows) {
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const key = r.slug || r.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

function isStrongRow(r) {
  return typeof r?.similarity === 'number' && r.similarity >= relevanceFloorFor(r?.vertical)
}

export async function GET(req) {
  const limited = checkRateLimit(req, { keyPrefix: 'press-search', maxRequests: 30, windowMs: 60_000 })
  if (limited) return limited

  const cookie = req.cookies.get(PRESS_SESSION_COOKIE)
  const session = validatePressSession(cookie?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim().slice(0, 200)
  const scope = searchParams.get('scope') === 'all' ? 'all' : 'followed'
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const t0 = Date.now()

  try {
    const followed = await getFollowedRegions(sb, session.pressId)
    const followedIds = new Set(followed.map(r => r.id))
    const regionNameById = new Map(followed.map(r => [r.id, r.name]))

    // ── Retrieval: the canonical hybrid arm, network-wide ─────────────────
    const includeWay = isVerticalPublic('way')
    const { lit: queryEmbedding, error: voyageError } = await embedQueryCached(sb, q)

    const { data, error } = await sb.rpc('search_listings_hybrid', {
      query_embedding: queryEmbedding,
      query_text: q,
      filter_vertical: null,
      filter_state: null,
      filter_region: null,
      filter_suburb: null,
      match_count: RESULT_POOL,
      similarity_floor: SIMILARITY_FLOOR,
      include_way: includeWay,
    })
    if (error) {
      console.error('[press-search] hybrid RPC error:', error.message)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    let all = dedupeBySlug((data || []).filter(isPublicListing).filter(r => isVerticalPublic(r.vertical)))

    // ── Precision rerank (cross-encoder, fail-open) ───────────────────────
    let reranked = false
    {
      const rr = await rerankSearchResults(sb, q, all, { topN: RERANK_TOP_N })
      all = rr.listings
      reranked = rr.reranked
    }
    const applyStrength = (rows, didRerank) => rows.map(r => ({
      ...r,
      strong: didRerank
        ? typeof r.rerank_score === 'number' && r.rerank_score >= RERANK_STRONG_FLOOR
        : isStrongRow(r),
    }))
    all = applyStrength(all, reranked)

    // ── Descriptive-recall expansion (the vibe pass) ──────────────────────
    // A story hunt is exactly the descriptive query this was built for: when
    // nothing cleared the strong floor, expand the feeling into concrete
    // venue vocabulary and rerank the widened pool against the ORIGINAL query.
    let expanded = false
    if (looksDescriptive(q) && !all.some(r => r.strong)) {
      const expandedText = await expandDescriptiveQuery(q)
      if (expandedText) {
        const { data: moreData } = await sb.rpc('search_listings_hybrid', {
          query_embedding: queryEmbedding, query_text: expandedText,
          filter_vertical: null, filter_state: null, filter_region: null, filter_suburb: null,
          match_count: RESULT_POOL, similarity_floor: SIMILARITY_FLOOR, include_way: includeWay,
        })
        const seenKeys = new Set(all.flatMap(r => [r.id, r.slug || r.id]))
        const fresh = dedupeBySlug((moreData || []).filter(isPublicListing).filter(r => isVerticalPublic(r.vertical)))
          .filter(r => !seenKeys.has(r.id) && !seenKeys.has(r.slug || r.id))
        if (fresh.length) {
          const rr = await rerankSearchResults(sb, q, all.concat(fresh), { topN: RERANK_TOP_N })
          all = applyStrength(rr.listings, rr.reranked)
          reranked = reranked || rr.reranked
          expanded = true
        }
      }
    }

    // ── Press enrichment: story hooks for the rows we'll actually show ────
    const top = all.slice(0, ENRICH_TOP_N)
    const ids = top.map(r => r.id)
    const [{ data: extras }, { data: evRows }] = await Promise.all([
      ids.length
        ? sb.from('listings_with_region')
            .select('id, region_id, created_at, founded_year, heritage_significance')
            .in('id', ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? sb.from('events')
            .select('listing_id, name, slug, start_date')
            .in('listing_id', ids)
            .eq('status', 'approved')
            .not('published', 'is', false)
            .gte('end_date', todayYMD())
            .order('start_date', { ascending: true })
        : Promise.resolve({ data: [] }),
    ])
    const extraById = new Map((extras || []).map(x => [x.id, x]))
    const nextEventByListing = new Map()
    for (const e of evRows || []) {
      if (!nextEventByListing.has(e.listing_id)) nextEventByListing.set(e.listing_id, e)
    }

    // Region names for rows outside the followed set (one lookup).
    const missingRegionIds = [...new Set((extras || [])
      .map(x => x.region_id)
      .filter(id => id && !regionNameById.has(id)))]
    if (missingRegionIds.length) {
      const { data: regionRows } = await sb.from('regions').select('id, name').in('id', missingRegionIds)
      for (const r of regionRows || []) regionNameById.set(r.id, r.name)
    }

    const thisYear = new Date().getFullYear()
    const since60 = new Date(Date.now() - 60 * 86400000).toISOString()

    function shape(r) {
      const extra = extraById.get(r.id) || {}
      const hooks = []
      if (extra.founded_year && ANNIVERSARY_YEARS.has(thisYear - extra.founded_year)) {
        hooks.push({ kind: 'anniversary', label: `Turns ${thisYear - extra.founded_year} this year` })
      } else if (extra.founded_year) {
        hooks.push({ kind: 'founded', label: `Est. ${extra.founded_year}` })
      }
      if (extra.heritage_significance === true) hooks.push({ kind: 'heritage', label: 'Heritage significance' })
      if (extra.created_at && extra.created_at >= since60) hooks.push({ kind: 'new', label: 'Newly listed' })
      const ev = nextEventByListing.get(r.id)
      if (ev) hooks.push({ kind: 'event', label: `Event ${ev.start_date}: ${ev.name}`, slug: ev.slug })
      if (r.editors_pick) hooks.push({ kind: 'pick', label: "Editors' pick" })
      if (r.is_claimed) hooks.push({ kind: 'reachable', label: 'Owner on the Atlas — intro available' })
      return {
        id: r.id, name: r.name, slug: r.slug, vertical: r.vertical,
        sub_type: r.sub_type || null, suburb: r.suburb || null, state: r.state || null,
        description: r.description ? String(r.description).slice(0, 320) : null,
        hero_image_url: r.hero_image_url || null,
        is_claimed: r.is_claimed === true, editors_pick: r.editors_pick === true,
        strong: r.strong === true,
        region_id: extra.region_id || null,
        regionName: extra.region_id ? (regionNameById.get(extra.region_id) || null) : null,
        hooks,
      }
    }

    const shaped = top.map(shape)
    const inRegions = shaped.filter(r => r.region_id && followedIds.has(r.region_id)).slice(0, FOLLOWED_MAX)
    const beyond = shaped.filter(r => !r.region_id || !followedIds.has(r.region_id)).slice(0, BEYOND_MAX)
    const results = scope === 'all' ? { inRegions, beyond } : { inRegions, beyond: beyond.slice(0, followedIds.size ? BEYOND_MAX : BEYOND_MAX) }

    // Telemetry: journalists' hunts show up in admin Search Insights.
    logSearchEvent(sb, {
      query_text: q, surface: 'newsroom', result_count: shaped.length, latency_ms: Date.now() - t0,
      vector_arm_fired: !!queryEmbedding, fell_back: !queryEmbedding,
      voyage_error: voyageError, zero_result: shaped.length === 0, reranked,
    })

    return NextResponse.json({
      query: q,
      scope,
      followedCount: followedIds.size,
      inRegions: results.inRegions,
      beyond: results.beyond,
      reranked,
      expanded,
      total: shaped.length,
    })
  } catch (err) {
    console.error('[press-search] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
