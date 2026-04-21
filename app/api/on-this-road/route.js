import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { getDistanceBudget, getStopLimits } from '@/lib/route-budgets'

export const maxDuration = 120

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-6'

const VERTICAL_NAMES = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

// ── Detour tolerance → buffer distance + quality gate ────────────────
const DETOUR_CONFIG = {
  on_route:        { bufferKm: 8,  minQuality: 65, label: 'staying on route' },
  happy_to_detour: { bufferKm: 25, minQuality: 50, label: 'happy to detour' },
  flexible:        { bufferKm: 40, minQuality: 40, label: 'flexible routing' },
}

// Legacy time-based config (backward compat)
const TIME_CONFIG = {
  '30':  { bufferKm: 5,  minQuality: 70, label: '30 minutes' },
  '60':  { bufferKm: 10, minQuality: 60, label: '1 hour' },
  '120': { bufferKm: 20, minQuality: 50, label: '2 hours' },
  'all': { bufferKm: 20, minQuality: 0,  label: 'as long as it takes' },
}

// ── Trip length → number of days + target stops ─────────────────────
const TRIP_LENGTH_CONFIG = {
  passing_through: { days: 1, stopsPerDay: 5,  label: 'passing through' },
  day_trip:        { days: 1, stopsPerDay: 10, label: 'day trip' },
  '2_days':        { days: 2, stopsPerDay: 6,  label: '2 days' },
  '3_days':        { days: 3, stopsPerDay: 5,  label: '3 days' },
  '4_plus':        { days: 4, stopsPerDay: 5,  label: '4+ days' },
  // Cycling-specific trip lengths
  half_day:        { days: 1, stopsPerDay: 4,  label: 'half-day ride' },
  full_day:        { days: 1, stopsPerDay: 6,  label: 'full-day ride' },
  weekend:         { days: 2, stopsPerDay: 5,  label: 'weekend ride' },
}

// ── Departure timing → first stop distance constraints ──────────────
const DEPARTURE_CONFIG = {
  this_morning:     { minFirstStopKm: 30,  maxFirstStopKm: 120, label: 'this morning' },
  this_afternoon:   { minFirstStopKm: 60,  maxFirstStopKm: 180, label: 'this afternoon' },
  tomorrow_morning: { minFirstStopKm: 30,  maxFirstStopKm: 200, label: 'tomorrow morning' },
  this_weekend:     { minFirstStopKm: 30,  maxFirstStopKm: 200, label: 'this weekend' },
}

// ── Preference chips → listing filters (soft weights) ───────────────
const PREFERENCE_MAP = {
  cellar_doors:    { verticals: ['sba'], visit_types: ['experiential'], sub_types: ['winery', 'cellar_door'], label: 'Cellar doors & wineries' },
  great_coffee:    { verticals: ['fine_grounds'], visit_types: [], sub_types: [], label: 'Great coffee' },
  history:         { verticals: ['collection'], visit_types: ['attraction'], sub_types: [], label: 'History & heritage' },
  lunch:           { verticals: ['table'], visit_types: ['venue'], sub_types: [], label: 'Good places for lunch' },
  producers:       { verticals: ['sba'], visit_types: ['experiential'], sub_types: [], label: 'Producers & farm gates' },
  art_makers:      { verticals: ['craft'], visit_types: [], sub_types: [], label: 'Art & makers' },
  nature:          { verticals: ['field'], visit_types: [], sub_types: [], label: 'Nature & outdoors' },
  local_shops:     { verticals: ['corner'], visit_types: [], sub_types: [], label: 'Local shops & boutiques' },
  markets:         { verticals: ['found'], visit_types: [], sub_types: [], label: 'Markets & vintage finds' },
  craft_drinks:    { verticals: ['sba'], visit_types: ['experiential'], sub_types: ['brewery', 'distillery', 'cidery', 'meadery', 'sour_brewery', 'non_alcoholic'], label: 'Breweries & distilleries' },
  fine_dining:     { verticals: ['table'], visit_types: ['venue'], sub_types: [], label: 'Fine dining' },
  scenic:          { verticals: ['field', 'collection'], visit_types: ['attraction'], sub_types: [], label: 'Scenic stops & lookouts' },
}

// ── Multi-day overnight clustering ─────────────────────────────────
// Verticals that cluster at overnight waypoints (evening + morning)
const OVERNIGHT_VERTICALS = new Set(['rest', 'table', 'fine_grounds'])
// Verticals distributed between overnight points (daytime discovery)
const DISCOVERY_VERTICALS = new Set(['sba', 'craft', 'collection', 'corner', 'field', 'found'])
// Radius for querying dinner/coffee near overnight waypoints
const OVERNIGHT_CLUSTER_RADIUS_KM = 25
// Deprioritize listings near origin/destination (km)
const ORIGIN_DEAD_ZONE_KM = 50
const DESTINATION_DEAD_ZONE_KM = 30

// ── Season mapping (Southern Hemisphere) ────────────────────────────
const MONTH_TO_SEASON = {
  0: 'Summer', 1: 'Summer', 2: 'Autumn', 3: 'Autumn', 4: 'Autumn',
  5: 'Winter', 6: 'Winter', 7: 'Winter', 8: 'Spring', 9: 'Spring', 10: 'Spring', 11: 'Summer',
}

function getCurrentSeason() {
  return MONTH_TO_SEASON[new Date().getMonth()]
}

// ── Geo utilities ───────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function projectOntoRoute(lat, lng, routeCoords) {
  let minDist = Infinity
  let bestIdx = 0
  for (let i = 0; i < routeCoords.length; i++) {
    const [rLng, rLat] = routeCoords[i]
    const d = haversineKm(lat, lng, rLat, rLng)
    if (d < minDist) { minDist = d; bestIdx = i }
  }
  return { distance: minDist, routeIndex: bestIdx }
}

function buildRouteDistances(routeCoords) {
  const distances = [0]
  for (let i = 1; i < routeCoords.length; i++) {
    const [lng1, lat1] = routeCoords[i - 1]
    const [lng2, lat2] = routeCoords[i]
    distances.push(distances[i - 1] + haversineKm(lat1, lng1, lat2, lng2))
  }
  return distances
}

function sampleRoutePoints(routeCoords, intervalKm = 20) {
  const points = [routeCoords[0]]
  let accum = 0
  for (let i = 1; i < routeCoords.length; i++) {
    const [lng1, lat1] = routeCoords[i - 1]
    const [lng2, lat2] = routeCoords[i]
    accum += haversineKm(lat1, lng1, lat2, lng2)
    if (accum >= intervalKm) { points.push(routeCoords[i]); accum = 0 }
  }
  return points
}

function findCoverageGaps(routeCoords, routeDistances, listings) {
  const totalKm = routeDistances[routeDistances.length - 1]
  const SEGMENT_SIZE_KM = 10
  const GAP_THRESHOLD_KM = 50
  const numSegments = Math.ceil(totalKm / SEGMENT_SIZE_KM)
  const covered = new Array(numSegments).fill(false)

  for (const l of listings) {
    const segIdx = Math.floor((routeDistances[l.routeIndex] || 0) / SEGMENT_SIZE_KM)
    if (segIdx >= 0 && segIdx < numSegments) covered[segIdx] = true
  }

  const gaps = []
  let gapStart = null
  for (let i = 0; i <= numSegments; i++) {
    if (i < numSegments && !covered[i]) {
      if (gapStart === null) gapStart = i
    } else {
      if (gapStart !== null) {
        const gapKm = (i - gapStart) * SEGMENT_SIZE_KM
        if (gapKm >= GAP_THRESHOLD_KM) {
          const midKm = (gapStart * SEGMENT_SIZE_KM + i * SEGMENT_SIZE_KM) / 2
          const midIdx = routeDistances.findIndex(d => d >= midKm)
          if (midIdx >= 0 && midIdx < routeCoords.length) {
            gaps.push({
              startKm: Math.round(gapStart * SEGMENT_SIZE_KM),
              endKm: Math.round(Math.min(i * SEGMENT_SIZE_KM, totalKm)),
              lengthKm: Math.round(gapKm),
              midpoint: { lng: routeCoords[midIdx][0], lat: routeCoords[midIdx][1] },
            })
          }
        }
        gapStart = null
      }
    }
  }
  return gaps
}

/**
 * Compute overnight waypoints — roughly evenly spaced along the route.
 * Returns one waypoint per night (days - 1 waypoints for N days).
 */
function computeOvernightWaypoints(routeCoords, routeDistances, totalRouteKm, tripDays) {
  const waypoints = []
  const kmPerDay = totalRouteKm / tripDays
  for (let d = 1; d < tripDays; d++) {
    const targetKm = d * kmPerDay
    const idx = routeDistances.findIndex(dist => dist >= targetKm)
    if (idx >= 0 && idx < routeCoords.length) {
      const [lng, lat] = routeCoords[idx]
      waypoints.push({ night: d, targetKm: Math.round(targetKm), lat, lng, routeIndex: idx })
    }
  }
  return waypoints
}

/**
 * Find the route coordinate at a given km distance along the route.
 */
function getRouteCoordAtKm(routeCoords, routeDistances, targetKm) {
  const idx = routeDistances.findIndex(d => d >= targetKm)
  if (idx >= 0 && idx < routeCoords.length) {
    return { lng: routeCoords[idx][0], lat: routeCoords[idx][1] }
  }
  return null
}

/**
 * Build overnight clusters: for each overnight waypoint, find the best
 * rest/table/fine_grounds listings using progressive radius expansion.
 * Falls back to geographic proximity when route-position matching fails.
 */
