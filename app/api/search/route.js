import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createHash } from 'crypto'

const SELECT_FIELDS = 'id, vertical, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, is_claimed, editors_pick, website, address'

/** Generate an anonymous session id from user-agent + date (no PII) */
function getSessionId(request) {
  const ua = request.headers.get('user-agent') || 'unknown'
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256').update(`${ua}:${day}`).digest('hex').slice(0, 16)
}

/** Fire-and-forget search log — must never break search */
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

// Map natural-language keywords to vertical keys
const VERTICAL_KEYWORDS = {
  sba: ['brewery', 'breweries', 'winery', 'wineries', 'distillery', 'distilleries', 'cidery', 'cideries', 'cellar door', 'wine', 'beer', 'craft beer', 'spirits', 'gin', 'whisky', 'whiskey', 'vermouth', 'cider', 'small batch', 'natural wine'],
  collection: ['museum', 'museums', 'gallery', 'galleries', 'heritage', 'cultural', 'art gallery', 'exhibition'],
  craft: ['maker', 'makers', 'artist', 'artists', 'studio', 'studios', 'pottery', 'ceramics', 'woodwork', 'textiles', 'jewellery', 'jewelry'],
  fine_grounds: ['coffee', 'cafe', 'cafes', 'roaster', 'roasters', 'espresso', 'specialty coffee'],
  rest: ['stay', 'stays', 'hotel', 'hotels', 'accommodation', 'boutique stay', 'boutique stays', 'glamping', 'farmstay', 'farm stay', 'cottage', 'cottages', 'bnb', 'b&b', 'bed and breakfast'],
  field: ['swimming hole', 'waterfall', 'waterfalls', 'lookout', 'lookouts', 'hiking', 'trail', 'trails', 'nature', 'natural', 'outdoor', 'outdoors', 'walking track'],
  corner: ['bookshop', 'bookshops', 'book shop', 'record store', 'record stores', 'homewares', 'indie shop', 'indie retail', 'independent shop'],
  found: ['vintage', 'op shop', 'op shops', 'antique', 'antiques', 'secondhand', 'second hand', 'thrift', 'retro', 'market'],
  table: ['farm gate', 'bakery', 'bakeries', 'food producer', 'providore', 'providores', 'butcher', 'cheese', 'olive oil', 'honey', 'sourdough'],
}

// Map region keywords to region names for ilike matching
const REGION_KEYWORDS = {
  'barossa': 'Barossa',
  'yarra valley': 'Yarra Valley',
  'mornington': 'Mornington Peninsula',
  'blue mountains': 'Blue Mountains',
  'byron': 'Byron',
  'byron bay': 'Byron',
  'adelaide hills': 'Adelaide Hills',
  'hunter valley': 'Hunter Valley',
  'margaret river': 'Margaret River',
  'daylesford': 'Daylesford',
  'macedon': 'Macedon Ranges',
  'dandenong': 'Dandenong Ranges',
  'goldfields': 'Goldfields',
  'bellarine': 'Bellarine',
  'gippsland': 'Gippsland',
  'southern highlands': 'Southern Highlands',
  'central coast': 'Central Coast',
  'sunshine coast': 'Sunshine Coast',
  'gold coast': 'Gold Coast',
  'noosa': 'Noosa',
  'kangaroo island': 'Kangaroo Island',
  'tasmania': 'TAS',
  'melbourne': 'Melbourne',
  'sydney': 'Sydney',
  'brisbane': 'Brisbane',
  'adelaide': 'Adelaide',
  'perth': 'Perth',
  'hobart': 'Hobart',
  'canberra': 'ACT',
  'darwin': 'Darwin',
  'fremantle': 'Fremantle',
}

// Words to strip from query after extracting hints (prepositions, filler)
const STRIP_WORDS = new Set(['near', 'in', 'around', 'the', 'a', 'an', 'and', 'or', 'for', 'best', 'top', 'good', 'great'])

/**
 * Parse a natural-language query for vertical and region hints.
 * Returns { vertical, region, cleanedTerms } where vertical/region
 * may be null if no hint was found, and cleanedTerms is the remaining
 * search text with hint phrases removed.
 */
function parseQueryHints(rawQuery) {
  const lower = rawQuery.toLowerCase().trim()
  let detectedVertical = null
  let detectedRegion = null
  let remaining = lower

  // Check for vertical keywords (longest match first)
  for (const [vKey, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
    // Sort by length descending so multi-word matches win
    const sorted = [...keywords].sort((a, b) => b.length - a.length)
    for (const kw of sorted) {
      if (remaining.includes(kw)) {
        detectedVertical = vKey
        remaining = remaining.replace(kw, ' ').trim()
        break
      }
    }
    if (detectedVertical) break
  }

  // Check for region keywords (longest match first)
  const regionEntries = Object.entries(REGION_KEYWORDS).sort((a, b) => b[0].length - a[0].length)
  for (const [kw, regionValue] of regionEntries) {
    if (remaining.includes(kw)) {
      detectedRegion = regionValue
      remaining = remaining.replace(kw, ' ').trim()
      break
    }
  }

  // Clean remaining text: remove filler words, collapse whitespace
  const cleanedTerms = remaining
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STRIP_WORDS.has(w))

  return { vertical: detectedVertical, region: detectedRegion, cleanedTerms }
}

