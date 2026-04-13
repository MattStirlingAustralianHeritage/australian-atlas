import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// Extend timeout for Claude API + Mapbox calls
export const maxDuration = 60

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-4-20250514'

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

// Find the closest point on the route to a given point, return distance and index
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

export async function POST(request) {
  try {
    const body = await request.json()
    const { start, end, timeAvailable } = body

    if (!start || !end) {
      return NextResponse.json(
        { error: 'start and end are required' },
        { status: 400 }
      )
    }

    // 1. Geocode start and end
    const [startCoords, endCoords] = await Promise.all([
      geocode(start),
      geocode(end),
    ])

    if (!startCoords || !endCoords) {
      return NextResponse.json(
        { error: 'Could not geocode one or both locations. Try a more specific Australian place name.' },
        { status: 400 }
      )
    }

    // 2. Get route from Mapbox Directions API
    const routeUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoords.lng},${startCoords.lat};${endCoords.lng},${endCoords.lat}?geometries=geojson&access_token=${MAPBOX_TOKEN}`
    const routeRes = await fetch(routeUrl)
    const routeData = await routeRes.json()

    if (!routeData.routes || routeData.routes.length === 0) {
      return NextResponse.json(
        { error: 'No driving route found between these locations.' },
        { status: 400 }
      )
    }

    const route = routeData.routes[0]
    const routeGeometry = route.geometry
    const routeCoords = routeGeometry.coordinates
    const routeDurationMinutes = Math.round(route.duration / 60)
    const routeDistanceKm = Math.round(route.distance / 1000)

    // 3. Sample points along the route every 20km
    const samplePoints = sampleRoutePoints(routeCoords, 20)

    // 4. Query listings near each sample point
    const sb = getSupabaseAdmin()
    const BUFFER_KM = 20
    const seenIds = new Set()
    const allListings = []

    // Process in batches to avoid overwhelming the DB
    for (const point of samplePoints) {
      const [pLng, pLat] = point
      const latDelta = BUFFER_KM / 111
      const lngDelta = BUFFER_KM / (111 * Math.cos(pLat * Math.PI / 180))

      const { data } = await sb
        .from('listings')
        .select('id, name, slug, vertical, region, state, lat, lng, hero_image_url, quality_score, description')
        .eq('status', 'active')
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

    // 5. Filter listings within 20km of the route and project onto route
    const routeListings = allListings
      .map(listing => {
        const proj = projectOntoRoute(listing.lat, listing.lng, routeCoords)
        return {
          ...listing,
          distanceFromRoute: proj.distance,
          routeIndex: proj.routeIndex,
        }
      })
      .filter(l => l.distanceFromRoute <= BUFFER_KM)
      .sort((a, b) => a.routeIndex - b.routeIndex)

    if (routeListings.length === 0) {
      return NextResponse.json({
        title: `${start} to ${end}`,
        route_geometry: routeGeometry,
        stops: [],
        total_listings_found: 0,
        route_duration_minutes: routeDurationMinutes,
        route_distance_km: routeDistanceKm,
      })
    }

    // 6. Group into clusters by region
    const clusters = {}
    for (const listing of routeListings) {
      const clusterKey = listing.region || 'Along the way'
      if (!clusters[clusterKey]) clusters[clusterKey] = []
      clusters[clusterKey].push({
        listing_id: listing.id,
        listing_name: listing.name,
        slug: listing.slug,
        vertical: listing.vertical,
        region: listing.region,
        state: listing.state,
        lat: listing.lat,
        lng: listing.lng,
        quality_score: listing.quality_score || 0,
        hero_image_url: listing.hero_image_url,
        description: listing.description ? listing.description.slice(0, 100) : '',
        route_index: listing.routeIndex,
        distance_from_route_km: Math.round(listing.distanceFromRoute * 10) / 10,
      })
    }

    // 7. Call Claude to pick the best stops
    const timeLabel = timeAvailable === 'all_day' ? 'a full day' : `${timeAvailable} hours`
    const clusterSummary = Object.entries(clusters).map(([region, listings]) => ({
      region,
      listings: listings.map(l => ({
        listing_id: l.listing_id,
        listing_name: l.listing_name,
        vertical: l.vertical,
        quality_score: l.quality_score,
        distance_from_route_km: l.distance_from_route_km,
        description: l.description,
      })),
    }))

    const prompt = `You are an editorial road-trip planner for Australian Atlas, a network of independent places across Australia. Select the best 8-12 stops for a road trip from ${start} to ${end} with ${timeLabel} to spare (driving time is about ${routeDurationMinutes} minutes / ${routeDistanceKm}km). Available listings grouped by cluster along the route:

${JSON.stringify(clusterSummary, null, 1)}

Pick stops that are:
- Diverse across verticals (try to include at least 3 different verticals)
- High quality (prefer quality_score above 70)
- Well-spaced along the route
- Close to the route (prefer lower distance_from_route_km)

Return ONLY valid JSON with no markdown formatting, no code fences:
{"title":"A short evocative title for this road trip","stops":[{"listing_id":"uuid","listing_name":"Name","cluster":"Region name","estimated_minutes_from_previous":30,"notes":"One-sentence editorial note about why to stop here"}]}`

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

      // Extract JSON from the response (handle possible markdown wrapping)
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        claudeResult = JSON.parse(jsonMatch[0])
      }
    } catch (err) {
      console.error('Claude API error in on-this-road:', err)
    }

    // 8. Build response
    if (claudeResult && claudeResult.stops) {
      // Enrich stops with full listing data
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
            state: listing.state,
            lat: listing.lat,
            lng: listing.lng,
            hero_image_url: listing.hero_image_url,
            cluster: stop.cluster,
            estimated_minutes_from_previous: stop.estimated_minutes_from_previous,
            notes: stop.notes,
          }
        })
        .filter(Boolean)

      return NextResponse.json({
        title: claudeResult.title || `${start} to ${end}`,
        route_geometry: routeGeometry,
        stops: enrichedStops,
        total_listings_found: routeListings.length,
        route_duration_minutes: routeDurationMinutes,
        route_distance_km: routeDistanceKm,
      })
    }

    // Fallback: pick top listings by quality score with vertical diversity
    const fallbackStops = buildFallbackStops(routeListings, 10)
    return NextResponse.json({
      title: `${start} to ${end}`,
      route_geometry: routeGeometry,
      stops: fallbackStops,
      total_listings_found: routeListings.length,
      route_duration_minutes: routeDurationMinutes,
      route_distance_km: routeDistanceKm,
    })

  } catch (err) {
    console.error('On This Road error:', err)
    return NextResponse.json(
      { error: 'An error occurred planning your route. Please try again.' },
      { status: 500 }
    )
  }
}

async function geocode(text) {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?country=au&access_token=${MAPBOX_TOKEN}`
    const res = await fetch(url)
    const data = await res.json()
    if (!data.features || data.features.length === 0) return null
    const [lng, lat] = data.features[0].center
    return { lat, lng, place_name: data.features[0].place_name }
  } catch {
    return null
  }
}

function buildFallbackStops(routeListings, count = 10) {
  // Sort by quality score descending
  const sorted = [...routeListings].sort((a, b) =>
    (b.quality_score || 0) - (a.quality_score || 0)
  )

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
      state: l.state,
      lat: l.lat,
      lng: l.lng,
      hero_image_url: l.hero_image_url,
      cluster: l.region || 'Along the way',
      estimated_minutes_from_previous: null,
      notes: '',
    })
  }

  // Re-sort by route position
  result.sort((a, b) => {
    const aIdx = routeListings.find(r => r.id === a.listing_id)?.routeIndex || 0
    const bIdx = routeListings.find(r => r.id === b.listing_id)?.routeIndex || 0
    return aIdx - bIdx
  })

  return result
}
