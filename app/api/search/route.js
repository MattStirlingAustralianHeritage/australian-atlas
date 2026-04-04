import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createHash } from 'crypto'

const SELECT_FIELDS = 'id, vertical, name, slug, description, region, state, sub_type, lat, lng, hero_image_url, is_featured, is_claimed, website'

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

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const vertical = searchParams.get('vertical') || null
  const state = searchParams.get('state') || null
  const region = searchParams.get('region') || null
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10), 100)
  const offset = (page - 1) * limit

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

    // If there's a text query, parse for hints and filter
    if (q && q.trim()) {
      const { vertical: hintVertical, region: hintRegion, cleanedTerms } = parseQueryHints(q)

      // Apply vertical hint if no explicit vertical filter was provided
      if (hintVertical && !vertical) {
        baseQuery = baseQuery.eq('vertical', hintVertical)
      }

      // Apply region hint as ilike filter if no explicit region filter
      if (hintRegion && !region) {
        // Could be a state abbreviation or a region name
        if (hintRegion.length <= 3 && hintRegion === hintRegion.toUpperCase()) {
          baseQuery = baseQuery.eq('state', hintRegion)
        } else {
          baseQuery = baseQuery.or(
            `region.ilike.%${hintRegion}%,state.ilike.%${hintRegion}%`
          )
        }
      }

      // Apply remaining search terms as ilike filters (AND across terms, OR across fields per term)
      if (cleanedTerms.length > 0) {
        for (const term of cleanedTerms) {
          const pattern = `%${term}%`
          baseQuery = baseQuery.or(
            `name.ilike.${pattern},description.ilike.${pattern},region.ilike.${pattern},state.ilike.${pattern}`
          )
        }
      }

      // Order by relevance: featured first, then claimed, then name
      baseQuery = baseQuery
        .order('is_featured', { ascending: false })
        .order('is_claimed', { ascending: false })
        .order('name')
        .range(offset, offset + limit - 1)

      const { data, error, count } = await baseQuery

      if (error) {
        console.error('[search] Query error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const listings = data || []
      const total = count || 0

      logSearch(request, { queryText: q, verticalFilter: vertical, resultCount: listings.length })

      return NextResponse.json({
        listings,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      })
    }

    // No text query -- standard listing fetch with filters
    baseQuery = baseQuery
      .order('is_claimed', { ascending: false })
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await baseQuery

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Only log filter-based browsing when explicit filters are present (skip empty browses)
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
