import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const maxDuration = 60

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-20250514'

const VERTICAL_NAMES = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

// Time preference → buffer distance + quality gate
const TIME_CONFIG = {
  '30': { bufferKm: 5, minQuality: 70, label: '30 minutes' },
  '60': { bufferKm: 10, minQuality: 60, label: '1 hour' },
  '120': { bufferKm: 20, minQuality: 50, label: '2 hours' },
  'all': { bufferKm: 20, minQuality: 0, label: 'as long as it takes' },
}

// Haversine distance in km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Find closest point on route to a given point
function projectOntoRoute(lat, lng, routeCoords) {
  let minDist = Infinity
  let bestIdx = 0
  for (let i = 0; i < routeCoords.length; i++) {
    const [rLng, rLat] = routeCoords[i]
    const d = haversineKm(lat, lng, rLat, rLng)
    if (d < minDist) {
      minDist = d
      bestIdx = i
    }
  }
  return { distance: minDist, routeIndex: bestIdx }
}

// Calculate cumulative distance along route at each coordinate index
function buildRouteDistances(routeCoords) {
  const distances = [0]
  for (let i = 1; i < routeCoords.length; i++) {
    const [lng1, lat1] = routeCoords[i - 1]
    const [lng2, lat2] = routeCoords[i]
    distances.push(distances[i - 1] + haversineKm(lat1, lng1, lat2, lng2))
  }
  return distances
}

// Sample points along the route every N km
function sampleRoutePoints(routeCoords, intervalKm = 20) {
  const points = [routeCoords[0]]
  let accum = 0
  for (let i = 1; i < routeCoords.length; i++) {
    const [lng1, lat1] = routeCoords[i - 1]
    const [lng2, lat2] = routeCoords[i]
    accum += haversineKm(lat1, lng1, lat2, lng2)
    if (accum >= intervalKm) {
      points.push(routeCoords[i])
      accum = 0
    }
  }
  return points
}

