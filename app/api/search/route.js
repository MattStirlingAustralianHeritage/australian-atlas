import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createHash } from 'crypto'
import { LISTING_REGION_SELECT, resolveRegionParam } from '@/lib/regions'

const SELECT_FIELDS = `id, vertical, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, is_claimed, editors_pick, website, address, ${LISTING_REGION_SELECT}`

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

/** Fire-and-forget: record which claimed listings appeared in search results */
function trackSearchAppearances(listings) {
  try {
    const claimedIds = listings.filter(l => l.is_claimed).map(l => l.id)
    if (!claimedIds.length) return
    const sb = getSupabaseAdmin()
    const rows = claimedIds.map(id => ({ listing_id: id }))
    sb.from('listing_search_appearances').insert(rows).then(() => {}).catch(() => {})
  } catch { /* silent */ }
}

// Map natural-language keywords to vertical keys
const VERTICAL_KEYWORDS = {
  sba: ['brewery', 'breweries', 'winery', 'wineries', 'distillery', 'distilleries', 'cidery', 'cideries', 'cellar door', 'wine', 'beer', 'craft beer', 'spirits', 'gin', 'whisky', 'whiskey', 'vermouth', 'cider', 'small batch', 'natural wine'],
  collection: ['museum', 'museums', 'gallery', 'galleries', 'heritage', 'cultural', 'art gallery', 'exhibition'],
  craft: ['chocolate maker', 'chocolate makers', 'maker', 'makers', 'artist', 'artists', 'studio', 'studios', 'pottery', 'ceramics', 'woodwork', 'textiles', 'jewellery', 'jewelry', 'chocolate'],
  fine_grounds: ['coffee', 'cafe', 'cafes', 'roaster', 'roasters', 'espresso', 'specialty coffee'],
  rest: ['stay', 'stays', 'hotel', 'hotels', 'accommodation', 'boutique stay', 'boutique stays', 'glamping', 'farmstay', 'farm stay', 'cottage', 'cottages', 'bnb', 'b&b', 'bed and breakfast', 'lodge', 'lodges', 'eco lodge', 'eco lodges'],
  field: ['swimming hole', 'waterfall', 'waterfalls', 'lookout', 'lookouts', 'hiking', 'hike', 'hikes', 'trail', 'trails', 'nature', 'natural', 'nature walk', 'nature walks', 'bush walk', 'bush walks', 'bushwalk', 'bushwalks', 'walk', 'walks', 'walking track', 'walking tracks', 'outdoor', 'outdoors', 'wildlife', 'wildlife park', 'zoo', 'gorge', 'gorges', 'cave', 'caves', 'hot spring', 'hot springs', 'national park'],
  corner: ['bookshop', 'bookshops', 'book shop', 'record store', 'record stores', 'homewares', 'indie shop', 'indie retail', 'independent shop'],
  found: ['vintage', 'op shop', 'op shops', 'antique', 'antiques', 'secondhand', 'second hand', 'thrift', 'retro', 'market'],
  table: ['farm gate', 'bakery', 'bakeries', 'food producer', 'providore', 'providores', 'butcher', 'cheese maker', 'cheese makers', 'cheese', 'olive oil', 'honey', 'sourdough', 'oyster', 'seafood', 'restaurant', 'restaurants', 'dining', 'cooking school', 'cooking schools'],
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
  'grampians': 'Grampians',
  'surf coast': 'Surf Coast',
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
  // Metro inner suburbs → metro region
  'fitzroy': 'Melbourne',
  'collingwood': 'Melbourne',
  'carlton': 'Melbourne',
  'brunswick': 'Melbourne',
  'richmond': 'Melbourne',
  'south yarra': 'Melbourne',
  'st kilda': 'Melbourne',
  'prahran': 'Melbourne',
  'elsternwick': 'Melbourne',
  'surry hills': 'Sydney',
  'newtown': 'Sydney',
  'paddington': 'Sydney',
  'marrickville': 'Sydney',
  'bondi': 'Sydney',
  'fortitude valley': 'Brisbane',
  'west end': 'Brisbane',
  'new farm': 'Brisbane',
  'leederville': 'Perth',
  'northbridge': 'Perth',
  'mount lawley': 'Perth',
  'newcastle': 'Newcastle',
}

