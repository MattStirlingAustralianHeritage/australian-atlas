import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// Map natural-language category hints to vertical keys
const CATEGORY_KEYWORDS = {
  sba: ['wine', 'winery', 'wineries', 'vineyard', 'vineyards', 'brewery', 'breweries', 'distillery', 'distilleries', 'cellar door', 'gin', 'whisky', 'cider', 'craft beer', 'natural wine', 'spirits', 'drink', 'drinks', 'small batch', 'tasting'],
  fine_grounds: ['coffee', 'cafe', 'cafes', 'roaster', 'espresso'],
  rest: ['accommodation', 'stay', 'stays', 'hotel', 'hotels', 'glamping', 'farmstay', 'cottage', 'boutique stay', 'bnb', 'b&b', 'bed and breakfast', 'sleep'],
  collection: ['art', 'gallery', 'galleries', 'museum', 'museums', 'heritage', 'cultural', 'exhibition'],
  craft: ['maker', 'makers', 'studio', 'studios', 'pottery', 'ceramics', 'woodwork', 'textiles', 'jewellery'],
  field: ['nature', 'hiking', 'waterfall', 'swimming hole', 'lookout', 'walking', 'outdoor', 'national park'],
  corner: ['shop', 'shops', 'bookshop', 'record store', 'homewares', 'indie'],
  found: ['vintage', 'op shop', 'antique', 'antiques', 'secondhand', 'thrift', 'retro'],
  table: ['food', 'bakery', 'farm gate', 'providore', 'cheese', 'olive oil', 'produce', 'sourdough'],
}

