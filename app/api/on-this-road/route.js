import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const maxDuration = 60

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
  cellar_doors:    { verticals: ['sba'], visit_types: ['experiential'], label: 'Cellar doors & wineries' },
  great_coffee:    { verticals: ['fine_grounds'], visit_types: [], label: 'Great coffee' },
  history:         { verticals: ['collection'], visit_types: ['attraction'], label: 'History & heritage' },
  lunch:           { verticals: ['table', 'sba'], visit_types: ['venue'], label: 'Worth stopping for lunch' },
  producers:       { verticals: ['sba'], visit_types: ['experiential'], label: 'Producers & farm gates' },
  accommodation:   { verticals: ['rest'], visit_types: ['venue'], label: 'Somewhere good to stay' },
  art_makers:      { verticals: ['craft'], visit_types: [], label: 'Art & makers' },
  nature:          { verticals: ['field'], visit_types: [], label: 'Nature & scenery' },
}

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

async function getRoute(startCoords, endCoords, waypoints = []) {
  const coords = [
    `${startCoords.lng},${startCoords.lat}`,
    ...waypoints.map(w => `${w.lng},${w.lat}`),
    `${endCoords.lng},${endCoords.lat}`,
  ].join(';')
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
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
      const loopResult = await generateSurpriseLoop(startCoords, tripConfig, preferences, detourConfig)
      if (!loopResult) {
        return NextResponse.json({ error: 'Could not find enough listings to build a surprise loop. Try different preferences.' }, { status: 400 })
      }
      endCoords = startCoords // Loop back to start
      // Use the loop waypoints for routing
      const route = await getRoute(startCoords, startCoords, loopResult.waypoints)
      if (!route) {
        return NextResponse.json({ error: 'Could not generate a driving loop from this location.' }, { status: 400 })
      }
      return buildItinerary({
        startCoords, endCoords: startCoords, route,
        detourConfig, tripConfig, departureConfig, preferences,
        currentSeason, isMultiDay, isSurpriseLoop, returnDifferentRoad: false,
        startName: start, endName: start,
        preSelectedListings: loopResult.listings,
      })
    }

    // 3. Geocode end
    endCoords = await geocode(end)
    if (!endCoords) {
      return NextResponse.json({ error: 'Could not find end location. Try a more specific Australian place name.' }, { status: 400 })
    }

    // Short trip detection
    const directDistance = haversineKm(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng)
    if (directDistance < 20) {
      return NextResponse.json({
        short_trip: true,
        message: "That\u2019s a short trip \u2014 try the Long Weekend Engine instead.",
        direct_distance_km: Math.round(directDistance),
      })
    }

    // 4. Get outbound route
    const route = await getRoute(startCoords, endCoords)
    if (!route) {
      return NextResponse.json({ error: 'No driving route found between these locations.' }, { status: 400 })
    }

    // 5. Build outbound itinerary
    const result = await buildItinerary({
      startCoords, endCoords, route,
      detourConfig, tripConfig, departureConfig, preferences,
      currentSeason, isMultiDay, isSurpriseLoop: false, returnDifferentRoad,
      startName: start, endName: end,
    })

    // 6. If return different road requested, build return route
    if (returnDifferentRoad && result.status !== 400) {
      const resultData = await result.json()
      const returnRoute = await getRoute(endCoords, startCoords)
      if (returnRoute) {
        const returnResult = await buildItinerary({
          startCoords: endCoords, endCoords: startCoords, route: returnRoute,
          detourConfig, tripConfig: { ...tripConfig, days: Math.max(1, tripConfig.days - 1) },
          departureConfig: null, preferences, currentSeason,
          isMultiDay: tripConfig.days >= 3, isSurpriseLoop: false, returnDifferentRoad: false,
          startName: end, endName: start,
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
}) {
  const routeGeometry = route.geometry
  const routeCoords = routeGeometry.coordinates
  const routeDurationMinutes = Math.round(route.duration / 60)
  const routeDistanceKm = Math.round(route.distance / 1000)
  const isLongTrip = routeDistanceKm > 2000

  const routeDistances = buildRouteDistances(routeCoords)
  const totalRouteKm = routeDistances[routeDistances.length - 1] || routeDistanceKm

  // Query listings along route — batched for performance
  const samplePoints = sampleRoutePoints(routeCoords, 30)
  const sb = getSupabaseAdmin()
  const seenIds = new Set()
  const allListings = []

  const SELECT_COLS = 'id, name, slug, vertical, region, state, suburb, lat, lng, hero_image_url, quality_score, description, sub_type, visit_type, best_season'

  // Run all point queries in parallel batches of 10
  const BATCH_SIZE = 10
  for (let batchStart = 0; batchStart < samplePoints.length; batchStart += BATCH_SIZE) {
    const batch = samplePoints.slice(batchStart, batchStart + BATCH_SIZE)
    const results = await Promise.all(batch.map(point => {
      const [pLng, pLat] = point
      const latDelta = detourConfig.bufferKm / 111
      const lngDelta = detourConfig.bufferKm / (111 * Math.cos(pLat * Math.PI / 180))
      return sb
        .from('listings')
        .select(SELECT_COLS)
        .eq('status', 'active')
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
    // Project onto route
    restCandidates = restCandidates.map(l => {
      const proj = projectOntoRoute(l.lat, l.lng, routeCoords)
      return { ...l, distanceFromRoute: proj.distance, routeIndex: proj.routeIndex, positionKm: Math.round(routeDistances[proj.routeIndex] || 0) }
    }).sort((a, b) => a.positionKm - b.positionKm)
  }

  // Project all listings onto route + filter by detour tolerance
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
      if (l.distanceFromRoute > detourConfig.bufferKm) return false
      if ((l.quality_score || 0) < detourConfig.minQuality) return false
      return true
    })
    .sort((a, b) => a.routeIndex - b.routeIndex)

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
      start_name: startCoords.place_name || startName,
      end_name: endCoords.place_name || endName,
    })
  }

  // Segment-based stop distribution
  const totalStopsTarget = tripConfig.stopsPerDay * tripConfig.days
  const numSegments = Math.max(6, Math.min(totalStopsTarget + 4, Math.round(totalRouteKm / 60)))
  const segmentLengthKm = totalRouteKm / numSegments
  const MIN_SPACING_KM = Math.max(30, totalRouteKm / (totalStopsTarget + 2))

  const segments = Array.from({ length: numSegments }, () => [])
  for (const listing of routeListings) {
    const segIdx = Math.min(numSegments - 1, Math.floor(listing.positionKm / segmentLengthKm))
    segments[segIdx].push(listing)
  }

  // Pick best listing per segment using composite score
  const distributedListings = []
  let lastPositionKm = -Infinity

  for (let i = 0; i < numSegments; i++) {
    const seg = segments[i].sort((a, b) => {
      // Composite: quality + preference weight + seasonal
      const scoreA = (a.quality_score || 0) + (a.preferenceScore * 15) + (a.seasonalScore * 5)
      const scoreB = (b.quality_score || 0) + (b.preferenceScore * 15) + (b.seasonalScore * 5)
      return scoreB - scoreA
    })

    for (const listing of seg) {
      if (listing.positionKm - lastPositionKm >= MIN_SPACING_KM) {
        distributedListings.push(listing)
        lastPositionKm = listing.positionKm
        break
      }
    }
  }

  const distributedIds = new Set(distributedListings.map(l => l.id))
  const supplemental = routeListings
    .filter(l => !distributedIds.has(l.id))
    .sort((a, b) => {
      const scoreA = (a.quality_score || 0) + (a.preferenceScore * 15) + (a.seasonalScore * 5)
      const scoreB = (b.quality_score || 0) + (b.preferenceScore * 15) + (b.seasonalScore * 5)
      return scoreB - scoreA
    })
    .slice(0, 20)

  const listingsForPrompt = [...distributedListings, ...supplemental]
    .sort((a, b) => a.positionKm - b.positionKm)

  // Build preference context for Claude
  const prefLabels = preferences.map(p => PREFERENCE_MAP[p]?.label).filter(Boolean)
  const prefContext = prefLabels.length > 0
    ? `The traveller has expressed interest in: ${prefLabels.join(', ')}. Strongly prefer listings that match these interests.`
    : ''

  // Build departure context
  const departureContext = departureConfig
    ? `They are leaving ${departureConfig.label}. The first stop should be roughly ${departureConfig.minFirstStopKm}-${departureConfig.maxFirstStopKm} km from the start — don't suggest anything too close to departure.`
    : ''

  // Build seasonal context
  const seasonContext = `The current season is ${currentSeason} (Australia). When multiple listings compete for a slot, prefer those with best_season matching "${currentSeason}" or "Year-round".`

  // Build listings payload for Claude
  const listingsJson = listingsForPrompt.map(l => ({
    listing_id: l.id,
    listing_name: l.name,
    vertical: l.vertical,
    vertical_name: VERTICAL_NAMES[l.vertical] || l.vertical,
    visit_type: l.visit_type || null,
    quality_score: l.quality_score || 0,
    distance_from_route_km: Math.round(l.distanceFromRoute * 10) / 10,
    position_km: l.positionKm,
    region: l.region,
    description: l.description ? l.description.slice(0, 150) : '',
    best_season: l.best_season || null,
    is_segment_pick: distributedIds.has(l.id),
    preference_match: l.preferenceScore > 0,
  }))

  // Build overnight candidates for multi-day
  const overnightJson = isMultiDay && restCandidates.length > 0
    ? restCandidates.map(l => ({
        listing_id: l.id,
        listing_name: l.name,
        position_km: l.positionKm,
        region: l.region,
        description: l.description ? l.description.slice(0, 100) : '',
        quality_score: l.quality_score || 0,
      }))
    : []

  // Build per-day distance targets for multi-day trips
  const dayTargets = []
  if (isMultiDay) {
    const kmPerDay = Math.round(totalRouteKm / tripConfig.days)
    for (let d = 1; d <= tripConfig.days; d++) {
      const startKm = (d - 1) * kmPerDay
      const endKm = d === tripConfig.days ? totalRouteKm : d * kmPerDay
      dayTargets.push({ day: d, startKm, endKm, overnightTargetKm: endKm })
    }
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
      targetStops, targetSpacingKm, MIN_SPACING_KM, listingsJson, overnightJson,
      isSurpriseLoop, dayTargets, totalRouteKm,
    })
  } else {
    prompt = buildSingleDayPrompt({
      startNameFull, endNameFull, routeDistanceKm, routeDurationMinutes,
      detourConfig, tripConfig, prefContext, departureContext, seasonContext,
      targetStops, targetSpacingKm, MIN_SPACING_KM, listingsJson,
      isSurpriseLoop,
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
    console.error('[on-this-road] Claude API error:', err?.message, '| Listings sent:', listingsForPrompt.length, '| Route:', routeDistanceKm, 'km')
  }

  // Build response
  const listingMap = new Map(routeListings.map(l => [l.id, l]))
  // Add rest candidates to map for overnight enrichment
  for (const r of restCandidates) {
    if (!listingMap.has(r.id)) listingMap.set(r.id, r)
  }

  // Anti-hallucination: validate overnight IDs against actual candidates
  if (claudeResult && isMultiDay && claudeResult.days) {
    const validOvernightIds = new Set(restCandidates.map(r => r.id))
    for (const day of claudeResult.days) {
      if (day.overnight && day.overnight.listing_id) {
        if (!validOvernightIds.has(day.overnight.listing_id)) {
          console.error(`[on-this-road] HALLUCINATED OVERNIGHT DETECTED: Day ${day.day_number} — "${day.overnight.listing_name}" (${day.overnight.listing_id}) is not in the ${validOvernightIds.size} rest candidates. Stripping.`)
          day.overnight = null
          day.accommodation_note = day.accommodation_note || 'No verified stay found for this area.'
        }
      }
    }
  }

  if (claudeResult) {
    return formatClaudeResult({
      claudeResult, listingMap, routeGeometry, routeDistanceKm,
      routeDurationMinutes, coverageGaps, isLongTrip, isSurpriseLoop,
      restCandidates, startCoords, endCoords, startName, endName,
      tripConfig, isMultiDay,
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
    start_name: startCoords.place_name || startName,
    end_name: endCoords.place_name || endName,
    start_coords: { lat: startCoords.lat, lng: startCoords.lng },
    end_coords: { lat: endCoords.lat, lng: endCoords.lng },
  })
}

// ── Prompt builders ─────────────────────────────────────────────────

function buildSingleDayPrompt({
  startNameFull, endNameFull, routeDistanceKm, routeDurationMinutes,
  detourConfig, tripConfig, prefContext, departureContext, seasonContext,
  targetStops, targetSpacingKm, MIN_SPACING_KM, listingsJson, isSurpriseLoop,
}) {
  const routeDesc = isSurpriseLoop
    ? `a loop from ${startNameFull} and back (${routeDistanceKm}km, ~${Math.round(routeDurationMinutes / 60)} hours)`
    : `${startNameFull} to ${endNameFull} (${routeDistanceKm}km, ~${Math.round(routeDurationMinutes / 60)} hours)`

  return `You are writing for Australian Atlas, a curated guide to independent Australian places. A traveller is driving ${routeDesc}. They are ${detourConfig.label} and want a ${tripConfig.label}.

${prefContext}
${departureContext}
${seasonContext}

CRITICAL: Select stops that are geographically distributed along the FULL LENGTH of the route. The route is ${routeDistanceKm}km — aim for stops approximately every ${targetSpacingKm}km. Listings marked "is_segment_pick: true" are pre-selected for their route segment — strongly prefer these.

From the listings below, select the best ${targetStops} stops in order along the route. Prioritise:
1. Geographic distribution (most important)
2. Preference matches (listings with preference_match: true)
3. Quality score and genuine interest
4. Vertical diversity (at least 3 different verticals)
5. No two consecutive stops less than ${MIN_SPACING_KM}km apart

For each stop write one sentence explaining why it\u2019s worth pulling over for.
Then write a 2-sentence route introduction that captures this particular drive. Be specific about landscape, the road, the places. No generic travel writing.

Available listings in order along route (position_km = distance from start):
${JSON.stringify(listingsJson, null, 1)}

Return ONLY valid JSON, no markdown:
{"intro":"2-sentence editorial intro","stops":[{"listing_id":"uuid","listing_name":"Name","cluster":"Region name","position_km":123,"reason":"One sentence"}]}`
}

function buildMultiDayPrompt({
  startNameFull, endNameFull, routeDistanceKm, routeDurationMinutes,
  detourConfig, tripConfig, prefContext, departureContext, seasonContext,
  targetStops, targetSpacingKm, MIN_SPACING_KM, listingsJson, overnightJson,
  isSurpriseLoop, dayTargets, totalRouteKm,
}) {
  const routeDesc = isSurpriseLoop
    ? `a ${tripConfig.days}-day loop from ${startNameFull} (${routeDistanceKm}km total)`
    : `${startNameFull} to ${endNameFull} over ${tripConfig.days} days (${routeDistanceKm}km, ~${Math.round(routeDurationMinutes / 60)} hours driving)`

  // Build per-day distance targets section
  const dayTargetsSection = dayTargets && dayTargets.length > 0
    ? `\n\nPER-DAY DISTANCE TARGETS (MUST follow these):\n${dayTargets.map(dt =>
        `- Day ${dt.day}: stops between ${dt.startKm}km–${dt.endKm}km from start. Overnight near ${dt.overnightTargetKm}km.`
      ).join('\n')}\nEach day MUST make meaningful progress toward the destination. Day stops and overnights outside their assigned km range are WRONG.`
    : ''

  const overnightIds = overnightJson.map(o => o.listing_id)
  const overnightSection = overnightJson.length > 0
    ? `\n\nACCOMMODATION CANDIDATES (you MUST pick overnight stays ONLY from this list — do NOT invent or hallucinate any accommodation):\n${JSON.stringify(overnightJson, null, 1)}\n\nValid overnight listing_ids: ${JSON.stringify(overnightIds)}\nIf no candidate exists near a day's endpoint, set overnight to null and add "accommodation_note": "No verified stays near [area] — consider continuing to [next town with candidates]".`
    : '\n\nNo accommodation listings found along this route. Set overnight to null for all days and add "accommodation_note" explaining the gap.'

  return `You are writing for Australian Atlas, a curated guide to independent Australian places. A traveller is driving ${routeDesc}. They are ${detourConfig.label}.

${prefContext}
${departureContext}
${seasonContext}

This is a ${tripConfig.days}-day trip. The route is ${routeDistanceKm}km total.
${dayTargetsSection}

CRITICAL RULES:
1. Each day's stops MUST fall within that day's km range. Day 1 covers the first segment, Day 2 the next, etc.
2. Overnight stays MUST be selected from the accommodation candidates list below. Do NOT invent accommodation names. If the listing_id is not in the candidates list, do NOT use it.
3. Each day must end meaningfully closer to the destination than the previous day.
4. Listings marked "is_segment_pick: true" are pre-selected — strongly prefer these.
5. Prioritise preference matches, quality, vertical diversity.
6. All listing_ids for stops MUST come from the day stops list below. Do NOT invent stops.

Day stops (position_km = distance from start):
${JSON.stringify(listingsJson, null, 1)}
${overnightSection}

Return ONLY valid JSON:
{"intro":"2-sentence editorial intro","days":[{"day_number":1,"label":"Day 1 — [place] to [place]","stops":[{"listing_id":"uuid","listing_name":"Name","cluster":"Region","position_km":123,"reason":"One sentence"}],"overnight":{"listing_id":"uuid","listing_name":"Name","position_km":456,"reason":"Why stay here"}}]}`
}

// ── Format Claude result into response ──────────────────────────────

function formatClaudeResult({
  claudeResult, listingMap, routeGeometry, routeDistanceKm,
  routeDurationMinutes, coverageGaps, isLongTrip, isSurpriseLoop,
  restCandidates, startCoords, endCoords, startName, endName,
  tripConfig, isMultiDay,
}) {
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
      return {
        day_number: day.day_number,
        label: day.label || `Day ${day.day_number}`,
        stops: (day.stops || []).map(enrichStop).filter(Boolean),
        overnight: enrichedOvernight,
        accommodation_gap: !enrichedOvernight && day.day_number < tripConfig.days,
        accommodation_note: day.accommodation_note || null,
      }
    })

    const allStops = days.flatMap(d => [...d.stops, ...(d.overnight ? [d.overnight] : [])])
    const avgStopMinutes = 25
    const additionalHours = Math.round((allStops.length * avgStopMinutes) / 60 * 10) / 10

    return NextResponse.json({
      title: claudeResult.title || `${startCoords.text || startName} to ${endCoords.text || endName}`,
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
      trip_days: tripConfig.days,
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

async function generateSurpriseLoop(startCoords, tripConfig, preferences, detourConfig) {
  const sb = getSupabaseAdmin()

  // Radius based on trip length
  const radiusKm = {
    passing_through: 100, day_trip: 150, '2_days': 250, '3_days': 350, '4_plus': 450,
  }[tripConfig.label?.replace(/ /g, '_')] || 200

  const latDelta = radiusKm / 111
  const lngDelta = radiusKm / (111 * Math.cos(startCoords.lat * Math.PI / 180))

  const { data: listings } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, lat, lng, hero_image_url, quality_score, description, sub_type, visit_type, best_season')
    .eq('status', 'active')
    .or('trail_suitable.eq.true,trail_suitable.is.null')
    .gte('lat', startCoords.lat - latDelta)
    .lte('lat', startCoords.lat + latDelta)
    .gte('lng', startCoords.lng - lngDelta)
    .lte('lng', startCoords.lng + lngDelta)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .gte('quality_score', 45)
    .limit(200)

  if (!listings || listings.length < 5) return null

  // Find listing-dense clusters by dividing into quadrants
  const quadrants = { NE: [], NW: [], SE: [], SW: [] }
  for (const l of listings) {
    const ns = l.lat >= startCoords.lat ? 'N' : 'S'
    const ew = l.lng >= startCoords.lng ? 'E' : 'W'
    quadrants[ns + ew].push(l)
  }

  // Pick the densest quadrant as the primary direction, second densest as return
  const sorted = Object.entries(quadrants)
    .sort((a, b) => b[1].length - a[1].length)
    .filter(([, v]) => v.length >= 2)

  if (sorted.length < 1) return null

  const primary = sorted[0][1]
  const secondary = sorted.length > 1 ? sorted[1][1] : primary

  // Pick waypoints: farthest high-quality listing in primary direction, then secondary
  const primaryWp = primary.sort((a, b) => {
    const distA = haversineKm(startCoords.lat, startCoords.lng, a.lat, a.lng)
    const distB = haversineKm(startCoords.lat, startCoords.lng, b.lat, b.lng)
    return distB - distA
  })[Math.min(2, primary.length - 1)] // 3rd farthest for a good middle distance

  const secondaryWp = secondary.sort((a, b) => {
    const distA = haversineKm(startCoords.lat, startCoords.lng, a.lat, a.lng)
    const distB = haversineKm(startCoords.lat, startCoords.lng, b.lat, b.lng)
    return distB - distA
  })[Math.min(1, secondary.length - 1)]

  return {
    waypoints: [
      { lat: primaryWp.lat, lng: primaryWp.lng },
      { lat: secondaryWp.lat, lng: secondaryWp.lng },
    ],
    listings,
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
