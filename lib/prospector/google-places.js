/**
 * Google Places API Client for Candidate Discovery
 *
 * Uses Google Places Text Search to discover real, verified businesses.
 * Every candidate sourced from this module is guaranteed to exist on Google.
 *
 * API: Google Places API (Legacy)
 * - Text Search: $32/1k requests
 * - Place Details: $17/1k requests (basic fields)
 *
 * Env: GOOGLE_PLACES_API_KEY
 */

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place'

// Australia bounding box — hard geographic filter
const AUSTRALIA_BOUNDS = { south: -44.0, north: -10.0, west: 112.0, east: 154.0 }

// State capital coordinates for regional targeting
const STATE_CENTERS = {
  VIC: { lat: -37.8136, lng: 144.9631 },
  NSW: { lat: -33.8688, lng: 151.2093 },
  QLD: { lat: -27.4698, lng: 153.0251 },
  SA: { lat: -34.9285, lng: 138.6007 },
  WA: { lat: -31.9505, lng: 115.8605 },
  TAS: { lat: -42.8821, lng: 147.3272 },
  ACT: { lat: -35.2809, lng: 149.1300 },
  NT: { lat: -12.4634, lng: 130.8456 },
}

// Vertical-specific Google Places search queries
// Each vertical gets 4-7 query patterns to maximise coverage and diversity
const VERTICAL_QUERIES = {
  sba: [
    'craft distillery',
    'boutique winery cellar door',
    'microbrewery craft beer',
    'gin distillery',
    'meadery cidery',
    'craft brewery taproom',
    'natural wine producer',
  ],
  collection: [
    'art gallery museum',
    'heritage museum collection',
    'sculpture park art space',
    'regional art gallery',
    'maritime museum historical society',
    'contemporary art centre',
  ],
  craft: [
    'pottery ceramics studio',
    'artisan workshop maker',
    'glass blowing woodworking studio',
    'jewellery maker studio',
    'textile weaving studio',
    'printmaking artist studio',
  ],
  fine_grounds: [
    'specialty coffee roaster',
    'micro coffee roastery',
    'single origin coffee roaster',
    'artisan coffee roaster beans',
  ],
  rest: [
    'boutique hotel bed breakfast',
    'farm stay eco lodge',
    'glamping accommodation',
    'heritage cottage accommodation',
    'boutique guesthouse',
    'luxury retreat wellness',
  ],
  field: [
    'national park nature reserve',
    'walking trail lookout',
    'botanical garden wildlife sanctuary',
    'swimming hole waterfall',
    'gorge hiking trail',
    'coastal walk scenic',
  ],
  corner: [
    'independent bookshop',
    'design store homewares shop',
    'record store vinyl',
    'concept store lifestyle',
    'stationery shop',
    'general store providore',
  ],
  found: [
    'antique shop vintage store',
    'secondhand furniture salvage',
    'op shop charity vintage',
    'retro vintage clothing',
    'antique market collectibles',
    'bric a brac curiosities shop',
  ],
  table: [
    'farm to table restaurant',
    'destination restaurant regional dining',
    'hatted restaurant fine dining',
    'breakfast brunch cafe',
    'bakery cafe artisan',
    'all day dining cafe',
    'farm cafe paddock to plate',
    'artisan food producer farmgate',
    'providore specialty food store',
    'farmers market produce market',
  ],
}

/**
 * Search Google Places Text Search API.
 * Returns raw results array.
 *
 * @param {string} query - Search query
 * @param {object} location - { lat, lng } center point
 * @param {object} options - { radius (meters), type }
 * @returns {object[]} Google Places results
 */
// Budget gate (lazy import → safe in raw-node scripts, which fail-open). Places
// is a fixed per-call cost, so the reservation IS the actual cost (no reconcile).
// `budgetKey` selects the ledger pool ('google_places' for crons — the default —
// or 'google_places_admin' for interactive admin repairs, which must not be
// starved by the crons). `kind` picks the per-call price (search vs details).
async function placesBudgetReserve(budgetKey = 'google_places', kind = 'search') {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/clients')
    const { reserve, PLACES_CALL_USD, PLACES_DETAILS_USD } = await import('@/lib/budget/governor')
    const cost = kind === 'details' ? PLACES_DETAILS_USD : PLACES_CALL_USD
    return await reserve(getSupabaseAdmin(), budgetKey, cost)
  } catch {
    return true // governor unavailable (raw node) → don't block
  }
}

// Thrown (only when a caller opts in via onBudgetExhausted:'throw') so an
// interactive caller can tell "budget dry" apart from "no results" — a silent
// [] here is exactly what made the Gate Check Fix report a misleading
// "no replacement found" for a month-exhausted pool.
export class PlacesBudgetExhaustedError extends Error {
  constructor(budgetKey) {
    super(`Google Places monthly budget exhausted (pool: ${budgetKey})`)
    this.code = 'PLACES_BUDGET_EXHAUSTED'
    this.budgetKey = budgetKey
  }
}