// Geographic anchors: center coordinates + bounding radius for all known regions/cities.
// This is the ONLY source of geographic filtering — no text-matching on listing.region.
// radiusDeg is in degrees (~111km per degree latitude).
const GEO_ANCHORS = {
  // Wine/food regions
  'Barossa':                { lat: -34.56, lng: 138.95, r: 0.35 },
  'Yarra Valley':           { lat: -37.73, lng: 145.51, r: 0.35 },
  'Mornington Peninsula':   { lat: -38.37, lng: 145.03, r: 0.30 },
  'Blue Mountains':         { lat: -33.72, lng: 150.31, r: 0.35 },
  'Byron':                  { lat: -28.64, lng: 153.61, r: 0.30 },
  'Adelaide Hills':         { lat: -35.02, lng: 138.72, r: 0.35 },
  'Hunter Valley':          { lat: -32.75, lng: 151.28, r: 0.40 },
  'Margaret River':         { lat: -33.95, lng: 115.07, r: 0.40 },
  'Daylesford':             { lat: -37.35, lng: 144.15, r: 0.25 },
  'Macedon Ranges':         { lat: -37.35, lng: 144.55, r: 0.30 },
  'Dandenong Ranges':       { lat: -37.85, lng: 145.35, r: 0.20 },
  'Goldfields':             { lat: -37.05, lng: 144.28, r: 0.50 },
  'Bellarine':              { lat: -38.25, lng: 144.55, r: 0.25 },
  'Gippsland':              { lat: -38.05, lng: 146.00, r: 0.80 },
  'Southern Highlands':     { lat: -34.50, lng: 150.45, r: 0.35 },
  'Central Coast':          { lat: -33.30, lng: 151.35, r: 0.35 },
  'Sunshine Coast':         { lat: -26.65, lng: 153.05, r: 0.35 },
  'Gold Coast':             { lat: -28.00, lng: 153.40, r: 0.35 },
  'Noosa':                  { lat: -26.39, lng: 153.09, r: 0.25 },
  'Kangaroo Island':        { lat: -35.80, lng: 137.20, r: 0.45 },
  'McLaren Vale':           { lat: -35.22, lng: 138.55, r: 0.25 },
  'Clare Valley':           { lat: -33.83, lng: 138.60, r: 0.35 },
  'Great Ocean Road':       { lat: -38.68, lng: 143.55, r: 0.60 },
  'Grampians':              { lat: -37.15, lng: 142.45, r: 0.50 },
  'Bruny Island':           { lat: -43.30, lng: 147.33, r: 0.25 },
  'Cradle Mountain':        { lat: -41.65, lng: 145.95, r: 0.30 },
  'South Coast':            { lat: -35.10, lng: 150.60, r: 0.50 },
  'North Coast':            { lat: -29.50, lng: 153.30, r: 0.50 },
  'Mid North Coast':        { lat: -31.20, lng: 152.75, r: 0.50 },
  'Shoalhaven':             { lat: -34.88, lng: 150.60, r: 0.35 },
  'Tamar Valley':           { lat: -41.30, lng: 147.05, r: 0.30 },
  'Riverland':              { lat: -34.18, lng: 140.75, r: 0.45 },
  'Limestone Coast':        { lat: -37.05, lng: 140.80, r: 0.50 },
  'Scenic Rim':             { lat: -28.10, lng: 152.80, r: 0.35 },
  'Flinders Ranges':        { lat: -32.00, lng: 138.60, r: 0.60 },
  // Cities — slightly larger radius to capture metro + fringe
  'Melbourne':              { lat: -37.81, lng: 144.96, r: 0.45 },
  'Sydney':                 { lat: -33.87, lng: 151.21, r: 0.45 },
  'Brisbane':               { lat: -27.47, lng: 153.03, r: 0.45 },
  'Adelaide':               { lat: -34.93, lng: 138.60, r: 0.40 },
  'Perth':                  { lat: -31.95, lng: 115.86, r: 0.45 },
  'Hobart':                 { lat: -42.88, lng: 147.33, r: 0.40 },
  'Darwin':                 { lat: -12.46, lng: 130.84, r: 0.40 },
  'Fremantle':              { lat: -32.05, lng: 115.75, r: 0.25 },
  'Bendigo':                { lat: -36.76, lng: 144.28, r: 0.30 },
  'Ballarat':               { lat: -37.56, lng: 143.85, r: 0.30 },
  'Orange':                 { lat: -33.28, lng: 149.10, r: 0.35 },
  'Mudgee':                 { lat: -32.60, lng: 149.59, r: 0.30 },
  'Beechworth':             { lat: -36.36, lng: 146.69, r: 0.25 },
  'Bright':                 { lat: -36.73, lng: 146.96, r: 0.25 },
  'Healesville':            { lat: -37.65, lng: 145.52, r: 0.25 },
  'Red Hill':               { lat: -38.37, lng: 145.03, r: 0.20 },
  'Hepburn':                { lat: -37.32, lng: 144.14, r: 0.20 },
  'Launceston':             { lat: -41.45, lng: 147.14, r: 0.30 },
  'Canberra':               { lat: -35.28, lng: 149.13, r: 0.35 },
}

// State bounding boxes for directional queries ("eastern victoria", "north queensland")
const STATE_BOUNDS = {
  VIC: { latMin: -39.2, latMax: -34.0, lngMin: 140.9, lngMax: 150.0 },
  NSW: { latMin: -37.5, latMax: -28.2, lngMin: 140.9, lngMax: 153.7 },
  QLD: { latMin: -29.2, latMax: -10.7, lngMin: 138.0, lngMax: 153.6 },
  SA:  { latMin: -38.1, latMax: -26.0, lngMin: 129.0, lngMax: 141.0 },
  WA:  { latMin: -35.1, latMax: -13.7, lngMin: 112.9, lngMax: 129.0 },
  TAS: { latMin: -43.7, latMax: -39.5, lngMin: 143.8, lngMax: 148.5 },
  ACT: { latMin: -35.9, latMax: -35.1, lngMin: 148.7, lngMax: 149.4 },
  NT:  { latMin: -26.0, latMax: -10.9, lngMin: 129.0, lngMax: 138.0 },
}

