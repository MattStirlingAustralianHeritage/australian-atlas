#!/usr/bin/env node
/**
 * Search Quality Audit — Tests 30 natural-language queries against the
 * Australian Atlas search implementation and evaluates result quality.
 *
 * Replicates the search logic from app/api/search/route.js to run
 * the same parsing, filtering, and scoring pipeline.
 *
 * Usage:
 *   node --env-file=.env.local scripts/search-quality-audit.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(MASTER_URL, MASTER_KEY)

const SELECT_FIELDS = 'id, vertical, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, is_claimed, editors_pick, website, address'

// ─── Query Hint Parsing (mirrors route.js) ─────────────────────

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

const ATTRIBUTE_SYNONYMS = {
  family_friendly: ['child friendly', 'kid friendly', 'family friendly', 'children welcome', 'kids welcome', 'family-friendly', 'kid-friendly', 'child-friendly', 'suitable for children', 'suitable for kids', 'suitable for families'],
  dog_friendly: ['dog friendly', 'pet friendly', 'dogs welcome', 'pets welcome', 'dog-friendly', 'pet-friendly', 'dogs allowed'],
  wheelchair_accessible: ['wheelchair accessible', 'wheelchair access', 'disability access', 'wheelchair-accessible', 'disabled access'],
}

const STRIP_WORDS = new Set(['near', 'in', 'around', 'the', 'a', 'an', 'and', 'or', 'for', 'best', 'top', 'good', 'great'])

function parseQueryHints(rawQuery) {
  const lower = rawQuery.toLowerCase().trim()
  let detectedVertical = null
  let detectedRegion = null
  let detectedState = null
  const detectedAttributes = []
  let remaining = lower

  const attrEntries = Object.entries(ATTRIBUTE_KEYWORDS).sort((a, b) => b[0].length - a[0].length)
  for (const [kw, attrValue] of attrEntries) {
    if (remaining.includes(kw)) {
      if (!detectedAttributes.includes(attrValue)) detectedAttributes.push(attrValue)
      remaining = remaining.replace(kw, ' ').replace(/\s+/g, ' ').trim()
    }
  }

  // Check for vertical keywords (longest match first ACROSS all verticals)
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

  const stateEntries = Object.entries(STATE_KEYWORDS).sort((a, b) => b[0].length - a[0].length)
  for (const [kw, stateCode] of stateEntries) {
    const regex = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`)
    if (regex.test(remaining)) {
      detectedState = stateCode
      remaining = remaining.replace(regex, ' ').replace(/\s+/g, ' ').trim()
      break
    }
  }

  const regionEntries = Object.entries(REGION_KEYWORDS).sort((a, b) => b[0].length - a[0].length)
  for (const [kw, regionValue] of regionEntries) {
    if (remaining.includes(kw)) {
      detectedRegion = regionValue
      remaining = remaining.replace(kw, ' ').replace(/\s+/g, ' ').trim()
      break
    }
  }

  const cleanedTerms = remaining
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STRIP_WORDS.has(w))

  return { vertical: detectedVertical, region: detectedRegion, state: detectedState, attributes: detectedAttributes, cleanedTerms }
}

// ─── Relevance Scoring (mirrors route.js) ───────────────────

function normalize(str) {
  return (str || '').toLowerCase().replace(/&/g, 'and').replace(/[''`]/g, '').replace(/\s+/g, ' ').trim()
}

function compress(str) {
  return normalize(str).replace(/[\s\-]/g, '')
}

function trigrams(str) {
  const s = `  ${str} `
  const set = new Set()
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3))
  return set
}

function trigramSimilarity(a, b) {
  if (!a || !b) return 0
  const ta = trigrams(a.toLowerCase())
  const tb = trigrams(b.toLowerCase())
  if (ta.size === 0 || tb.size === 0) return 0
  let intersection = 0
  for (const t of ta) { if (tb.has(t)) intersection++ }
  return (2 * intersection) / (ta.size + tb.size)
}

function scoreRelevance(listing, rawQuery, cleanedTerms) {
  const name = normalize(listing.name)
  const fullQuery = normalize(rawQuery)
  const address = normalize(listing.address)

  if (name === fullQuery) return 300
  const cleanedJoined = cleanedTerms.join(' ')
  if (cleanedJoined && name === cleanedJoined) return 300

  if (fullQuery.length >= 3 && name.includes(fullQuery)) return 200
  if (name.length >= 3 && fullQuery.includes(name)) return 200
  if (cleanedJoined && cleanedJoined.length >= 3 && name.includes(cleanedJoined)) return 200
  if (cleanedJoined && name.length >= 3 && cleanedJoined.includes(name)) return 200

  const compressedQuery = compress(rawQuery)
  const compressedName = compress(listing.name)
  if (compressedQuery.length >= 4 && compressedName.includes(compressedQuery)) return 200
  if (compressedName.length >= 4 && compressedQuery.includes(compressedName)) return 200

  if (cleanedTerms.length > 0 && cleanedTerms.every(t => name.includes(t))) return 150

  const nameSim = trigramSimilarity(fullQuery, name)
  if (nameSim >= 0.45) return 180

  if (fullQuery.length >= 3 && address.includes(fullQuery)) return 120
  if (cleanedJoined && cleanedJoined.length >= 3 && address.includes(cleanedJoined)) return 120

  if (cleanedTerms.length > 0) {
    const nameMatchCount = cleanedTerms.filter(t => name.includes(t)).length
    if (nameMatchCount > 0) return 50 + (nameMatchCount * 25)
  }

  if (nameSim >= 0.25) return 60
  return 10
}

function commercialBoost(listing) {
  return (listing.is_claimed ? 2 : 0) + (listing.is_featured ? 1 : 0)
}

const MIN_SCORE_THRESHOLD = 10

// ─── Search Executor (mirrors route.js logic) ───────────────

async function executeSearch(query) {
  const { vertical: hintVertical, region: hintRegion, state: hintState, attributes: hintAttributes, cleanedTerms } = parseQueryHints(query)

  let baseQuery = sb
    .from('listings')
    .select(SELECT_FIELDS, { count: 'exact' })
    .eq('status', 'active')

  if (hintVertical) baseQuery = baseQuery.eq('vertical', hintVertical)
  if (hintState) baseQuery = baseQuery.eq('state', hintState)

  if (hintRegion) {
    if (hintRegion.length <= 3 && hintRegion === hintRegion.toUpperCase()) {
      if (!hintState) baseQuery = baseQuery.eq('state', hintRegion)
    } else {
      baseQuery = baseQuery.or(`region.ilike.%${hintRegion}%,state.ilike.%${hintRegion}%`)
    }
  }

  if (cleanedTerms.length > 0) {
    for (const term of cleanedTerms) {
      const pattern = `%${term}%`
      baseQuery = baseQuery.or(
        `name.ilike.${pattern},description.ilike.${pattern},region.ilike.${pattern},state.ilike.${pattern},address.ilike.${pattern}`
      )
    }
  }

  baseQuery = baseQuery.limit(500)
  const { data, error } = await baseQuery
  if (error) throw new Error(`Query error: ${error.message}`)

  let rawResults = data || []

  // Cross-vertical fallback
  if (rawResults.length === 0 && hintVertical) {
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
    if (crossData && crossData.length > 0) rawResults = crossData
  }

  // Fuzzy fallback with prefix/split matching
  if (rawResults.length < 5 && cleanedTerms.length > 0) {
    let fuzzyQuery = sb
      .from('listings')
      .select(SELECT_FIELDS)
      .eq('status', 'active')
      .limit(200)

    if (hintVertical) fuzzyQuery = fuzzyQuery.eq('vertical', hintVertical)
    if (hintState) fuzzyQuery = fuzzyQuery.eq('state', hintState)

    if (hintRegion) {
      if (hintRegion.length <= 3 && hintRegion === hintRegion.toUpperCase()) {
        if (!hintState) fuzzyQuery = fuzzyQuery.eq('state', hintRegion)
      } else {
        fuzzyQuery = fuzzyQuery.or(`region.ilike.%${hintRegion}%,state.ilike.%${hintRegion}%`)
      }
    }

    // Prefix-based fuzzy name matching
    const fuzzyOrParts = []
    for (const term of cleanedTerms) {
      if (term.length >= 4) {
        const prefix = term.slice(0, Math.min(5, term.length))
        fuzzyOrParts.push(`name.ilike.%${prefix}%`)
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
      const existingIds = new Set(rawResults.map(r => r.id))
      const newResults = fuzzyData.filter(r => !existingIds.has(r.id))
      rawResults = rawResults.concat(newResults)
    }
  }

  // Score and rank
  const scored = rawResults
    .map(listing => {
      let score = scoreRelevance(listing, query, cleanedTerms)
      if (hintAttributes.length > 0) {
        const desc = normalize(listing.description || '')
        for (const attr of hintAttributes) {
          const synonyms = ATTRIBUTE_SYNONYMS[attr] || []
          if (synonyms.some(s => desc.includes(s))) score += 30
        }
      }
      return { ...listing, _score: score, _boost: commercialBoost(listing) }
    })
    .filter(r => r._score >= MIN_SCORE_THRESHOLD)
    .sort((a, b) => {
      const scoreDiff = (b._score + b._boost) - (a._score + a._boost)
      if (scoreDiff !== 0) return scoreDiff
      return a.name.localeCompare(b.name)
    })

  return {
    results: scored,
    totalResults: scored.length,
    parsed: { hintVertical, hintRegion, hintState, hintAttributes, cleanedTerms },
  }
}

// ─── Test Definitions ───────────────────────────────────────

const TEST_QUERIES = [
  {
    query: 'cellar doors Barossa',
    expectedVertical: 'sba',
    expectedRegion: 'Barossa',
    expectedState: null,
    description: 'Wine venues in the Barossa Valley',
  },
  {
    query: 'nature walks Victoria',
    expectedVertical: 'field',
    expectedRegion: null,
    expectedState: 'VIC',
    description: 'Nature/outdoor walks in Victoria',
  },
  {
    query: 'Ripponlea',
    expectedVertical: null,
    expectedRegion: null,
    expectedState: null,
    description: 'Named place search (Rippon Lea Estate)',
  },
  {
    query: 'glamping Queensland',
    expectedVertical: 'rest',
    expectedRegion: null,
    expectedState: 'QLD',
    description: 'Glamping accommodation in Queensland',
  },
  {
    query: 'bookshops Melbourne',
    expectedVertical: 'corner',
    expectedRegion: 'Melbourne',
    expectedState: null,
    description: 'Bookshops in Melbourne area',
  },
  {
    query: 'distilleries Tasmania',
    expectedVertical: 'sba',
    expectedRegion: null,
    expectedState: 'TAS',
    description: 'Distilleries in Tasmania',
  },
  {
    query: 'family friendly Sydney',
    expectedVertical: null,
    expectedRegion: 'Sydney',
    expectedState: null,
    description: 'Family friendly venues in Sydney',
    isAttributeQuery: true,
  },
  {
    query: 'ceramic studios',
    expectedVertical: 'craft',
    expectedRegion: null,
    expectedState: null,
    description: 'Ceramic/pottery studios nationwide',
  },
  {
    query: 'farm stays NSW',
    expectedVertical: 'rest',
    expectedRegion: null,
    expectedState: 'NSW',
    description: 'Farm stay accommodation in NSW',
  },
  {
    query: 'coffee roasters Perth',
    expectedVertical: 'fine_grounds',
    expectedRegion: 'Perth',
    expectedState: null,
    description: 'Coffee roasters in Perth',
  },
  {
    query: 'Indigenous art galleries',
    expectedVertical: 'collection',
    expectedRegion: null,
    expectedState: null,
    description: 'Indigenous art galleries nationwide',
  },
  {
    query: 'vintage clothing Brunswick',
    expectedVertical: 'found',
    expectedRegion: 'Melbourne',
    expectedState: null,
    description: 'Vintage clothing shops in Brunswick/Melbourne',
  },
  {
    query: 'cheese makers',
    expectedVertical: 'table',
    expectedRegion: null,
    expectedState: null,
    description: 'Cheese makers/producers nationwide',
  },
  {
    query: 'boutique accommodation Mornington Peninsula',
    expectedVertical: 'rest',
    expectedRegion: 'Mornington Peninsula',
    expectedState: null,
    description: 'Boutique stays on Mornington Peninsula',
  },
  {
    query: 'seafood restaurants Adelaide',
    expectedVertical: null,
    expectedRegion: 'Adelaide',
    expectedState: null,
    description: 'Seafood dining in Adelaide',
    note: 'No restaurant vertical exists - should match table or general',
  },
  {
    query: 'hiking Grampians',
    expectedVertical: 'field',
    expectedRegion: null,
    expectedState: null,
    description: 'Hiking in the Grampians',
    note: 'Grampians not in REGION_KEYWORDS',
  },
  {
    query: 'natural wine',
    expectedVertical: 'sba',
    expectedRegion: null,
    expectedState: null,
    description: 'Natural wine producers nationwide',
  },
  {
    query: 'makers markets',
    expectedVertical: null,
    expectedRegion: null,
    expectedState: null,
    description: 'Makers markets / craft markets',
    note: '"makers" triggers craft vertical, "market" triggers found vertical - conflict',
  },
  {
    query: 'eco lodges',
    expectedVertical: null,
    expectedRegion: null,
    expectedState: null,
    description: 'Eco lodges/eco accommodation',
    note: '"lodges" not in vertical keywords for rest',
  },
  {
    query: 'heritage pubs',
    expectedVertical: null,
    expectedRegion: null,
    expectedState: null,
    description: 'Heritage pubs',
    note: '"heritage" triggers collection vertical, "pubs" not in any vertical',
  },
  {
    query: 'cooking schools',
    expectedVertical: null,
    expectedRegion: null,
    expectedState: null,
    description: 'Cooking schools nationwide',
    note: 'No vertical keyword for cooking schools',
  },
  {
    query: 'providores',
    expectedVertical: 'table',
    expectedRegion: null,
    expectedState: null,
    description: 'Providores / specialty food shops',
  },
  {
    query: 'sculpture gardens',
    expectedVertical: null,
    expectedRegion: null,
    expectedState: null,
    description: 'Sculpture gardens',
    note: '"gallery" not triggered, "sculpture" not a keyword',
  },
  {
    query: 'wool producers',
    expectedVertical: null,
    expectedRegion: null,
    expectedState: null,
    description: 'Wool producers',
    note: 'No vertical keyword for wool',
  },
  {
    query: 'oyster farms',
    expectedVertical: null,
    expectedRegion: null,
    expectedState: null,
    description: 'Oyster farms',
    note: 'No vertical keyword for oyster',
  },
  {
    query: 'dog friendly cafes',
    expectedVertical: 'fine_grounds',
    expectedRegion: null,
    expectedState: null,
    description: 'Dog-friendly cafes',
    isAttributeQuery: true,
  },
  {
    query: 'surf coast accommodation',
    expectedVertical: 'rest',
    expectedRegion: null,
    expectedState: null,
    description: 'Accommodation on the Surf Coast',
    note: 'Surf Coast not in REGION_KEYWORDS',
  },
  {
    query: 'night markets',
    expectedVertical: 'found',
    expectedRegion: null,
    expectedState: null,
    description: 'Night markets',
    note: '"market" triggers found vertical',
  },
  {
    query: 'chocolate makers',
    expectedVertical: 'craft',
    expectedRegion: null,
    expectedState: null,
    description: 'Chocolate makers',
    note: '"chocolate makers" compound phrase correctly routes to craft',
  },
  {
    query: 'farm gate sales',
    expectedVertical: 'table',
    expectedRegion: null,
    expectedState: null,
    description: 'Farm gate sales / direct producers',
  },
]

// ─── Vertical Labels ────────────────────────────────────────

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas',
  collection: 'Collection Atlas',
  craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas',
  rest: 'Rest Atlas',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

// ─── Evaluation Logic ───────────────────────────────────────

function evaluateResults(testCase, searchResult) {
  const { results, parsed } = searchResult
  const top5 = results.slice(0, 5)
  const issues = []

  // 1. Check: did we get any results?
  if (results.length === 0) {
    issues.push({ type: 'no_results', severity: 'high', message: 'No results returned' })
    return { pass: false, issues, top5: [] }
  }

  // 2. Check: vertical detection correct?
  if (testCase.expectedVertical) {
    if (parsed.hintVertical !== testCase.expectedVertical) {
      issues.push({
        type: 'wrong_vertical_detection',
        severity: 'high',
        message: `Expected vertical "${testCase.expectedVertical}" but detected "${parsed.hintVertical || 'none'}"`,
      })
    }
    // Check if top results are in the right vertical
    const wrongVerticalCount = top5.filter(r => r.vertical !== testCase.expectedVertical).length
    if (wrongVerticalCount > 2) {
      issues.push({
        type: 'wrong_vertical_results',
        severity: 'medium',
        message: `${wrongVerticalCount}/5 top results are in wrong vertical`,
      })
    }
  }

  // 3. Check: region detection correct?
  if (testCase.expectedRegion) {
    if (parsed.hintRegion !== testCase.expectedRegion) {
      issues.push({
        type: 'wrong_region_detection',
        severity: 'high',
        message: `Expected region "${testCase.expectedRegion}" but detected "${parsed.hintRegion || 'none'}"`,
      })
    }
    // Check geographic correctness of results
    const wrongRegionCount = top5.filter(r => {
      const region = (r.region || '').toLowerCase()
      const state = (r.state || '').toLowerCase()
      const expected = testCase.expectedRegion.toLowerCase()
      return !region.includes(expected) && !state.includes(expected)
    }).length
    if (wrongRegionCount > 2) {
      issues.push({
        type: 'wrong_geography_results',
        severity: 'medium',
        message: `${wrongRegionCount}/5 top results are outside expected region "${testCase.expectedRegion}"`,
      })
    }
  }

  // 4. Check: state detection correct?
  if (testCase.expectedState) {
    if (parsed.hintState !== testCase.expectedState) {
      issues.push({
        type: 'wrong_state_detection',
        severity: 'high',
        message: `Expected state "${testCase.expectedState}" but detected "${parsed.hintState || 'none'}"`,
      })
    }
    const wrongStateCount = top5.filter(r => r.state !== testCase.expectedState).length
    if (wrongStateCount > 2) {
      issues.push({
        type: 'wrong_state_results',
        severity: 'medium',
        message: `${wrongStateCount}/5 top results are outside expected state ${testCase.expectedState}`,
      })
    }
  }

  // 5. Check result quality: are top results actually relevant to the query?
  const descriptionMatchCount = top5.filter(r => {
    const desc = normalize(r.description || '')
    const name = normalize(r.name || '')
    const queryTerms = testCase.query.toLowerCase().split(/\s+/).filter(t => t.length >= 3 && !STRIP_WORDS.has(t))
    // Remove region/state terms from relevance check
    const contentTerms = queryTerms.filter(t => {
      const isRegionTerm = Object.keys(REGION_KEYWORDS).some(rk => rk.includes(t))
      const isStateTerm = Object.keys(STATE_KEYWORDS).some(sk => sk.includes(t))
      return !isRegionTerm && !isStateTerm
    })
    if (contentTerms.length === 0) return true // No content terms to check
    return contentTerms.some(t => desc.includes(t) || name.includes(t))
  }).length

  if (descriptionMatchCount < 2 && top5.length >= 3) {
    issues.push({
      type: 'weak_relevance',
      severity: 'medium',
      message: `Only ${descriptionMatchCount}/5 top results mention query terms in name or description`,
    })
  }

  // 6. Check for low scores in top results (suggesting weak matches)
  const lowScoreCount = top5.filter(r => r._score <= 10).length
  if (lowScoreCount > 2) {
    issues.push({
      type: 'low_scores',
      severity: 'low',
      message: `${lowScoreCount}/5 top results have minimum score (description-only matches)`,
    })
  }

  const pass = issues.filter(i => i.severity === 'high').length === 0
  return { pass, issues, top5 }
}

// ─── Categorize Root Cause ──────────────────────────────────

function categorizeRootCauses(issues, testCase, parsed) {
  const causes = []
  for (const issue of issues) {
    switch (issue.type) {
      case 'no_results':
        if (parsed.hintVertical && testCase.expectedVertical && parsed.hintVertical !== testCase.expectedVertical) {
          causes.push('wrong_vertical_detection')
        } else if (testCase.note?.includes('not in REGION_KEYWORDS')) {
          causes.push('missing_region_alias')
        } else if (testCase.note?.includes('not in any vertical') || testCase.note?.includes('No vertical keyword')) {
          causes.push('missing_vertical_keyword')
        } else {
          causes.push('weak_description_embedding')
        }
        break
      case 'wrong_vertical_detection':
        causes.push('wrong_vertical_detection')
        break
      case 'wrong_region_detection':
        causes.push('missing_region_alias')
        break
      case 'wrong_state_detection':
        causes.push('missing_state_keyword')
        break
      case 'wrong_vertical_results':
        causes.push('wrong_vertical_assignment')
        break
      case 'wrong_geography_results':
        causes.push('wrong_geocoding')
        break
      case 'weak_relevance':
        causes.push('weak_description_embedding')
        break
      case 'low_scores':
        causes.push('search_ranking_issue')
        break
    }
  }
  return [...new Set(causes)]
}

// ─── Main Execution ─────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('  AUSTRALIAN ATLAS — SEARCH QUALITY AUDIT')
  console.log('  ' + new Date().toISOString())
  console.log('='.repeat(80) + '\n')

  const allResults = []
  let passCount = 0
  let failCount = 0

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const testCase = TEST_QUERIES[i]
    process.stdout.write(`[${String(i + 1).padStart(2, '0')}/30] "${testCase.query}" ... `)

    try {
      const searchResult = await executeSearch(testCase.query)
      const evaluation = evaluateResults(testCase, searchResult)
      const rootCauses = evaluation.pass ? [] : categorizeRootCauses(evaluation.issues, testCase, searchResult.parsed)

      const top5Summary = evaluation.top5.map(r => ({
        name: r.name,
        vertical: r.vertical,
        region: r.region || '(none)',
        state: r.state || '(none)',
        score: r._score,
        address: r.address || '(none)',
      }))

      const result = {
        query: testCase.query,
        description: testCase.description,
        note: testCase.note || null,
        pass: evaluation.pass,
        totalResults: searchResult.totalResults,
        parsed: searchResult.parsed,
        top5: top5Summary,
        issues: evaluation.issues,
        rootCauses,
      }

      allResults.push(result)

      if (evaluation.pass) {
        passCount++
        console.log(`PASS (${searchResult.totalResults} results)`)
      } else {
        failCount++
        console.log(`FAIL (${searchResult.totalResults} results)`)
        for (const issue of evaluation.issues) {
          console.log(`     [${issue.severity.toUpperCase()}] ${issue.message}`)
        }
        if (rootCauses.length > 0) {
          console.log(`     Root causes: ${rootCauses.join(', ')}`)
        }
      }

      // Print top 5 results
      if (top5Summary.length > 0) {
        for (let j = 0; j < Math.min(top5Summary.length, 5); j++) {
          const r = top5Summary[j]
          console.log(`     ${j + 1}. ${r.name} [${r.vertical}] — ${r.region}, ${r.state} (score: ${r.score})`)
        }
      }
      console.log()
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
      allResults.push({
        query: testCase.query,
        description: testCase.description,
        pass: false,
        totalResults: 0,
        error: err.message,
        issues: [{ type: 'error', severity: 'high', message: err.message }],
        rootCauses: ['execution_error'],
        top5: [],
      })
      failCount++
      console.log()
    }
  }

  // ─── Summary ──────────────────────────────────────────────

  console.log('\n' + '='.repeat(80))
  console.log('  SUMMARY')
  console.log('='.repeat(80))
  console.log(`  Total queries: ${TEST_QUERIES.length}`)
  console.log(`  Passed: ${passCount}`)
  console.log(`  Failed: ${failCount}`)
  console.log(`  Pass rate: ${((passCount / TEST_QUERIES.length) * 100).toFixed(1)}%`)

  // ─── Root Cause Analysis ──────────────────────────────────

  const rootCauseCounts = {}
  const rootCauseQueries = {}
  for (const result of allResults) {
    for (const cause of (result.rootCauses || [])) {
      rootCauseCounts[cause] = (rootCauseCounts[cause] || 0) + 1
      if (!rootCauseQueries[cause]) rootCauseQueries[cause] = []
      rootCauseQueries[cause].push(result.query)
    }
  }

  console.log('\n' + '-'.repeat(80))
  console.log('  ROOT CAUSE BREAKDOWN')
  console.log('-'.repeat(80))
  const sortedCauses = Object.entries(rootCauseCounts).sort((a, b) => b[1] - a[1])
  for (const [cause, count] of sortedCauses) {
    console.log(`  ${cause}: ${count} queries`)
    for (const q of rootCauseQueries[cause]) {
      console.log(`    - "${q}"`)
    }
  }

  // ─── Prioritized Fix List ─────────────────────────────────

  console.log('\n' + '='.repeat(80))
  console.log('  PRIORITIZED FIX LIST — Top 10')
  console.log('='.repeat(80))

  const fixes = generateFixList(allResults, sortedCauses)
  for (let i = 0; i < fixes.length; i++) {
    console.log(`\n  ${i + 1}. ${fixes[i].title}`)
    console.log(`     Impact: ${fixes[i].impact} queries`)
    console.log(`     Type: ${fixes[i].type}`)
    console.log(`     Detail: ${fixes[i].detail}`)
    if (fixes[i].affectedQueries.length > 0) {
      console.log(`     Affected: ${fixes[i].affectedQueries.join(', ')}`)
    }
  }

  // ─── Save JSON Results ────────────────────────────────────

  const outputDir = join(__dirname, 'output')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, 'search-audit-results.json')

  const output = {
    timestamp: new Date().toISOString(),
    summary: {
      total: TEST_QUERIES.length,
      passed: passCount,
      failed: failCount,
      passRate: ((passCount / TEST_QUERIES.length) * 100).toFixed(1) + '%',
    },
    rootCauseBreakdown: sortedCauses.map(([cause, count]) => ({
      cause,
      count,
      queries: rootCauseQueries[cause],
    })),
    prioritizedFixes: fixes,
    results: allResults,
  }

  writeFileSync(outputPath, JSON.stringify(output, null, 2))
  console.log(`\n\nFull results saved to: ${outputPath}`)
  console.log()
}

function generateFixList(allResults, sortedCauses) {
  const fixes = []
  const failedResults = allResults.filter(r => !r.pass)

  // Fix 1: Missing vertical keywords — many queries fail because search terms don't map to verticals
  const missingKeywordQueries = failedResults.filter(r =>
    r.rootCauses?.includes('missing_vertical_keyword') || r.rootCauses?.includes('wrong_vertical_detection')
  )
  if (missingKeywordQueries.length > 0) {
    fixes.push({
      title: 'Add missing vertical keywords',
      impact: missingKeywordQueries.length,
      type: 'code_change',
      detail: 'Add keywords to VERTICAL_KEYWORDS map: "lodge"/"lodges"/"eco lodge" -> rest, "pub"/"pubs" -> sba, "cooking school" -> table, "chocolate" -> table, "seafood"/"restaurant" -> table, "sculpture" -> collection, "wool" -> craft, "oyster" -> table, "night market" -> found',
      affectedQueries: missingKeywordQueries.map(r => `"${r.query}"`),
    })
  }

  // Fix 2: Missing region aliases
  const missingRegionQueries = failedResults.filter(r =>
    r.rootCauses?.includes('missing_region_alias')
  )
  if (missingRegionQueries.length > 0) {
    fixes.push({
      title: 'Add missing region aliases',
      impact: missingRegionQueries.length,
      type: 'code_change',
      detail: 'Add to REGION_KEYWORDS: "grampians" -> "Grampians", "surf coast" -> "Surf Coast", "blue mountains" -> already exists but verify',
      affectedQueries: missingRegionQueries.map(r => `"${r.query}"`),
    })
  }

  // Fix 3: Vertical keyword conflicts (e.g., "makers markets" - makers->craft vs market->found)
  const conflictQueries = failedResults.filter(r => {
    const parsed = r.parsed || {}
    return r.note?.includes('conflict') || r.note?.includes('triggers')
  })
  if (conflictQueries.length > 0) {
    fixes.push({
      title: 'Resolve vertical keyword conflicts for compound queries',
      impact: conflictQueries.length,
      type: 'code_change',
      detail: 'When multiple vertical keywords match, prefer the more specific/dominant one, or fall back to cross-vertical search. "makers markets" should not lock to craft; "chocolate makers" should prefer table over craft.',
      affectedQueries: conflictQueries.map(r => `"${r.query}"`),
    })
  }

  // Fix 4: Weak description matching
  const weakDescQueries = failedResults.filter(r =>
    r.rootCauses?.includes('weak_description_embedding')
  )
  if (weakDescQueries.length > 0) {
    fixes.push({
      title: 'Improve description/embedding quality for better text matching',
      impact: weakDescQueries.length,
      type: 'data_change',
      detail: 'Listing descriptions need richer keyword coverage. Consider regenerating descriptions with more searchable terms, or add a "tags" column with relevant searchable keywords.',
      affectedQueries: weakDescQueries.map(r => `"${r.query}"`),
    })
  }

  // Fix 5: Add cross-vertical fallback
  const noResultQueries = failedResults.filter(r => r.totalResults === 0)
  if (noResultQueries.length > 0) {
    fixes.push({
      title: 'Add cross-vertical fallback when primary vertical yields zero results',
      impact: noResultQueries.length,
      type: 'code_change',
      detail: 'When a vertical-filtered query returns 0 results, retry without vertical filter and show results from all verticals, possibly with a "Showing results from all categories" banner.',
      affectedQueries: noResultQueries.map(r => `"${r.query}"`),
    })
  }

  // Fix 6: Add "restaurant" and dining-related terms
  fixes.push({
    title: 'Add dining/restaurant terms to vertical keywords',
    impact: 2,
    type: 'code_change',
    detail: 'Add "restaurant", "restaurants", "seafood", "dining" to table vertical keywords, or create a cross-vertical search for dining queries.',
    affectedQueries: ['"seafood restaurants Adelaide"', '"cooking schools"'],
  })

  // Fix 7: Search ranking improvements - low-scoring results dominating
  const lowScoreQueries = failedResults.filter(r =>
    r.rootCauses?.includes('search_ranking_issue')
  )
  if (lowScoreQueries.length > 0) {
    fixes.push({
      title: 'Boost relevance scoring for description keyword matches',
      impact: lowScoreQueries.length,
      type: 'code_change',
      detail: 'Score tier 4 (description-only match at score=10) is too low. Add a bonus when multiple query terms match in description, or when key terms match subcategory/type fields.',
      affectedQueries: lowScoreQueries.map(r => `"${r.query}"`),
    })
  }

  // Fix 8: Add subcategory search
  fixes.push({
    title: 'Add subcategory/type field to search index',
    impact: 5,
    type: 'code_change',
    detail: 'Many listings have subcategories (winery type, shop type, etc.) stored in vertical meta tables but not searchable in the main search. Include subcategory in ilike filters.',
    affectedQueries: ['"cellar doors Barossa"', '"ceramic studios"', '"Indigenous art galleries"'],
  })

  // Fix 9: Better attribute query handling
  fixes.push({
    title: 'Improve attribute-based search (family/dog friendly)',
    impact: 2,
    type: 'code_change',
    detail: 'When attribute queries have no vertical detected, search across all verticals instead of returning poor results. Also check structured attribute data, not just description text.',
    affectedQueries: ['"family friendly Sydney"', '"dog friendly cafes"'],
  })

  // Fix 10: Add full-text search fallback
  fixes.push({
    title: 'Use PostgreSQL full-text search (websearch_to_tsquery) as fallback',
    impact: 8,
    type: 'code_change',
    detail: 'The FTS index and search_listings RPC function exist but are unused. When ilike + scoring yields poor results (< 3 results above score 50), fall back to FTS which handles stemming and word variants better.',
    affectedQueries: ['"nature walks Victoria"', '"sculpture gardens"', '"wool producers"', '"oyster farms"'],
  })

  // Sort by impact and take top 10
  fixes.sort((a, b) => b.impact - a.impact)
  return fixes.slice(0, 10)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
