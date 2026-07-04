// ============================================================
// Trail concierge — the quiet guide inside the trail editor.
//
// A day out has a shape: a coffee to start, a proper lunch near
// the middle, somewhere to stay if you're going overnight. The
// concierge reads the trail-so-far, works out which of those
// moments are still open, and finds the single best real place to
// fill each one — anchored to the RIGHT part of the route (coffee
// near the start, lunch near the middle, a bed near the end) and
// inserted at the right position when accepted.
//
// Pure client-side over the in-memory /api/map set — zero API
// spend, instant, and it never invents a place.
// ============================================================

import { tasteAffinity } from '@/lib/discover/tasteProfile'
import { haversineKm } from '@/lib/trail/draft'
import { isCoffee, isLunch, isStay } from '@/lib/trail/suggest'

// The three moments, in day order. `insert` says where an accepted
// pick lands in the stop list; `anchor` says where along the route to
// look for it.
const ROLES = [
  { key: 'coffee', test: isCoffee, anchor: 'start',  insert: 'start' },
  { key: 'lunch',  test: isLunch,  anchor: 'middle', insert: 'middle' },
  { key: 'stay',   test: isStay,   anchor: 'end',    insert: 'end' },
]

function anchorPoint(stops, where) {
  const pts = stops
    .filter(s => s.latitude != null && s.longitude != null)
    .map(s => [parseFloat(s.latitude), parseFloat(s.longitude)])
  if (!pts.length) return null
  if (where === 'start') return pts[0]
  if (where === 'end') return pts[pts.length - 1]
  // middle — the stop nearest the centroid, so lunch lands mid-route
  const cx = pts.reduce((s, p) => s + p[1], 0) / pts.length
  const cy = pts.reduce((s, p) => s + p[0], 0) / pts.length
  let best = pts[0], bestD = Infinity
  for (const p of pts) {
    const d = haversineKm(p[0], p[1], cy, cx)
    if (d < bestD) { bestD = d; best = p }
  }
  return best
}

function insertIndexFor(stops, where) {
  if (where === 'start') return 0
  if (where === 'end') return stops.length
  return Math.ceil(stops.length / 2)
}

/**
 * Work out the day's open moments and the best place to fill each.
 *
 * @returns {{
 *   slots: Array<{ role, filled, insertIndex, candidate }>,
 *   openCount: number,
 * }}
 *   `candidate` is a listing (or null when nothing suitable is near).
 *   `filled` roles are already satisfied by a stop on the trail.
 */
export function conciergeSlots({ stops, listings, taste = null, maxRadiusKm = 40 }) {
  const clean = (stops || []).filter(s => s.latitude != null && s.longitude != null)
  if (!clean.length || !listings?.length) return { slots: [], openCount: 0 }

  const inTrail = new Set((stops || []).map(s => String(s.id)))
  // Stay only becomes relevant once the trail is a real day (or already
  // spans days) — nobody books a bed for a two-stop morning.
  const daysAssigned = stops.some(s => s.day != null)
  const wantStay = clean.length >= 3 || daysAssigned

  const slots = ROLES.map(role => {
    if (role.key === 'stay' && !wantStay) return null
    const filled = clean.some(role.test)
    const anchor = anchorPoint(clean, role.anchor)
    let candidate = null
    if (!filled && anchor) {
      let best = null, bestScore = -Infinity
      for (const l of listings) {
        if (l.trail_suitable === false) continue
        if (l.lat == null || l.lng == null || l.address_on_request) continue
        if (inTrail.has(String(l.id))) continue
        if (!role.test(l)) continue
        const d = haversineKm(parseFloat(l.lat), parseFloat(l.lng), anchor[0], anchor[1])
        if (d > maxRadiusKm) continue
        const proximity = 1 - d / maxRadiusKm
        const affinity = tasteAffinity(taste, l)
        const quality = l.is_featured ? 1 : (l.description && l.description.length > 100 ? 0.55 : 0.25)
        const score = 0.55 * proximity + 0.25 * affinity + 0.2 * quality
        if (score > bestScore) { bestScore = score; best = { listing: l, distanceKm: Math.round(d * 10) / 10 } }
      }
      candidate = best
    }
    return {
      role: role.key,
      filled,
      insertIndex: insertIndexFor(clean, role.insert),
      candidate,
    }
  }).filter(Boolean)

  const openCount = slots.filter(s => !s.filled && s.candidate).length
  return { slots, openCount }
}