function buildOvernightClusters(overnightWaypoints, routeListings, restCandidates, routeCoords, routeDistances) {
  // Progressive radii for finding rest candidates (km along route)
  const CLUSTER_RADII_KM = [37.5, 75, 112.5, 150]

  return overnightWaypoints.map(wp => {
    // Progressive expansion: try each radius until we find rest candidates
    let nearbyRest = []
    let matchedRadius = 0
    for (const radius of CLUSTER_RADII_KM) {
      nearbyRest = restCandidates
        .filter(r => Math.abs(r.positionKm - wp.targetKm) <= radius)
      matchedRadius = radius
      if (nearbyRest.length >= 1) break
    }

    // Geographic fallback: if route-position matching found nothing,
    // try geographic proximity to the waypoint coordinate
    if (nearbyRest.length === 0) {
      const wpCoord = getRouteCoordAtKm(routeCoords, routeDistances, wp.targetKm) || wp
      nearbyRest = restCandidates.filter(r =>
        haversineKm(wpCoord.lat, wpCoord.lng, r.lat, r.lng) <= 80
      )
      if (nearbyRest.length > 0) matchedRadius = -1 // flag geographic fallback
    }

    nearbyRest = nearbyRest.sort((a, b) => {
      const distA = Math.abs(a.positionKm - wp.targetKm)
      const distB = Math.abs(b.positionKm - wp.targetKm)
      const scoreA = (a.quality_score > 0 ? a.quality_score : 50) - distA * 0.3
      const scoreB = (b.quality_score > 0 ? b.quality_score : 50) - distB * 0.3
      return scoreB - scoreA
    })

    if (matchedRadius !== 0) {
      const radiusLabel = matchedRadius === -1 ? 'geographic fallback (80km)' : `±${matchedRadius}km route-position`
      console.log(`[on-this-road] Night ${wp.night} rest search: ${nearbyRest.length} candidates at ${radiusLabel}`)
    }

    // Expand dinner/coffee radius to match — sparse regions need wider cluster
    const effectiveClusterRadius = Math.max(OVERNIGHT_CLUSTER_RADIUS_KM, matchedRadius > 0 ? Math.round(matchedRadius * 0.5) : 40)

    const nearbyDining = routeListings
      .filter(l => l.vertical === 'table' && Math.abs(l.positionKm - wp.targetKm) <= effectiveClusterRadius)
      .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))

    const nearbyCoffee = routeListings
      .filter(l => l.vertical === 'fine_grounds' && Math.abs(l.positionKm - wp.targetKm) <= effectiveClusterRadius)
      .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))

    const anchor = nearbyRest[0] || nearbyDining[0] || nearbyCoffee[0]
    const clusterRegion = anchor
      ? (anchor.suburb || anchor.region || `${Math.round(wp.targetKm)}km mark`)
      : `${Math.round(wp.targetKm)}km mark`

    return {
      night: wp.night,
      targetKm: wp.targetKm,
      lat: wp.lat,
      lng: wp.lng,
      region: clusterRegion,
      rest_candidates: nearbyRest.slice(0, 3).map(r => ({
        listing_id: r.id, listing_name: r.name, position_km: r.positionKm,
        region: r.region, suburb: r.suburb, description: r.description?.slice(0, 100) || '',
        quality_score: r.quality_score || 0,
      })),
      dinner_candidates: nearbyDining.slice(0, 3).map(l => ({
        listing_id: l.id, listing_name: l.name, position_km: l.positionKm,
        region: l.region, vertical: l.vertical, description: l.description?.slice(0, 100) || '',
      })),
      coffee_candidates: nearbyCoffee.slice(0, 2).map(l => ({
        listing_id: l.id, listing_name: l.name, position_km: l.positionKm,
        region: l.region, description: l.description?.slice(0, 80) || '',
      })),
    }
  })
}

async function geocode(text) {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?country=au&types=place,locality,neighborhood,address&access_token=${MAPBOX_TOKEN}`
    const res = await fetch(url)
    const data = await res.json()
    if (!data.features || data.features.length === 0) return null
    const [lng, lat] = data.features[0].center
    return { lat, lng, text: data.features[0].text, place_name: data.features[0].place_name }
  } catch { return null }
}

async function getRoute(startCoords, endCoords, waypoints = [], profile = 'driving') {
  const mapboxProfile = profile === 'cycling' ? 'cycling' : 'driving'
  const coords = [
    `${startCoords.lng},${startCoords.lat}`,
    ...waypoints.map(w => `${w.lng},${w.lat}`),
    `${endCoords.lng},${endCoords.lat}`,
  ].join(';')
  const url = `https://api.mapbox.com/directions/v5/mapbox/${mapboxProfile}/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
  const res = await fetch(url)
  const data = await res.json()
  if (!data.routes || data.routes.length === 0) return null
  return data.routes[0]
}

// ── Preference scoring ──────────────────────────────────────────────

function scoreListingPreferences(listing, preferences) {
  if (!preferences || preferences.length === 0) return 0
  let score = 0
  for (const pref of preferences) {
    const config = PREFERENCE_MAP[pref]
    if (!config) continue
    if (config.verticals.includes(listing.vertical)) score += 2
    if (config.visit_types.includes(listing.visit_type)) score += 1
  }
  return score
}

function scoreSeasonalRelevance(listing, currentSeason) {
  if (!listing.best_season) return 0
  if (listing.best_season === currentSeason) return 2
  if (listing.best_season === 'Year-round') return 1
  return 0
}

function isExcludedByPreferences(listing, preferences) {
  if (!preferences || preferences.length === 0) return false
  for (const pref of preferences) {
    const config = PREFERENCE_MAP[pref]
    if (!config) continue
    if (!config.verticals.includes(listing.vertical)) continue
    if (!config.sub_types || config.sub_types.length === 0) return false
    if (!listing.sub_type) return false
    if (config.sub_types.includes(listing.sub_type)) return false
  }
  return true
}

const DAY_PHASE_SUITABILITY = {
  morning: {
    verticals: { fine_grounds: 3, field: 2 },
    sub_types: { cafe: 3, roaster: 2, lookout: 2, bush_walk: 2, swimming_hole: 1, botanical_garden: 2 },
  },
  midday: {
    verticals: { collection: 2, craft: 2, corner: 2, table: 1 },
    sub_types: { museum: 2, gallery: 2, heritage_site: 2, winery: 2, cellar_door: 2 },
  },
  afternoon: {
    verticals: { sba: 2, found: 2, craft: 1 },
    sub_types: { brewery: 2, distillery: 2, cidery: 2, market: 2, winery: 1 },
  },
  evening: {
    verticals: { table: 3, rest: 2 },
    sub_types: { destination: 3 },
  },
}

function getDayPhase(positionKm, dayStartKm, dayEndKm) {
  const dayLength = dayEndKm - dayStartKm
  if (dayLength <= 0) return 'midday'
  const progress = (positionKm - dayStartKm) / dayLength
  if (progress < 0.2) return 'morning'
  if (progress < 0.5) return 'midday'
  if (progress < 0.8) return 'afternoon'
  return 'evening'
}

function scoreDayPhase(listing, phase) {
  const config = DAY_PHASE_SUITABILITY[phase]
  if (!config) return 0
  let score = config.verticals[listing.vertical] || 0
  if (listing.sub_type && config.sub_types[listing.sub_type]) {
    score = Math.max(score, config.sub_types[listing.sub_type])
  }
  return score
}

// ── Vertical balancing ─────────────────────────────────────────────

/**
 * Compute per-vertical stop budget to prevent high-inventory verticals
 * (e.g. SBA with ~2,170 listings) from crowding out smaller ones.
 * Returns { caps: { vertical: maxStops }, hardCap: N } or null if no balancing needed.
 */
function computeVerticalBudget(preferences, totalStopsTarget) {
  if (!preferences || preferences.length === 0) return null

  // Count how many preference chips reference each vertical
  const verticalHits = {}
  for (const pref of preferences) {
    const config = PREFERENCE_MAP[pref]
    if (!config) continue
    for (const v of config.verticals) {
      verticalHits[v] = (verticalHits[v] || 0) + 1
    }
  }

  const activeVerticals = Object.keys(verticalHits)
  if (activeVerticals.length <= 1) return null // Single vertical — no balancing needed

  // Hard cap: no single vertical exceeds 30% of stops
  const MAX_SHARE = 0.3
  const hardCap = Math.max(2, Math.ceil(totalStopsTarget * MAX_SHARE))

  // Distribute proportionally to preference hits, capped
  const totalHits = Object.values(verticalHits).reduce((a, b) => a + b, 0)
  const caps = {}
  for (const [v, hits] of Object.entries(verticalHits)) {
    const proportional = Math.max(2, Math.round(totalStopsTarget * (hits / totalHits)))
    caps[v] = Math.min(proportional, hardCap)
  }

  return { caps, hardCap }
}

// ── Request ID generator ────────────────────────────────────────────

function requestId() {
  return 'otr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
}

function envCheck() {
  const missing = []
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!MAPBOX_TOKEN) missing.push('MAPBOX_ACCESS_TOKEN / NEXT_PUBLIC_MAPBOX_TOKEN')
  if (!ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY')
  return missing
}

// ── Main handler ────────────────────────────────────────────────────