// Words to strip from query after extracting hints (prepositions, filler)
const STRIP_WORDS = new Set(['near', 'in', 'around', 'the', 'a', 'an', 'and', 'or', 'for', 'best', 'top', 'good', 'great'])

// Map state names and common abbreviations to state codes
const STATE_KEYWORDS = {
  'australian capital territory': 'ACT',
  'new south wales': 'NSW',
  'northern territory': 'NT',
  'south australia': 'SA',
  'western australia': 'WA',
  'queensland': 'QLD',
  'victoria': 'VIC',
  'tasmania': 'TAS',
  'tassie': 'TAS',
  'nsw': 'NSW',
  'qld': 'QLD',
  'vic': 'VIC',
  'tas': 'TAS',
}

// Map natural-language attribute phrases to canonical keys
const ATTRIBUTE_KEYWORDS = {
  'wheelchair accessible': 'wheelchair_accessible',
  'family friendly': 'family_friendly',
  'child friendly': 'family_friendly',
  'kid friendly': 'family_friendly',
  'kids friendly': 'family_friendly',
  'for children': 'family_friendly',
  'for families': 'family_friendly',
  'dog friendly': 'dog_friendly',
  'pet friendly': 'dog_friendly',
  'for kids': 'family_friendly',
}

// Synonym phrases for attribute-based description matching (scoring boost)
const ATTRIBUTE_SYNONYMS = {
  family_friendly: ['child friendly', 'kid friendly', 'family friendly', 'children welcome', 'kids welcome', 'family-friendly', 'kid-friendly', 'child-friendly', 'suitable for children', 'suitable for kids', 'suitable for families'],
  dog_friendly: ['dog friendly', 'pet friendly', 'dogs welcome', 'pets welcome', 'dog-friendly', 'pet-friendly', 'dogs allowed'],
  wheelchair_accessible: ['wheelchair accessible', 'wheelchair access', 'disability access', 'wheelchair-accessible', 'disabled access'],
}

/**
 * Parse a natural-language query for vertical, region, state, and attribute hints.
 * Extraction order: attributes → verticals → states → regions (longest match first).
 * Returns { vertical, region, state, attributes, cleanedTerms }.
 */
