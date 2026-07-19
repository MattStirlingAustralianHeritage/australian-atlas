/**
 * GET /api/itinerary/directions?coords=lng,lat;lng,lat&mode=driving
 *
 * Like /api/mapbox/directions, but returns per-leg distance + duration (not
 * just geometry) so the itinerary panel can show a drive-time chip between
 * every stop and a running total. Falls back to straight-line haversine
 * estimates when the Directions API is unavailable, so the UI never stalls.
 */

function haversineKm(a, b) {
  const R = 6371
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

function straightLineFallback(points, mode) {
  const speedKmh = mode === 'walking' ? 4.5 : 68
  const legs = []
  let coordinates = []
  for (let i = 0; i < points.length; i++) {
    coordinates.push(points[i])
    if (i > 0) {
      const km = haversineKm(points[i - 1], points[i]) * 1.25 // road factor
      legs.push({ distance_km: Math.round(km * 10) / 10, duration_min: Math.round((km / speedKmh) * 60) })
    }
  }
  const distance_km = Math.round(legs.reduce((s, l) => s + l.distance_km, 0) * 10) / 10
  const duration_min = legs.reduce((s, l) => s + l.duration_min, 0)
  return {
    geometry: { type: 'LineString', coordinates },
    legs,
    distance_km,
    duration_min,
    approx: true,
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('coords')
  const mode = searchParams.get('mode') === 'walking' ? 'walking' : 'driving'

  if (!raw) return Response.json({ geometry: null, legs: [] })

  const points = raw
    .split(';')
    .map((p) => p.split(',').map(Number))
    .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))

  if (points.length < 2) return Response.json({ geometry: null, legs: [] })
  if (points.length > 25) return Response.json({ geometry: null, legs: [] })

  const coords = points.map((p) => `${p[0]},${p[1]}`).join(';')

  try {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN
    const url = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${coords}?geometries=geojson&overview=full&access_token=${token}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return Response.json(straightLineFallback(points, mode))

    const data = await res.json()
    const route = data.routes?.[0]
    if (!route?.geometry) return Response.json(straightLineFallback(points, mode))

    const legs = (route.legs || []).map((leg) => ({
      distance_km: Math.round((leg.distance / 1000) * 10) / 10,
      duration_min: Math.round(leg.duration / 60),
    }))

    return Response.json({
      geometry: route.geometry,
      legs,
      distance_km: Math.round((route.distance / 1000) * 10) / 10,
      duration_min: Math.round(route.duration / 60),
      approx: false,
    })
  } catch {
    return Response.json(straightLineFallback(points, mode))
  }
}