// Region keyword detection — maps natural-language phrases to GEO_ANCHOR keys or state codes
const REGION_KEYWORDS = {
  'barossa': 'Barossa', 'yarra valley': 'Yarra Valley', 'mornington': 'Mornington Peninsula',
  'mornington peninsula': 'Mornington Peninsula', 'blue mountains': 'Blue Mountains',
  'byron': 'Byron', 'byron bay': 'Byron', 'adelaide hills': 'Adelaide Hills',
  'hunter valley': 'Hunter Valley', 'margaret river': 'Margaret River',
  'daylesford': 'Daylesford', 'macedon': 'Macedon Ranges', 'macedon ranges': 'Macedon Ranges',
  'dandenong': 'Dandenong Ranges', 'goldfields': 'Goldfields', 'bellarine': 'Bellarine',
  'gippsland': 'Gippsland', 'southern highlands': 'Southern Highlands',
  'central coast': 'Central Coast', 'sunshine coast': 'Sunshine Coast',
  'gold coast': 'Gold Coast', 'noosa': 'Noosa', 'kangaroo island': 'Kangaroo Island',
  'tasmania': 'TAS', 'melbourne': 'Melbourne', 'sydney': 'Sydney', 'brisbane': 'Brisbane',
  'adelaide': 'Adelaide', 'perth': 'Perth', 'hobart': 'Hobart', 'canberra': 'Canberra',
  'darwin': 'Darwin', 'fremantle': 'Fremantle', 'bendigo': 'Bendigo', 'ballarat': 'Ballarat',
  'orange': 'Orange', 'mudgee': 'Mudgee', 'mclaren vale': 'McLaren Vale',
  'clare valley': 'Clare Valley', 'great ocean road': 'Great Ocean Road',
  'grampians': 'Grampians', 'beechworth': 'Beechworth', 'bright': 'Bright',
  'healesville': 'Healesville', 'red hill': 'Red Hill', 'hepburn': 'Hepburn',
  'launceston': 'Launceston', 'cradle mountain': 'Cradle Mountain',
  'bruny island': 'Bruny Island', 'south coast': 'South Coast',
  'north coast': 'North Coast', 'mid north coast': 'Mid North Coast',
  'shoalhaven': 'Shoalhaven', 'tamar valley': 'Tamar Valley', 'tamar': 'Tamar Valley',
  'riverland': 'Riverland', 'limestone coast': 'Limestone Coast',
  'scenic rim': 'Scenic Rim', 'flinders ranges': 'Flinders Ranges', 'flinders': 'Flinders Ranges',
}

// State name variants for directional parsing
const STATE_NAMES = {
  'victoria': 'VIC', 'vic': 'VIC',
  'new south wales': 'NSW', 'nsw': 'NSW',
  'queensland': 'QLD', 'qld': 'QLD',
  'south australia': 'SA', 'sa': 'SA',
  'western australia': 'WA', 'wa': 'WA',
  'tasmania': 'TAS', 'tas': 'TAS', 'tassie': 'TAS',
  'northern territory': 'NT', 'nt': 'NT',
  'act': 'ACT', 'canberra': 'ACT',
}

/**
 * Resolve a parsed region label into a geographic bounding box.
 * Returns { latMin, latMax, lngMin, lngMax, label } or null if unresolvable.
 */
function resolveGeoBounds(regionLabel, rawQuery) {
  if (!regionLabel && !rawQuery) return null

  // 1. Check GEO_ANCHORS for an exact named region
  if (regionLabel && GEO_ANCHORS[regionLabel]) {
    const a = GEO_ANCHORS[regionLabel]
    return {
      latMin: a.lat - a.r, latMax: a.lat + a.r,
      lngMin: a.lng - a.r, lngMax: a.lng + a.r,
      label: regionLabel,
    }
  }

  // 2. Check if regionLabel is a state code → full state bounds
  if (regionLabel && STATE_BOUNDS[regionLabel]) {
    return { ...STATE_BOUNDS[regionLabel], label: regionLabel }
  }

  return null
}

/**
 * Parse directional state references from the raw query.
 * e.g. "eastern victoria" → VIC eastern half bounding box
 * e.g. "north queensland" → QLD northern third
 */