export async function POST(request) {
  const rid = requestId()
  try {
    // Check env vars upfront
    const missingEnv = envCheck()
    if (missingEnv.length > 0) {
      console.error(`[on-this-road] [${rid}] Missing env vars:`, missingEnv)
      return NextResponse.json(
        { error: 'The trip planner is misconfigured. Please try again later.', category: 'missing_env', request_id: rid },
        { status: 500 }
      )
    }
    const body = await request.json()
    const {
      start, end,
      timeAvailable,           // legacy
      departureTiming,         // new
      tripLength,              // new
      detourTolerance,         // new
      preferences = [],        // new
      surpriseMe = false,      // new
      returnDifferentRoad = false, // new
      transportMode = 'driving', // 'driving' | 'cycling'
      bikeType = 'any',         // 'road' | 'gravel' | 'any'
      fitness = 'moderate',     // 'relaxed' | 'moderate' | 'strong'
    } = body

    if (!start) {
      return NextResponse.json({ error: 'Start location is required.' }, { status: 400 })
    }
    if (!end && !surpriseMe) {
      return NextResponse.json({ error: 'End location or Surprise Me mode is required.' }, { status: 400 })
    }

    // Resolve configs — use new params if provided, fall back to legacy
    const detourConfig = DETOUR_CONFIG[detourTolerance] || TIME_CONFIG[timeAvailable] || DETOUR_CONFIG.happy_to_detour
    const tripConfig = TRIP_LENGTH_CONFIG[tripLength] || { days: 1, stopsPerDay: 10, label: 'day trip' }
    const departureConfig = DEPARTURE_CONFIG[departureTiming] || null
    const currentSeason = getCurrentSeason()
    const isMultiDay = tripConfig.days >= 2

    // 1. Geocode start
    const startCoords = await geocode(start)
    if (!startCoords) {
      return NextResponse.json({ error: 'Could not find start location. Try a more specific Australian place name.' }, { status: 400 })
    }

    let endCoords = null
    let isSurpriseLoop = false

    // 2. Surprise Me: generate a loop route
    if (surpriseMe && !end) {
      isSurpriseLoop = true
      const distanceBudget = getDistanceBudget(transportMode, tripLength, fitness)
      const loopResult = await generateSurpriseLoop(startCoords, tripConfig, preferences, detourConfig, transportMode, fitness, distanceBudget)
      if (!loopResult) {
        return NextResponse.json({ error: 'Could not find enough listings to build a surprise loop. Try different preferences.' }, { status: 400 })
      }
      endCoords = startCoords // Loop back to start
      // Use the loop waypoints for routing
      const route = await getRoute(startCoords, startCoords, loopResult.waypoints, transportMode)
      if (!route) {
        return NextResponse.json({ error: `Could not generate a ${transportMode === 'cycling' ? 'cycling' : 'driving'} loop from this location.` }, { status: 400 })
      }

      // Validate route distance against budget — retry with tighter radius if over
      if (distanceBudget) {
        const routeKm = Math.round(route.distance / 1000)
        if (routeKm > distanceBudget * 1.2) {
          const tighterResult = await generateSurpriseLoop(startCoords, tripConfig, preferences, detourConfig, transportMode, fitness, distanceBudget * 0.4)
          if (tighterResult) {
            const tighterRoute = await getRoute(startCoords, startCoords, tighterResult.waypoints, transportMode)
            if (tighterRoute && Math.round(tighterRoute.distance / 1000) <= distanceBudget * 1.2) {
              Object.assign(loopResult, tighterResult)
              Object.assign(route, tighterRoute)
            }
          }
        }
      }

      const itineraryResponse = await buildItinerary({
        startCoords, endCoords: startCoords, route,
        detourConfig, tripConfig, departureConfig, preferences,
        currentSeason, isMultiDay, isSurpriseLoop, returnDifferentRoad: false,
        startName: start, endName: start,
        preSelectedListings: loopResult.listings,
        transportMode, bikeType, fitness,
        tripLengthKey: tripLength,
      })
      // Inject direction metadata into surprise response for reveal animation
      if (loopResult.direction && itineraryResponse.status === 200) {
        const body = await itineraryResponse.json()
        body.surprise_direction = loopResult.direction
        return NextResponse.json(body)
      }
      return itineraryResponse
    }

    // 3. Geocode end
    endCoords = await geocode(end)
    if (!endCoords) {
      return NextResponse.json({ error: 'Could not find end location. Try a more specific Australian place name.' }, { status: 400 })
    }

    // Short trip detection — cycling trips can be much shorter
    const directDistance = haversineKm(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng)
    const isCycling = transportMode === 'cycling'
    const shortTripThreshold = isCycling ? 3 : 20
    if (directDistance < shortTripThreshold) {
      return NextResponse.json({
        short_trip: true,
        message: isCycling
          ? "That\u2019s a very short ride \u2014 try exploring a bit further afield."
          : "That\u2019s a short trip \u2014 try the Long Weekend Engine instead.",
        direct_distance_km: Math.round(directDistance),
      })
    }

    // 4. Get outbound route
    console.log(`[on-this-road] [${rid}] Directions request (${transportMode}): ${startCoords.lng},${startCoords.lat} → ${endCoords.lng},${endCoords.lat}`)
    const route = await getRoute(startCoords, endCoords, [], transportMode)
    if (!route) {
      return NextResponse.json({ error: `No ${isCycling ? 'cycling' : 'driving'} route found between these locations.` }, { status: 400 })
    }

    // 5. Build outbound itinerary
    const result = await buildItinerary({
      startCoords, endCoords, route,
      detourConfig, tripConfig, departureConfig, preferences,
      currentSeason, isMultiDay, isSurpriseLoop: false, returnDifferentRoad,
      startName: start, endName: end,
      transportMode, bikeType, fitness,
      tripLengthKey: tripLength,
    })

    // 6. If return different road requested, build return route
    if (returnDifferentRoad && result.status !== 400) {
      const resultData = await result.json()
      const returnRoute = await getRoute(endCoords, startCoords, [], transportMode)
      if (returnRoute) {
        const returnResult = await buildItinerary({
          startCoords: endCoords, endCoords: startCoords, route: returnRoute,
          detourConfig, tripConfig: { ...tripConfig, days: Math.max(1, tripConfig.days - 1) },
          departureConfig: null, preferences, currentSeason,
          isMultiDay: tripConfig.days >= 3, isSurpriseLoop: false, returnDifferentRoad: false,
          startName: end, endName: start,
          transportMode, bikeType, fitness,
          tripLengthKey: tripLength,
        })
        const returnData = await returnResult.json()
        if (returnData.days) {
          // Merge: renumber return days continuing from outbound
          const outboundDays = resultData.days || [{ day_number: 1, stops: resultData.stops || [] }]
          const returnDays = (returnData.days || []).map((d, i) => ({
            ...d,
            day_number: outboundDays.length + i + 1,
            label: `Day ${outboundDays.length + i + 1} \u2014 heading home`,
            is_return: true,
          }))
          resultData.days = [...outboundDays, ...returnDays]
          resultData.return_route_geometry = returnRoute.geometry
          resultData.is_return_different = true
          resultData.route_distance_km += returnData.route_distance_km || 0
          resultData.route_duration_minutes += returnData.route_duration_minutes || 0
        }
      }
      return NextResponse.json(resultData)
    }

    return result

  } catch (err) {
    console.error(`[on-this-road] [${rid}] Error:`, err?.message, err?.stack)

    // Surface specific error categories
    const message = err?.message || ''
    if (message.includes('timeout') || message.includes('TIMEOUT') || err?.code === 'ETIMEDOUT') {
      return NextResponse.json(
        { error: 'Route planning timed out. Try a shorter trip or fewer preferences.', category: 'timeout', request_id: rid },
        { status: 504 }
      )
    }
    if (message.includes('ANTHROPIC') || message.includes('anthropic') || message.includes('claude')) {
      return NextResponse.json(
        { error: 'The itinerary writer is temporarily unavailable. Your route was found — please try again in a moment.', category: 'upstream_api_error', request_id: rid },
        { status: 502 }
      )
    }
    if (message.includes('supabase') || message.includes('PGRST') || message.includes('relation')) {
      return NextResponse.json(
        { error: 'Could not search listings along the route. Please try again shortly.', category: 'upstream_api_error', request_id: rid },
        { status: 502 }
      )
    }
    return NextResponse.json(
      { error: 'Something went wrong planning your route. Please try again.', category: 'unknown', request_id: rid },
      { status: 500 }
    )
  }
}

// ── Build itinerary from route + listings ───────────────────────────