// Detect coverage gaps: segments of route > 50km with no listings
function findCoverageGaps(routeCoords, routeDistances, listings) {
  const totalKm = routeDistances[routeDistances.length - 1]
  const GAP_THRESHOLD_KM = 50
  const SEGMENT_SIZE_KM = 10

  // Build a coverage bitmap: which 10km segments have listings?
  const numSegments = Math.ceil(totalKm / SEGMENT_SIZE_KM)
  const covered = new Array(numSegments).fill(false)

  for (const l of listings) {
    const segIdx = Math.floor((routeDistances[l.routeIndex] || 0) / SEGMENT_SIZE_KM)
    if (segIdx >= 0 && segIdx < numSegments) covered[segIdx] = true
  }

  // Find runs of uncovered segments
  const gaps = []
  let gapStart = null
  for (let i = 0; i < numSegments; i++) {
    if (!covered[i]) {
      if (gapStart === null) gapStart = i
    } else {
      if (gapStart !== null) {
        const gapKm = (i - gapStart) * SEGMENT_SIZE_KM
        if (gapKm >= GAP_THRESHOLD_KM) {
          const startKm = gapStart * SEGMENT_SIZE_KM
          const endKm = i * SEGMENT_SIZE_KM
          // Find the midpoint coordinates
          const midKm = (startKm + endKm) / 2
          const midIdx = routeDistances.findIndex(d => d >= midKm)
          if (midIdx >= 0 && midIdx < routeCoords.length) {
            gaps.push({
              startKm: Math.round(startKm),
              endKm: Math.round(endKm),
              lengthKm: Math.round(gapKm),
              midpoint: { lng: routeCoords[midIdx][0], lat: routeCoords[midIdx][1] },
            })
          }
        }
        gapStart = null
      }
    }
  }
  // Handle trailing gap
  if (gapStart !== null) {
    const gapKm = (numSegments - gapStart) * SEGMENT_SIZE_KM
    if (gapKm >= GAP_THRESHOLD_KM) {
      gaps.push({
        startKm: Math.round(gapStart * SEGMENT_SIZE_KM),
        endKm: Math.round(totalKm),
        lengthKm: Math.round(gapKm),
        midpoint: { lng: routeCoords[routeCoords.length - 1][0], lat: routeCoords[routeCoords.length - 1][1] },
      })
    }
  }
  return gaps
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { start, end, timeAvailable } = body

    if (!start || !end) {
      return NextResponse.json({ error: 'Start and end locations are required.' }, { status: 400 })
    }

    const timeConfig = TIME_CONFIG[timeAvailable] || TIME_CONFIG['120']

    // 1. Geocode start and end
    const [startCoords, endCoords] = await Promise.all([geocode(start), geocode(end)])

    if (!startCoords || !endCoords) {
      return NextResponse.json(
        { error: 'Could not find one or both locations. Try a more specific Australian place name.' },
        { status: 400 }
      )
    }

    // Short trip detection
    const directDistance = haversineKm(startCoords.lat, startCoords.lng, endCoords.lat, endCoords.lng)
    if (directDistance < 20) {
      return NextResponse.json({
        short_trip: true,
        message: "That's a short trip \u2014 try the Long Weekend Engine instead.",
        direct_distance_km: Math.round(directDistance),
      })
    }

    // 2. Get route from Mapbox Directions API
    const routeUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoords.lng},${startCoords.lat};${endCoords.lng},${endCoords.lat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
    const routeRes = await fetch(routeUrl)
    const routeData = await routeRes.json()

    if (!routeData.routes || routeData.routes.length === 0) {
      return NextResponse.json({ error: 'No driving route found between these locations.' }, { status: 400 })
    }

    const route = routeData.routes[0]
    const routeGeometry = route.geometry
    const routeCoords = routeGeometry.coordinates
    const routeDurationMinutes = Math.round(route.duration / 60)
    const routeDistanceKm = Math.round(route.distance / 1000)

    // Long trip warning
    const isLongTrip = routeDistanceKm > 2000

    // 3. Build route distances for position calculation
    const routeDistances = buildRouteDistances(routeCoords)

    // 4. Sample points along the route and query listings
    const samplePoints = sampleRoutePoints(routeCoords, 20)
    const sb = getSupabaseAdmin()
    const QUERY_BUFFER_KM = 20 // Always query 20km buffer, filter by time preference later
    const seenIds = new Set()
    const allListings = []

    for (const point of samplePoints) {
      const [pLng, pLat] = point
      const latDelta = QUERY_BUFFER_KM / 111
      const lngDelta = QUERY_BUFFER_KM / (111 * Math.cos(pLat * Math.PI / 180))

      // trail_suitable filter: exclude listings explicitly marked unsuitable.
      // NULL = not yet classified (included until enrichment runs).
      const { data } = await sb
        .from('listings')
        .select('id, name, slug, vertical, region, state, suburb, lat, lng, hero_image_url, quality_score, description, sub_type')
        .eq('status', 'active')
        .or('trail_suitable.eq.true,trail_suitable.is.null')
        .gte('lat', pLat - latDelta)
        .lte('lat', pLat + latDelta)
        .gte('lng', pLng - lngDelta)
        .lte('lng', pLng + lngDelta)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .limit(50)

      if (data) {
        for (const listing of data) {
          if (!seenIds.has(listing.id)) {
            seenIds.add(listing.id)
            allListings.push(listing)
          }
        }
      }
    }

    // 5. Project onto route + filter by time preference
    const routeListings = allListings
      .map(listing => {
        const proj = projectOntoRoute(listing.lat, listing.lng, routeCoords)
        return {
          ...listing,
          distanceFromRoute: proj.distance,
          routeIndex: proj.routeIndex,
          positionKm: Math.round(routeDistances[proj.routeIndex] || 0),
        }
      })
      .filter(l => {
        // Apply time-based filtering
        if (l.distanceFromRoute > timeConfig.bufferKm) return false
        if ((l.quality_score || 0) < timeConfig.minQuality) return false
        return true
      })
      .sort((a, b) => a.routeIndex - b.routeIndex)

    // Also find ALL listings within 20km for coverage gap analysis (unfiltered)
    const allRouteListings = allListings
      .map(listing => {
        const proj = projectOntoRoute(listing.lat, listing.lng, routeCoords)
        return { ...listing, distanceFromRoute: proj.distance, routeIndex: proj.routeIndex }
      })
      .filter(l => l.distanceFromRoute <= 20)

    // 6. Detect coverage gaps
    const coverageGaps = findCoverageGaps(routeCoords, routeDistances, allRouteListings)

    if (routeListings.length === 0) {
      return NextResponse.json({
        title: `${startCoords.place_name || start} to ${endCoords.place_name || end}`,
        intro: null,
        route_geometry: routeGeometry,
        stops: [],
        total_listings_found: 0,
        route_duration_minutes: routeDurationMinutes,
        route_distance_km: routeDistanceKm,
        coverage_gaps: coverageGaps,
        is_long_trip: isLongTrip,
        start_name: startCoords.place_name || start,
        end_name: endCoords.place_name || end,
      })
    }

    // 7. Segment-based stop distribution
    // Divide route into equal segments and pick the best listing per segment.
    // This prevents clustering at departure/destination and ensures stops
    // are distributed along the full route length.
    const totalRouteKm = routeDistances[routeDistances.length - 1] || routeDistanceKm
    const numSegments = Math.max(6, Math.min(12, Math.round(totalRouteKm / 80)))
    const segmentLengthKm = totalRouteKm / numSegments
    const MIN_SPACING_KM = 50

    // Assign each listing to a segment
    const segments = Array.from({ length: numSegments }, () => [])
    for (const listing of routeListings) {
      const segIdx = Math.min(
        numSegments - 1,
        Math.floor(listing.positionKm / segmentLengthKm)
      )
      segments[segIdx].push(listing)
    }

    // For segments with zero listings, try expanding buffer to 40km
    for (let i = 0; i < numSegments; i++) {
      if (segments[i].length === 0) {
        const segStartKm = i * segmentLengthKm
        const segEndKm = (i + 1) * segmentLengthKm
        const expanded = allListings
          .map(listing => {
            const proj = projectOntoRoute(listing.lat, listing.lng, routeCoords)
            const posKm = routeDistances[proj.routeIndex] || 0
            return { ...listing, distanceFromRoute: proj.distance, routeIndex: proj.routeIndex, positionKm: Math.round(posKm) }
          })
          .filter(l =>
            l.distanceFromRoute <= 40 &&
            l.positionKm >= segStartKm &&
            l.positionKm < segEndKm &&
            (l.quality_score || 0) >= Math.max(timeConfig.minQuality - 20, 0)
          )
        if (expanded.length > 0) {
          segments[i] = expanded
        }
      }
    }

    // Pick the best listing per segment (highest quality score), enforcing minimum spacing
    const distributedListings = []
    let lastPositionKm = -Infinity

    for (let i = 0; i < numSegments; i++) {
      const seg = segments[i]
        .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))

      for (const listing of seg) {
        if (listing.positionKm - lastPositionKm >= MIN_SPACING_KM) {
          distributedListings.push(listing)
          lastPositionKm = listing.positionKm
          break
        }
      }
    }

    // Also gather remaining high-quality listings for Claude to have options
    const distributedIds = new Set(distributedListings.map(l => l.id))
    const supplemental = routeListings
      .filter(l => !distributedIds.has(l.id))
      .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))
      .slice(0, 20)

    const listingsForPrompt = [...distributedListings, ...supplemental]
      .sort((a, b) => a.positionKm - b.positionKm)

    // For long trips, separate out Rest Atlas listings
    let restListings = []
    if (isLongTrip) {
      restListings = routeListings
        .filter(l => l.vertical === 'rest')
        .map(l => ({
          listing_id: l.id,
          listing_name: l.name,
          slug: l.slug,
          region: l.region,
          suburb: l.suburb,
          position_km: l.positionKm,
          hero_image_url: l.hero_image_url,
          description: l.description ? l.description.slice(0, 150) : '',
        }))
    }

    // 8. Call Claude with geographically distributed listings
    const startName = startCoords.text || start
    const endName = endCoords.text || end
    const targetSpacingKm = Math.round(totalRouteKm / numSegments)

    const listingsJson = listingsForPrompt.map(l => ({
      listing_id: l.id,
      listing_name: l.name,
      vertical: l.vertical,
      vertical_name: VERTICAL_NAMES[l.vertical] || l.vertical,
      quality_score: l.quality_score || 0,
      distance_from_route_km: Math.round(l.distanceFromRoute * 10) / 10,
      position_km: l.positionKm,
      region: l.region,
      description: l.description ? l.description.slice(0, 150) : '',
      is_segment_pick: distributedIds.has(l.id),
    }))

    const prompt = `You are writing for Australian Atlas, a curated guide to independent Australian places. A traveller is driving from ${startName} to ${endName} (${routeDistanceKm}km, about ${Math.round(routeDurationMinutes / 60)} hours) and has ${timeConfig.label} to spare for stops.

CRITICAL: Select stops that are geographically distributed along the FULL LENGTH of the route. Do NOT cluster stops at the start or end. The route is ${routeDistanceKm}km — aim for stops approximately every ${targetSpacingKm}km. Each stop should represent a meaningfully different point along the journey.

Listings marked "is_segment_pick: true" are pre-selected as the best option for their route segment — strongly prefer these unless a nearby alternative is significantly more interesting.

From the listings below, select the best 8-12 stops in order along the route. Prioritise:
1. Geographic distribution (most important — spread stops evenly)
2. Quality score and genuine interest
3. Vertical diversity (at least 3 different verticals)
4. No two consecutive stops less than ${MIN_SPACING_KM}km apart

For each stop write one sentence explaining why it\u2019s worth pulling over for.

Then write a 2-sentence route introduction that captures the character of this particular drive. Be specific about the landscape, the feel of the road, the kind of places along the way. No generic travel writing.

Available listings in order along route (position_km = distance from start):
${JSON.stringify(listingsJson, null, 1)}

Return ONLY valid JSON, no markdown, no code fences:
{"intro":"2-sentence editorial route introduction","stops":[{"listing_id":"uuid","listing_name":"Name","cluster":"Region or town name","position_km":123,"reason":"One sentence on why to stop here"}]}`

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
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      const claudeData = await claudeRes.json()
      const text = claudeData.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        claudeResult = JSON.parse(jsonMatch[0])
      }
    } catch (err) {
      console.error('[on-this-road] Claude API error:', err)
    }

    // 9. Build response
    if (claudeResult && claudeResult.stops) {
      const listingMap = new Map(routeListings.map(l => [l.id, l]))
      const enrichedStops = claudeResult.stops
        .map(stop => {
          const listing = listingMap.get(stop.listing_id)
          if (!listing) return null
          return {
            listing_id: stop.listing_id,
            listing_name: stop.listing_name || listing.name,
            slug: listing.slug,
            vertical: listing.vertical,
            region: listing.region,
            suburb: listing.suburb,
            state: listing.state,
            lat: listing.lat,
            lng: listing.lng,
            hero_image_url: listing.hero_image_url,
            cluster: stop.cluster,
            position_km: stop.position_km || listing.positionKm,
            reason: stop.reason,
            notes: stop.reason, // Backward compat with StopCard
          }
        })
        .filter(Boolean)

      // Estimate additional stop time
      const avgStopMinutes = timeAvailable === '30' ? 15 : timeAvailable === '60' ? 20 : 30
      const additionalHours = Math.round((enrichedStops.length * avgStopMinutes) / 60 * 10) / 10

      return NextResponse.json({
        title: claudeResult.title || `${startName} to ${endName}`,
        intro: claudeResult.intro || null,
        route_geometry: routeGeometry,
        stops: enrichedStops,
        total_listings_found: routeListings.length,
        route_duration_minutes: routeDurationMinutes,
        route_distance_km: routeDistanceKm,
        additional_stop_hours: additionalHours,
        coverage_gaps: coverageGaps,
        is_long_trip: isLongTrip,
        rest_listings: isLongTrip ? restListings : [],
        start_name: startCoords.place_name || start,
        end_name: endCoords.place_name || end,
      })
    }

    // Fallback: pick top listings by quality score with vertical diversity
    const fallbackStops = buildFallbackStops(routeListings, 10)
    const avgStopMinutes = 20
    const additionalHours = Math.round((fallbackStops.length * avgStopMinutes) / 60 * 10) / 10

    return NextResponse.json({
      title: `${startName} to ${endName}`,
      intro: null,
      route_geometry: routeGeometry,
      stops: fallbackStops,
      total_listings_found: routeListings.length,
      route_duration_minutes: routeDurationMinutes,
      route_distance_km: routeDistanceKm,
      additional_stop_hours: additionalHours,
      coverage_gaps: coverageGaps,
      is_long_trip: isLongTrip,
      rest_listings: isLongTrip ? restListings : [],
      start_name: startCoords.place_name || start,
      end_name: endCoords.place_name || end,
    })

  } catch (err) {
    console.error('[on-this-road] Error:', err)
    return NextResponse.json(
      { error: 'An error occurred planning your route. Please try again.' },
      { status: 500 }
    )
  }
}