export async function searchPlaces(query, location, options = {}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured')

  // Places is the #1 cost driver. Over the monthly cap → no results, so the
  // prospector falls back to its free OSM Overpass source (no user value lost).
  const budgetKey = options.budgetKey || 'google_places'
  if (!(await placesBudgetReserve(budgetKey, 'search'))) {
    if (options.onBudgetExhausted === 'throw') throw new PlacesBudgetExhaustedError(budgetKey)
    console.warn('[google-places] monthly Places budget reached — skipping search (OSM fallback)')
    return []
  }

  const params = new URLSearchParams({
    query: `${query} Australia`,
    key: apiKey,
  })

  if (location) {
    params.set('location', `${location.lat},${location.lng}`)
    params.set('radius', String(options.radius || 150000)) // 150km default
  }

  if (options.type) {
    params.set('type', options.type)
  }

  // Google Places returns OVER_QUERY_LIMIT under QPS bursts (and at the daily
  // cap). Without backoff this surfaces as an empty result set, which the
  // prospector misreads as "no supply" — a silent throttle that starves the
  // candidate queue. Retry with exponential backoff so transient throttling
  // doesn't masquerade as exhaustion.
  let data
  for (let attempt = 0; attempt <= 3; attempt++) {
    const res = await fetch(`${PLACES_BASE}/textsearch/json?${params}`)
    if (!res.ok) throw new Error(`Google Places API ${res.status}`)
    data = await res.json()
    if (data.status !== 'OVER_QUERY_LIMIT') break
    if (attempt < 3) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
  }

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places error: ${data.status} — ${data.error_message || ''}`)
  }

  return (data.results || []).filter(r => {
    // Hard geographic filter — must be in Australia
    const lat = r.geometry?.location?.lat
    const lng = r.geometry?.location?.lng
    return lat && lng && isInAustralia(lat, lng)
  })
}

/**
 * Get detailed place information including website and phone.
 *
 * @param {string} placeId - Google Place ID
 * @returns {object|null} Place details
 */
export async function getPlaceDetails(placeId, options = {}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured')

  const budgetKey = options.budgetKey || 'google_places'
  if (!(await placesBudgetReserve(budgetKey, 'details'))) {
    if (options.onBudgetExhausted === 'throw') throw new PlacesBudgetExhaustedError(budgetKey)
    console.warn('[google-places] monthly Places budget reached — skipping details')
    return null
  }

  const fields = [
    'name', 'formatted_address', 'geometry', 'website',
    'formatted_phone_number', 'business_status', 'rating',
    'user_ratings_total', 'types', 'url', 'place_id',
  ].join(',')

  const params = new URLSearchParams({
    place_id: placeId,
    fields,
    key: apiKey,
  })

  const res = await fetch(`${PLACES_BASE}/details/json?${params}`)
  if (!res.ok) throw new Error(`Google Places Details API ${res.status}`)

  const data = await res.json()

  if (data.status !== 'OK') return null
  return data.result || null
}

/**
 * Run discovery for a single vertical, anchored to one search area.
 * Returns an array of enriched candidate objects.
 *
 * Google Places Text Search ranks primarily by the QUERY TEXT, with
 * location+radius only a soft bias. Targeting a regional town therefore
 * requires the town name to appear in the query itself — a location bias
 * alone keeps returning capital-city results. `placeLabel` is the text
 * appended to each query (a town name for regional sweeps, a state code for
 * capital sweeps); `regionCenter` is the matching coordinate bias.
 *
 * @param {string} vertical - Vertical key (e.g. 'sba')
 * @param {string} state - State code (e.g. 'VIC') — used for fallback state tagging
 * @param {object} options - { maxPerSearch, regionCenter, radius, placeLabel, skipIfKnown }
 *   - placeLabel:  text appended to each query (defaults to `state`)
 *   - skipIfKnown: (name) => bool — when true for a result, skip the (paid)
 *                  detail fetch and drop it. Lets callers avoid spending
 *                  Place Details calls on venues already in the DB.
 * @returns {object[]} Candidate objects ready for pipeline
 */
export async function discoverCandidates(vertical, state, options = {}) {
  const queries = VERTICAL_QUERIES[vertical] || []
  const center = options.regionCenter || STATE_CENTERS[state]
  const maxPerSearch = options.maxPerSearch || 10
  const searchRadius = options.radius || 200000
  const placeLabel = options.placeLabel || state
  const skipIfKnown = typeof options.skipIfKnown === 'function' ? options.skipIfKnown : null
  const candidates = []
  const seenPlaceIds = new Set()

  for (const query of queries) {
    try {
      const stateQuery = `${query} ${placeLabel}`
      const results = await searchPlaces(stateQuery, center, { radius: searchRadius })

      for (const place of results.slice(0, maxPerSearch)) {
        if (seenPlaceIds.has(place.place_id)) continue
        seenPlaceIds.add(place.place_id)

        // Skip closed businesses
        if (place.business_status && place.business_status !== 'OPERATIONAL') continue

        // Skip venues already known to the caller BEFORE the paid detail call.
        // On exhausted geography ~90% of hits are dupes; skipping their detail
        // fetches is the difference between a cron that fits its time/cost
        // budget and one that burns it re-confirming the same venues.
        if (skipIfKnown && place.name && skipIfKnown(place.name)) continue

        // Get full details for website URL
        let details = null
        try {
          details = await getPlaceDetails(place.place_id)
          // Rate limit between detail requests
          await new Promise(r => setTimeout(r, 200))
        } catch (err) {
          console.warn(`[google-places] Details failed for ${place.name}:`, err.message)
        }

        const lat = place.geometry?.location?.lat
        const lng = place.geometry?.location?.lng
        const website = details?.website || null
        const phone = details?.formatted_phone_number || null
        const address = details?.formatted_address || place.formatted_address || null
        const extractedState = extractState(address)
        const region = extractRegion(address)

        candidates.push({
          name: place.name,
          region: region || null,
          state: extractedState || state,
          vertical,
          website_url: website,
          source: 'google_places',
          source_detail: `Google Places — ${stateQuery}`,
          notes: [
            place.rating ? `Google rating: ${place.rating} (${place.user_ratings_total || 0} reviews)` : null,
            details?.business_status === 'OPERATIONAL' ? 'Confirmed open' : null,
          ].filter(Boolean).join('. '),
          status: 'pending',
          // Google Places metadata for the review queue
          google_places_data: {
            place_id: place.place_id,
            business_status: details?.business_status || place.business_status || null,
            rating: place.rating || null,
            rating_count: place.user_ratings_total || null,
            google_maps_url: details?.url || null,
            types: place.types || [],
          },
          // Pre-fill coordinates from Google
          lat,
          lng,
          phone,
          address,
        })
      }
    } catch (err) {
      console.warn(`[google-places] Search failed for "${query} ${state}":`, err.message)
    }

    // Rate limit between searches
    await new Promise(r => setTimeout(r, 300))
  }

  return candidates
}

/**
 * Probe whether the Google Places quota is currently healthy.
 *
 * One cheap Text Search; classifies the result so callers can decide whether to
 * bother sweeping Places at all. When billing lapses (or a low custom quota is
 * hit) every call returns OVER_QUERY_LIMIT — sweeping in that state burns the
 * whole cron budget re-confirming a dead API and silently starves the queue.
 * The floor cron uses this to skip Places entirely and lean on OSM instead.
 *
 * @returns {Promise<{available:boolean, status:string, reason:string|null}>}
 */
export async function probePlacesQuota() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return { available: false, status: 'NO_KEY', reason: 'GOOGLE_PLACES_API_KEY not configured' }
  try {
    const params = new URLSearchParams({ query: 'brewery Australia', key: apiKey })
    const res = await fetch(`${PLACES_BASE}/textsearch/json?${params}`)
    if (!res.ok) return { available: false, status: `HTTP_${res.status}`, reason: `Places probe HTTP ${res.status}` }
    const data = await res.json()
    if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
      return { available: true, status: data.status, reason: null }
    }
    return {
      available: false,
      status: data.status,
      reason: data.error_message || `Places probe returned ${data.status}`,
    }
  } catch (err) {
    return { available: false, status: 'FETCH_FAILED', reason: err.message }
  }
}

// ─── Helpers ───────────────────────────────────────────────

export function isInAustralia(lat, lng) {
  return (
    lat >= AUSTRALIA_BOUNDS.south && lat <= AUSTRALIA_BOUNDS.north &&
    lng >= AUSTRALIA_BOUNDS.west && lng <= AUSTRALIA_BOUNDS.east
  )
}

export function extractState(address) {
  if (!address) return null
  const stateMatch = address.match(/\b(VIC|NSW|QLD|SA|WA|TAS|ACT|NT)\b/)
  return stateMatch ? stateMatch[1] : null
}

export function extractRegion(address) {
  if (!address) return null
  const parts = address.split(',').map(p => p.trim())
  // Google format: "Street, Suburb, State Postcode, Australia"
  if (parts.length >= 3) return parts[parts.length - 3]
  if (parts.length >= 2) return parts[0]
  return null
}

export { STATE_CENTERS, VERTICAL_QUERIES, AUSTRALIA_BOUNDS }
