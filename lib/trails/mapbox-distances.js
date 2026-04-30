/**
 * Compute drive-time + distance between consecutive trail stops via Mapbox
 * Directions API. Cached on the trail_pitches row (under candidate_results)
 * and on trail_stops (distance_from_previous_km / duration_from_previous_minutes).
 *
 * Uses the same endpoint as app/api/mapbox/directions/route.js but reads
 * `routes[0].distance` (meters → km) and `routes[0].duration` (seconds → minutes).
 */

const MAPBOX_TIMEOUT_MS = 10_000

export async function legDistance(fromLat, fromLng, toLat, toLng) {
  if (fromLat == null || fromLng == null || toLat == null || toLng == null) return null
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN
  if (!token) return null

  const coords = `${fromLng},${fromLat};${toLng},${toLat}`
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?overview=false&access_token=${token}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(MAPBOX_TIMEOUT_MS) })
    if (!res.ok) return null
    const data = await res.json()
    const route = data?.routes?.[0]
    if (!route) return null
    return {
      distance_km: Math.round((route.distance / 1000) * 100) / 100,
      duration_minutes: Math.round(route.duration / 60),
    }
  } catch {
    return null
  }
}

/**
 * Compute distances + durations for a sequence of stops with {lat, lng}.
 * Returns array of legs, where legs[i] = distance/duration FROM stop[i-1] TO stop[i].
 * legs[0] is null (first stop has no "from").
 */
export async function legsForSequence(stops) {
  const legs = [null]
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1]
    const cur = stops[i]
    const leg = await legDistance(prev.lat, prev.lng, cur.lat, cur.lng)
    legs.push(leg)
  }
  return legs
}
