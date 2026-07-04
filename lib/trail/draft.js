// ============================================================
// Trail draft engine — the single tech tree shared by the /map
// trail planner and Plan-a-Stay's "open on the map" hand-off.
//
// The draft lives in localStorage under the SAME key the old
// /trails/builder used, so in-flight drafts survive the builder's
// retirement and both surfaces read/write one shape:
//
//   { name, desc, visibility, transportMode, neighbourhoodLabel,
//     stops: [{ id, name, vertical, sub_type, region, state,
//               latitude, longitude, slug, image_url, day? }],
//     notes: { [stopId]: string }, savedAt }
//
// `day` is the only addition over the builder-era shape: an
// optional 1-based day number (multi-day trails). Older drafts
// simply have no `day` and render as a single run.
//
// Every function is SSR-safe and never throws.
// ============================================================

export const DRAFT_KEY = 'aa_trail_draft_v2'
export const MAX_STOPS = 25 // Mapbox Directions waypoint ceiling

export function readDraft() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || !Array.isArray(d.stops)) return null
    return d
  } catch { return null }
}

export function writeDraft(draft) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch {}
}

export function clearDraft() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(DRAFT_KEY) } catch {}
}

// Accepts a listing from any surface (/api/map pins, /api/trails/search
// rows, trail_stops rows, plan-a-stay stops) and returns the one stop shape.
export function normaliseStop(v) {
  return {
    id: v.id,
    name: v.name,
    vertical: v.vertical,
    sub_type: v.sub_type || null,
    region: v.region || null,
    state: v.state || null,
    latitude: v.latitude ?? v.lat ?? null,
    longitude: v.longitude ?? v.lng ?? null,
    slug: v.slug || v.listing_slug || null,
    image_url: v.image_url || v.hero_image_url || null,
    ...(v.day != null ? { day: v.day } : {}),
  }
}

export function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371, toRad = d => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// One Directions call covers the whole sequence: full geometry for the map
// plus per-leg distance/duration for the list. Falls back to straight lines
// and haversine estimates if the API is unavailable.
export async function fetchRoute(stops, mode) {
  const pts = stops.filter(s => s.latitude && s.longitude)
  if (pts.length < 2) return { geometry: null, legs: [], totalKm: 0, totalMin: 0, approx: false }

  const fallback = () => {
    const legs = []
    const coords = []
    for (let i = 0; i < pts.length; i++) {
      coords.push([parseFloat(pts[i].longitude), parseFloat(pts[i].latitude)])
      if (i > 0) {
        const km = haversineKm(
          parseFloat(pts[i - 1].latitude), parseFloat(pts[i - 1].longitude),
          parseFloat(pts[i].latitude), parseFloat(pts[i].longitude)
        ) * 1.25 // straight-line → rough road factor
        legs.push({ km: Math.round(km * 10) / 10, min: Math.round((km / (mode === 'drive' ? 70 : 4.5)) * 60) })
      }
    }
    return {
      geometry: { type: 'LineString', coordinates: coords },
      legs,
      totalKm: Math.round(legs.reduce((s, l) => s + l.km, 0)),
      totalMin: Math.round(legs.reduce((s, l) => s + l.min, 0)),
      approx: true,
    }
  }

  try {
    const profile = mode === 'drive' ? 'driving' : 'walking'
    const coordStr = pts.map(s => `${s.longitude},${s.latitude}`).join(';')
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordStr}?geometries=geojson&overview=full&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
    const res = await fetch(url)
    if (!res.ok) return fallback()
    const data = await res.json()
    const route = data.routes?.[0]
    if (!route?.geometry) return fallback()
    const legs = (route.legs || []).map(l => ({
      km: Math.round((l.distance / 1000) * 10) / 10,
      min: Math.round(l.duration / 60),
    }))
    return {
      geometry: route.geometry,
      legs,
      totalKm: Math.round(route.distance / 1000),
      totalMin: Math.round(route.duration / 60),
      approx: false,
    }
  } catch {
    return fallback()
  }
}

// Nearest-neighbour reorder, anchored on the current first stop. Not optimal
// TSP, but turns a zig-zag into a sane order in one click.
export function nearestNeighbourOrder(stops) {
  if (stops.length < 3) return stops
  const remaining = stops.slice(1)
  const ordered = [stops[0]]
  while (remaining.length) {
    const last = ordered[ordered.length - 1]
    let bestI = 0, bestD = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(
        parseFloat(last.latitude), parseFloat(last.longitude),
        parseFloat(remaining[i].latitude), parseFloat(remaining[i].longitude)
      )
      if (d < bestD) { bestD = d; bestI = i }
    }
    ordered.push(remaining.splice(bestI, 1)[0])
  }
  return ordered
}

// How much the shortest-run order would save vs the current order — shown as
// a badge so the choice stays with the user (telling beats silently changing).
export function optimiseSavings(stops) {
  const pts = stops.filter(s => s.latitude && s.longitude)
  if (pts.length < 4) return 0
  const orderKm = (arr) => {
    let km = 0
    for (let i = 1; i < arr.length; i++) {
      km += haversineKm(
        parseFloat(arr[i - 1].latitude), parseFloat(arr[i - 1].longitude),
        parseFloat(arr[i].latitude), parseFloat(arr[i].longitude)
      )
    }
    return km
  }
  const current = orderKm(pts)
  const optimised = orderKm(nearestNeighbourOrder(pts))
  const saving = current - optimised
  return saving > Math.max(5, current * 0.12) ? Math.round(saving) : 0
}

// Convert a Plan-a-Stay trip (assemble response) into draft stops. Day
// numbers carry through so the trail keeps its day structure on the map.
export function stopsFromPlanAStayTrip(trip) {
  const out = []
  for (const day of trip?.days || []) {
    for (const s of day.stops || []) {
      if (s.lat == null || s.lng == null) continue
      out.push(normaliseStop({
        id: s.listing_id,
        name: s.name,
        vertical: s.vertical,
        sub_type: s.sub_type,
        lat: s.lat,
        lng: s.lng,
        slug: s.slug,
        region: s.suburb || null,
        day: day.day_number ?? null,
      }))
    }
  }
  return out.slice(0, MAX_STOPS)
}