async function buildItinerary({
  startCoords, endCoords, route,
  detourConfig, tripConfig, departureConfig, preferences,
  currentSeason, isMultiDay, isSurpriseLoop, returnDifferentRoad,
  startName, endName, preSelectedListings,
  transportMode = 'driving', bikeType = 'any', fitness = 'moderate',
  tripLengthKey = 'day_trip',
}) {
  const isCycling = transportMode === 'cycling'
  const routeGeometry = route.geometry
  const routeCoords = routeGeometry.coordinates
  const routeDurationMinutes = Math.round(route.duration / 60)
  const routeDistanceKm = Math.round(route.distance / 1000)
  const isLongTrip = isCycling ? false : routeDistanceKm > 2000

  // Cycling fitness constraints
  const CYCLING_FITNESS = {
    relaxed:  { maxDayKm: 30,  maxElevationM: 200,  stopSpacingKm: 3  },
    moderate: { maxDayKm: 60,  maxElevationM: 500,  stopSpacingKm: 5  },
    strong:   { maxDayKm: 100, maxElevationM: 1000, stopSpacingKm: 8  },
  }
  const cyclingConfig = isCycling ? CYCLING_FITNESS[fitness] || CYCLING_FITNESS.moderate : null

  // Distance budget and stop count limits
  const distanceBudget = getDistanceBudget(transportMode, tripLengthKey, fitness)
  const stopLimits = getStopLimits(tripLengthKey)

  const routeDistances = buildRouteDistances(routeCoords)
  const totalRouteKm = routeDistances[routeDistances.length - 1] || routeDistanceKm

  // Query listings along route — batched for performance
  // Cycling uses tighter sampling intervals and narrower corridor
  const sampleInterval = isCycling ? 5 : 30
  const samplePoints = sampleRoutePoints(routeCoords, sampleInterval)
  const sb = getSupabaseAdmin()
  const seenIds = new Set()
  const allListings = []

  // Cycling uses a narrower corridor (cyclists don't detour far off-route)
  const effectiveBufferKm = isCycling ? Math.min(detourConfig.bufferKm, 5) : detourConfig.bufferKm

  const SELECT_COLS = 'id, name, slug, vertical, region, state, suburb, lat, lng, hero_image_url, quality_score, description, sub_type, visit_type, best_season'

  // Run all point queries in parallel batches of 10
  const BATCH_SIZE = 10
  for (let batchStart = 0; batchStart < samplePoints.length; batchStart += BATCH_SIZE) {
    const batch = samplePoints.slice(batchStart, batchStart + BATCH_SIZE)
    const results = await Promise.all(batch.map(point => {
      const [pLng, pLat] = point
      const latDelta = effectiveBufferKm / 111
      const lngDelta = effectiveBufferKm / (111 * Math.cos(pLat * Math.PI / 180))
      return sb
        .from('listings')
        .select(SELECT_COLS)
        .eq('status', 'active')
        .or('address_on_request.eq.false,address_on_request.is.null')
        .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
        .or('trail_suitable.eq.true,trail_suitable.is.null')
        .gte('lat', pLat - latDelta)
        .lte('lat', pLat + latDelta)
        .gte('lng', pLng - lngDelta)
        .lte('lng', pLng + lngDelta)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .limit(50)
    }))
    for (const { data } of results) {
      if (data) {
        for (const listing of data) {
          if (!seenIds.has(listing.id)) { seenIds.add(listing.id); allListings.push(listing) }
        }
      }
    }
  }

  // Merge pre-selected listings from surprise loop (they may be outside the narrow route corridor)
  if (preSelectedListings && preSelectedListings.length > 0) {
    for (const listing of preSelectedListings) {
      if (!seenIds.has(listing.id)) { seenIds.add(listing.id); allListings.push(listing) }
    }
  }

  // If multi-day, also query Rest Atlas listings with expanded buffer — batched
  let restCandidates = []
  if (isMultiDay) {
    const restBuffer = Math.max(detourConfig.bufferKm, 30)
    const restSeen = new Set()
    const restPoints = sampleRoutePoints(routeCoords, 50)
    const restResults = await Promise.all(restPoints.map(point => {
      const [pLng, pLat] = point
      const latDelta = restBuffer / 111
      const lngDelta = restBuffer / (111 * Math.cos(pLat * Math.PI / 180))
      return sb
        .from('listings')
        .select(SELECT_COLS)
        .eq('status', 'active')
        .eq('vertical', 'rest')
        .or('address_on_request.eq.false,address_on_request.is.null')
        .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
        .or('trail_suitable.eq.true,trail_suitable.is.null')
        .gte('lat', pLat - latDelta)
        .lte('lat', pLat + latDelta)
        .gte('lng', pLng - lngDelta)
        .lte('lng', pLng + lngDelta)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .limit(20)
    }))
    for (const { data } of restResults) {
      if (data) {
        for (const l of data) {
          if (!restSeen.has(l.id)) { restSeen.add(l.id); restCandidates.push(l) }
        }
      }
    }

    // Sparse region expansion: if route is long and few rest listings found, widen the search
    if (totalRouteKm > 500 && restCandidates.length < 5) {
      console.log(`[on-this-road] Sparse rest coverage: only ${restCandidates.length} rest listings on ${Math.round(totalRouteKm)}km route — expanding search`)
      const expandedRestPoints = sampleRoutePoints(routeCoords, 40)
      const expandedRestResults = await Promise.all(expandedRestPoints.map(point => {
        const [pLng, pLat] = point
        const latDelta = 60 / 111
        const lngDelta = 60 / (111 * Math.cos(pLat * Math.PI / 180))
        return sb
          .from('listings')
          .select(SELECT_COLS)
          .eq('status', 'active')
          .eq('vertical', 'rest')
          .or('address_on_request.eq.false,address_on_request.is.null')
          .or('trail_suitable.eq.true,trail_suitable.is.null')
          .gte('lat', pLat - latDelta)
          .lte('lat', pLat + latDelta)
          .gte('lng', pLng - lngDelta)
          .lte('lng', pLng + lngDelta)
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .gte('quality_score', 35)
          .limit(20)
      }))
      for (const { data } of expandedRestResults) {
        if (data) {
          for (const l of data) {
            if (!restSeen.has(l.id)) { restSeen.add(l.id); restCandidates.push(l) }
          }
        }
      }
      console.log(`[on-this-road] After expansion: ${restCandidates.length} rest listings`)
    }

    // Project onto route
    restCandidates = restCandidates.map(l => {
      const proj = projectOntoRoute(l.lat, l.lng, routeCoords)
      return { ...l, distanceFromRoute: proj.distance, routeIndex: proj.routeIndex, positionKm: Math.round(routeDistances[proj.routeIndex] || 0) }
    }).sort((a, b) => a.positionKm - b.positionKm)
  }

  // Project all listings onto route + filter by detour tolerance + interest exclusion
  // For surprise loops, use a wider corridor since pre-selected listings may be off-route
  const preSelectedIds = preSelectedListings ? new Set(preSelectedListings.map(l => l.id)) : new Set()
  const corridorKm = (isSurpriseLoop && isCycling) ? Math.max(effectiveBufferKm, 15) : effectiveBufferKm
  let prefExcludedCount = 0
  const routeListings = allListings
    .map(listing => {
      const proj = projectOntoRoute(listing.lat, listing.lng, routeCoords)
      return {
        ...listing,
        distanceFromRoute: proj.distance,
        routeIndex: proj.routeIndex,
        positionKm: Math.round(routeDistances[proj.routeIndex] || 0),
        preferenceScore: scoreListingPreferences(listing, preferences),
        seasonalScore: scoreSeasonalRelevance(listing, currentSeason),
      }
    })
    .filter(l => {
      const maxBuffer = preSelectedIds.has(l.id) ? corridorKm : effectiveBufferKm
      if (l.distanceFromRoute > maxBuffer) return false
      const effectiveQuality = l.quality_score > 0 ? l.quality_score : 50
      if (effectiveQuality < detourConfig.minQuality) return false
      if (isExcludedByPreferences(l, preferences)) { prefExcludedCount++; return false }
      return true
    })
    .sort((a, b) => a.routeIndex - b.routeIndex)

  if (prefExcludedCount > 0) {
    console.log(`[on-this-road] Interest filter excluded ${prefExcludedCount} listings not matching selected preferences`)
  }


  // Coverage gaps
  const allRouteListings = allListings
    .map(listing => {
      const proj = projectOntoRoute(listing.lat, listing.lng, routeCoords)
      return { ...listing, distanceFromRoute: proj.distance, routeIndex: proj.routeIndex }
    })
    .filter(l => l.distanceFromRoute <= 20)

  const coverageGaps = findCoverageGaps(routeCoords, routeDistances, allRouteListings)

  if (routeListings.length === 0) {
    return NextResponse.json({
      title: `${startCoords.place_name || startName} to ${endCoords.place_name || endName}`,
      intro: null, route_geometry: routeGeometry,
      stops: [], days: [{ day_number: 1, label: 'Day 1', stops: [], overnight: null }],
      total_listings_found: 0, route_duration_minutes: routeDurationMinutes,
      route_distance_km: routeDistanceKm, coverage_gaps: coverageGaps,
      is_long_trip: isLongTrip, is_surprise_loop: isSurpriseLoop,
      transport_mode: transportMode,
      distance_budget_km: distanceBudget || null,
      budget_exceeded: distanceBudget ? routeDistanceKm > distanceBudget * 1.2 : false,
      start_name: startCoords.place_name || startName,
      end_name: endCoords.place_name || endName,
    })
  }

  // ── Stop distribution (multi-day vs single-day) ───────────────────
  let totalStopsTarget = isCycling
    ? Math.min(tripConfig.stopsPerDay * tripConfig.days, Math.round(totalRouteKm / (cyclingConfig.stopSpacingKm * 2)))
    : tripConfig.stopsPerDay * tripConfig.days
  // Clamp to stop count limits based on trip duration
  totalStopsTarget = Math.max(stopLimits.min, Math.min(stopLimits.max, totalStopsTarget))
  const MIN_SPACING_KM = isCycling
    ? Math.max(cyclingConfig.stopSpacingKm, totalRouteKm / (totalStopsTarget + 2))
    : Math.max(30, totalRouteKm / (totalStopsTarget + 2))

  // Build preference + seasonal context (shared by both paths)
  const prefLabels = preferences.map(p => PREFERENCE_MAP[p]?.label).filter(Boolean)
  const prefContext = prefLabels.length > 0
    ? `The traveller has expressed interest in: ${prefLabels.join(', ')}. The listings below have been pre-filtered to match these interests.`
    : ''
  const departureContext = departureConfig
    ? `They are leaving ${departureConfig.label}. The first stop should be roughly ${departureConfig.minFirstStopKm}-${departureConfig.maxFirstStopKm} km from the start — don't suggest anything too close to departure.`
    : ''
  const seasonContext = `The current season is ${currentSeason} (Australia). When multiple listings compete for a slot, prefer those with best_season matching "${currentSeason}" or "Year-round".`

  // ── Multi-day: overnight clusters + discovery distribution ─────────
  let overnightClusters = []
  let discoveryListingsJson = []
  let listingsJson = []
  let dayTargets = []

  if (isMultiDay) {
    // 1. Compute overnight waypoints
    const overnightWaypoints = computeOvernightWaypoints(routeCoords, routeDistances, totalRouteKm, tripConfig.days)

    // 2. Build overnight clusters (rest + table + fine_grounds near each waypoint)
    overnightClusters = buildOvernightClusters(overnightWaypoints, routeListings, restCandidates, routeCoords, routeDistances)

    // Build per-day distance targets (needed for phase scoring in segment distribution)
    const kmPerDay = Math.round(totalRouteKm / tripConfig.days)
    for (let d = 1; d <= tripConfig.days; d++) {
      const startKm = (d - 1) * kmPerDay
      const endKm = d === tripConfig.days ? totalRouteKm : d * kmPerDay
      dayTargets.push({ day: d, startKm, endKm, overnightTargetKm: endKm })
    }

    // 3. Collect all IDs claimed by overnight clusters so they aren't double-used
    const clusterIds = new Set()
    for (const c of overnightClusters) {
      for (const r of c.rest_candidates) clusterIds.add(r.listing_id)
      for (const d of c.dinner_candidates) clusterIds.add(d.listing_id)
      for (const co of c.coffee_candidates) clusterIds.add(co.listing_id)
    }

    // 4. Discovery listings: only discovery verticals, deprioritise origin/destination zones
    const discoveryListings = routeListings
      .filter(l => DISCOVERY_VERTICALS.has(l.vertical) && !clusterIds.has(l.id))
      .map(l => {
        // Soft penalty for origin/destination proximity
        let zonePenalty = 0
        if (l.positionKm < ORIGIN_DEAD_ZONE_KM) zonePenalty = 20
        else if (l.positionKm > totalRouteKm - DESTINATION_DEAD_ZONE_KM) zonePenalty = 15
        return { ...l, zonePenalty }
      })

    // 5. Segment-distribute discovery listings between overnight points
    const multiDaySegDivisor = isCycling ? 10 : 60
    const numSegments = Math.max(4, Math.min(totalStopsTarget + 4, Math.round(totalRouteKm / multiDaySegDivisor)))
    const segmentLengthKm = totalRouteKm / numSegments
    const segments = Array.from({ length: numSegments }, () => [])
    for (const listing of discoveryListings) {
      const segIdx = Math.min(numSegments - 1, Math.floor(listing.positionKm / segmentLengthKm))
      segments[segIdx].push(listing)
    }

    // ── Vertical budget: prevent high-inventory verticals from dominating ──
    const verticalBudget = computeVerticalBudget(preferences, totalStopsTarget)
    const verticalCounts = {}

    const distributedListings = []
    let lastPositionKm = -Infinity
    for (let i = 0; i < numSegments; i++) {
      const segMidKm = (i + 0.5) * segmentLengthKm
      let dayStartKm = 0, dayEndKm = totalRouteKm
      for (const dt of dayTargets) {
        if (segMidKm >= dt.startKm && segMidKm <= dt.endKm) { dayStartKm = dt.startKm; dayEndKm = dt.endKm; break }
      }
      const dayPhase = getDayPhase(segMidKm, dayStartKm, dayEndKm)
      const seg = segments[i].sort((a, b) => {
        const prefA = Math.min(a.preferenceScore || 0, 3)
        const prefB = Math.min(b.preferenceScore || 0, 3)
        const phaseA = scoreDayPhase(a, dayPhase)
        const phaseB = scoreDayPhase(b, dayPhase)
        const scoreA = (a.quality_score > 0 ? a.quality_score : 50) + (prefA * 15) + (a.seasonalScore * 5) - a.zonePenalty + (phaseA * 8)
        const scoreB = (b.quality_score > 0 ? b.quality_score : 50) + (prefB * 15) + (b.seasonalScore * 5) - b.zonePenalty + (phaseB * 8)
        return scoreB - scoreA
      })
      for (const listing of seg) {
        if (listing.positionKm - lastPositionKm < MIN_SPACING_KM) continue
        // Check vertical budget — skip if this vertical has hit its cap
        const vc = verticalCounts[listing.vertical] || 0
        if (verticalBudget) {
          const cap = verticalBudget.caps[listing.vertical] ?? verticalBudget.hardCap
          if (vc >= cap) continue
        }
        distributedListings.push(listing)
        verticalCounts[listing.vertical] = vc + 1
        lastPositionKm = listing.positionKm
        break
      }
    }

    const distributedIds = new Set(distributedListings.map(l => l.id))
    const supplemental = discoveryListings
      .filter(l => !distributedIds.has(l.id))
      .sort((a, b) => {
        const prefA = Math.min(a.preferenceScore || 0, 3)
        const prefB = Math.min(b.preferenceScore || 0, 3)
        const scoreA = (a.quality_score > 0 ? a.quality_score : 50) + (prefA * 15) - a.zonePenalty
        const scoreB = (b.quality_score > 0 ? b.quality_score : 50) + (prefB * 15) - b.zonePenalty
        return scoreB - scoreA
      })
      .filter(l => {
        // Respect vertical budget in supplemental picks too
        if (!verticalBudget) return true
        const vc = verticalCounts[l.vertical] || 0
        const cap = verticalBudget.caps[l.vertical] ?? verticalBudget.hardCap
        if (vc >= cap) return false
        verticalCounts[l.vertical] = vc + 1
        return true
      })
      .slice(0, 15)

    if (verticalBudget) {
      console.log(`[on-this-road] Multi-day vertical balance: budget=${JSON.stringify(verticalBudget.caps)}, actual=${JSON.stringify(verticalCounts)}`)
    }

    discoveryListingsJson = [...distributedListings, ...supplemental]
      .sort((a, b) => a.positionKm - b.positionKm)
      .map(l => ({
        listing_id: l.id, listing_name: l.name, vertical: l.vertical,
        vertical_name: VERTICAL_NAMES[l.vertical] || l.vertical,
        quality_score: l.quality_score || 0, position_km: l.positionKm,
        region: l.region, description: l.description ? l.description.slice(0, 150) : '',
        preference_match: l.preferenceScore > 0, is_segment_pick: distributedIds.has(l.id),
      }))

  }

  // ── Single-day: standard segment distribution (all verticals) ─────
  if (!isMultiDay) {
    const segmentDivisor = isCycling ? 10 : 60
    const numSegments = Math.max(4, Math.min(totalStopsTarget + 4, Math.round(totalRouteKm / segmentDivisor)))
    const segmentLengthKm = totalRouteKm / numSegments
    const segments = Array.from({ length: numSegments }, () => [])
    for (const listing of routeListings) {
      const segIdx = Math.min(numSegments - 1, Math.floor(listing.positionKm / segmentLengthKm))
      segments[segIdx].push(listing)
    }
    // ── Vertical budget: prevent high-inventory verticals from dominating ──
    const verticalBudget = computeVerticalBudget(preferences, totalStopsTarget)
    const verticalCounts = {}

    const distributedListings = []
    let lastPositionKm = -Infinity
    for (let i = 0; i < numSegments; i++) {
      const segMidKm = (i + 0.5) * segmentLengthKm
      const dayPhase = getDayPhase(segMidKm, 0, totalRouteKm)
      const seg = segments[i].sort((a, b) => {
        const prefA = Math.min(a.preferenceScore || 0, 3)
        const prefB = Math.min(b.preferenceScore || 0, 3)
        const phaseA = scoreDayPhase(a, dayPhase)
        const phaseB = scoreDayPhase(b, dayPhase)
        const scoreA = (a.quality_score > 0 ? a.quality_score : 50) + (prefA * 15) + (a.seasonalScore * 5) + (phaseA * 8)
        const scoreB = (b.quality_score > 0 ? b.quality_score : 50) + (prefB * 15) + (b.seasonalScore * 5) + (phaseB * 8)
        return scoreB - scoreA
      })
      for (const listing of seg) {
        if (listing.positionKm - lastPositionKm < MIN_SPACING_KM) continue
        const vc = verticalCounts[listing.vertical] || 0
        if (verticalBudget) {
          const cap = verticalBudget.caps[listing.vertical] ?? verticalBudget.hardCap
          if (vc >= cap) continue
        }
        distributedListings.push(listing)
        verticalCounts[listing.vertical] = vc + 1
        lastPositionKm = listing.positionKm
        break
      }
    }
    const distributedIds = new Set(distributedListings.map(l => l.id))
    const supplemental = routeListings
      .filter(l => !distributedIds.has(l.id))
      .sort((a, b) => {
        const prefA = Math.min(a.preferenceScore || 0, 3)
        const prefB = Math.min(b.preferenceScore || 0, 3)
        const scoreA = (a.quality_score > 0 ? a.quality_score : 50) + (prefA * 15) + (a.seasonalScore * 5)
        const scoreB = (b.quality_score > 0 ? b.quality_score : 50) + (prefB * 15) + (b.seasonalScore * 5)
        return scoreB - scoreA
      })
      .filter(l => {
        if (!verticalBudget) return true
        const vc = verticalCounts[l.vertical] || 0
        const cap = verticalBudget.caps[l.vertical] ?? verticalBudget.hardCap
        if (vc >= cap) return false
        verticalCounts[l.vertical] = vc + 1
        return true
      })
      .slice(0, 20)

    if (verticalBudget) {
      console.log(`[on-this-road] Single-day vertical balance: budget=${JSON.stringify(verticalBudget.caps)}, actual=${JSON.stringify(verticalCounts)}`)
    }
    listingsJson = [...distributedListings, ...supplemental]
      .sort((a, b) => a.positionKm - b.positionKm)
      .map(l => ({
        listing_id: l.id, listing_name: l.name, vertical: l.vertical,
        vertical_name: VERTICAL_NAMES[l.vertical] || l.vertical,
        visit_type: l.visit_type || null, quality_score: l.quality_score || 0,
        distance_from_route_km: Math.round(l.distanceFromRoute * 10) / 10,
        position_km: l.positionKm, region: l.region,
        description: l.description ? l.description.slice(0, 150) : '',
        best_season: l.best_season || null, is_segment_pick: distributedIds.has(l.id),
        preference_match: l.preferenceScore > 0,
      }))
  }

  // Build prompt
  const startNameFull = startCoords.text || startName
  const endNameFull = endCoords.text || endName
  const targetStops = tripConfig.stopsPerDay * tripConfig.days
  const targetSpacingKm = Math.round(totalRouteKm / (targetStops + 2))

  let prompt
  if (isMultiDay) {
    prompt = buildMultiDayPrompt({
      startNameFull, endNameFull, routeDistanceKm, routeDurationMinutes,
      detourConfig, tripConfig, prefContext, departureContext, seasonContext,
      targetStops, targetSpacingKm, MIN_SPACING_KM,
      overnightClusters, discoveryListingsJson,
      isSurpriseLoop, dayTargets, totalRouteKm, isCycling,
    })
  } else {
    prompt = buildSingleDayPrompt({
      startNameFull, endNameFull, routeDistanceKm, routeDurationMinutes,
      detourConfig, tripConfig, prefContext, departureContext, seasonContext,
      targetStops, targetSpacingKm, MIN_SPACING_KM, listingsJson,
      isSurpriseLoop, isCycling,
    })
  }

  // Call Claude
  let claudeResult = null
  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!claudeRes.ok) {
      const errBody = await claudeRes.text().catch(() => '')
      console.error('[on-this-road] Claude API non-200:', claudeRes.status, errBody.slice(0, 300))
    }
    const claudeData = await claudeRes.json()
    const text = claudeData.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) claudeResult = JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error('[on-this-road] Claude API error:', err?.message, '| Route:', routeDistanceKm, 'km', '| Multi-day:', isMultiDay)
  }
  // Build response
  const listingMap = new Map(routeListings.map(l => [l.id, l]))
  // Add rest candidates to map for overnight enrichment
  for (const r of restCandidates) {
    if (!listingMap.has(r.id)) listingMap.set(r.id, r)
  }

  // Anti-hallucination: validate overnight/dinner/coffee IDs against actual candidates
  if (claudeResult && isMultiDay && claudeResult.days) {
    const validOvernightIds = new Set(restCandidates.map(r => r.id))
    const validDinnerIds = new Set(overnightClusters.flatMap(c => c.dinner_candidates.map(d => d.listing_id)))
    const validCoffeeIds = new Set(overnightClusters.flatMap(c => c.coffee_candidates.map(co => co.listing_id)))
    for (const day of claudeResult.days) {
      if (day.overnight && day.overnight.listing_id) {
        if (!validOvernightIds.has(day.overnight.listing_id)) {
          console.error(`[on-this-road] HALLUCINATED OVERNIGHT: Day ${day.day_number} — "${day.overnight.listing_name}" (${day.overnight.listing_id}) not in ${validOvernightIds.size} rest candidates. Stripping.`)
          day.overnight = null
          day.accommodation_note = day.accommodation_note || 'No verified stay found for this area.'
        }
      }
      if (day.dinner && day.dinner.listing_id) {
        if (!validDinnerIds.has(day.dinner.listing_id)) {
          console.error(`[on-this-road] HALLUCINATED DINNER: Day ${day.day_number} — "${day.dinner.listing_name}" (${day.dinner.listing_id}). Stripping.`)
          day.dinner = null
        }
      }
      if (day.morning_coffee && day.morning_coffee.listing_id) {
        if (!validCoffeeIds.has(day.morning_coffee.listing_id)) {
          console.error(`[on-this-road] HALLUCINATED COFFEE: Day ${day.day_number} — "${day.morning_coffee.listing_name}" (${day.morning_coffee.listing_id}). Stripping.`)
          day.morning_coffee = null
        }
      }
    }
  }

  if (claudeResult) {
    return formatClaudeResult({
      claudeResult, listingMap, routeGeometry, routeDistanceKm,
      routeDurationMinutes, coverageGaps, isLongTrip, isSurpriseLoop,
      restCandidates, overnightClusters, startCoords, endCoords, startName, endName,
      tripConfig, isMultiDay, transportMode, distanceBudget,
    })
  }

  // Fallback: build without Claude
  const fallbackStops = buildFallbackStops(routeListings, targetStops, preferences)
  return NextResponse.json({
    title: `${startNameFull} to ${endNameFull}`,
    intro: null, route_geometry: routeGeometry,
    stops: fallbackStops,
    days: [{ day_number: 1, label: 'Day 1', stops: fallbackStops, overnight: null }],
    total_listings_found: routeListings.length,
    route_duration_minutes: routeDurationMinutes,
    route_distance_km: routeDistanceKm,
    coverage_gaps: coverageGaps,
    is_long_trip: isLongTrip, is_surprise_loop: isSurpriseLoop,
    transport_mode: transportMode,
    start_name: startCoords.place_name || startName,
    end_name: endCoords.place_name || endName,
    start_coords: { lat: startCoords.lat, lng: startCoords.lng },
    end_coords: { lat: endCoords.lat, lng: endCoords.lng },
  })
}

