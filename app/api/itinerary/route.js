import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createHash } from 'crypto'

// CRITICAL: Vercel defaults to 10s — extend to 60s. Must be top-level export.
export const maxDuration = 60

// Hardcoded model — one less thing that can break
const MODEL = 'claude-sonnet-4-20250514'

/** Generate an anonymous session id from user-agent + date (no PII) */
function getSessionId(request) {
  const ua = request.headers.get('user-agent') || 'unknown'
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256').update(`${ua}:${day}`).digest('hex').slice(0, 16)
}

/** Fire-and-forget error log — writes to trail_errors for diagnostics */
function logTrailError({ destination, preferences, errorMessage, errorType, rawResponse }) {
  try {
    const sb = getSupabaseAdmin()
    sb.from('trail_errors').insert({
      destination: destination || null,
      preferences: preferences || null,
      error_message: errorMessage || null,
      error_type: errorType || 'unknown',
      raw_response: rawResponse ? String(rawResponse).slice(0, 5000) : null,
    }).then(() => {}).catch(() => {})
  } catch { /* silent — error logging must never crash the route */ }
}

/** Fire-and-forget trail log — must never break itinerary generation */
function logTrail(request, { promptText, regionDetected, verticalsIncluded, daysGenerated }) {
  try {
    const sb = getSupabaseAdmin()
    sb.from('trail_logs').insert({
      prompt_text: promptText,
      region_detected: regionDetected || null,
      verticals_included: verticalsIncluded || [],
      days_generated: daysGenerated || 0,
      session_id: getSessionId(request),
    }).then(() => {}).catch(() => {})
  } catch { /* silent */ }
}

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Build a simplified fallback itinerary directly from venue data — no Claude call.
 * Used when the Claude API fails after retries. Returns a basic but functional itinerary
 * so the user always sees something instead of an error.
 */
function buildFallbackItinerary(venueData, { region, duration, stopsPerDay = 4 }) {
  const nonRest = venueData.filter(v => v.vertical !== 'rest')
  const restVenues = venueData.filter(v => v.vertical === 'rest')

  // Sort by quality: featured/claimed first, then editors picks
  nonRest.sort((a, b) => {
    const aScore = (a.is_claimed ? 3 : 0) + (a.editors_pick ? 2 : 0) + (a.is_featured ? 1 : 0)
    const bScore = (b.is_claimed ? 3 : 0) + (b.editors_pick ? 2 : 0) + (b.is_featured ? 1 : 0)
    return bScore - aScore
  })

  const days = []
  let venueIdx = 0

  for (let di = 0; di < duration.days; di++) {
    const dayStops = []
    for (let si = 0; si < stopsPerDay && venueIdx < nonRest.length; si++) {
      const v = nonRest[venueIdx++]
      dayStops.push({
        listing_id: v.id,
        venue_name: v.name,
        vertical: v.vertical,
        lat: v.lat,
        lng: v.lng,
        slug: v.slug || null,
        source_id: v.source_id || null,
        hero_image_url: v.hero_image_url || null,
        region: v.region || null,
        note: v.description ? v.description.slice(0, 120) : 'A local favourite.',
      })
    }

    let overnight = null
    if (di < duration.days - 1 && restVenues[di]) {
      const rv = restVenues[di]
      overnight = {
        listing_id: rv.id,
        venue_name: rv.name,
        vertical: 'rest',
        lat: rv.lat,
        lng: rv.lng,
        slug: rv.slug || null,
        source_id: rv.source_id || null,
        hero_image_url: rv.hero_image_url || null,
        region: rv.region || null,
        note: `A place to rest for the night.`,
      }
    }

    days.push({
      day_number: di + 1,
      label: duration.days === 1 ? `A day in ${region || 'the region'}` : `Day ${di + 1}`,
      stops: dayStops,
      overnight,
      accommodation_gap: di < duration.days - 1 && !overnight,
    })
  }

  return {
    title: `Exploring ${region || 'the region'}`,
    intro: `Here are some of the best independent venues in ${region || 'this area'}, curated from the Australian Atlas network.`,
    days,
    _fallback: true,
  }
}

/**
 * Check whether the primary vertical(s) make up at least 50% of itinerary stops.
 * Overnight stays are excluded — they're always 'rest' and shouldn't affect focus ratio.
 */
function enforceVerticalRatio(days, primaryVerticals) {
  let totalStops = 0
  let primaryStops = 0
  for (const day of days) {
    for (const stop of (day.stops || [])) {
      totalStops++
      if (primaryVerticals.includes(stop.vertical)) primaryStops++
    }
  }
  const ratio = totalStops > 0 ? primaryStops / totalStops : 0
  return { ratio, totalStops, primaryStops, passed: ratio >= 0.5 }
}

/** Build a deterministic cache key from the normalized query + flow params */
function buildCacheKey(query, flow = {}) {
  const normalized = [
    query.toLowerCase().trim().replace(/\s+/g, ' '),
    flow.accommodation || '',
    flow.transport || '',
    flow.group || '',
    flow.pace || '',
    flow.anchor || '',
  ].join('|')
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32)
}

/**
 * Call Anthropic with retry (529 overloaded) and a hard 45-second timeout.
 * The timeout prevents the function from hanging until the 60s Vercel limit,
 * giving us time to return a graceful fallback instead of a silent crash.
 */
async function callAnthropicWithRetry(client, params) {
  const TIMEOUT_MS = 45000 // 45s — leaves 15s headroom before Vercel kills us

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await Promise.race([
        client.messages.create(params),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('CLAUDE_TIMEOUT')), TIMEOUT_MS)
        ),
      ])
      return result
    } catch (err) {
      if (err.message === 'CLAUDE_TIMEOUT') {
        console.error(`[itinerary] Claude API timed out after ${TIMEOUT_MS}ms (attempt ${attempt + 1})`)
        if (attempt === 0) continue // retry once on timeout
        throw err
      }
      if (err.status === 529 && attempt === 0) {
        console.warn('[itinerary] Anthropic overloaded (529), retrying once...')
        continue
      }
      throw err
    }
  }
}

/**
 * Generate a query embedding using Voyage-3 (asymmetric, inputType: 'query').
 * Returns null if VOYAGE_API_KEY is not set or the call fails — callers must handle gracefully.
 */
async function generateQueryEmbedding(text) {
  if (!process.env.VOYAGE_API_KEY) return null
  try {
    const { VoyageAIClient } = await import('voyageai')
    const client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY })
    const result = await client.embed({
      model: 'voyage-3',
      input: [text],
      inputType: 'query',
    })
    return result.data?.[0]?.embedding || null
  } catch (err) {
    console.warn('[itinerary] Failed to generate query embedding:', err.message)
    return null
  }
}

// Map natural-language category hints to vertical keys
const CATEGORY_KEYWORDS = {
  sba: ['wine', 'winery', 'wineries', 'vineyard', 'vineyards', 'brewery', 'breweries', 'distillery', 'distilleries', 'cellar door', 'gin', 'whisky', 'cider', 'craft beer', 'natural wine', 'spirits', 'drink', 'drinks', 'small batch', 'tasting'],
  fine_grounds: ['coffee', 'cafe', 'cafes', 'roaster', 'espresso'],
  rest: ['accommodation', 'stay', 'stays', 'hotel', 'hotels', 'glamping', 'farmstay', 'cottage', 'boutique stay', 'bnb', 'b&b', 'bed and breakfast', 'sleep'],
  collection: ['art', 'gallery', 'galleries', 'museum', 'museums', 'heritage', 'cultural', 'exhibition'],
  craft: ['maker', 'makers', 'studio', 'studios', 'pottery', 'ceramics', 'woodwork', 'textiles', 'jewellery'],
  field: ['natural beauty', 'nature', 'natural', 'scenic', 'scenery', 'hiking', 'waterfall', 'swimming hole', 'lookout', 'walking', 'outdoor', 'national park', 'bush walk', 'bushwalk', 'wildlife', 'zoo'],
  corner: ['bookshop', 'bookshops', 'book shop', 'record store', 'record stores', 'homewares', 'indie shop', 'indie retail', 'independent shop'],
  found: ['vintage', 'op shop', 'antique shops', 'antique shop', 'antique', 'antiques', 'secondhand', 'thrift', 'retro'],
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
  // Cities — metro-only radius (0.25° ≈ 28km from center, covers inner + middle suburbs)
  'Melbourne':              { lat: -37.81, lng: 144.96, r: 0.25 },
  'Sydney':                 { lat: -33.87, lng: 151.21, r: 0.25 },
  'Brisbane':               { lat: -27.47, lng: 153.03, r: 0.25 },
  'Adelaide':               { lat: -34.93, lng: 138.60, r: 0.25 },
  'Perth':                  { lat: -31.95, lng: 115.86, r: 0.30 },
  'Hobart':                 { lat: -42.88, lng: 147.33, r: 0.25 },
  'Darwin':                 { lat: -12.46, lng: 130.84, r: 0.25 },
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
  // Additional regions referenced by CITY_TO_REGION
  'Bellarine Peninsula':    { lat: -38.25, lng: 144.55, r: 0.25 },
  'Far North Queensland':   { lat: -16.92, lng: 145.77, r: 0.80 },
  'Top End':                { lat: -12.46, lng: 130.84, r: 1.20 },
  'North Queensland':       { lat: -19.25, lng: 146.80, r: 0.80 },
  'Darling Downs':          { lat: -27.56, lng: 151.95, r: 0.60 },
  'Central Queensland':     { lat: -23.38, lng: 150.51, r: 0.80 },
  'ACT':                    { lat: -35.28, lng: 149.13, r: 0.35 },
  'North East Victoria':    { lat: -36.36, lng: 146.69, r: 0.60 },
  'Riverina':               { lat: -35.12, lng: 147.37, r: 0.80 },
  'Northern Rivers':        { lat: -28.81, lng: 153.28, r: 0.50 },
  'Murray River':           { lat: -35.75, lng: 144.25, r: 0.80 },
  'Goulburn Valley':        { lat: -36.38, lng: 145.40, r: 0.50 },
  'New England':            { lat: -30.50, lng: 151.65, r: 0.60 },
  'Central West NSW':       { lat: -32.25, lng: 148.60, r: 0.80 },
  'Eurobodalla':            { lat: -35.71, lng: 150.18, r: 0.35 },
  'Sapphire Coast':         { lat: -36.89, lng: 149.91, r: 0.40 },
  'Wimmera':                { lat: -36.72, lng: 142.20, r: 0.60 },
  'West Gippsland':         { lat: -38.13, lng: 145.95, r: 0.40 },
  'Surf Coast':             { lat: -38.33, lng: 144.32, r: 0.25 },
  'Western Victoria':       { lat: -37.83, lng: 142.02, r: 0.60 },
  'North West Tasmania':    { lat: -41.18, lng: 145.87, r: 0.50 },
  'Red Centre':             { lat: -23.70, lng: 133.87, r: 1.50 },
  'Kimberley':              { lat: -17.96, lng: 122.24, r: 1.50 },
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
  // Regions that exist in GEO_ANCHORS but were previously unreachable by keyword
  'northern rivers': 'Northern Rivers', 'bellarine': 'Bellarine Peninsula', 'bellarine peninsula': 'Bellarine Peninsula',
  'far north queensland': 'Far North Queensland', 'fnq': 'Far North Queensland',
  'top end': 'Top End', 'north queensland': 'North Queensland',
  'darling downs': 'Darling Downs', 'central queensland': 'Central Queensland',
  'north east victoria': 'North East Victoria', 'northeast victoria': 'North East Victoria',
  'riverina': 'Riverina', 'murray river': 'Murray River', 'murray': 'Murray River',
  'goulburn valley': 'Goulburn Valley', 'new england': 'New England',
  'central west nsw': 'Central West NSW', 'central west': 'Central West NSW',
  'eurobodalla': 'Eurobodalla', 'sapphire coast': 'Sapphire Coast',
  'wimmera': 'Wimmera', 'west gippsland': 'West Gippsland',
  'surf coast': 'Surf Coast', 'western victoria': 'Western Victoria',
  'north west tasmania': 'North West Tasmania', 'northwest tasmania': 'North West Tasmania',
  'red centre': 'Red Centre', 'kimberley': 'Kimberley',
  // Additional natural language variants
  'illawarra': 'Southern Highlands', 'south coast nsw': 'Shoalhaven',
  'whitsundays': 'Central Queensland', 'atherton tablelands': 'Far North Queensland',
  'daintree': 'Far North Queensland', 'tweed': 'Northern Rivers',
  'mullumbimby': 'Northern Rivers', 'bangalow': 'Northern Rivers',
  'otways': 'Great Ocean Road', 'otway': 'Great Ocean Road', 'otway ranges': 'Great Ocean Road',
  'colac otway': 'Great Ocean Road', 'forrest': 'Great Ocean Road',
}