function parseQueryHints(rawQuery) {
  const lower = rawQuery.toLowerCase().trim()
  let detectedVertical = null
  let detectedRegion = null
  let detectedState = null
  const detectedAttributes = []
  let remaining = lower

  // 1. Extract attribute phrases FIRST (multi-word; longest match first)
  //    "child friendly" must be captured as a unit before single-word extraction
  const attrEntries = Object.entries(ATTRIBUTE_KEYWORDS).sort((a, b) => b[0].length - a[0].length)
  for (const [kw, attrValue] of attrEntries) {
    if (remaining.includes(kw)) {
      if (!detectedAttributes.includes(attrValue)) detectedAttributes.push(attrValue)
      remaining = remaining.replace(kw, ' ').replace(/\s+/g, ' ').trim()
    }
  }

  // 2. Check for vertical keywords (longest match first ACROSS all verticals)
  //    This ensures "cheese makers" (table) beats "makers" (craft).
  const allVerticalPairs = []
  for (const [vKey, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
    for (const kw of keywords) allVerticalPairs.push([kw, vKey])
  }
  allVerticalPairs.sort((a, b) => b[0].length - a[0].length)
  for (const [kw, vKey] of allVerticalPairs) {
    if (remaining.includes(kw)) {
      detectedVertical = vKey
      remaining = remaining.replace(kw, ' ').replace(/\s+/g, ' ').trim()
      break
    }
  }

  // 3. Check for state names (longest match first, word-boundary aware)
  //    Catches "Victoria" → VIC, "New South Wales" → NSW, etc.
  const stateEntries = Object.entries(STATE_KEYWORDS).sort((a, b) => b[0].length - a[0].length)
  for (const [kw, stateCode] of stateEntries) {
    const regex = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`)
    if (regex.test(remaining)) {
      detectedState = stateCode
      remaining = remaining.replace(regex, ' ').replace(/\s+/g, ' ').trim()
      break
    }
  }

  // 4. Check for region keywords (longest match first)
  const regionEntries = Object.entries(REGION_KEYWORDS).sort((a, b) => b[0].length - a[0].length)
  for (const [kw, regionValue] of regionEntries) {
    if (remaining.includes(kw)) {
      detectedRegion = regionValue
      remaining = remaining.replace(kw, ' ').replace(/\s+/g, ' ').trim()
      break
    }
  }

  // Clean remaining text: remove filler words, collapse whitespace
  const cleanedTerms = remaining
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STRIP_WORDS.has(w))

  return { vertical: detectedVertical, region: detectedRegion, state: detectedState, attributes: detectedAttributes, cleanedTerms }
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

  // Decision 2 dual-acceptance: accept slug-shaped or name-shaped ?region= param,
  // resolve internally to a regions row, filter via FK below. No redirect from
  // this API route — URL canonicalisation belongs at the page level.
  const { region: resolvedRegion } = await resolveRegionParam(region)

  try {
    // Build base query with explicit filters
    let baseQuery = sb
      .from('listings')
      .select(SELECT_FIELDS, { count: 'exact' })
      .eq('status', 'active')

    if (vertical) baseQuery = baseQuery.eq('vertical', vertical)
    if (state) baseQuery = baseQuery.eq('state', state)
    if (resolvedRegion) {
      // FK filter via override-or-computed precedence
      baseQuery = baseQuery.or(`region_computed_id.eq.${resolvedRegion.id},region_override_id.eq.${resolvedRegion.id}`)
    } else if (region) {
      // Param supplied but no canonical region matched — fall back to legacy text filter
      // so users searching for unactivated regions (e.g. "Riverina") still see anything tagged with that text
      baseQuery = baseQuery.eq('region', region)
    }

    // If there's a text query, parse for hints, filter, score, and rank
    if (q && q.trim()) {
      const { vertical: hintVertical, region: hintRegion, state: hintState, attributes: hintAttributes, cleanedTerms } = parseQueryHints(q)

      // Apply vertical hint if no explicit vertical filter was provided
      if (hintVertical && !vertical) {
        baseQuery = baseQuery.eq('vertical', hintVertical)
      }

      // Apply state hint if no explicit state filter
      if (hintState && !state) {
        baseQuery = baseQuery.eq('state', hintState)
      }

      // Apply region hint as ilike filter if no explicit region filter
      if (hintRegion && !region) {
        if (hintRegion.length <= 3 && hintRegion === hintRegion.toUpperCase()) {
          // Region mapped to state code (e.g. 'tasmania' → 'TAS')
          if (!state && !hintState) baseQuery = baseQuery.eq('state', hintRegion)
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

      // ── Cross-vertical fallback: if vertical-filtered query returned 0 results ──
      // Retry without the vertical filter so users still see relevant results
      // from other categories (e.g. "boutique accommodation Mornington Peninsula"
      // where no rest listings exist but sba/field listings do).
      if (rawResults.length === 0 && hintVertical && !vertical) {
        let crossQuery = sb
          .from('listings')
          .select(SELECT_FIELDS)
          .eq('status', 'active')
          .limit(500)

        if (hintState) crossQuery = crossQuery.eq('state', hintState)

        if (hintRegion) {
          if (hintRegion.length <= 3 && hintRegion === hintRegion.toUpperCase()) {
            if (!hintState) crossQuery = crossQuery.eq('state', hintRegion)
          } else {
            crossQuery = crossQuery.or(`region.ilike.%${hintRegion}%,state.ilike.%${hintRegion}%`)
          }
        }

        if (cleanedTerms.length > 0) {
          for (const term of cleanedTerms) {
            const pattern = `%${term}%`
            crossQuery = crossQuery.or(
              `name.ilike.${pattern},description.ilike.${pattern},region.ilike.${pattern},state.ilike.${pattern},address.ilike.${pattern}`
            )
          }
        }

        const { data: crossData } = await crossQuery
        if (crossData && crossData.length > 0) {
          rawResults = crossData
        }
      }

      // ── Fuzzy fallback: if ILIKE returned few results, do a broader query ──
      // This catches queries like "Ripponlea" (no spaces) that fail ILIKE
      // against "Rippon Lea Estate" because "ripponlea" is not a substring.
      if (rawResults.length < 5 && cleanedTerms.length > 0) {
        // Strategy 1: Prefix-based fuzzy search on names
        // For each cleaned term, search using the first 5 characters as a prefix
        // so "ripponlea" matches "rippon lea" via ilike %rippo%
        let fuzzyQuery = sb
          .from('listings')
          .select(SELECT_FIELDS)
          .eq('status', 'active')
          .limit(200)

        if (vertical) fuzzyQuery = fuzzyQuery.eq('vertical', vertical)
        else if (hintVertical) fuzzyQuery = fuzzyQuery.eq('vertical', hintVertical)
        if (state) fuzzyQuery = fuzzyQuery.eq('state', state)
        else if (hintState) fuzzyQuery = fuzzyQuery.eq('state', hintState)

        // Apply region hint if present
        if (hintRegion && !region) {
          if (hintRegion.length <= 3 && hintRegion === hintRegion.toUpperCase()) {
            if (!state && !hintState) fuzzyQuery = fuzzyQuery.eq('state', hintRegion)
          } else {
            fuzzyQuery = fuzzyQuery.or(`region.ilike.%${hintRegion}%,state.ilike.%${hintRegion}%`)
          }
        }

        // Build prefix-based OR filter for name matching
        // For "ripponlea" → try "rippo%" prefix AND character-split "%r%i%p%p%o%n%l%e%a%"
        const fuzzyOrParts = []
        for (const term of cleanedTerms) {
          if (term.length >= 4) {
            const prefix = term.slice(0, Math.min(5, term.length))
            fuzzyOrParts.push(`name.ilike.%${prefix}%`)
            // Also try splitting the term into halves with wildcard between
            // "ripponlea" → "%rippon%lea%"
            const mid = Math.floor(term.length / 2)
            const half1 = term.slice(0, mid)
            const half2 = term.slice(mid)
            if (half1.length >= 3 && half2.length >= 3) {
              fuzzyOrParts.push(`name.ilike.%${half1}%${half2}%`)
            }
          }
        }
        if (fuzzyOrParts.length > 0) {
          fuzzyQuery = fuzzyQuery.or(fuzzyOrParts.join(','))
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
        .map(listing => {
          let score = scoreRelevance(listing, q, cleanedTerms)
          // Attribute boost: listings matching detected attributes rank higher
          if (hintAttributes.length > 0) {
            const desc = normalize(listing.description || '')
            for (const attr of hintAttributes) {
              const synonyms = ATTRIBUTE_SYNONYMS[attr] || []
              if (synonyms.some(s => desc.includes(s))) score += 30
            }
          }
          return {
            ...listing,
            _score: score,
            _boost: commercialBoost(listing),
          }
        })
        .filter(r => r._score >= MIN_SCORE_THRESHOLD)
        .sort((a, b) => {
          // Primary: relevance score descending
          const scoreDiff = (b._score + b._boost) - (a._score + a._boost)
          if (scoreDiff !== 0) return scoreDiff
          // Tiebreaker: name alphabetical
          return a.name.localeCompare(b.name)
        })

      // ── Quality cap: trim low-relevance tail when many results ──
      let qualityResults = scored
      if (qualityResults.length > 60) {
        for (const threshold of [150, 100, 50, 25]) {
          const above = qualityResults.filter(r => (r._score + r._boost) >= threshold)
          if (above.length >= 12) {
            qualityResults = above
            break
          }
        }
      }

      // ── Paginate the scored results ──────────────────────
      const total = qualityResults.length
      const offset = (page - 1) * limit
      const paged = qualityResults.slice(offset, offset + limit)

      // Strip internal scoring fields before returning
      const listings = paged.map(({ _score, _boost, ...rest }) => rest)

      trackSearchAppearances(listings)
      logSearch(request, { queryText: q, verticalFilter: vertical, resultCount: total })

      return NextResponse.json({
        listings,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        detectedState: hintState || null,
        detectedVertical: hintVertical || null,
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

    trackSearchAppearances(data || [])

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