// ── Prompt builders ─────────────────────────────────────────────────

// Shared editorial voice instructions for all prompts
const EDITORIAL_VOICE = `WRITING VOICE — you are a travel editor at Australian Atlas. Write like field notes from someone who has driven this road and knows what matters.

STOP DESCRIPTIONS: Write exactly two sentences per stop. First sentence: a specific sensory detail, what the traveller will notice or do here, grounded in this particular place. Second sentence: why this stop matters on THIS route — connect it to the landscape, the drive, the day's rhythm.

BANNED PHRASES (never use): "hidden gem", "nestled", "boasts", "offers", "perfect for", "whether you're...or...", "no trip to X is complete without", "pre-selected", "segment pick", "a great spot", "must-visit", "don't miss", "something for everyone"
- Never invent specific offerings, menu items, or experiential details not present in the listing data. Write about what you know: the name, the vertical, the region, and the landscape.

EXEMPLAR STOP DESCRIPTIONS (match this voice):
- "Sixth-generation land. The vines here predate most Australian wine regions and the approach reflects that continuity — patient, unhurried, low-intervention."
- "The road up into the Adelaide Hills is one of the best short drives in the country. The temperature drops, the canopy closes in, and everything slows down."
- "A Hills institution that has earned its reputation through consistency rather than reinvention. The kind of place where regulars outnumber tourists ten to one."
`