// City-to-region mapping: maps common Australian cities/towns to their nearest
// covered Atlas region. Checked BEFORE REGION_KEYWORDS so that e.g. "Geelong"
// resolves to Bellarine Peninsula rather than failing or matching a broad area.
const CITY_TO_REGION = {
  'geelong':        { region: 'Bellarine Peninsula', label: 'Showing results for Bellarine Peninsula near Geelong' },
  'ballarat':       { region: 'Goldfields', label: 'Showing results for Goldfields near Ballarat' },
  'bendigo':        { region: 'Goldfields', label: 'Showing results for Goldfields near Bendigo' },
  'newcastle':      { region: 'Hunter Valley', label: 'Showing results for Hunter Valley near Newcastle' },
  'wollongong':     { region: 'Southern Highlands', label: 'Showing results for Southern Highlands near Wollongong' },
  'cairns':         { region: 'Far North Queensland', label: 'Showing results for Far North Queensland near Cairns' },
  'darwin':         { region: 'Top End', label: 'Showing results for Top End near Darwin' },
  'townsville':     { region: 'North Queensland', label: 'Showing results for North Queensland near Townsville' },
  'toowoomba':      { region: 'Darling Downs', label: 'Showing results for Darling Downs near Toowoomba' },
  'rockhampton':    { region: 'Central Queensland', label: 'Showing results for Central Queensland near Rockhampton' },
  'canberra':       { region: 'ACT', label: 'Showing results for ACT near Canberra' },
  'albury':         { region: 'North East Victoria', label: 'Showing results for North East Victoria near Albury' },
  'wagga wagga':    { region: 'Riverina', label: 'Showing results for Riverina near Wagga Wagga' },
  'bunbury':        { region: 'Margaret River', label: 'Showing results for Margaret River near Bunbury' },
  'geraldton':      { region: 'WA', label: 'Showing results for Western Australia near Geraldton' },
  'bathurst':       { region: 'Orange', label: 'Showing results for Orange near Bathurst' },
  'tamworth':       { region: 'New England', label: 'Showing results for New England near Tamworth' },
  'dubbo':          { region: 'Central West NSW', label: 'Showing results for Central West NSW near Dubbo' },
  'lismore':        { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Lismore' },
  'coffs harbour':  { region: 'Mid North Coast', label: 'Showing results for Mid-North Coast near Coffs Harbour' },
  'port macquarie': { region: 'Mid North Coast', label: 'Showing results for Mid-North Coast near Port Macquarie' },
  'mildura':        { region: 'Murray River', label: 'Showing results for Murray River near Mildura' },
  'shepparton':     { region: 'Goulburn Valley', label: 'Showing results for Goulburn Valley near Shepparton' },
  'warrnambool':    { region: 'Great Ocean Road', label: 'Showing results for Great Ocean Road near Warrnambool' },
  'mount gambier':  { region: 'Limestone Coast', label: 'Showing results for Limestone Coast near Mount Gambier' },
  'burnie':         { region: 'North West Tasmania', label: 'Showing results for North West Tasmania near Burnie' },
  'devonport':      { region: 'North West Tasmania', label: 'Showing results for North West Tasmania near Devonport' },
  'alice springs':  { region: 'Red Centre', label: 'Showing results for Red Centre near Alice Springs' },
  'broome':         { region: 'Kimberley', label: 'Showing results for Kimberley near Broome' },
  'mandurah':       { region: 'Perth', label: 'Showing results for Perth near Mandurah' },
  'gosford':        { region: 'Central Coast', label: 'Showing results for Central Coast near Gosford' },
  'wangaratta':     { region: 'North East Victoria', label: 'Showing results for North East Victoria near Wangaratta' },
  'echuca':         { region: 'Murray River', label: 'Showing results for Murray River near Echuca' },
  'swan hill':      { region: 'Murray River', label: 'Showing results for Murray River near Swan Hill' },
  'armidale':       { region: 'New England', label: 'Showing results for New England near Armidale' },
  'nowra':          { region: 'Shoalhaven', label: 'Showing results for Shoalhaven near Nowra' },
  'batemans bay':   { region: 'Eurobodalla', label: 'Showing results for Eurobodalla near Batemans Bay' },
  'ulladulla':      { region: 'Shoalhaven', label: 'Showing results for Shoalhaven near Ulladulla' },
  'merimbula':      { region: 'Sapphire Coast', label: 'Showing results for Sapphire Coast near Merimbula' },
  'horsham':        { region: 'Wimmera', label: 'Showing results for Wimmera near Horsham' },
  'sale':           { region: 'Gippsland', label: 'Showing results for Gippsland near Sale' },
  'traralgon':      { region: 'Gippsland', label: 'Showing results for Gippsland near Traralgon' },
  'warragul':       { region: 'West Gippsland', label: 'Showing results for West Gippsland near Warragul' },
  'torquay':        { region: 'Surf Coast', label: 'Showing results for Surf Coast near Torquay' },
  'lorne':          { region: 'Great Ocean Road', label: 'Showing results for Great Ocean Road near Lorne' },
  'apollo bay':     { region: 'Great Ocean Road', label: 'Showing results for Great Ocean Road near Apollo Bay' },
  'port fairy':     { region: 'Western Victoria', label: 'Showing results for Western Victoria near Port Fairy' },
  'hamilton':       { region: 'Western Victoria', label: 'Showing results for Western Victoria near Hamilton' },
  'colac':          { region: 'Western Victoria', label: 'Showing results for Western Victoria near Colac' },
  'castlemaine':    { region: 'Goldfields', label: 'Showing results for Goldfields near Castlemaine' },
  // Additional cities for broader coverage
  'wodonga':        { region: 'North East Victoria', label: 'Showing results for North East Victoria near Wodonga' },
  'maitland':       { region: 'Hunter Valley', label: 'Showing results for Hunter Valley near Maitland' },
  'cessnock':       { region: 'Hunter Valley', label: 'Showing results for Hunter Valley near Cessnock' },
  'katoomba':       { region: 'Blue Mountains', label: 'Showing results for Blue Mountains near Katoomba' },
  'leura':          { region: 'Blue Mountains', label: 'Showing results for Blue Mountains near Leura' },
  'victor harbor':  { region: 'McLaren Vale', label: 'Showing results for McLaren Vale near Victor Harbor' },
  'goolwa':         { region: 'McLaren Vale', label: 'Showing results for McLaren Vale near Goolwa' },
  'port douglas':   { region: 'Far North Queensland', label: 'Showing results for Far North Queensland near Port Douglas' },
  'mission beach':  { region: 'North Queensland', label: 'Showing results for North Queensland near Mission Beach' },
  'gladstone':      { region: 'Central Queensland', label: 'Showing results for Central Queensland near Gladstone' },
  'mackay':         { region: 'Central Queensland', label: 'Showing results for Central Queensland near Mackay' },
  'caloundra':      { region: 'Sunshine Coast', label: 'Showing results for Sunshine Coast near Caloundra' },
  'maroochydore':   { region: 'Sunshine Coast', label: 'Showing results for Sunshine Coast near Maroochydore' },
  'coolangatta':    { region: 'Gold Coast', label: 'Showing results for Gold Coast near Coolangatta' },
  'warwick':        { region: 'Darling Downs', label: 'Showing results for Darling Downs near Warwick' },
  'grafton':        { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Grafton' },
  'kempsey':        { region: 'Mid North Coast', label: 'Showing results for Mid-North Coast near Kempsey' },
  'orange':         { region: 'Orange', label: 'Showing results for Orange region' },
  'mudgee':         { region: 'Central West NSW', label: 'Showing results for Central West NSW near Mudgee' },
  'benalla':        { region: 'North East Victoria', label: 'Showing results for North East Victoria near Benalla' },
  'seymour':        { region: 'Goulburn Valley', label: 'Showing results for Goulburn Valley near Seymour' },
  'korumburra':     { region: 'West Gippsland', label: 'Showing results for West Gippsland near Korumburra' },
  'bairnsdale':     { region: 'Gippsland', label: 'Showing results for Gippsland near Bairnsdale' },
  'lakes entrance':  { region: 'Gippsland', label: 'Showing results for Gippsland near Lakes Entrance' },
  'margaret river': { region: 'Margaret River', label: 'Showing results for Margaret River region' },
  'dunsborough':    { region: 'Margaret River', label: 'Showing results for Margaret River near Dunsborough' },
  'busselton':      { region: 'Margaret River', label: 'Showing results for Margaret River near Busselton' },
  'kalgoorlie':     { region: 'WA', label: 'Showing results for Western Australia near Kalgoorlie' },
  'albany':         { region: 'WA', label: 'Showing results for Western Australia near Albany' },
  // Extended city-to-region coverage (task #2)
  'berry':          { region: 'Shoalhaven', label: 'Showing results for Shoalhaven near Berry' },
  'kiama':          { region: 'Shoalhaven', label: 'Showing results for Shoalhaven near Kiama' },
  'bowral':         { region: 'Southern Highlands', label: 'Showing results for Southern Highlands near Bowral' },
  'moss vale':      { region: 'Southern Highlands', label: 'Showing results for Southern Highlands near Moss Vale' },
  'mittagong':      { region: 'Southern Highlands', label: 'Showing results for Southern Highlands near Mittagong' },
  'thirroul':       { region: 'Southern Highlands', label: 'Showing results for Illawarra near Thirroul' },
  'mullumbimby':    { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Mullumbimby' },
  'bangalow':       { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Bangalow' },
  'ballina':        { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Ballina' },
  'lennox head':    { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Lennox Head' },
  'murwillumbah':   { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Murwillumbah' },
  'bellingen':      { region: 'Mid North Coast', label: 'Showing results for Mid-North Coast near Bellingen' },
  'sawtell':        { region: 'Mid North Coast', label: 'Showing results for Mid-North Coast near Sawtell' },
  'yamba':          { region: 'Northern Rivers', label: 'Showing results for Northern Rivers near Yamba' },
  'drouin':         { region: 'West Gippsland', label: 'Showing results for West Gippsland near Drouin' },
  'phillip island':  { region: 'West Gippsland', label: 'Showing results for West Gippsland near Phillip Island' },
  'inverloch':      { region: 'West Gippsland', label: 'Showing results for West Gippsland near Inverloch' },
  'paynesville':    { region: 'Gippsland', label: 'Showing results for Gippsland near Paynesville' },
  'mallacoota':     { region: 'Gippsland', label: 'Showing results for Gippsland near Mallacoota' },
  'anglesea':       { region: 'Surf Coast', label: 'Showing results for Surf Coast near Anglesea' },
  'aireys inlet':   { region: 'Surf Coast', label: 'Showing results for Surf Coast near Aireys Inlet' },
  'drysdale':       { region: 'Bellarine Peninsula', label: 'Showing results for Bellarine Peninsula near Drysdale' },
  'queenscliff':    { region: 'Bellarine Peninsula', label: 'Showing results for Bellarine Peninsula near Queenscliff' },
  'portarlington':  { region: 'Bellarine Peninsula', label: 'Showing results for Bellarine Peninsula near Portarlington' },
  'kyneton':        { region: 'Macedon Ranges', label: 'Showing results for Macedon Ranges near Kyneton' },
  'woodend':        { region: 'Macedon Ranges', label: 'Showing results for Macedon Ranges near Woodend' },
  'gisborne':       { region: 'Macedon Ranges', label: 'Showing results for Macedon Ranges near Gisborne' },
  'daylesford':     { region: 'Daylesford', label: 'Showing results for Daylesford region' },
  'hepburn springs': { region: 'Hepburn', label: 'Showing results for Hepburn Springs region' },
  'trentham':       { region: 'Hepburn', label: 'Showing results for Hepburn near Trentham' },
  'yackandandah':   { region: 'North East Victoria', label: 'Showing results for North East Victoria near Yackandandah' },
  'rutherglen':     { region: 'North East Victoria', label: 'Showing results for North East Victoria near Rutherglen' },
  'myrtleford':     { region: 'North East Victoria', label: 'Showing results for North East Victoria near Myrtleford' },
  'tanunda':        { region: 'Barossa', label: 'Showing results for Barossa Valley near Tanunda' },
  'nuriootpa':      { region: 'Barossa', label: 'Showing results for Barossa Valley near Nuriootpa' },
  'angaston':       { region: 'Barossa', label: 'Showing results for Barossa Valley near Angaston' },
  'stirling':       { region: 'Adelaide Hills', label: 'Showing results for Adelaide Hills near Stirling' },
  'hahndorf':       { region: 'Adelaide Hills', label: 'Showing results for Adelaide Hills near Hahndorf' },
  'mt barker':      { region: 'Adelaide Hills', label: 'Showing results for Adelaide Hills near Mt Barker' },
  'mclaren vale':   { region: 'McLaren Vale', label: 'Showing results for McLaren Vale region' },
  'willunga':       { region: 'McLaren Vale', label: 'Showing results for McLaren Vale near Willunga' },
  'huonville':      { region: 'Hobart', label: 'Showing results for Hobart near Huonville' },
  'richmond':       { region: 'Hobart', label: 'Showing results for Hobart near Richmond' },
  'cygnet':         { region: 'Hobart', label: 'Showing results for Hobart near Cygnet' },
  'sheffield':      { region: 'North West Tasmania', label: 'Showing results for North West Tasmania near Sheffield' },
  'deloraine':      { region: 'North West Tasmania', label: 'Showing results for North West Tasmania near Deloraine' },
  'maleny':         { region: 'Sunshine Coast', label: 'Showing results for Sunshine Coast Hinterland near Maleny' },
  'montville':      { region: 'Sunshine Coast', label: 'Showing results for Sunshine Coast Hinterland near Montville' },
  'eumundi':        { region: 'Noosa', label: 'Showing results for Noosa near Eumundi' },
  'kuranda':        { region: 'Far North Queensland', label: 'Showing results for Far North Queensland near Kuranda' },
  'yungaburra':     { region: 'Far North Queensland', label: 'Showing results for Atherton Tablelands near Yungaburra' },
  'tamborine mountain': { region: 'Gold Coast', label: 'Showing results for Gold Coast Hinterland near Tamborine Mountain' },
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
  let city_note = null
  let verticals = []
  let duration = { days: 1 }

  // 1. Try directional state phrases first ("eastern victoria", "north queensland")
  //    These are more specific than REGION_KEYWORDS and should take priority
  const directional = parseDirectionalRegion(q)
  if (directional) {
    geoBounds = directional
    region = directional.label
  }

  // 2. Try CITY_TO_REGION mapping — redirects cities to their nearest covered region
  if (!geoBounds) {
    const cityEntries = Object.entries(CITY_TO_REGION).sort((a, b) => b[0].length - a[0].length)
    for (const [cityName, mapping] of cityEntries) {
      const re = new RegExp(`\\b${cityName.replace(/\s+/g, '\\s+')}\\b`)
      if (re.test(q)) {
        region = mapping.region
        city_note = mapping.label
        geoBounds = resolveGeoBounds(mapping.region, q)
        break
      }
    }
  }

  // 3. Try known region keywords (longest match first)
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

  // 4. Last resort: check for bare state names not caught by REGION_KEYWORDS
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

  // Extract category/vertical hints with preference weighting.
  // Classify each detected vertical based on surrounding context signals:
  //   primary   — the thing they came for (anchors every day)
  //   secondary — "also include..." / explicit supporting interests (1-2 per day)
  //   soft      — "if possible" / "maybe" / hedged (only where it naturally fits)
  const preferences = { primary: [], secondary: [], soft: [] }

  const softCtx = [
    /if\s+(?:there(?:'?s)?|you\s+can|possible)/i,
    /maybe\s+(?:some|a\s+few)/i,
    /wouldn'?t\s+mind/i,
  ]
  const secondaryCtx = [
    /also\s+(?:include|add|visit|see|check)/i,
    /throw\s+in/i,
    /plus\s+(?:some|a\s+few)/i,
  ]

  for (const [vKey, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const sorted = [...keywords].sort((a, b) => b.length - a.length)
    for (const kw of sorted) {
      const kwIdx = q.indexOf(kw)
      if (kwIdx === -1) continue
      if (!verticals.includes(vKey)) verticals.push(vKey)

      // Classify weight from surrounding context (60 chars lookback)
      const before = q.slice(Math.max(0, kwIdx - 60), kwIdx)
      const around = q.slice(Math.max(0, kwIdx - 60), kwIdx + kw.length + 30)

      if (softCtx.some(p => p.test(around))) {
        if (!preferences.soft.includes(vKey)) preferences.soft.push(vKey)
      } else if (secondaryCtx.some(p => p.test(before))) {
        if (!preferences.secondary.includes(vKey)) preferences.secondary.push(vKey)
      } else {
        if (!preferences.primary.includes(vKey)) preferences.primary.push(vKey)
      }
      break
    }
  }

  // If no explicit primary was found, promote the first detected vertical
  if (preferences.primary.length === 0 && verticals.length > 0) {
    preferences.primary.push(verticals[0])
    preferences.secondary = preferences.secondary.filter(v => v !== verticals[0])
    preferences.soft = preferences.soft.filter(v => v !== verticals[0])
  }
  // Dedupe across tiers — higher tier wins
  preferences.secondary = preferences.secondary.filter(v => !preferences.primary.includes(v))
  preferences.soft = preferences.soft.filter(v => !preferences.primary.includes(v) && !preferences.secondary.includes(v))

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

  return { region, geoBounds, verticals, duration, city_note, preferences }
}

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

// Activity-to-vertical mapping — shared between candidate selection and recommendation weighting
const ACTIVITY_TO_VERTICAL = {
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

// Readable labels for activities (for LLM prompt)
const ACTIVITY_LABELS = {
  wine_tasting: 'Wine tasting', craft_beer: 'Craft beer', distillery_tours: 'Distillery tours',
  coffee: 'Specialty coffee',
  hiking: 'Hiking & walks', swimming: 'Swimming holes', lookouts: 'Lookouts', national_parks: 'National parks',
  galleries: 'Galleries', museums: 'Museums', heritage: 'Heritage sites',
  makers_studios: 'Makers & studios', ceramics: 'Ceramics & pottery', woodwork: 'Woodwork',
  farm_gate: 'Farm gates', markets: 'Markets', bakeries: 'Bakeries', providores: 'Providores',
  boutique_stays: 'Boutique stays', glamping: 'Glamping', farm_stays: 'Farm stays',
  bookshops: 'Bookshops', record_stores: 'Record stores', homewares: 'Homewares',
  vintage: 'Vintage', op_shops: 'Op shops', antiques: 'Antiques',
}

// Chronological day ordering: the ideal sequence for stops within a single day.
// Coffee/food first, nature and culture through the day, browsing and craft in
// the afternoon, tastings and drinks in the evening, accommodation last.
const VERTICAL_ORDER = [
  'fine_grounds', // coffee first thing
  'table',        // farm gates, bakeries, providores — morning food stops
  'field',        // nature, hiking, lookouts — active mid-morning
  'collection',   // galleries, museums, heritage — midday culture
  'craft',        // makers, studios — afternoon browsing
  'corner',       // bookshops, homewares — afternoon shopping
  'found',        // vintage, op shops — late afternoon
  'sba',          // wine, brewery, distillery — evening tastings
  'rest',         // accommodation — end of day
]

// Group type → vertical weighting adjustments
const GROUP_VERTICAL_WEIGHTS = {
  family: { boost: ['field', 'table', 'collection'], deprioritise: [] },
  friends: { boost: ['sba', 'table', 'found'], deprioritise: [] },
  solo: { boost: [], deprioritise: [] },
  couple: { boost: [], deprioritise: [] },
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  // Question flow params
  const accommodation = searchParams.get('accommodation') // 'need' | 'sorted' | 'daytrip'
  const transport = searchParams.get('transport')           // 'driving' | 'public' | 'walking'
  const group = searchParams.get('group')                   // 'family' | 'friends' | 'solo' | 'couple'
  const pace = searchParams.get('pace')                     // 'packed' | 'relaxed'
  const anchorId = searchParams.get('anchor')               // listing ID to use as guaranteed stop 1 of day 1

  if (!q || q.trim().length < 3) {
    return NextResponse.json({ error: 'Query parameter "q" is required (min 3 characters)' }, { status: 400 })
  }

  // --- Environment validation — fail fast with a clear message ---
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[itinerary] FATAL: ANTHROPIC_API_KEY not configured')
    logTrailError({ destination: q, errorMessage: 'ANTHROPIC_API_KEY not configured', errorType: 'config_error' })
    return NextResponse.json({ error: 'Trail builder is temporarily unavailable. Please try again later.' }, { status: 500 })
  }

  try {
    // --- Response cache: return a recent cached result if available (24h TTL) ---
    const cacheKey = buildCacheKey(q, { accommodation, transport, group, pace, anchor: anchorId })
    try {
      const { data: cached } = await getSupabaseAdmin()
        .from('user_trails')
        .select('cached_response, created_at')
        .eq('cache_key', cacheKey)
        .eq('source', 'cache')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (cached?.cached_response) {
        console.log(`[itinerary] Cache hit for key ${cacheKey.slice(0, 8)}...`)
        return NextResponse.json({ ...cached.cached_response, cached: true })
      }
    } catch { /* no cache hit — proceed with generation */ }

    let { region, geoBounds, verticals, duration, city_note, preferences } = parseItineraryQuery(q)

    // Pace overrides stops-per-day target
    const stopsPerDay = pace === 'packed' ? 6 : pace === 'relaxed' ? 3 : 4

    // ── Anchor-based region resolution ──────────────────────
    // When a user clicks "Start a trail here" on a listing, the anchor param
    // provides a listing ID. If parseItineraryQuery couldn't resolve a region
    // from the text query (e.g. "1 day in Elsternwick"), use the anchor
    // listing's own coordinates to build a geographic bounding box.
    let anchorRegionSource = null
    if (anchorId && !geoBounds) {
      try {
        const sb = getSupabaseAdmin()
        const { data: anchor } = await sb
          .from('listings')
          .select('lat, lng, region, state, name')
          .eq('id', anchorId)
          .eq('status', 'active')
          .maybeSingle()

        if (anchor?.lat && anchor?.lng) {
          // Build a ~30km bounding box around the anchor listing
          const radius = 0.3 // ~30km in degrees at Australian latitudes
          geoBounds = {
            latMin: anchor.lat - radius,
            latMax: anchor.lat + radius,
            lngMin: anchor.lng - radius,
            lngMax: anchor.lng + radius,
            label: anchor.region || anchor.state || 'anchor',
          }
          region = anchor.region || anchor.state || region
          anchorRegionSource = `anchor listing "${anchor.name}" (${anchor.region || anchor.state})`
          console.log(`[itinerary] Region resolved from anchor: ${anchorRegionSource}`)
        }
      } catch (err) {
        console.warn(`[itinerary] Failed to resolve region from anchor ${anchorId}:`, err.message)
      }
    }

    console.log('[itinerary] Parsed query:', {
      region,
      geoBounds: geoBounds ? `${geoBounds.label || 'custom'} (${geoBounds.latMin.toFixed(2)}–${geoBounds.latMax.toFixed(2)}, ${geoBounds.lngMin.toFixed(2)}–${geoBounds.lngMax.toFixed(2)})` : 'NONE',
      verticals, duration, preferences,
      flow: { accommodation, transport, group, pace, stopsPerDay },
      anchorRegionSource: anchorRegionSource || 'none',
    })

    // STEP 1: Region must be detected. If the user's query names a place we can't
    // resolve, return an honest error rather than silently serving random venues.
    if (!geoBounds) {
      console.warn('[itinerary] No geographic anchor resolved from query:', q)

      // Suggest well-covered regions the user might mean
      const topRegions = ['Melbourne', 'Sydney', 'Barossa', 'Hobart', 'Blue Mountains', 'Mornington Peninsula', 'Byron', 'Adelaide Hills']
      const suggestedTrails = topRegions.slice(0, 3).map(r => ({
        query: `Day trip to ${r}`,
        region: r,
      }))

      return NextResponse.json({
        error: 'no_region',
        message: `We couldn't identify a specific region in your request. Try naming a place — like "Barossa Valley", "Hobart", or "Eastern Victoria".`,
        query: q,
        region: null,
        suggested_trails: suggestedTrails,
      }, { status: 200 })
    }

    // Fetch user preferences if authenticated
    let userInterests = null
    let isAuthenticated = false
    try {
      const { createAuthServerClient } = await import('@/lib/supabase/auth-clients')
      const authSb = await createAuthServerClient()
      const { data: { user } } = await authSb.auth.getUser()
      if (user) {
        isAuthenticated = true
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

    // Derive preferred verticals from user interests
    const preferredVerticals = new Set()
    const preferenceLabels = []
    if (userInterests?.verticals) {
      userInterests.verticals.forEach(v => preferredVerticals.add(v))
    }
    if (userInterests?.activities) {
      userInterests.activities.forEach(a => {
        if (ACTIVITY_TO_VERTICAL[a]) preferredVerticals.add(ACTIVITY_TO_VERTICAL[a])
        if (ACTIVITY_LABELS[a]) preferenceLabels.push(ACTIVITY_LABELS[a])
      })
    }

    // Apply group-type vertical weighting
    const groupWeights = GROUP_VERTICAL_WEIGHTS[group] || { boost: [], deprioritise: [] }

    // Merge: query verticals + user preference verticals (query takes priority)
    const effectiveVerticals = verticals.length > 0
      ? verticals
      : preferredVerticals.size > 0
        ? [...preferredVerticals]
        : []

    // Transport mode → tighter geo bounds for walking/cycling
    let effectiveGeoBounds = geoBounds
    if (transport === 'walking') {
      // Constrain to ~5km radius from center
      const centerLat = (geoBounds.latMin + geoBounds.latMax) / 2
      const centerLng = (geoBounds.lngMin + geoBounds.lngMax) / 2
      effectiveGeoBounds = {
        ...geoBounds,
        latMin: centerLat - 0.045, latMax: centerLat + 0.045,
        lngMin: centerLng - 0.055, lngMax: centerLng + 0.055,
      }
    } else if (transport === 'public') {
      // Slightly tighter — ~15km radius (town center focused)
      const centerLat = (geoBounds.latMin + geoBounds.latMax) / 2
      const centerLng = (geoBounds.lngMin + geoBounds.lngMax) / 2
      const latRange = (geoBounds.latMax - geoBounds.latMin) * 0.5
      const lngRange = (geoBounds.lngMax - geoBounds.lngMin) * 0.5
      effectiveGeoBounds = {
        ...geoBounds,
        latMin: centerLat - Math.min(latRange, 0.14),
        latMax: centerLat + Math.min(latRange, 0.14),
        lngMin: centerLng - Math.min(lngRange, 0.17),
        lngMax: centerLng + Math.min(lngRange, 0.17),
      }
    }

    // Query candidate venues from master listings
    const sb = getSupabaseAdmin()
    const LISTING_COLS = 'id, name, vertical, lat, lng, region, state, description, hero_image_url, slug, source_id, is_claimed, is_featured, editors_pick'

    // Helper: build a base query with status + coordinate filters + geo bounds.
    // trail_suitable filter excludes listings explicitly marked unsuitable
    // (retail-only, workshops). NULL = not yet classified, still included.
    function baseQuery() {
      let q = sb
        .from('listings')
        .select(LISTING_COLS)
        .eq('status', 'active')
        .or('address_on_request.eq.false,address_on_request.is.null')
        .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
        .or('trail_suitable.eq.true,trail_suitable.is.null')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
      return applyGeoFilter(q, effectiveGeoBounds)
    }

    // Start semantic search in parallel with geo queries (non-blocking).
    // Uses Voyage-3 query embedding + geo-filtered cosine similarity via pgvector.
    // Falls back gracefully if VOYAGE_API_KEY is missing or embeddings aren't populated.
    const semanticPromise = (async () => {
      const embedding = await generateQueryEmbedding(q)
      if (!embedding) return []
      try {
        const { data, error: rpcErr } = await sb.rpc('search_listings_geo', {
          query_embedding: `[${embedding.join(',')}]`,
          lat_min: effectiveGeoBounds.latMin,
          lat_max: effectiveGeoBounds.latMax,
          lng_min: effectiveGeoBounds.lngMin,
          lng_max: effectiveGeoBounds.lngMax,
          match_threshold: 0.6,
          match_count: 30,
        })
        if (rpcErr) throw rpcErr
        return data || []
      } catch (err) {
        console.warn('[itinerary] Semantic search failed (non-fatal):', err.message)
        return []
      }
    })()

    // Accommodation handling: exclude rest from candidates if daytrip
    const includeRest = accommodation !== 'daytrip'

    let query = baseQuery()

    // For single-day trips with specific verticals, filter tightly
    if (effectiveVerticals.length > 0 && duration.days <= 1) {
      const allVerticals = includeRest
        ? [...new Set([...effectiveVerticals, 'rest'])]
        : [...new Set(effectiveVerticals)].filter(v => v !== 'rest')
      query = query.in('vertical', allVerticals)
    }

    query = query.limit(80)

    let candidates
    let error

    // For multi-day trips with focus verticals, fetch focus venues first then supplement
    if (effectiveVerticals.length > 0 && duration.days > 1) {
      const focusVerticals = includeRest
        ? [...new Set([...effectiveVerticals, 'rest'])]
        : [...new Set(effectiveVerticals)].filter(v => v !== 'rest')
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
    if (effectiveVerticals.length > 0 && duration.days <= 1 && (!candidates || candidates.length < 4)) {
      const broadQuery = baseQuery()
      const { data: broadCandidates } = await broadQuery.limit(80)
      if (broadCandidates && broadCandidates.length >= 4) {
        // Preserve focus-vertical candidates; supplement (not replace) with broad results
        const focusIds = new Set((candidates || []).map(c => c.id))
        const supplements = broadCandidates.filter(c => !focusIds.has(c.id))
        candidates = [...(candidates || []), ...supplements].slice(0, 80)
      }
    }

    // Merge semantic search results into candidate pool
    const semanticResults = await semanticPromise
    const semanticMatchIds = new Set()
    if (semanticResults.length > 0) {
      const existingIds = new Set((candidates || []).map(c => c.id))
      let added = 0
      for (const sr of semanticResults) {
        semanticMatchIds.add(sr.id)
        if (!existingIds.has(sr.id)) {
          if (!candidates) candidates = []
          candidates.push(sr)
          added++
        }
      }
      console.log(`[itinerary] Semantic search: ${semanticResults.length} matches, ${added} new candidates, ${semanticResults.length - added} existing boosted`)
    }

    // Guarantee rest venues when accommodation is needed (or any multi-day trip
    // where the user hasn't said "sorted" or "daytrip").
    const shouldGuaranteeRest = duration.days > 1 && accommodation !== 'sorted' && accommodation !== 'daytrip'
    if (shouldGuaranteeRest) {
      const restInPool = (candidates || []).filter(c => c.vertical === 'rest').length
      const nightsNeeded = duration.days - 1
      if (restInPool < nightsNeeded + 1) {
        console.log(`[itinerary] Only ${restInPool} rest venues in pool, need ${nightsNeeded + 1}. Fetching more.`)
        const { data: restVenues } = await baseQuery().eq('vertical', 'rest').limit(nightsNeeded + 5)
        if (restVenues?.length > 0) {
          const existingIds = new Set((candidates || []).map(c => c.id))
          const newRest = restVenues.filter(v => !existingIds.has(v.id))
          candidates = [...(candidates || []), ...newRest]
          console.log(`[itinerary] Added ${newRest.length} rest venues to candidate pool`)
        }
      }
    }

    // Sort candidates: boost query verticals, claimed/featured venues, user preferences, semantic matches, and group-appropriate verticals
    candidates.sort((a, b) => {
      const aScore = (a.is_claimed ? 3 : 0) + (a.editors_pick ? 2 : 0) + (a.is_featured ? 1 : 0)
        + (effectiveVerticals.includes(a.vertical) ? 4 : 0)
        + (preferredVerticals.has(a.vertical) ? 2 : 0)
        + (groupWeights.boost.includes(a.vertical) ? 1 : 0)
        - (groupWeights.deprioritise.includes(a.vertical) ? 1 : 0)
        + (semanticMatchIds.has(a.id) ? 3 : 0)
      const bScore = (b.is_claimed ? 3 : 0) + (b.editors_pick ? 2 : 0) + (b.is_featured ? 1 : 0)
        + (effectiveVerticals.includes(b.vertical) ? 4 : 0)
        + (preferredVerticals.has(b.vertical) ? 2 : 0)
        + (groupWeights.boost.includes(b.vertical) ? 1 : 0)
        - (groupWeights.deprioritise.includes(b.vertical) ? 1 : 0)
        + (semanticMatchIds.has(b.id) ? 3 : 0)
      return bScore - aScore
    })

    if (!candidates || candidates.length < 4) {
      // Find nearby regions with better coverage to suggest alternatives
      const centerLat = (geoBounds.latMin + geoBounds.latMax) / 2
      const centerLng = (geoBounds.lngMin + geoBounds.lngMax) / 2
      const nearbyRegions = []

      for (const [name, anchor] of Object.entries(GEO_ANCHORS)) {
        if (name === region || name === geoBounds?.label) continue
        const dist = Math.sqrt(Math.pow(anchor.lat - centerLat, 2) + Math.pow(anchor.lng - centerLng, 2))
        if (dist < 2.5) { // ~275km radius
          nearbyRegions.push({ name, dist })
        }
      }
      nearbyRegions.sort((a, b) => a.dist - b.dist)

      // Check which nearby regions have decent coverage
      const suggestedAlternatives = []
      for (const nr of nearbyRegions.slice(0, 8)) {
        const nrAnchor = GEO_ANCHORS[nr.name]
        if (!nrAnchor) continue
        const { count } = await sb
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active')
          .not('lat', 'is', null)
          .gte('lat', nrAnchor.lat - nrAnchor.r)
          .lte('lat', nrAnchor.lat + nrAnchor.r)
          .gte('lng', nrAnchor.lng - nrAnchor.r)
          .lte('lng', nrAnchor.lng + nrAnchor.r)
        if (count >= 5) {
          suggestedAlternatives.push({ region: nr.name, listing_count: count })
          if (suggestedAlternatives.length >= 3) break
        }
      }

      // Build suggested trail queries
      const suggestedTrails = suggestedAlternatives.map(alt => ({
        query: `${duration.days > 1 ? duration.days + ' day' : 'Day'} trip to ${alt.region}`,
        region: alt.region,
        listing_count: alt.listing_count,
      }))

      // Log thin coverage to candidates queue for acquisition prioritisation
      try {
        await sb.from('listing_candidates').upsert({
          name: `[Coverage gap] ${region || geoBounds?.label}`,
          region: region || geoBounds?.label,
          vertical: effectiveVerticals[0] || null,
          source: 'coverage_gap',
          source_detail: `Trail query "${q}" returned only ${candidates?.length || 0} venues. Region needs more listings.`,
          confidence: 0.1,
          status: 'pending',
        }, { onConflict: 'name,region', ignoreDuplicates: true }).catch(() => {})
      } catch { /* non-blocking */ }

      return NextResponse.json({
        error: 'insufficient_venues',
        message: `We found ${candidates?.length || 0} verified listing${(candidates?.length || 0) !== 1 ? 's' : ''} in ${region || geoBounds?.label || 'this area'} — not quite enough to build a full trail yet. ${suggestedAlternatives.length > 0 ? 'These nearby regions have stronger coverage:' : 'Try a larger city or popular region like Melbourne, Barossa, or Blue Mountains.'}`,
        venue_count: candidates?.length || 0,
        region: region || null,
        region_label: geoBounds?.label || region || null,
        suggested_alternatives: suggestedAlternatives,
        suggested_trails: suggestedTrails,
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
      source_id: v.source_id || null,
      hero_image_url: v.hero_image_url || null,
      is_claimed: v.is_claimed || false,
      is_featured: v.is_featured || false,
      editors_pick: v.editors_pick || false,
    }))

    const candidateIds = new Set(venueData.map(v => v.id))

    // --- Anchor listing: guaranteed stop 1 of day 1 ---
    let anchorListing = null
    if (anchorId) {
      // Check if the anchor is already in the candidate pool
      const existingAnchor = venueData.find(v => String(v.id) === String(anchorId))
      if (existingAnchor) {
        anchorListing = existingAnchor
      } else {
        // Fetch anchor from DB — it may be outside the geo bounds, and that's OK
        try {
          const { data: anchorData } = await sb
            .from('listings')
            .select('id, name, vertical, lat, lng, region, state, description, hero_image_url, slug, source_id, is_claimed, is_featured, editors_pick')
            .eq('id', anchorId)
            .eq('status', 'active')
            .single()

          if (anchorData) {
            const formatted = {
              id: anchorData.id,
              name: anchorData.name,
              vertical: anchorData.vertical,
              vertical_label: VERTICAL_LABELS[anchorData.vertical] || anchorData.vertical,
              lat: anchorData.lat,
              lng: anchorData.lng,
              region: anchorData.region,
              state: anchorData.state,
              description: anchorData.description ? anchorData.description.slice(0, 200) : null,
              slug: anchorData.slug,
              source_id: anchorData.source_id || null,
              hero_image_url: anchorData.hero_image_url || null,
              is_claimed: anchorData.is_claimed || false,
              is_featured: anchorData.is_featured || false,
              editors_pick: anchorData.editors_pick || false,
            }
            // Prepend anchor to venue data so it's the first candidate
            venueData.unshift(formatted)
            candidateIds.add(formatted.id)
            anchorListing = formatted
          }
        } catch (err) {
          console.warn(`[itinerary] Failed to fetch anchor listing ${anchorId}:`, err.message)
          // Continue without anchor — it's not critical
        }
      }

      if (anchorListing) {
        console.log(`[itinerary] Anchor listing: "${anchorListing.name}" (id=${anchorListing.id}, ${anchorListing.vertical})`)
      }
    }

    // Build the Anthropic API call
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Build accommodation instruction for LLM
    let accommodationInstruction = ''
    if (accommodation === 'sorted') {
      accommodationInstruction = `\nACCOMMODATION: The user has their own accommodation sorted. Do NOT include overnight stays as itinerary stops. Set "overnight" to null for all days. If you see "rest" vertical venues in the candidate list, you may mention them as optional suggestions in notes but do not make them stops.`
    } else if (accommodation === 'daytrip') {
      accommodationInstruction = `\nACCOMMODATION: This is a day trip — no overnight stays needed. Set "overnight" to null.`
    } else if (accommodation === 'need' || duration.days > 1) {
      accommodationInstruction = `\nACCOMMODATION: The user needs accommodation. REQUIRED for multi-day trips:
- Each day (except the final day) MUST have an "overnight" field containing a "rest" vertical venue
- Each day MUST have a DIFFERENT accommodation listing — do NOT reuse the same property across multiple days unless there are genuinely fewer Rest Atlas listings available than days, in which case mark consecutive nights as a multi-night stay by adding "(2-night stay)" to the note
- The accommodation MUST be in or near that day's geographic cluster — never across the state
- If no "rest" venue exists near a day's stops, set overnight to null and include "accommodation_gap": true in that day so the UI can show a fallback message
- The "overnight" field is separate from the "stops" array — accommodation does NOT count as a numbered stop
- Accommodation is non-negotiable when nights are specified — every night needs a place to stay`
    }

    // Build transport instruction
    let transportInstruction = ''
    if (transport === 'public') {
      transportInstruction = `\nTRANSPORT: The user is using public transport. Prefer venues in or near town centres. If a venue requires driving, mention this in the note (e.g. "you'll need a taxi for this one"). Keep stops geographically tight.`
    } else if (transport === 'walking') {
      transportInstruction = `\nTRANSPORT: The user is walking or cycling. Only include venues within easy walking/cycling distance of each other. All stops should be very close together geographically. Flag any venue that would require other transport.`
    } else {
      transportInstruction = `\nTRANSPORT: The user is driving. Plan a geographically coherent road trip:
- Day 1 stops should cluster around a logical starting point
- Each subsequent day should progress in a sensible direction — no jumping back and forth across the map
- The overall trail must have a clear arc: start point → journey → end point
- Do not include stops that require significant backtracking
- Sort stops within each day by proximity to minimise drive time between them`
    }

    // Build group instruction
    let groupInstruction = ''
    if (group === 'family') {
      groupInstruction = `\nGROUP: Family with kids. Avoid scheduling three alcohol-focused stops in a row. Weight toward nature, food, cultural experiences, and venues with family-friendly appeal. Mix in breaks and lunch stops.`
    } else if (group === 'friends') {
      groupInstruction = `\nGROUP: Group of friends. Weight toward social, shared experiences — tastings, markets, lively venues. Food and drink stops work well.`
    } else if (group === 'couple') {
      groupInstruction = `\nGROUP: Couple. Use preferences as the primary signal. No special constraints.`
    }

    // Build pace instruction
    const paceInstruction = pace === 'packed'
      ? `\nPACE: Packed schedule — aim for ${stopsPerDay} stops per day. Tight scheduling, minimal downtime.`
      : pace === 'relaxed'
      ? `\nPACE: Relaxed pace — aim for ${stopsPerDay} stops per day. Include breathing room between stops. Suggest a coffee break or long lunch. Keep it unhurried.`
      : `\nPACE: Moderate pace — aim for ${stopsPerDay} stops per day.`

    // Build anchor instruction — forces a specific listing as stop 1 of day 1
    let anchorInstruction = ''
    if (anchorListing) {
      anchorInstruction = `\nANCHOR VENUE (MANDATORY): The user started trail-building from a specific listing. This venue MUST be the FIRST stop of Day 1 — no exceptions.
- Listing ID: ${anchorListing.id}
- Name: "${anchorListing.name}"
- Vertical: ${anchorListing.vertical}
Place it as stops[0] on day 1, regardless of the day-sequencing rules above. The rest of the day should flow naturally from this starting point. Build the remaining itinerary around the anchor's location.`
    }

    // Build user preferences section for LLM
    let preferencesPrompt = ''
    if (userInterests) {
      const parts = []
      if (preferenceLabels.length > 0) parts.push(`Favourite activities: ${preferenceLabels.join(', ')}`)
      if (userInterests.verticals?.length > 0) {
        parts.push(`Preferred verticals: ${userInterests.verticals.map(v => VERTICAL_LABELS[v] || v).join(', ')}`)
      }
      if (userInterests.regions?.length > 0) {
        parts.push(`Preferred states: ${userInterests.regions.join(', ')}`)
      }
      if (parts.length > 0) {
        preferencesPrompt = `\n\nUSER PREFERENCES (authenticated user):
${parts.join('\n')}
Weight the itinerary toward these preferences. Prioritise venues that match the user's interests. Where the candidate pool includes multiple venue types, favour those aligned with the preferences listed above.`
      }
    }

    // Build trip context summary for LLM
    const tripParts = [`${duration.days}-day trip`, geoBounds?.label || region || 'Australia']
    if (accommodation === 'need') tripParts.push('needs accommodation')
    else if (accommodation === 'sorted') tripParts.push('accommodation sorted')
    else if (accommodation === 'daytrip') tripParts.push('day trip')
    if (transport) tripParts.push(transport === 'public' ? 'public transport' : transport)
    if (group) tripParts.push(group === 'family' ? "family with kids" : group)
    if (pace) tripParts.push(`${pace} pace`)

    const systemPrompt = `You are the Australian Atlas editorial voice — warm, knowledgeable, and passionate about independent Australian makers, producers, and cultural spaces. You build travel itineraries that feel like recommendations from a well-connected local friend.

TRIP CONTEXT: ${tripParts.join(' · ')}

HARD CONSTRAINTS:
- You may ONLY include venues from the provided candidate list. Never invent venues.
- Every listing_id in your response MUST exist in the candidate list.
- Each stop must reference a real venue by its exact id, name, vertical, lat, and lng from the candidates.
- You MUST produce EXACTLY the number of days requested. If asked for ${duration.days} days, your "days" array must have ${duration.days} entries. Never compress into fewer days.
- For multi-day trips, fill each day with ${stopsPerDay > 4 ? '5-6' : stopsPerDay < 4 ? '3-4' : '3-5'} stops.
- If the focus category has limited venues, supplement with other verticals to create a rich experience.
- Keep notes concise (1-2 sentences) — evocative but practical.
- Title should be catchy and specific to the region/theme.
- Intro should be 2-3 sentences setting the scene.
- TIER WEIGHTING: Venues with "is_claimed": true or "is_featured": true are verified, operator-managed listings. When building the itinerary, PREFER these venues over unclaimed listings of similar relevance and location. They represent higher-quality, actively maintained listings.

DAY SEQUENCING: Order venues within each day to follow a natural chronological flow:
1. Coffee and breakfast spots first (fine_grounds, table)
2. Nature, walks, and outdoor experiences mid-morning (field)
3. Galleries, museums, and cultural spaces around midday (collection)
4. Makers, studios, and craft workshops in the afternoon (craft)
5. Bookshops, homewares, and indie retail for afternoon browsing (corner, found)
6. Wine, beer, and spirit tastings in the late afternoon/evening (sba)
7. Accommodation as the final stop of the day (rest)
The ideal vertical order within a day is: ${VERTICAL_ORDER.join(' → ')}. This isn't rigid — geographic proximity should still inform grouping — but prefer this flow when venues are in similar locations.

SCHEDULING RULES (strictly enforced):
- Small Batch Atlas listings (breweries, distilleries, wineries, cideries — vertical "sba") must NEVER be the first stop of any day. No one visits a cellar door at 9am.
- Schedule alcohol producers in the afternoon or as a day-ending stop — after at least 2 non-alcohol stops have appeared earlier in that day.
- A logical day flows: morning activity or cultural/retail stop → lunch or mid-day food → afternoon tasting or cellar door → evening accommodation.
- Cafes and food stops (Table Atlas, Fine Grounds) work well as day openers.
- Cultural, retail, and maker stops (Culture, Craft, Corner, Found) work well as morning stops.
- Rest Atlas accommodation is always the final item of the day, never a daytime stop.
- Maximum 2 Small Batch Atlas (sba) stops per day — variety across verticals is the point of the Atlas Network. Even on a wine- or distillery-focused trip, balance each day with non-alcohol experiences.

GEOGRAPHIC COHERENCE: All stops in the itinerary must be geographically tight.
- For city trips: all stops should be within ~25km of each other. Never include a venue 50+ km away.
- For regional trips: stops should cluster within the core region. Avoid venues on the geographic fringe of the candidate list.
- Before selecting a venue, check its lat/lng against the other stops you've chosen. If it's significantly further away than the rest, skip it and pick a closer alternative.
- A compact, walkable/drivable itinerary is ALWAYS better than a geographically scattered one, even if it means missing a "better" venue.
${anchorInstruction}${accommodationInstruction}${transportInstruction}${groupInstruction}${paceInstruction}${preferencesPrompt}

Respond with valid JSON only. No markdown, no code fences, just the JSON object.`

    // Count focus-vertical venues in the candidate pool
    const focusCount = effectiveVerticals.length > 0
      ? venueData.filter(v => effectiveVerticals.includes(v.vertical)).length
      : 0
    const totalStopsNeeded = duration.days * stopsPerDay

    // Build preference hierarchy for the LLM — primary anchors the trip, secondary supports, soft fills gaps
    let focusNote = ''
    if (preferences.primary.length > 0 || preferences.secondary.length > 0 || preferences.soft.length > 0) {
      const parts = []

      if (preferences.primary.length > 0) {
        const primaryLabels = preferences.primary.map(v => VERTICAL_LABELS[v] || v).join(', ')
        const primaryCount = venueData.filter(v => preferences.primary.includes(v.vertical)).length
        parts.push(`PRIMARY INTEREST (must anchor every day): ${primaryLabels}
At least 60% of all stops MUST be from the primary vertical(s): ${preferences.primary.join(', ')}. Every day must contain at least one primary-interest stop. This is what the user came for — it dominates the itinerary.${primaryCount < totalStopsNeeded ? `\nNOTE: Only ${primaryCount} primary-interest venues available. Use ALL of them. Fill remaining slots with complementary verticals. Acknowledge in the intro that ${primaryLabels} coverage is still growing in this area.` : ''}`)
      }

      if (preferences.secondary.length > 0) {
        const secondaryLabels = preferences.secondary.map(v => VERTICAL_LABELS[v] || v).join(', ')
        parts.push(`SECONDARY INTERESTS (supporting, 1-2 per day max): ${secondaryLabels}
These complement the primary interest. Include where they fit geographically but never let them outweigh the primary stops.`)
      }

      if (preferences.soft.length > 0) {
        const softLabels = preferences.soft.map(v => VERTICAL_LABELS[v] || v).join(', ')
        parts.push(`SOFT PREFERENCES (low priority, max 1-2 across entire trip): ${softLabels}
Include only where they genuinely fit the route without displacing primary or secondary stops. Even if there are hundreds of venues in this category, it was a casual "if possible" request — it must NOT dominate the itinerary.`)
      }

      focusNote = '\n\nPREFERENCE HIERARCHY:\n' + parts.join('\n\n')
      focusNote += '\n\nCRITICAL: Never let the size of a category\'s dataset influence its share of stops. A soft preference with 200 available venues gets FEWER stops than a primary interest with 10 venues.'
    } else if (effectiveVerticals.length > 0) {
      focusNote = `\nThe user is interested in: ${effectiveVerticals.map(v => VERTICAL_LABELS[v] || v).join(', ')}.
VENUE TYPE PRIORITY: At least 60% of all stops MUST be from these verticals.
Supplementary stops should complement the theme, not dominate it.`
    }

    const userPrompt = `Build a ${duration.days}-day itinerary for this request: "${q}"
${focusNote}
IMPORTANT: You MUST produce exactly ${duration.days} day(s) with ${stopsPerDay > 4 ? '5-6' : stopsPerDay < 4 ? '3-4' : '3-5'} stops each. Do not compress into fewer days.

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

Aim for ${stopsPerDay > 4 ? '5-6' : stopsPerDay < 4 ? '3-4' : '3-5'} stops per day. Make it flow geographically. Favour the requested vertical(s) heavily. You MUST have exactly ${duration.days} entries in the "days" array.`

    let itinerary
    let rawText = null
    let usedFallback = false

    try {
      const response = await callAnthropicWithRetry(anthropic, {
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
      })

      // Extract text response
      const textBlock = response.content.find(b => b.type === 'text')
      if (!textBlock) {
        throw new Error('No text block in Claude response')
      }

      // Parse JSON from response (strip any accidental markdown fences)
      rawText = textBlock.text.trim()
      if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      }

      itinerary = JSON.parse(rawText)
    } catch (claudeErr) {
      const isTimeout = claudeErr.message === 'CLAUDE_TIMEOUT'
      const isParseError = claudeErr instanceof SyntaxError
      const errorType = isTimeout ? 'timeout' : isParseError ? 'parse_error' : 'api_error'

      console.error(`[itinerary] Claude ${errorType}:`, claudeErr.message)
      logTrailError({
        destination: geoBounds?.label || region || q,
        preferences: { accommodation, transport, group, pace },
        errorMessage: claudeErr.message,
        errorType,
        rawResponse: rawText || null,
      })

      // FALLBACK: Build a simplified itinerary directly from venue data
      console.warn('[itinerary] Using fallback itinerary builder')
      itinerary = buildFallbackItinerary(venueData, { region: geoBounds?.label || region, duration, stopsPerDay })
      usedFallback = true
    }

    // Validate & strip: remove any stops whose listing_id doesn't exist in candidates.
    // The LLM is instructed to only use candidate venues, but occasionally hallucinates.
    let strippedCount = 0
    let enrichedDays = (itinerary.days || []).map(day => {
      const enrichedStops = (day.stops || []).reduce((acc, stop) => {
        const candidate = venueData.find(v => String(v.id) === String(stop.listing_id))
        if (!candidate) {
          console.warn(`[itinerary] STRIPPED hallucinated stop: listing_id ${stop.listing_id} ("${stop.venue_name}") not in candidate pool`)
          strippedCount++
          return acc // skip this stop entirely
        }
        acc.push({
          ...stop,
          slug: candidate.slug || null,
          source_id: candidate.source_id || null,
          hero_image_url: candidate.hero_image_url || null,
          region: candidate.region || null,
        })
        return acc
      }, [])

      let enrichedOvernight = day.overnight
      if (enrichedOvernight?.listing_id) {
        const candidate = venueData.find(v => String(v.id) === String(enrichedOvernight.listing_id))
        if (!candidate) {
          console.warn(`[itinerary] STRIPPED hallucinated overnight: listing_id ${enrichedOvernight.listing_id} ("${enrichedOvernight.venue_name}") not in candidate pool`)
          strippedCount++
          enrichedOvernight = null // remove invalid overnight
        } else {
          enrichedOvernight = {
            ...enrichedOvernight,
            slug: candidate.slug || null,
            source_id: candidate.source_id || null,
            hero_image_url: candidate.hero_image_url || null,
            region: candidate.region || null,
          }
        }
      }

      return { ...day, stops: enrichedStops, overnight: enrichedOvernight }
    })
    // Remove any days that ended up completely empty after stripping
    .filter(day => (day.stops?.length || 0) > 0 || day.overnight)

    if (strippedCount > 0) {
      console.warn(`[itinerary] Stripped ${strippedCount} hallucinated venue(s) from LLM output`)
    }

    // --- Geographic outlier filter ---
    // Remove stops that are geographically far from the cluster centroid.
    // This catches venues the LLM placed from the edges of the geo bounding box
    // that would make the itinerary impractical (e.g. a Central Coast venue on a Sydney trip).
    {
      // Max radius from centroid: tighter for day trips/walking, wider for multi-day driving
      const maxRadiusKm = transport === 'walking' ? 8
        : transport === 'public' ? 20
        : duration.days > 1 ? 60
        : 35

      // Collect all stop coordinates to find centroid
      const allCoords = []
      for (const day of enrichedDays) {
        for (const stop of (day.stops || [])) {
          if (stop.lat && stop.lng) allCoords.push({ lat: parseFloat(stop.lat), lng: parseFloat(stop.lng) })
        }
        if (day.overnight?.lat && day.overnight?.lng) {
          allCoords.push({ lat: parseFloat(day.overnight.lat), lng: parseFloat(day.overnight.lng) })
        }
      }

      if (allCoords.length >= 3) {
        const cLat = allCoords.reduce((s, c) => s + c.lat, 0) / allCoords.length
        const cLng = allCoords.reduce((s, c) => s + c.lng, 0) / allCoords.length

        let outlierCount = 0
        enrichedDays = enrichedDays.map(day => {
          const filteredStops = (day.stops || []).filter(stop => {
            if (!stop.lat || !stop.lng) return true // keep stops without coords (rare)
            // Never remove the anchor listing — it's the user's chosen starting point
            if (anchorListing && String(stop.listing_id) === String(anchorListing.id)) return true
            const dist = haversineKm(cLat, cLng, parseFloat(stop.lat), parseFloat(stop.lng))
            if (dist > maxRadiusKm) {
              console.warn(`[itinerary] OUTLIER removed: "${stop.venue_name}" is ${Math.round(dist)}km from cluster center (max ${maxRadiusKm}km)`)
              outlierCount++
              return false
            }
            return true
          })

          // Check overnight too
          let overnight = day.overnight
          if (overnight?.lat && overnight?.lng) {
            const dist = haversineKm(cLat, cLng, parseFloat(overnight.lat), parseFloat(overnight.lng))
            if (dist > maxRadiusKm) {
              console.warn(`[itinerary] OUTLIER removed overnight: "${overnight.venue_name}" is ${Math.round(dist)}km from center`)
              overnight = null
              outlierCount++
            }
          }

          return { ...day, stops: filteredStops, overnight }
        }).filter(day => (day.stops?.length || 0) > 0 || day.overnight)

        if (outlierCount > 0) {
          strippedCount += outlierCount
          console.log(`[itinerary] Removed ${outlierCount} geographic outlier(s) (>${maxRadiusKm}km from centroid)`)
        }
      }
    }

    // --- Anchor listing guarantee ---
    // If an anchor listing was requested, ensure it's stop 1 of day 1.
    // The LLM is instructed to do this, but if it didn't, we inject it here.
    if (anchorListing && enrichedDays.length > 0) {
      const day1 = enrichedDays[0]
      const anchorInDay1 = (day1.stops || []).find(s => String(s.listing_id) === String(anchorListing.id))

      if (!anchorInDay1) {
        // Remove anchor from any other day (if it ended up elsewhere)
        for (const day of enrichedDays) {
          day.stops = (day.stops || []).filter(s => String(s.listing_id) !== String(anchorListing.id))
        }

        // Prepend anchor as stop 1 of day 1
        const anchorStop = {
          listing_id: anchorListing.id,
          venue_name: anchorListing.name,
          vertical: anchorListing.vertical,
          lat: anchorListing.lat,
          lng: anchorListing.lng,
          slug: anchorListing.slug || null,
          source_id: anchorListing.source_id || null,
          hero_image_url: anchorListing.hero_image_url || null,
          region: anchorListing.region || null,
          note: `Your starting point — the venue that inspired this trail.`,
          is_anchor: true,
        }
        enrichedDays[0].stops = [anchorStop, ...(enrichedDays[0].stops || [])]
        console.log(`[itinerary] Anchor "${anchorListing.name}" injected as stop 1 of day 1`)
      } else {
        // Anchor is in day 1 — make sure it's first and mark it
        const idx = day1.stops.indexOf(anchorInDay1)
        if (idx > 0) {
          // Move to position 0
          day1.stops.splice(idx, 1)
          day1.stops.unshift(anchorInDay1)
        }
        anchorInDay1.is_anchor = true
      }
    }

    // --- Vertical ratio enforcement ---
    // Verify the primary vertical(s) dominate the itinerary (≥50% of stops).
    // If below threshold, retry once with a stricter prompt.
    const primaryVerticals = preferences.primary.length > 0 ? preferences.primary : effectiveVerticals
    let ratioResult = primaryVerticals.length > 0
      ? enforceVerticalRatio(enrichedDays, primaryVerticals)
      : null
    let ratioRetried = false

    if (ratioResult && !ratioResult.passed && !usedFallback) {
      console.warn(`[itinerary] Vertical ratio check failed: ${(ratioResult.ratio * 100).toFixed(0)}% primary (${ratioResult.primaryStops}/${ratioResult.totalStops} stops). Retrying with stricter prompt.`)

      const stricterSystem = systemPrompt + `\n\nCRITICAL RATIO OVERRIDE: Your previous attempt had only ${(ratioResult.ratio * 100).toFixed(0)}% of stops from the primary vertical(s) (${primaryVerticals.map(v => VERTICAL_LABELS[v] || v).join(', ')}). This MUST be at least 50%. Replace non-primary stops with primary-vertical venues from the candidate list. Do not pad with unrelated verticals.`

      try {
        const retryResponse = await callAnthropicWithRetry(anthropic, {
          model: MODEL,
          max_tokens: 4096,
          messages: [{ role: 'user', content: userPrompt }],
          system: stricterSystem,
        })

        const retryText = retryResponse.content.find(b => b.type === 'text')
        if (retryText) {
          let retryRaw = retryText.text.trim()
          if (retryRaw.startsWith('```')) {
            retryRaw = retryRaw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
          }

          try {
            const retryItinerary = JSON.parse(retryRaw)

            // Re-run hallucination strip on retry result
            let retryStrippedCount = 0
            const retryDays = (retryItinerary.days || []).map(day => {
              const stops = (day.stops || []).reduce((acc, stop) => {
                const candidate = venueData.find(v => String(v.id) === String(stop.listing_id))
                if (!candidate) { retryStrippedCount++; return acc }
                acc.push({
                  ...stop,
                  slug: candidate.slug || null,
                  source_id: candidate.source_id || null,
                  hero_image_url: candidate.hero_image_url || null,
                  region: candidate.region || null,
                })
                return acc
              }, [])

              let overnight = day.overnight
              if (overnight?.listing_id) {
                const candidate = venueData.find(v => String(v.id) === String(overnight.listing_id))
                if (!candidate) { retryStrippedCount++; overnight = null }
                else {
                  overnight = {
                    ...overnight,
                    slug: candidate.slug || null,
                    source_id: candidate.source_id || null,
                    hero_image_url: candidate.hero_image_url || null,
                    region: candidate.region || null,
                  }
                }
              }

              return { ...day, stops, overnight }
            }).filter(day => (day.stops?.length || 0) > 0 || day.overnight)

            const retryRatio = enforceVerticalRatio(retryDays, primaryVerticals)

            // Accept retry if it improved the ratio (even if still under 50%)
            if (retryRatio.ratio > ratioResult.ratio) {
              enrichedDays = retryDays
              itinerary.title = retryItinerary.title
              itinerary.intro = retryItinerary.intro
              strippedCount += retryStrippedCount
              ratioResult = retryRatio
              ratioRetried = true
              console.log(`[itinerary] Retry improved ratio to ${(retryRatio.ratio * 100).toFixed(0)}% (${retryRatio.primaryStops}/${retryRatio.totalStops})`)
            } else {
              console.log(`[itinerary] Retry did not improve ratio (${(retryRatio.ratio * 100).toFixed(0)}%), keeping original`)
            }
          } catch (parseErr) {
            console.warn('[itinerary] Ratio retry JSON parse failed:', parseErr.message, '— keeping original result')
          }
        }
      } catch (retryErr) {
        console.warn('[itinerary] Ratio enforcement retry failed:', retryErr.message, '— keeping original result')
      }
    }

    // --- Post-processing: physically remove non-focus stops if ratio still below 50% ---
    if (ratioResult && !ratioResult.passed && primaryVerticals.length > 0 && !usedFallback) {
      console.warn(`[itinerary] Ratio still ${(ratioResult.ratio * 100).toFixed(0)}% after LLM retry — removing non-focus stops`)
      let removed = 0
      let done = false

      // Work backwards through days, removing from end of each day first
      for (let di = enrichedDays.length - 1; di >= 0 && !done; di--) {
        const stops = [...(enrichedDays[di].stops || [])]

        for (let si = stops.length - 1; si >= 0 && !done; si--) {
          const stop = stops[si]
          // Keep focus verticals and accommodation
          if (primaryVerticals.includes(stop.vertical) || stop.vertical === 'rest') continue

          stops.splice(si, 1)
          enrichedDays[di] = { ...enrichedDays[di], stops }
          removed++
          console.warn(`[itinerary] Removed "${stop.venue_name}" (${stop.vertical}) from day ${di + 1}`)

          const check = enforceVerticalRatio(enrichedDays, primaryVerticals)
          if (check.passed || check.totalStops <= 4) done = true
        }
      }

      // Remove empty days
      enrichedDays = enrichedDays.filter(day => (day.stops?.length || 0) > 0 || day.overnight)

      if (removed > 0) {
        ratioResult = enforceVerticalRatio(enrichedDays, primaryVerticals)
        strippedCount += removed
        console.log(`[itinerary] Post-processing removed ${removed} non-focus stop(s). Ratio now ${(ratioResult.ratio * 100).toFixed(0)}% (${ratioResult.primaryStops}/${ratioResult.totalStops})`)
      }
    }

    // Renumber days sequentially after any filtering/removal (prevents Day 1, Day 2, Day 4 gaps)
    enrichedDays = enrichedDays.map((d, i) => ({ ...d, day_number: i + 1 }))

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

    // Alias to top-level haversine for recommendation proximity filtering
    const distKm = haversineKm

    const RECOMMENDATION_RADIUS_KM = 50

    // Check if itinerary is missing accommodation for multi-day trips.
    // If the user asked for accommodation (or it's a multi-day trip without "sorted"),
    // try to inject rest venues the LLM forgot — one per night, unique where possible.
    let accommodationNote = null

    if (duration.days > 1 && shouldGuaranteeRest) {
      // Collect all rest venues used by LLM
      const usedRestIds = new Set()
      enrichedDays.forEach(d => {
        if (d.overnight?.listing_id) usedRestIds.add(d.overnight.listing_id)
        ;(d.stops || []).filter(s => s.vertical === 'rest').forEach(s => usedRestIds.add(s.listing_id))
      })
      const allRestVenues = venueData.filter(v => v.vertical === 'rest')
      const availableRest = allRestVenues.filter(v => !usedRestIds.has(v.id))

      // Count how many non-final days are missing overnight
      let gapCount = 0
      for (let di = 0; di < enrichedDays.length - 1; di++) {
        if (!enrichedDays[di].overnight?.listing_id) gapCount++
      }

      if (gapCount > 0 && (availableRest.length > 0 || allRestVenues.length > 0)) {
        // Inject accommodation into each non-final day that's missing an overnight
        let injected = 0
        // Use available (unused) pool first, fall back to full pool for multi-night stays
        const pool = availableRest.length > 0 ? [...availableRest] : [...allRestVenues]

        for (let di = 0; di < enrichedDays.length - 1; di++) {
          const day = enrichedDays[di]
          if (day.overnight?.listing_id) continue // already has one

          // Find the rest venue closest to this day's stops
          const dayStops = (day.stops || []).filter(s => s.lat && s.lng)
          if (dayStops.length === 0) continue

          const dayCenter = {
            lat: dayStops.reduce((a, s) => a + parseFloat(s.lat), 0) / dayStops.length,
            lng: dayStops.reduce((a, s) => a + parseFloat(s.lng), 0) / dayStops.length,
          }

          let bestRest = null
          let bestDist = Infinity
          const searchPool = pool.length > 0 ? pool : allRestVenues
          for (const rv of searchPool) {
            const d = distKm(dayCenter.lat, dayCenter.lng, rv.lat, rv.lng)
            if (d < bestDist) { bestDist = d; bestRest = rv }
          }

          if (bestRest && bestDist < 80) {
            // Check if this property is being reused (multi-night)
            const alreadyUsedByPrevDay = enrichedDays.slice(0, di).some(
              prev => prev.overnight?.listing_id === bestRest.id
            )
            const stayNote = alreadyUsedByPrevDay
              ? `Continue your stay at ${bestRest.name} — ${bestRest.region || 'the area'}.`
              : `A place to rest for the night in ${bestRest.region || 'the area'}.`

            enrichedDays[di] = {
              ...enrichedDays[di],
              overnight: {
                listing_id: bestRest.id,
                venue_name: bestRest.name,
                vertical: 'rest',
                lat: bestRest.lat,
                lng: bestRest.lng,
                slug: bestRest.slug || null,
                source_id: bestRest.source_id || null,
                hero_image_url: bestRest.hero_image_url || null,
                region: bestRest.region || null,
                note: stayNote,
                multi_night: alreadyUsedByPrevDay || false,
              },
            }
            // Remove from available pool so next day tries a different property
            const poolIdx = pool.indexOf(bestRest)
            if (poolIdx >= 0) pool.splice(poolIdx, 1)
            injected++
          } else {
            // No nearby rest venue — flag the gap for the frontend
            enrichedDays[di] = {
              ...enrichedDays[di],
              accommodation_gap: true,
            }
          }
        }

        if (injected > 0) {
          console.log(`[itinerary] Auto-injected ${injected} overnight accommodation stop(s)`)
        }
      }

      // Count remaining gaps after injection
      const remainingGaps = enrichedDays.filter(
        (d, i) => i < enrichedDays.length - 1 && !d.overnight?.listing_id
      ).length
      if (remainingGaps > 0) {
        accommodationNote = `No Rest Atlas accommodation listings available for ${remainingGaps} night${remainingGaps > 1 ? 's' : ''} of this trip. We recommend checking local booking sites for those nights.`
        console.warn(`[itinerary] ${remainingGaps} night(s) without rest venues`)
      }
    }

    // Use preferredVerticals (already computed earlier) for recommendation weighting
    const interestVerticals = preferredVerticals

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
        if (shouldGuaranteeRest) {
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
    const focusVerticalCount = effectiveVerticals.length > 0
      ? venueData.filter(v => effectiveVerticals.includes(v.vertical)).length
      : venueData.length
    const thinCorpus = effectiveVerticals.length > 0 && focusVerticalCount < totalStopsNeeded

    // Collect unique verticals present in the generated itinerary
    const itineraryVerticals = [...new Set(
      enrichedDays.flatMap(d => (d.stops || []).map(s => s.vertical)).filter(Boolean)
    )]

    logTrail(request, {
      promptText: q,
      regionDetected: geoBounds?.label || region || null,
      verticalsIncluded: itineraryVerticals,
      daysGenerated: enrichedDays.length,
    })

    // Build response payload
    const responsePayload = {
      title: itinerary.title,
      intro: itinerary.intro,
      days: enrichedDays,
      recommendations,
      needs_accommodation: shouldGuaranteeRest,
      accommodation_note: accommodationNote || null,
      thin_corpus: thinCorpus,
      parsed_preferences: {
        primary: preferences.primary.map(v => VERTICAL_LABELS[v] || v),
        secondary: preferences.secondary.map(v => VERTICAL_LABELS[v] || v),
        soft: preferences.soft.map(v => VERTICAL_LABELS[v] || v),
      },
      focus_verticals: effectiveVerticals.length > 0 ? effectiveVerticals.map(v => VERTICAL_LABELS[v] || v) : null,
      focus_venue_count: focusVerticalCount,
      personalised: interestVerticals.size > 0,
      preference_labels: preferenceLabels.length > 0 ? preferenceLabels : null,
      authenticated: isAuthenticated,
      query: q,
      region: region || null,
      region_label: geoBounds?.label || region || null,
      city_note: city_note || null,
      duration,
      venue_count: venueData.length,
      stripped_count: strippedCount,
      ratio_enforcement: ratioResult ? {
        ratio: Math.round(ratioResult.ratio * 100),
        primary_stops: ratioResult.primaryStops,
        total_stops: ratioResult.totalStops,
        passed: ratioResult.passed,
        retried: ratioRetried,
      } : null,
      // Echo question flow params for frontend display
      flow: (accommodation || transport || group || pace) ? {
        accommodation: accommodation || null,
        transport: transport || null,
        group: group || null,
        pace: pace || null,
      } : null,
      fallback: usedFallback || false,
      anchor_id: anchorListing ? anchorListing.id : null,
    }

    // --- Cache the generated response (fire-and-forget, 24h TTL enforced on read) ---
    try {
      getSupabaseAdmin().from('user_trails').insert({
        cache_key: cacheKey,
        source: 'cache',
        title: itinerary.title,
        prompt: q,
        region: region || geoBounds?.label || null,
        days: enrichedDays,
        cached_response: responsePayload,
      }).then(() => console.log(`[itinerary] Cached response for key ${cacheKey.slice(0, 8)}...`))
        .catch(() => {})
    } catch { /* cache write failure is non-blocking */ }

    return NextResponse.json(responsePayload)
  } catch (err) {
    console.error('[itinerary] Fatal error:', err)
    logTrailError({
      destination: q,
      preferences: { accommodation, transport, group, pace },
      errorMessage: err.message || String(err),
      errorType: 'fatal',
    })
    return NextResponse.json({
      error: 'generation_failed',
      message: 'Something went wrong building your trail. Please try again.',
    }, { status: 500 })
  }
}