function parseDirectionalRegion(rawQuery) {
  const q = rawQuery.toLowerCase().trim()

  const DIRECTIONS = [
    { patterns: ['eastern', 'east'], side: 'east' },
    { patterns: ['western', 'west'], side: 'west' },
    { patterns: ['northern', 'north'], side: 'north' },
    { patterns: ['southern', 'south'], side: 'south' },
    { patterns: ['central', 'central'], side: 'central' },
  ]

  // Sort state names by length (longest first) to match "south australia" before "south"
  const stateEntries = Object.entries(STATE_NAMES).sort((a, b) => b[0].length - a[0].length)

  for (const { patterns, side } of DIRECTIONS) {
    for (const dir of patterns) {
      for (const [stateName, stateCode] of stateEntries) {
        // Match "eastern victoria", "east victoria", "east vic"
        const phrase1 = `${dir} ${stateName}`
        const phrase2 = `${stateName} ${dir}` // "victoria east" less common but handle it
        if (q.includes(phrase1) || q.includes(phrase2)) {
          const bounds = STATE_BOUNDS[stateCode]
          if (!bounds) continue

          const latMid = (bounds.latMin + bounds.latMax) / 2
          const lngMid = (bounds.lngMin + bounds.lngMax) / 2
          const latThird = (bounds.latMax - bounds.latMin) / 3
          const lngThird = (bounds.lngMax - bounds.lngMin) / 3

          let box
          switch (side) {
            case 'east':
              box = { latMin: bounds.latMin, latMax: bounds.latMax, lngMin: lngMid, lngMax: bounds.lngMax }
              break
            case 'west':
              box = { latMin: bounds.latMin, latMax: bounds.latMax, lngMin: bounds.lngMin, lngMax: lngMid }
              break
            case 'north':
              // For southern hemisphere: "north" means less negative latitude (higher latMax)
              box = { latMin: latMid, latMax: bounds.latMax, lngMin: bounds.lngMin, lngMax: bounds.lngMax }
              break
            case 'south':
              box = { latMin: bounds.latMin, latMax: latMid, lngMin: bounds.lngMin, lngMax: bounds.lngMax }
              break
            case 'central':
              box = {
                latMin: bounds.latMin + latThird, latMax: bounds.latMax - latThird,
                lngMin: bounds.lngMin + lngThird, lngMax: bounds.lngMax - lngThird,
              }
              break
          }

          const label = `${dir.charAt(0).toUpperCase() + dir.slice(1)} ${stateCode}`
          return { ...box, label, state: stateCode }
        }
      }
    }
  }

  return null
}

/**
 * Apply geographic bounding box filter to a Supabase query.
 * This is the single point of geographic filtering — used by all query paths.
 */
function applyGeoFilter(query, geoBounds) {
  if (!geoBounds) return query
  return query
    .gte('lat', geoBounds.latMin)
    .lte('lat', geoBounds.latMax)
    .gte('lng', geoBounds.lngMin)
    .lte('lng', geoBounds.lngMax)
}

// Word-number to digit conversion
const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10,
}

// Duration extraction from query
const DURATION_PATTERNS = [
  { pattern: /(\d+)\s*nights?/i, extract: m => ({ nights: parseInt(m[1]) }) },
  { pattern: /(\d+)\s*days?/i, extract: m => ({ days: parseInt(m[1]) }) },
  { pattern: /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*nights?\b/i, extract: m => ({ nights: WORD_NUMBERS[m[1].toLowerCase()] }) },
  { pattern: /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*days?\b/i, extract: m => ({ days: WORD_NUMBERS[m[1].toLowerCase()] }) },
  { pattern: /weekend/i, extract: () => ({ days: 2 }) },
  { pattern: /long\s*weekend/i, extract: () => ({ days: 3 }) },
  { pattern: /day\s*trip/i, extract: () => ({ days: 1 }) },
  { pattern: /overnight/i, extract: () => ({ nights: 1 }) },
]