const DAY_RHYTHM = `DAY RHYTHM: Order stops to match the natural rhythm of a road trip day — coffee and nature walks in the morning, culture and producers at midday, breweries and markets in the afternoon. A brewery or distillery should not be the first stop of the day.`

function buildSingleDayPrompt({
  startNameFull, endNameFull, routeDistanceKm, routeDurationMinutes,
  detourConfig, tripConfig, prefContext, departureContext, seasonContext,
  targetStops, targetSpacingKm, MIN_SPACING_KM, listingsJson, isSurpriseLoop,
  isCycling = false,
}) {
  const modeVerb = isCycling ? 'cycling' : 'driving'
  const routeDesc = isSurpriseLoop
    ? `a loop from ${startNameFull} and back (${routeDistanceKm}km, ~${Math.round(routeDurationMinutes / 60)} hours ${modeVerb})`
    : `${startNameFull} to ${endNameFull} (${routeDistanceKm}km, ~${Math.round(routeDurationMinutes / 60)} hours ${modeVerb})`

  const cyclingContext = isCycling
    ? `\n\nCYCLING MODE: This is a bike ride, not a car trip. The total route is only ${routeDistanceKm}km. The rider won't want to detour far off-route. Favour stops that are directly on or very close to the route. Prioritise cafés, nature stops, and scenic rest points over venues that require indoor time. Consider that cyclists need water, food, and shade at regular intervals. Select only ${targetStops} stops — fewer stops mean more time riding.`
    : ''

  return `You are writing for Australian Atlas, a curated guide to independent Australian places. A traveller is ${modeVerb} ${routeDesc}. They are ${detourConfig.label} and want a ${tripConfig.label}.

${prefContext}
${departureContext}
${seasonContext}${cyclingContext}

${EDITORIAL_VOICE}

GROUNDING RULE: Only reference details that are directly stated or clearly implied by the listing's name, description, vertical, or region. You MUST NOT invent specific details about a venue's menu items, tasting experiences, interior atmosphere, staff behaviour, or service style. If the listing description says "family winery" you can say it's a family winery — you cannot say "the cheese plate arrives without ceremony" unless cheese is mentioned in the description. When the description is too sparse to write specifically about the venue itself, write about the landscape, the location on the route, or why this stop matters geographically at this point in the journey. The land is always true — the venue details might not be.

${DAY_RHYTHM}

CRITICAL: Select stops that are geographically distributed along the FULL LENGTH of the route. The route is ${routeDistanceKm}km — aim for stops approximately every ${targetSpacingKm}km. Listings marked "is_segment_pick: true" are pre-selected for their route segment — strongly prefer these.

From the listings below, select the best ${targetStops} stops in order along the route. Prioritise:
1. Geographic distribution (most important)
2. Preference matches (listings with preference_match: true)
3. Quality score and genuine interest
4. Vertical diversity — no single vertical should exceed 30% of stops. Aim for 2+ stops per selected interest vertical. Do NOT over-represent any one vertical just because it has more available listings.
5. No two consecutive stops less than ${MIN_SPACING_KM}km apart

Write a 2–3 sentence route introduction that captures this particular drive — specific landscape, the road, the places. No generic travel writing.
Also write an evocative subtitle (max 8 words) that captures the character of this drive — e.g. "Through the Old Gold Towns" or "Where the Vines Meet the Coast".

Available listings in order along route (position_km = distance from start):
${JSON.stringify(listingsJson, null, 1)}

Return ONLY valid JSON, no markdown:
{"intro":"2-3 sentence editorial intro","subtitle":"Evocative subtitle","stops":[{"listing_id":"uuid","listing_name":"Name","cluster":"Region name","position_km":123,"reason":"Two sentences, editorial voice"}]}`
}