// ─── Relevance Scoring ────────────────────────────────────

/** Normalize a string for comparison: lowercase, & → and, collapse whitespace */
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[''`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Strip all spaces/hyphens for compressed comparison ("Rippon Lea" → "ripponlea") */
function compress(str) {
  return normalize(str).replace(/[\s\-]/g, '')
}

/**
 * Simple trigram similarity (Dice coefficient on character trigrams).
 * Returns 0–1; higher = more similar.
 */
function trigramSimilarity(a, b) {
  if (!a || !b) return 0
  const ta = trigrams(a.toLowerCase())
  const tb = trigrams(b.toLowerCase())
  if (ta.size === 0 || tb.size === 0) return 0
  let intersection = 0
  for (const t of ta) { if (tb.has(t)) intersection++ }
  return (2 * intersection) / (ta.size + tb.size)
}

function trigrams(str) {
  const s = `  ${str} ` // pad for edge trigrams
  const set = new Set()
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3))
  return set
}

/**
 * Score a listing's relevance to the query.
 *
 * Tier 1 (300): Exact name match — full query matches the listing name
 * Tier 2 (200): Partial name match — query appears within the name or vice versa
 * Tier 2b (150): All search terms appear in the name
 * Tier 3 (50+): Some terms match the name (scaled by how many match)
 * Tier 4 (10): Description/region match only
 *
 * Returns a score ≥ 0. Higher = more relevant.
 */
function scoreRelevance(listing, rawQuery, cleanedTerms) {
  const name = normalize(listing.name)
  const fullQuery = normalize(rawQuery)
  const address = normalize(listing.address)

  // Tier 1: Exact match (full query matches name exactly)
  if (name === fullQuery) return 300

  // Also check cleaned-terms joined (e.g., "lark" after stripping "distillery")
  const cleanedJoined = cleanedTerms.join(' ')
  if (cleanedJoined && name === cleanedJoined) return 300

  // Tier 2: One string contains the other as a substring
  if (fullQuery.length >= 3 && name.includes(fullQuery)) return 200
  if (name.length >= 3 && fullQuery.includes(name)) return 200
  if (cleanedJoined && cleanedJoined.length >= 3 && name.includes(cleanedJoined)) return 200
  if (cleanedJoined && name.length >= 3 && cleanedJoined.includes(name)) return 200

  // Tier 2a: Space-stripped match ("ripponlea" matches "rippon lea estate")
  const compressedQuery = compress(rawQuery)
  const compressedName = compress(listing.name)
  if (compressedQuery.length >= 4 && compressedName.includes(compressedQuery)) return 200
  if (compressedName.length >= 4 && compressedQuery.includes(compressedName)) return 200

  // Tier 2b: All cleaned search terms appear in the name
  if (cleanedTerms.length > 0 && cleanedTerms.every(t => name.includes(t))) return 150

  // Tier 2c: Trigram similarity on name (handles misspellings and word-boundary mismatches)
  const nameSim = trigramSimilarity(fullQuery, name)
  if (nameSim >= 0.45) return 180

  // Tier 2d: Address/suburb match (searching "Elsternwick" matches address containing it)
  if (fullQuery.length >= 3 && address.includes(fullQuery)) return 120
  if (cleanedJoined && cleanedJoined.length >= 3 && address.includes(cleanedJoined)) return 120

  // Tier 3: Some terms match the name (scored by match count)
  if (cleanedTerms.length > 0) {
    const nameMatchCount = cleanedTerms.filter(t => name.includes(t)).length
    if (nameMatchCount > 0) {
      return 50 + (nameMatchCount * 25)
    }
  }

  // Tier 3b: Trigram similarity (lower threshold — partial fuzzy match)
  if (nameSim >= 0.25) return 60

  // Tier 4: Matched on description/region/state/address only
  return 10
}

/**
 * Secondary commercial boost (applied within relevance tiers).
 * Max 3 — never enough to jump a relevance tier (tiers are 50+ apart).
 */
function commercialBoost(listing) {
  return (listing.is_claimed ? 2 : 0) + (listing.is_featured ? 1 : 0)
}

/** Minimum score to include — description-only matches with no name relevance */
const MIN_SCORE_THRESHOLD = 10

// ─── Route Handler ────────────────────────────────────────

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const vertical = searchParams.get('vertical') || null
  const state = searchParams.get('state') || null
  const region = searchParams.get('region') || null
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10), 100)

  const sb = getSupabaseAdmin()

  try {
    // Build base query with explicit filters
    let baseQuery = sb
      .from('listings')
      .select(SELECT_FIELDS, { count: 'exact' })
      .eq('status', 'active')

    if (vertical) baseQuery = baseQuery.eq('vertical', vertical)
    if (state) baseQuery = baseQuery.eq('state', state)
    if (region) baseQuery = baseQuery.eq('region', region)

    // If there's a text query, parse for hints, filter, score, and rank
    if (q && q.trim()) {
      const { vertical: hintVertical, region: hintRegion, cleanedTerms } = parseQueryHints(q)

      // Apply vertical hint if no explicit vertical filter was provided
      if (hintVertical && !vertical) {
        baseQuery = baseQuery.eq('vertical', hintVertical)
      }

      // Apply region hint as ilike filter if no explicit region filter
      if (hintRegion && !region) {
        if (hintRegion.length <= 3 && hintRegion === hintRegion.toUpperCase()) {
          baseQuery = baseQuery.eq('state', hintRegion)
        } else {
          baseQuery = baseQuery.or(
            `region.ilike.%${hintRegion}%,state.ilike.%${hintRegion}%`
          )
        }
      }

      // Apply remaining search terms as ilike filters
      // Each term must appear in at least one field (AND across terms, OR across fields)
      if (cleanedTerms.length > 0) {
        for (const term of cleanedTerms) {
          const pattern = `%${term}%`
          baseQuery = baseQuery.or(
            `name.ilike.${pattern},description.ilike.${pattern},region.ilike.${pattern},state.ilike.${pattern},address.ilike.${pattern}`
          )
        }
      }

      // ── Fetch a generous pool for JS-side scoring (no DB pagination) ──
      // Cap at 500 to keep response snappy; far more than most queries return
      baseQuery = baseQuery.limit(500)

      const { data, error } = await baseQuery

      if (error) {
        console.error('[search] Query error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      let rawResults = data || []

      // ── Fuzzy fallback: if ILIKE returned few results, do a broader query ──
      // This catches queries like "Ripponlea" (no spaces) that fail ILIKE
      // against "Rippon Lea Estate" because "ripponlea" is not a substring.
      if (rawResults.length < 5 && cleanedTerms.length > 0) {
        let fuzzyQuery = sb
          .from('listings')
          .select(SELECT_FIELDS)
          .eq('status', 'active')
          .limit(200)

        if (vertical) fuzzyQuery = fuzzyQuery.eq('vertical', vertical)
        else if (hintVertical) fuzzyQuery = fuzzyQuery.eq('vertical', hintVertical)
        if (state) fuzzyQuery = fuzzyQuery.eq('state', state)

        // Apply region hint if present
        if (hintRegion && !region) {
          if (hintRegion.length <= 3 && hintRegion === hintRegion.toUpperCase()) {
            fuzzyQuery = fuzzyQuery.eq('state', hintRegion)
          } else {
            fuzzyQuery = fuzzyQuery.or(`region.ilike.%${hintRegion}%,state.ilike.%${hintRegion}%`)
          }
        }

        const { data: fuzzyData } = await fuzzyQuery
        if (fuzzyData && fuzzyData.length > 0) {
          // Merge with existing results (deduplicate by id)
          const existingIds = new Set(rawResults.map(r => r.id))
          const newResults = fuzzyData.filter(r => !existingIds.has(r.id))
          rawResults = rawResults.concat(newResults)
        }
      }

      // ── Score and rank ───────────────────────────────────
      const scored = rawResults
        .map(listing => ({
          ...listing,
          _score: scoreRelevance(listing, q, cleanedTerms),
          _boost: commercialBoost(listing),
        }))
        .filter(r => r._score >= MIN_SCORE_THRESHOLD)
        .sort((a, b) => {
          // Primary: relevance score descending
          const scoreDiff = (b._score + b._boost) - (a._score + a._boost)
          if (scoreDiff !== 0) return scoreDiff
          // Tiebreaker: name alphabetical
          return a.name.localeCompare(b.name)
        })

      // ── Paginate the scored results ──────────────────────
      const total = scored.length
      const offset = (page - 1) * limit
      const paged = scored.slice(offset, offset + limit)

      // Strip internal scoring fields before returning
      const listings = paged.map(({ _score, _boost, ...rest }) => rest)

      logSearch(request, { queryText: q, verticalFilter: vertical, resultCount: total })

      return NextResponse.json({
        listings,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      })
    }

    // No text query — standard listing fetch with filters
    const offset = (page - 1) * limit
    baseQuery = baseQuery
      .order('is_claimed', { ascending: false })
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await baseQuery

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Only log filter-based browsing when explicit filters are present
    if (vertical || state || region) {
      logSearch(request, { queryText: vertical || state || region || '', verticalFilter: vertical, resultCount: (data || []).length })
    }

    return NextResponse.json({
      listings: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    })
  } catch (err) {
    console.error('[search] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
