// ============================================================
// Corridor suggestions for the /map trail planner.
//
// Pure client-side: /map already holds the whole network listing
// set in memory, so "great stops near your route" is computed
// instantly with zero API spend. Ranking blends:
//
//   proximity  — distance to the nearest leg of the trail
//   taste      — tasteAffinity() against the visitor's shares
//                (session Discover picks + saved places)
//   anchors    — a day out needs coffee, lunch, somewhere to stay
//   variety    — new kinds of place over more of the same
//   quality    — featured listings and real descriptions
//
// Same philosophy as Plan-a-Stay's ranker: geography first, taste
// as a soft bonus — never a filter.
// ============================================================

import { tasteAffinity } from '@/lib/discover/tasteProfile'
import { haversineKm } from '@/lib/trail/draft'

// Flat-earth point→segment distance in km — fine at corridor ranges.
function pointToSegmentKm(pLat, pLng, aLat, aLng, bLat, bLng) {
  const cosLat = Math.cos((pLat * Math.PI) / 180)
  const ax = aLng * cosLat, ay = aLat
  const bx = bLng * cosLat, by = bLat
  const px = pLng * cosLat, py = pLat
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.hypot(px - cx, py - cy) * 111.32
}

function corridorDistanceKm(l, pts) {
  const lat = parseFloat(l.lat), lng = parseFloat(l.lng)
  if (pts.length === 1) return haversineKm(lat, lng, pts[0][0], pts[0][1])
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const d = pointToSegmentKm(lat, lng, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])
    if (d < best) best = d
  }
  return best
}

const COFFEE_SUBTYPES = new Set(['cafe', 'coffee_shop', 'roaster', 'roastery'])
const LUNCH_SUBTYPES = new Set(['restaurant', 'bistro', 'brasserie', 'eatery', 'diner', 'gastropub', 'pub', 'wine_bar', 'bakery'])

const isCoffee = (l) => l.vertical === 'fine_grounds' || (l.vertical === 'table' && COFFEE_SUBTYPES.has(l.sub_type))
const isLunch = (l) => l.vertical === 'table' && LUNCH_SUBTYPES.has(l.sub_type)
const isStay = (l) => l.vertical === 'rest'

/**
 * Rank the network for "next stop" candidates near the trail corridor.
 *
 * @param {Array} stops     current trail stops ({latitude, longitude, ...})
 * @param {Array} listings  the full /api/map listing set
 * @param {object|null} taste  shares profile ({verticalWeights, subTypeWeights}) or null
 * @param {number} limit
 * @returns {Array<{listing, distanceKm, reason}>}  reason ∈ addsCoffee|addsLunch|addsStay|matchesTaste|nearRoute|newKind
 */
export function suggestForTrail({ stops, listings, taste = null, limit = 6 }) {
  const pts = (stops || [])
    .filter(s => s.latitude != null && s.longitude != null)
    .map(s => [parseFloat(s.latitude), parseFloat(s.longitude)])
  if (!pts.length || !listings?.length) return []

  const inTrail = new Set((stops || []).map(s => String(s.id)))
  const verticalCounts = {}
  for (const s of stops) verticalCounts[s.vertical] = (verticalCounts[s.vertical] || 0) + 1

  const hasCoffee = stops.some(isCoffee)
  const hasLunch = stops.some(isLunch)
  const hasStay = stops.some(isStay)
  // A short hop doesn't need an overnight suggestion.
  const wantStay = !hasStay && stops.length >= 4

  // Adaptive corridor: widen until there's a real field to rank.
  const radii = [12, 25, 45]
  let candidates = []
  for (const radius of radii) {
    candidates = []
    for (const l of listings) {
      if (l.trail_suitable === false) continue
      if (l.lat == null || l.lng == null || l.address_on_request) continue
      if (inTrail.has(String(l.id))) continue
      const d = corridorDistanceKm(l, pts)
      if (d <= radius) candidates.push({ l, d, radius })
    }
    if (candidates.length >= limit * 3) break
  }
  if (!candidates.length) return []

  const scored = candidates.map(({ l, d, radius }) => {
    const proximity = 1 - d / radius
    const affinity = tasteAffinity(taste, l)
    const seen = verticalCounts[l.vertical] || 0
    const variety = seen === 0 ? 1 : seen === 1 ? 0.5 : 0.15
    const quality = l.is_featured ? 1 : (l.description && l.description.length > 100 ? 0.6 : 0.3)

    let anchor = 0
    let anchorReason = null
    if (!hasCoffee && isCoffee(l)) { anchor = 1; anchorReason = 'addsCoffee' }
    else if (!hasLunch && isLunch(l)) { anchor = 1; anchorReason = 'addsLunch' }
    else if (wantStay && isStay(l)) { anchor = 1; anchorReason = 'addsStay' }

    const score =
      0.38 * proximity +
      0.26 * affinity +
      0.16 * anchor +
      0.12 * variety +
      0.08 * quality

    const reason = anchorReason
      || (affinity >= 0.3 && taste ? 'matchesTaste' : null)
      || (seen === 0 && stops.length >= 2 ? 'newKind' : null)
      || 'nearRoute'

    return { listing: l, distanceKm: Math.round(d * 10) / 10, reason, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // Keep the strip itself varied: no more than two of one vertical.
  const out = []
  const outVerticals = {}
  for (const c of scored) {
    const v = c.listing.vertical
    if ((outVerticals[v] || 0) >= 2) continue
    out.push(c)
    outVerticals[v] = (outVerticals[v] || 0) + 1
    if (out.length >= limit) break
  }
  return out
}

// Build the shares profile client-side from ids the visitor has shown
// intent on (session Discover picks + trail stops so far), resolved
// against the in-memory listing set. Byte-compatible with the server's
// sharesFromRows so tasteAffinity() ranks identically on both surfaces.
export function sharesFromListings(rows) {
  const verticals = {}, subTypes = {}, regions = {}
  let n = 0
  for (const l of rows || []) {
    if (!l) continue
    n += 1
    if (l.vertical) verticals[l.vertical] = (verticals[l.vertical] || 0) + 1
    if (l.sub_type) subTypes[l.sub_type] = (subTypes[l.sub_type] || 0) + 1
    const reg = (l.region || '').trim()
    if (reg) regions[reg] = (regions[reg] || 0) + 1
  }
  if (n === 0) return null
  const normalise = (obj) => {
    const out = {}
    for (const k in obj) out[k] = obj[k] / n
    return out
  }
  return {
    savedCount: n,
    verticalWeights: normalise(verticals),
    subTypeWeights: normalise(subTypes),
    regionWeights: normalise(regions),
  }
}