function buildMultiDayPrompt({
  startNameFull, endNameFull, routeDistanceKm, routeDurationMinutes,
  detourConfig, tripConfig, prefContext, departureContext, seasonContext,
  targetStops, targetSpacingKm, MIN_SPACING_KM,
  overnightClusters, discoveryListingsJson,
  isSurpriseLoop, dayTargets, totalRouteKm, isCycling = false,
}) {
  const modeVerb = isCycling ? 'cycling' : 'driving'
  const routeDesc = isSurpriseLoop
    ? `a ${tripConfig.days}-day ${modeVerb} loop from ${startNameFull} (${routeDistanceKm}km total)`
    : `${startNameFull} to ${endNameFull} over ${tripConfig.days} days (${routeDistanceKm}km, ~${Math.round(routeDurationMinutes / 60)} hours ${modeVerb})`

  // Build per-day distance targets section
  const dayTargetsSection = dayTargets && dayTargets.length > 0
    ? `\n\nPER-DAY DISTANCE TARGETS (MUST follow these):\n${dayTargets.map(dt =>
        `- Day ${dt.day}: stops between ${dt.startKm}km–${dt.endKm}km from start. Overnight near ${dt.overnightTargetKm}km.`
      ).join('\n')}\nEach day MUST make meaningful progress toward the destination. Day stops and overnights outside their assigned km range are WRONG.`
    : ''

  // Build overnight clusters section — pre-assembled rest/dinner/coffee candidates per night
  let clustersSection = ''
  if (overnightClusters.length > 0) {
    const clusterBlocks = overnightClusters.map(c => {
      const restPart = c.rest_candidates.length > 0
        ? `  Accommodation (pick ONE):\n${c.rest_candidates.map(r => `    - ${r.listing_name} [${r.listing_id}] at ${r.position_km}km — ${r.description}`).join('\n')}`
        : '  Accommodation: none found — set overnight to null'
      const dinnerPart = c.dinner_candidates.length > 0
        ? `  Dinner (pick ONE):\n${c.dinner_candidates.map(d => `    - ${d.listing_name} [${d.listing_id}] at ${d.position_km}km — ${d.description}`).join('\n')}`
        : '  Dinner: none nearby — set dinner to null'
      const coffeePart = c.coffee_candidates.length > 0
        ? `  Morning coffee next day (pick ONE):\n${c.coffee_candidates.map(co => `    - ${co.listing_name} [${co.listing_id}] at ${co.position_km}km — ${co.description}`).join('\n')}`
        : '  Morning coffee: none nearby — set morning_coffee to null'
      return `Night ${c.night} — ${c.region} (~${c.targetKm}km from start):\n${restPart}\n${dinnerPart}\n${coffeePart}`
    })
    clustersSection = `\n\nOVERNIGHT CLUSTERS (pre-assembled — the traveller sleeps, eats dinner, and gets coffee in the same area):
${clusterBlocks.join('\n\n')}

CLUSTER RULES:
- overnight listing_id MUST come from the cluster's Accommodation list. Do NOT invent accommodation.
- dinner listing_id MUST come from the cluster's Dinner list. If none listed, set dinner to null.
- morning_coffee listing_id MUST come from the cluster's Morning coffee list. If none, set morning_coffee to null.
- Day 1 has no morning_coffee (the traveller starts from home).
- The last day (arriving at destination) has no overnight or dinner — omit both.
- Morning coffee from Night N belongs to Day N+1 (it's the next morning's stop before driving on).`
  } else {
    clustersSection = '\n\nNo overnight clusters found along this route. Set overnight, dinner, and morning_coffee to null for all days.'
  }

  const cyclingContext = isCycling
    ? `\n\nCYCLING MODE: This is a multi-day bike ride. The rider won't detour far off-route. Favour stops directly on or very close to the route — cafés, nature stops, scenic rest points. Consider that cyclists need water, food, and shade at regular intervals.`
    : ''

  return `You are writing for Australian Atlas, a curated guide to independent Australian places. A traveller is ${modeVerb} ${routeDesc}. They are ${detourConfig.label}.

${prefContext}
${departureContext}
${seasonContext}${cyclingContext}

${EDITORIAL_VOICE}

GROUNDING RULE: Only reference details that are directly stated or clearly implied by the listing's name, description, vertical, or region. You MUST NOT invent specific details about a venue's menu items, tasting experiences, interior atmosphere, staff behaviour, or service style. If the listing description says "family winery" you can say it's a family winery — you cannot say "the cheese plate arrives without ceremony" unless cheese is mentioned in the description. When the description is too sparse to write specifically about the venue itself, write about the landscape, the location on the route, or why this stop matters geographically at this point in the journey. The land is always true — the venue details might not be.

${DAY_RHYTHM}

This is a ${tripConfig.days}-day trip. The route is ${routeDistanceKm}km total.
${dayTargetsSection}

TRIP RHYTHM: The traveller discovers things during the day, then stops for dinner + sleep in a coherent overnight area. Each night's accommodation, dinner, and next morning's coffee are clustered in one town/area. Daytime stops are the discovery layer between overnight points.

CRITICAL RULES:
1. Each day's discovery stops MUST fall within that day's km range.
2. Overnight, dinner, and morning_coffee MUST be selected from the pre-assembled clusters below. Do NOT invent names or IDs.
3. Each day must end meaningfully closer to the destination than the previous day.
4. Listings marked "is_segment_pick: true" are pre-selected — strongly prefer these.
5. Prioritise preference matches, quality, and vertical diversity. No single vertical should exceed 30% of discovery stops — distribute across all selected interest verticals.
6. All listing_ids MUST come from the provided data. Do NOT invent stops.
${clustersSection}

DAYTIME DISCOVERY STOPS (distribute across days by position_km — these are for the driving segments between overnight points):
${JSON.stringify(discoveryListingsJson, null, 1)}

Write a 2–3 sentence route introduction capturing this particular drive — specific landscape, road character, the places. No generic travel writing.
Also write an evocative subtitle (max 8 words) — e.g. "Through the Old Gold Towns" or "Where the Vines Meet the Coast".
For each day label, write "Day N — [start place] to [end place]" AND a "day_subtitle" (max 8 words).

Return ONLY valid JSON:
{"intro":"2-3 sentence editorial intro","subtitle":"Evocative subtitle","days":[{"day_number":1,"label":"Day 1 — [place] to [place]","day_subtitle":"Character of the day","stops":[{"listing_id":"uuid","listing_name":"Name","cluster":"Region","position_km":123,"reason":"Two sentences, editorial voice"}],"dinner":{"listing_id":"uuid","listing_name":"Name","reason":"Two sentences"},"overnight":{"listing_id":"uuid","listing_name":"Name","position_km":456,"reason":"Two sentences about this stay"},"morning_coffee":null},{"day_number":2,"label":"Day 2 — ...","day_subtitle":"...","morning_coffee":{"listing_id":"uuid","listing_name":"Name","reason":"One sentence"},"stops":[...],"dinner":null,"overnight":null}]}`
}

// ── Format Claude result into response ──────────────────────────────

function formatClaudeResult({
  claudeResult, listingMap, routeGeometry, routeDistanceKm,
  routeDurationMinutes, coverageGaps, isLongTrip, isSurpriseLoop,
  restCandidates, overnightClusters = [], startCoords, endCoords, startName, endName,
  tripConfig, isMultiDay, transportMode = 'driving', distanceBudget = null,
}) {
  const budgetExceeded = distanceBudget ? routeDistanceKm > distanceBudget * 1.2 : false
  function enrichStop(stop) {
    const listing = listingMap.get(stop.listing_id)
    if (!listing) return null
    return {
      listing_id: stop.listing_id,
      listing_name: stop.listing_name || listing.name,
      slug: listing.slug,
      vertical: listing.vertical,
      visit_type: listing.visit_type || null,
      region: listing.region,
      suburb: listing.suburb,
      state: listing.state,
      lat: listing.lat,
      lng: listing.lng,
      hero_image_url: listing.hero_image_url,
      cluster: stop.cluster,
      position_km: stop.position_km || listing.positionKm,
      reason: stop.reason,
      notes: stop.reason,
    }
  }

  function enrichOvernight(overnight) {
    if (!overnight || !overnight.listing_id) return null
    const listing = listingMap.get(overnight.listing_id)
    if (!listing) return null
    return {
      listing_id: overnight.listing_id,
      listing_name: overnight.listing_name || listing.name,
      slug: listing.slug,
      vertical: 'rest',
      region: listing.region,
      suburb: listing.suburb,
      lat: listing.lat,
      lng: listing.lng,
      hero_image_url: listing.hero_image_url,
      position_km: overnight.position_km || listing.positionKm,
      reason: overnight.reason || 'Rest for the night.',
      is_overnight: true,
    }
  }

  // Multi-day response
  if (isMultiDay && claudeResult.days) {
    const days = claudeResult.days.map(day => {
      const enrichedOvernight = enrichOvernight(day.overnight)
      const enrichedDinner = day.dinner ? enrichStop(day.dinner) : null
      const enrichedCoffee = day.morning_coffee ? enrichStop(day.morning_coffee) : null
      const discoveryStops = (day.stops || []).map(enrichStop).filter(Boolean)

      // Compose full stop list: morning coffee → discovery → dinner
      const composedStops = []
      if (enrichedCoffee) composedStops.push({ ...enrichedCoffee, is_morning_coffee: true })
      composedStops.push(...discoveryStops)
      if (enrichedDinner) composedStops.push({ ...enrichedDinner, is_dinner: true })

      // Build overnight alternatives from the cluster for this day
      const cluster = overnightClusters[day.day_number - 1]
      const overnightAlternatives = cluster
        ? cluster.rest_candidates
          .filter(r => r.listing_id !== enrichedOvernight?.listing_id)
          .map(r => {
            const altListing = restCandidates.find(rc => rc.id === r.listing_id)
            return {
              listing_id: r.listing_id,
              listing_name: r.listing_name,
              slug: altListing?.slug || null,
              region: r.region,
              suburb: r.suburb,
              lat: altListing?.lat || null,
              lng: altListing?.lng || null,
              hero_image_url: altListing?.hero_image_url || null,
              position_km: r.position_km,
              reason: 'Alternative stay option.',
            }
          })
        : []

      return {
        day_number: day.day_number,
        label: day.label || `Day ${day.day_number}`,
        day_subtitle: day.day_subtitle || null,
        stops: composedStops,
        overnight: enrichedOvernight,
        overnight_alternatives: overnightAlternatives,
        dinner: enrichedDinner,
        morning_coffee: enrichedCoffee,
        accommodation_gap: !enrichedOvernight && day.day_number < tripConfig.days,
        accommodation_note: day.accommodation_note || null,
      }
    })

    const allStops = days.flatMap(d => [...d.stops, ...(d.overnight ? [d.overnight] : [])])
    const avgStopMinutes = 25
    const additionalHours = Math.round((allStops.length * avgStopMinutes) / 60 * 10) / 10

    return NextResponse.json({
      title: claudeResult.title || `${startCoords.text || startName} to ${endCoords.text || endName}`,
      subtitle: claudeResult.subtitle || null,
      intro: claudeResult.intro || null,
      route_geometry: routeGeometry,
      stops: allStops,
      days,
      total_listings_found: listingMap.size,
      route_duration_minutes: routeDurationMinutes,
      route_distance_km: routeDistanceKm,
      additional_stop_hours: additionalHours,
      coverage_gaps: coverageGaps,
      is_long_trip: isLongTrip,
      is_surprise_loop: isSurpriseLoop,
      is_multi_day: true,
      transport_mode: transportMode,
      trip_days: tripConfig.days,
      distance_budget_km: distanceBudget || null,
      budget_exceeded: budgetExceeded,
      start_name: startCoords.place_name || startName,
      end_name: endCoords.place_name || endName,
      start_coords: { lat: startCoords.lat, lng: startCoords.lng },
      end_coords: { lat: endCoords.lat, lng: endCoords.lng },
    })
  }

  // Single-day response
  const enrichedStops = (claudeResult.stops || []).map(enrichStop).filter(Boolean)
  const avgStopMinutes = 20
  const additionalHours = Math.round((enrichedStops.length * avgStopMinutes) / 60 * 10) / 10

  return NextResponse.json({
    title: claudeResult.title || `${startCoords.text || startName} to ${endCoords.text || endName}`,
    subtitle: claudeResult.subtitle || null,
    intro: claudeResult.intro || null,
    route_geometry: routeGeometry,
    stops: enrichedStops,
    days: [{ day_number: 1, label: 'Day 1', stops: enrichedStops, overnight: null }],
    total_listings_found: listingMap.size,
    route_duration_minutes: routeDurationMinutes,
    route_distance_km: routeDistanceKm,
    additional_stop_hours: additionalHours,
    coverage_gaps: coverageGaps,
    is_long_trip: isLongTrip,
    is_surprise_loop: isSurpriseLoop,
    is_multi_day: false,
    transport_mode: transportMode,
    distance_budget_km: distanceBudget || null,
    budget_exceeded: budgetExceeded,
    start_name: startCoords.place_name || startName,
    end_name: endCoords.place_name || endName,
    start_coords: { lat: startCoords.lat, lng: startCoords.lng },
    end_coords: { lat: endCoords.lat, lng: endCoords.lng },
    rest_listings: isLongTrip
      ? restCandidates.slice(0, 10).map(l => ({
          listing_id: l.id, listing_name: l.name, slug: l.slug,
          region: l.region, suburb: l.suburb, position_km: l.positionKm,
          hero_image_url: l.hero_image_url, description: l.description?.slice(0, 150) || '',
        }))
      : [],
  })
}

