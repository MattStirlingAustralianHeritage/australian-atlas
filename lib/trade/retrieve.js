/**
 * Atlas Trade — natural-language retrieval over the FULL curated network.
 *
 * This is the builder's engine: free-text query → Voyage embed → pgvector +
 * lexical hybrid retrieval, ranked in Postgres. It reuses the canonical
 * `search_listings_hybrid` RPC (the same NL → Voyage → pgvector path the
 * consumer front door uses) rather than forking search logic.
 *
 * Pool = ALL public listings. Trade-readiness is applied as ENRICHMENT on the
 * results (a `trade` object per candidate), NEVER as a filter on the pool — a
 * "winery tour" is mostly un-flagged Small Batch operators, and filtering to
 * trade-flagged rows would starve the builder.
 */
import { embedQueryCached } from '@/lib/embeddings/queryCache'
import { isPublicListing } from '@/lib/listings/publicFilter'
import { isVerticalPublic } from '@/lib/verticalUrl'
import { resolveRegionParam } from '@/lib/regions'
import { resolveQueryRegion } from '@/lib/search/resolveQueryRegion'
import { parseQueryLocation } from '@/lib/search/parseQuery'
import { getVerticalUrl, getVerticalLabel } from '@/lib/verticalUrl'
import { decorateWithTrade } from './enrich'

// Trade users want a broad candidate set to assemble from, so the pool is wider
// and the semantic floor lower than the consumer front door.
const TRADE_RESULT_POOL = 48
const TRADE_SIMILARITY_FLOOR = 0.30

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

/** Trim a description to a short candidate excerpt. */
function excerpt(text, max = 240) {
  if (!text) return null
  const t = String(text).trim()
  return t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, '') + '…'
}

/**
 * Run a trade retrieval.
 *   sb            — service-role client
 *   query         — free text, e.g. "a winery tour in the Yarra Valley"
 *   regionParam   — optional explicit region (name or slug); overrides any
 *                   region named in the query
 *   limit         — max candidates to return (after dedupe)
 *
 * Returns { candidates, detectedRegion, cleaned, fellBack }.
 */
export async function tradeRetrieve(sb, { query, regionParam = null, limit = 24 }) {
  const q = (query || '').trim()
  if (!q) return { candidates: [], detectedRegion: null, cleaned: '', fellBack: false }

  // ── Resolve a region constraint ────────────────────────────────────────
  // Precedence: explicit regionParam → region named in the query → state/none.
  // The location phrase is stripped from the text the search arms rank on.
  let filterRegion = null
  let filterState = null
  let detectedRegion = null
  let cleaned = q

  if (regionParam) {
    const { region } = await resolveRegionParam(regionParam)
    if (region) {
      filterRegion = region.id
      detectedRegion = { id: region.id, name: region.name, slug: region.slug, state: region.state }
    }
    cleaned = parseQueryLocation(q).cleaned
  } else {
    const qr = await resolveQueryRegion(sb, q)
    if (qr && qr.region) {
      filterRegion = qr.region.id
      detectedRegion = { id: qr.region.id, name: qr.region.name, slug: qr.region.slug, state: qr.region.state }
      cleaned = qr.cleaned
    } else {
      const parsed = parseQueryLocation(q)
      filterState = parsed.state || null
      cleaned = parsed.cleaned
    }
  }

  // ── Embed (Voyage, cached) — null on failure degrades to the lexical arm ──
  const { lit: queryEmbedding } = await embedQueryCached(sb, cleaned || q)
  const fellBack = !queryEmbedding

  // ── Hybrid retrieval over the FULL public pool (no vertical filter) ──────
  const { data, error } = await sb.rpc('search_listings_hybrid', {
    query_embedding: queryEmbedding,
    query_text: cleaned || q,
    filter_vertical: null,
    filter_state: filterState,
    filter_region: filterRegion,
    filter_suburb: null,
    match_count: TRADE_RESULT_POOL,
    similarity_floor: TRADE_SIMILARITY_FLOOR,
    include_way: isVerticalPublic('way'),
  })

  if (error) {
    console.error('[trade/retrieve] hybrid RPC error:', error.message)
    throw new Error(`Trade retrieval failed: ${error.message}`)
  }

  // Strip non-public fixtures, drop cross-vertical slug duplicates, cap.
  let rows = dedupeBySlug((data || []).filter(isPublicListing)).slice(0, limit)

  // Enrich (never filter) with trade-readiness.
  rows = await decorateWithTrade(sb, rows)

  const candidates = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    vertical: r.vertical,
    vertical_label: getVerticalLabel(r.vertical),
    sub_type: r.sub_type || null,
    region: r.region || null,
    state: r.state || null,
    suburb: r.suburb || null,
    excerpt: excerpt(r.description),
    hero_image_url: r.hero_image_url || null,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    url: getVerticalUrl(r.vertical, r.slug),
    trade_ready: r.trade_ready,
    trade: r.trade,
  }))

  return { candidates, detectedRegion, cleaned: cleaned || q, fellBack }
}
