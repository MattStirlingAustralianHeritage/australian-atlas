/**
 * Atlas Trade — leg distances between itinerary stops.
 *
 * Pure geometry, shared client + server: haversine distance plus a coarse
 * drive-time estimate (regional Australian roads, not city traffic). These are
 * planning hints — every render labels them "approx" and the PDF carries the
 * same caveat. No routing API: zero cost, zero latency, works offline.
 */

const EARTH_R_KM = 6371
// Straight line → road. 1.3 is the standard regional detour factor.
const ROAD_FACTOR = 1.3
// Blended regional average (highway legs + town ends).
const AVG_KMH = 75

export function haversineKm(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every((v) => typeof v === 'number' && Number.isFinite(v))) return null
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(a))
}

/**
 * Leg summary between two stops with coordinates.
 * Returns { km, minutes, label } or null when either end lacks coordinates
 * or the stops are essentially co-located (< 500 m — same cellar door lane).
 */
export function legBetween(a, b) {
  const line = haversineKm(a?.lat, a?.lng, b?.lat, b?.lng)
  if (line == null || line < 0.5) return null
  const km = line * ROAD_FACTOR
  const minutes = Math.round((km / AVG_KMH) * 60)
  const kmLabel = km >= 100 ? Math.round(km) : Math.round(km * 10) / 10
  const timeLabel =
    minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes} min`
  return { km, minutes, label: `~${kmLabel} km · ${timeLabel} drive` }
}