// ── Surprise Me loop generation ─────────────────────────────────────

async function generateSurpriseLoop(startCoords, tripConfig, preferences, detourConfig, transportMode = 'driving', fitness = 'moderate', distanceBudget = null) {
  const sb = getSupabaseAdmin()
  const isCycling = transportMode === 'cycling'

  // Radius derived from distance budget: a loop through 2 waypoints covers roughly 3x the radius
  // Use a reasonable minimum so sparse regional areas still find listings
  const budgetRadius = distanceBudget ? Math.round(distanceBudget / 3) : null
  const defaultRadius = {
    passing_through: 100, day_trip: 150, '2_days': 250, '3_days': 350, '4_plus': 450,
    half_day_ride: 60, full_day_ride: 100, weekend_ride: 150,
  }[tripConfig.label?.replace(/ /g, '_').replace(/-/g, '_')] || 200
  const minRadius = isCycling ? 15 : 40
  const targetRadius = budgetRadius ? Math.max(minRadius, Math.min(budgetRadius, defaultRadius)) : defaultRadius

  // Query with target radius first; expand if too few results
  let listings = null
  let radiusKm = targetRadius
  for (const tryRadius of [targetRadius, Math.min(targetRadius * 2, defaultRadius), defaultRadius]) {
    radiusKm = tryRadius
    const latDelta = radiusKm / 111
    const lngDelta = radiusKm / (111 * Math.cos(startCoords.lat * Math.PI / 180))
    const { data } = await sb
      .from('listings')
      .select('id, name, slug, vertical, region, state, lat, lng, hero_image_url, quality_score, description, sub_type, visit_type, best_season')
      .eq('status', 'active')
      .or('address_on_request.eq.false,address_on_request.is.null')
      .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
      .or('trail_suitable.eq.true,trail_suitable.is.null')
      .gte('lat', startCoords.lat - latDelta)
      .lte('lat', startCoords.lat + latDelta)
      .gte('lng', startCoords.lng - lngDelta)
      .lte('lng', startCoords.lng + lngDelta)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .gte('quality_score', 45)
      .limit(200)
    if (data && data.length >= 5) { listings = data; break }
    listings = data
  }

  if (!listings || listings.length < 5) return null

  // For budget-constrained routes, filter listings to within budget distance
  const maxWaypointDist = distanceBudget ? distanceBudget / 2 : radiusKm
  const reachableListings = listings.filter(l => {
    const dist = haversineKm(startCoords.lat, startCoords.lng, l.lat, l.lng)
    return dist <= maxWaypointDist
  })
  const usableListings = reachableListings.length >= 5 ? reachableListings : listings

  // Find listing-dense clusters by dividing into quadrants
  const quadrants = { NE: [], NW: [], SE: [], SW: [] }
  for (const l of usableListings) {
    const ns = l.lat >= startCoords.lat ? 'N' : 'S'
    const ew = l.lng >= startCoords.lng ? 'E' : 'W'
    quadrants[ns + ew].push(l)
  }

  // Score quadrants by listing density weighted by preference matches
  const scoredQuadrants = Object.entries(quadrants)
    .map(([dir, qListings]) => {
      const prefScore = qListings.reduce((sum, l) => sum + scoreListingPreferences(l, preferences), 0)
      const density = qListings.length
      return { dir, listings: qListings, score: density + (prefScore * 2) }
    })
    .filter(q => q.listings.length >= 2)
    .sort((a, b) => b.score - a.score)

  if (scoredQuadrants.length < 1) return null

  // Weighted random selection from top quadrants (not always the densest)
  // Top quadrant gets 50% weight, second 30%, third 15%, fourth 5%
  const weights = [0.5, 0.3, 0.15, 0.05]
  const rand = Math.random()
  let cumulative = 0
  let primaryIdx = 0
  for (let i = 0; i < scoredQuadrants.length; i++) {
    cumulative += weights[i] || 0.05
    if (rand <= cumulative) { primaryIdx = i; break }
  }

  const primaryQuadrant = scoredQuadrants[primaryIdx]
  const secondaryIdx = primaryIdx === 0 && scoredQuadrants.length > 1 ? 1
    : primaryIdx > 0 && scoredQuadrants.length > 1 ? 0 : primaryIdx
  const secondaryQuadrant = scoredQuadrants[secondaryIdx]

  // Pick waypoints: randomize within the top candidates (not always the same one)
  // Enforce minimum waypoint distance so loops aren't trivially small
  const minWpDist = isCycling ? 5 : 20
  const sortByDist = (arr) => arr.sort((a, b) => {
    const distA = haversineKm(startCoords.lat, startCoords.lng, a.lat, a.lng)
    const distB = haversineKm(startCoords.lat, startCoords.lng, b.lat, b.lng)
    return distB - distA
  })

  let primarySorted = sortByDist([...primaryQuadrant.listings])
    .filter(l => haversineKm(startCoords.lat, startCoords.lng, l.lat, l.lng) >= minWpDist)
  if (primarySorted.length === 0) {
    primarySorted = sortByDist([...primaryQuadrant.listings])
  }
  const pickIdx = Math.floor(Math.random() * Math.min(4, primarySorted.length))
  const primaryWp = primarySorted[Math.max(1, pickIdx)] || primarySorted[0]

  let secondarySorted = sortByDist([...secondaryQuadrant.listings])
    .filter(l => haversineKm(startCoords.lat, startCoords.lng, l.lat, l.lng) >= minWpDist)
  if (secondarySorted.length === 0) {
    secondarySorted = sortByDist([...secondaryQuadrant.listings])
  }
  const secPickIdx = Math.floor(Math.random() * Math.min(3, secondarySorted.length))
  const secondaryWp = secondarySorted[Math.max(1, secPickIdx)] || secondarySorted[0]

  // Compute compass bearing for direction reveal animation
  const bearing = Math.atan2(
    primaryWp.lng - startCoords.lng,
    primaryWp.lat - startCoords.lat
  ) * (180 / Math.PI)

  // Human-readable direction
  const DIRECTION_NAMES = {
    NE: 'northeast', NW: 'northwest', SE: 'southeast', SW: 'southwest',
  }
  const DIRECTION_FLAVOURS = {
    NE: ['Heading northeast', 'Northeast — into the ranges', 'Pointing northeast'],
    NW: ['Heading northwest', 'Northwest — inland', 'Pointing northwest'],
    SE: ['Heading southeast', 'Southeast — toward the coast', 'Pointing southeast'],
    SW: ['Heading southwest', 'Southwest — into open country', 'Pointing southwest'],
  }
  const dirFlavours = DIRECTION_FLAVOURS[primaryQuadrant.dir] || [`Heading ${DIRECTION_NAMES[primaryQuadrant.dir] || 'out'}`]
  const directionLabel = dirFlavours[Math.floor(Math.random() * dirFlavours.length)]

  return {
    waypoints: [
      { lat: primaryWp.lat, lng: primaryWp.lng },
      { lat: secondaryWp.lat, lng: secondaryWp.lng },
    ],
    listings: usableListings,
    direction: {
      bearing: Math.round(bearing),
      quadrant: primaryQuadrant.dir,
      label: directionLabel,
      name: DIRECTION_NAMES[primaryQuadrant.dir] || 'out',
    },
  }
}

// ── Fallback stop builder (no Claude) ───────────────────────────────

function buildFallbackStops(routeListings, count = 10, preferences = []) {
  const sorted = [...routeListings].sort((a, b) => {
    const scoreA = (a.quality_score || 0) + (scoreListingPreferences(a, preferences) * 15)
    const scoreB = (b.quality_score || 0) + (scoreListingPreferences(b, preferences) * 15)
    return scoreB - scoreA
  })

  const result = []
  const vertCounts = {}

  for (const l of sorted) {
    if (result.length >= count) break
    const vc = vertCounts[l.vertical] || 0
    if (vc >= 3) continue
    vertCounts[l.vertical] = vc + 1
    result.push({
      listing_id: l.id, listing_name: l.name, slug: l.slug,
      vertical: l.vertical, visit_type: l.visit_type || null,
      region: l.region, suburb: l.suburb, state: l.state,
      lat: l.lat, lng: l.lng, hero_image_url: l.hero_image_url,
      cluster: l.region || 'Along the way',
      position_km: l.positionKm, reason: '', notes: '',
    })
  }

  result.sort((a, b) => {
    const aIdx = routeListings.find(r => r.id === a.listing_id)?.routeIndex || 0
    const bIdx = routeListings.find(r => r.id === b.listing_id)?.routeIndex || 0
    return aIdx - bIdx
  })

  return result
}