async function geocode(text) {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?country=au&types=place,locality,neighborhood,address&access_token=${MAPBOX_TOKEN}`
    const res = await fetch(url)
    const data = await res.json()
    if (!data.features || data.features.length === 0) return null
    const [lng, lat] = data.features[0].center
    return { lat, lng, text: data.features[0].text, place_name: data.features[0].place_name }
  } catch {
    return null
  }
}

function buildFallbackStops(routeListings, count = 10) {
  const sorted = [...routeListings].sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))
  const result = []
  const vertCounts = {}

  for (const l of sorted) {
    if (result.length >= count) break
    const vc = vertCounts[l.vertical] || 0
    if (vc >= 3) continue
    vertCounts[l.vertical] = vc + 1
    result.push({
      listing_id: l.id,
      listing_name: l.name,
      slug: l.slug,
      vertical: l.vertical,
      region: l.region,
      suburb: l.suburb,
      state: l.state,
      lat: l.lat,
      lng: l.lng,
      hero_image_url: l.hero_image_url,
      cluster: l.region || 'Along the way',
      position_km: l.positionKm,
      reason: '',
      notes: '',
    })
  }

  result.sort((a, b) => {
    const aIdx = routeListings.find(r => r.id === a.listing_id)?.routeIndex || 0
    const bIdx = routeListings.find(r => r.id === b.listing_id)?.routeIndex || 0
    return aIdx - bIdx
  })

  return result
}