function parseItineraryQuery(rawQuery) {
  const q = rawQuery.toLowerCase().trim()
  let region = null
  let geoBounds = null
  let verticals = []
  let duration = { days: 1 }

  // 1. Try directional state phrases first ("eastern victoria", "north queensland")
  //    These are more specific than REGION_KEYWORDS and should take priority
  const directional = parseDirectionalRegion(q)
  if (directional) {
    geoBounds = directional
    region = directional.label
  }

  // 2. Try known region keywords (longest match first)
  if (!geoBounds) {
    const regionEntries = Object.entries(REGION_KEYWORDS).sort((a, b) => b[0].length - a[0].length)
    for (const [kw, regionValue] of regionEntries) {
      if (q.includes(kw)) {
        region = regionValue
        break
      }
    }

    // Resolve the matched region to coordinates
    if (region) {
      geoBounds = resolveGeoBounds(region, q)
    }
  }

  // 3. Last resort: check for bare state names not caught by REGION_KEYWORDS
  if (!geoBounds && !region) {
    const stateEntries = Object.entries(STATE_NAMES).sort((a, b) => b[0].length - a[0].length)
    for (const [name, code] of stateEntries) {
      // Only match if it's a word boundary (avoid "orange" matching "or" etc.)
      const re = new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`)
      if (re.test(q)) {
        region = code
        geoBounds = resolveGeoBounds(code, q)
        break
      }
    }
  }

  // Extract category/vertical hints
  for (const [vKey, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const sorted = [...keywords].sort((a, b) => b.length - a.length)
    for (const kw of sorted) {
      if (q.includes(kw)) {
        if (!verticals.includes(vKey)) verticals.push(vKey)
        break
      }
    }
  }

  // Extract duration
  for (const { pattern, extract } of DURATION_PATTERNS) {
    const match = q.match(pattern)
    if (match) {
      const d = extract(match)
      if (d.nights) duration = { days: d.nights + 1 }
      else if (d.days) duration = { days: d.days }
      break
    }
  }

  return { region, geoBounds, verticals, duration }
}

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas', collection: 'Collection Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  if (!q || q.trim().length < 3) {
    return NextResponse.json({ error: 'Query parameter "q" is required (min 3 characters)' }, { status: 400 })
  }

  try {
    const { region, geoBounds, verticals, duration } = parseItineraryQuery(q)

    // Check for user preferences to weight recommendations
    let userInterests = null
    try {
      const { createAuthServerClient } = await import('@/lib/supabase/auth-clients')
      const authSb = await createAuthServerClient()
      const { data: { user } } = await authSb.auth.getUser()
      if (user) {
        const adminSb = getSupabaseAdmin()
        const { data: profile } = await adminSb
          .from('profiles')
          .select('interests')
          .eq('id', user.id)
          .single()
        if (profile?.interests && Object.keys(profile.interests).length > 0) {
          userInterests = profile.interests
        }
      }
    } catch {
      // Auth not available or no preferences — that's fine, continue without
    }

    // Query candidate venues from master listings
    const sb = getSupabaseAdmin()
    const LISTING_COLS = 'id, name, vertical, lat, lng, region, state, description, hero_image_url, slug'

    // Helper: build a base query with status + coordinate filters + geo bounds
    function baseQuery() {
      let q = sb
        .from('listings')
        .select(LISTING_COLS)
        .eq('status', 'active')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
      return applyGeoFilter(q, geoBounds)
    }

    let query = baseQuery()

    // For single-day trips with specific verticals, filter tightly.
    if (verticals.length > 0 && duration.days <= 1) {
      const allVerticals = [...new Set([...verticals, 'rest'])]
      query = query.in('vertical', allVerticals)
    }

    query = query.limit(80)

    let candidates
    let error

    // For multi-day trips with focus verticals, fetch focus venues first then supplement
    if (verticals.length > 0 && duration.days > 1) {
      // First: fetch focus vertical venues (+ rest for accommodation)
      const focusVerticals = [...new Set([...verticals, 'rest'])]
      let focusQuery = baseQuery().in('vertical', focusVerticals)

      const { data: focusData, error: focusErr } = await focusQuery.limit(50)
      if (focusErr) {
        error = focusErr
      } else {
        const focusIds = new Set((focusData || []).map(v => v.id))

        // Second: fetch supplementary venues from other verticals (same geo bounds)
        const { data: suppData } = await query
        const suppVenues = (suppData || []).filter(v => !focusIds.has(v.id))

        // Combine: focus venues first, then supplements (cap total)
        candidates = [...(focusData || []), ...suppVenues].slice(0, 80)
      }
    } else {
      const result = await query
      candidates = result.data
      error = result.error
    }

    if (error) {
      console.error('[itinerary] DB query error:', error.message)
      return NextResponse.json({ error: 'Failed to fetch venues' }, { status: 500 })
    }

    // If we got very few results with vertical filtering on a day trip, retry without vertical filter
    // but KEEP the geo bounds — never return venues outside the requested geography
    if (verticals.length > 0 && duration.days <= 1 && (!candidates || candidates.length < 4)) {
      const broadQuery = baseQuery()
      const { data: broadCandidates } = await broadQuery.limit(80)
      if (broadCandidates && broadCandidates.length >= 4) {
        candidates.length = 0
        candidates.push(...broadCandidates)
      }
    }

    if (!candidates || candidates.length < 4) {
      return NextResponse.json({
        error: 'insufficient_venues',
        message: `Not enough venues found${region ? ` in ${region}` : ''}. Try a different region or broader search.`,
        venue_count: candidates?.length || 0,
      }, { status: 200 })
    }

    // Prepare venue data for Claude — more candidates for multi-day trips
    const maxVenues = duration.days > 1 ? 50 : 30
    const venueData = candidates.slice(0, maxVenues).map(v => ({
      id: v.id,
      name: v.name,
      vertical: v.vertical,
      vertical_label: VERTICAL_LABELS[v.vertical] || v.vertical,
      lat: v.lat,
      lng: v.lng,
      region: v.region,
      state: v.state,
      description: v.description ? v.description.slice(0, 200) : null,
      slug: v.slug,
      hero_image_url: v.hero_image_url || null,
    }))

    const candidateIds = new Set(venueData.map(v => v.id))

    // Build the Anthropic API call
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const systemPrompt = `You are the Australian Atlas editorial voice — warm, knowledgeable, and passionate about independent Australian makers, producers, and cultural spaces. You build travel itineraries that feel like recommendations from a well-connected local friend.

HARD CONSTRAINTS:
- You may ONLY include venues from the provided candidate list. Never invent venues.
- Every listing_id in your response MUST exist in the candidate list.
- Each stop must reference a real venue by its exact id, name, vertical, lat, and lng from the candidates.
- For multi-day trips, include at least one "rest" vertical venue as overnight accommodation per night (except the final night).
- You MUST produce EXACTLY the number of days requested. If asked for 3 days, your "days" array must have 3 entries. Never compress into fewer days.
- For multi-day trips, fill each day with 3-5 stops. If the focus category has limited venues, supplement with other verticals (food, nature, art, shops) to create a rich experience.
- Keep notes concise (1-2 sentences) — evocative but practical.
- Title should be catchy and specific to the region/theme.
- Intro should be 2-3 sentences setting the scene.

Respond with valid JSON only. No markdown, no code fences, just the JSON object.`

    // Count focus-vertical venues in the candidate pool
    const focusCount = verticals.length > 0
      ? venueData.filter(v => verticals.includes(v.vertical)).length
      : 0
    const totalStopsNeeded = duration.days * 4 // ~4 stops per day target

    const focusNote = verticals.length > 0
      ? `\nThe user is specifically interested in: ${verticals.map(v => VERTICAL_LABELS[v] || v).join(', ')}.
VENUE TYPE PRIORITY: At least 60% of all stops MUST be from the requested vertical(s): ${verticals.join(', ')}. These are the user's primary interest — do not dilute with unrelated categories.
${focusCount < totalStopsNeeded ? `\nNOTE: There are only ${focusCount} venues matching the focus vertical(s) in this region. Use ALL of them. Fill remaining slots with complementary verticals (food, stays, nature) but add a note in the intro acknowledging that coverage for ${verticals.map(v => VERTICAL_LABELS[v] || v).join(' / ')} is still growing in this area.` : ''}
Supplementary stops (food, nature, art, shops, stays) should complement the theme, not dominate it.`
      : ''

    const userPrompt = `Build a ${duration.days}-day itinerary for this request: "${q}"
${focusNote}
IMPORTANT: You MUST produce exactly ${duration.days} day(s) with 3-5 stops each. Do not compress into fewer days.

Here are the candidate venues (JSON array). You MUST only use venues from this list:
${JSON.stringify(venueData, null, 2)}

Return this exact JSON structure:
{
  "title": "string — catchy itinerary title",
  "intro": "string — 2-3 sentence editorial intro. If focus venues are limited, acknowledge this warmly.",
  "days": [
    {
      "day_number": 1,
      "label": "string — e.g. 'Morning in the Barossa'",
      "stops": [
        {
          "listing_id": "number — must match a candidate id",
          "venue_name": "string",
          "vertical": "string",
          "lat": "number",
          "lng": "number",
          "note": "string — 1-2 sentence editorial note"
        }
      ],
      "overnight": null or {
        "listing_id": "number",
        "venue_name": "string",
        "vertical": "rest",
        "lat": "number",
        "lng": "number",
        "note": "string"
      }
    }
  ]
}

Aim for 3-5 stops per day. Make it flow geographically. Favour the requested vertical(s) heavily. You MUST have exactly ${duration.days} entries in the "days" array.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })

    // Extract text response
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    // Parse JSON from response (strip any accidental markdown fences)
    let rawText = textBlock.text.trim()
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    let itinerary
    try {
      itinerary = JSON.parse(rawText)
    } catch (parseErr) {
      console.error('[itinerary] JSON parse error:', parseErr.message, 'Raw:', rawText.slice(0, 500))
      return NextResponse.json({ error: 'Failed to parse itinerary response' }, { status: 500 })
    }

    // Validate: ensure every listing_id exists in candidates
    let valid = true
    const enrichedDays = (itinerary.days || []).map(day => {
      const enrichedStops = (day.stops || []).map(stop => {
        const candidate = venueData.find(v => v.id === stop.listing_id)
        if (!candidate) {
          console.warn(`[itinerary] listing_id ${stop.listing_id} not found in candidates`)
          valid = false
        }
        return {
          ...stop,
          slug: candidate?.slug || null,
          hero_image_url: candidate?.hero_image_url || null,
          region: candidate?.region || null,
        }
      })

      let enrichedOvernight = day.overnight
      if (enrichedOvernight?.listing_id) {
        const candidate = venueData.find(v => v.id === enrichedOvernight.listing_id)
        if (!candidate) {
          console.warn(`[itinerary] overnight listing_id ${enrichedOvernight.listing_id} not found`)
          valid = false
        }
        enrichedOvernight = {
          ...enrichedOvernight,
          slug: candidate?.slug || null,
          hero_image_url: candidate?.hero_image_url || null,
          region: candidate?.region || null,
        }
      }

      return { ...day, stops: enrichedStops, overnight: enrichedOvernight }
    })

    if (!valid) {
      console.warn('[itinerary] Some venue IDs did not match candidates — returning anyway with available data')
    }

    // Build recommendations from unused candidates, constrained by geographic proximity
    const usedIds = new Set()
    const usedCoords = []
    for (const day of enrichedDays) {
      for (const stop of (day.stops || [])) {
        if (stop.listing_id) usedIds.add(stop.listing_id)
        if (stop.lat && stop.lng) usedCoords.push({ lat: stop.lat, lng: stop.lng })
      }
      if (day.overnight?.listing_id) {
        usedIds.add(day.overnight.listing_id)
        if (day.overnight.lat && day.overnight.lng) usedCoords.push({ lat: day.overnight.lat, lng: day.overnight.lng })
      }
    }

    // Calculate centroid of itinerary stops for proximity filtering
    let centroidLat = null, centroidLng = null
    if (usedCoords.length > 0) {
      centroidLat = usedCoords.reduce((s, c) => s + c.lat, 0) / usedCoords.length
      centroidLng = usedCoords.reduce((s, c) => s + c.lng, 0) / usedCoords.length
    }

    // Haversine distance in km
    function distKm(lat1, lng1, lat2, lng2) {
      const R = 6371
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLng = (lng2 - lng1) * Math.PI / 180
      const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    const RECOMMENDATION_RADIUS_KM = 50

    // Check if itinerary is missing accommodation for multi-day trips
    const hasOvernight = enrichedDays.some(d => d.overnight?.listing_id)
    const needsAccommodation = duration.days > 1 && !hasOvernight

    // Map user activity interests to verticals for weighting
    const interestVerticals = new Set()
    if (userInterests?.verticals) {
      userInterests.verticals.forEach(v => interestVerticals.add(v))
    }
    if (userInterests?.activities) {
      const activityToVertical = {
        wine_tasting: 'sba', craft_beer: 'sba', distillery_tours: 'sba',
        coffee: 'fine_grounds',
        hiking: 'field', swimming: 'field', lookouts: 'field', national_parks: 'field',
        galleries: 'collection', museums: 'collection', heritage: 'collection',
        makers_studios: 'craft', ceramics: 'craft', woodwork: 'craft',
        farm_gate: 'table', markets: 'table', bakeries: 'table', providores: 'table',
        boutique_stays: 'rest', glamping: 'rest', farm_stays: 'rest',
        bookshops: 'corner', record_stores: 'corner', homewares: 'corner',
        vintage: 'found', op_shops: 'found', antiques: 'found',
      }
      userInterests.activities.forEach(a => {
        if (activityToVertical[a]) interestVerticals.add(activityToVertical[a])
      })
    }

    const recommendations = venueData
      .filter(v => !usedIds.has(v.id))
      // Filter by geographic proximity to itinerary centroid
      .filter(v => {
        if (!centroidLat || !v.lat || !v.lng) return false
        return distKm(centroidLat, centroidLng, v.lat, v.lng) <= RECOMMENDATION_RADIUS_KM
      })
      .map(v => ({
        id: v.id,
        name: v.name,
        vertical: v.vertical,
        vertical_label: v.vertical_label,
        lat: v.lat,
        lng: v.lng,
        region: v.region,
        slug: v.slug,
        hero_image_url: v.hero_image_url,
        description: v.description,
        distance_km: centroidLat ? Math.round(distKm(centroidLat, centroidLng, v.lat, v.lng)) : null,
        matches_interests: interestVerticals.has(v.vertical),
      }))
      // Sort: accommodation first if needed, then user interests, then by distance
      .sort((a, b) => {
        if (needsAccommodation) {
          if (a.vertical === 'rest' && b.vertical !== 'rest') return -1
          if (b.vertical === 'rest' && a.vertical !== 'rest') return 1
        }
        // Boost user's preferred verticals
        if (a.matches_interests && !b.matches_interests) return -1
        if (b.matches_interests && !a.matches_interests) return 1
        return (a.distance_km || 0) - (b.distance_km || 0)
      })
      .slice(0, 12)

    // Flag thin corpus so frontend can show a note
    const focusVerticalCount = verticals.length > 0
      ? venueData.filter(v => verticals.includes(v.vertical)).length
      : venueData.length
    const thinCorpus = verticals.length > 0 && focusVerticalCount < totalStopsNeeded

    return NextResponse.json({
      title: itinerary.title,
      intro: itinerary.intro,
      days: enrichedDays,
      recommendations,
      needs_accommodation: needsAccommodation,
      thin_corpus: thinCorpus,
      focus_verticals: verticals.length > 0 ? verticals.map(v => VERTICAL_LABELS[v] || v) : null,
      focus_venue_count: focusVerticalCount,
      personalised: interestVerticals.size > 0,
      query: q,
      region: region || null,
      duration,
      venue_count: venueData.length,
    })
  } catch (err) {
    console.error('[itinerary] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
