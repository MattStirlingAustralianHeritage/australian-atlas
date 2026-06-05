/* ═══════════════════════════════════════════════════════════════════════
   Day assembly for Plan-a-Stay v2 — pure, testable, no IO
   ═══════════════════════════════════════════════════════════════════════
   Takes geographic clusters (the day "spines") plus region-wide pools of
   coffee / lunch / accommodation listings, and lays each day out as:

       1. Coffee     — Fine Grounds, or a Table café   (the first stop)
       …  Activities — up to MAX_ACTIVITIES_PER_DAY     (the things to do)
       •  Lunch      — a Table that serves lunch        (placed in the middle)
       …  Activities — the remainder
       ⌂  Accommodation — chosen by the visitor at render time, from the
                          per-day `accommodation_options` this module attaches.

   Meals and accommodation are pulled from pools rather than the intent-matched
   cluster candidates, so they are present regardless of what the trip is "about".
   Map-URL building is injected (buildMapUrl) to keep this module free of env IO. */

import {
  generateDayHeading,
  generateDayTheme,
  computeLoopKm,
  computeCentroid,
} from './day-theme'
import { generateDayDisclosures } from './disclosures'

/* ─── Slot classification ───────────────────────────────────────────────
   Table sub_types that read as a coffee-first morning stop. */
const COFFEE_TABLE_SUBTYPES = new Set(['cafe', 'coffee_shop'])

/* Table sub_types that read as a sit-down lunch, best first. table_meta
   carries no meal-service data, so sub_type is the only signal we have. */
const LUNCH_TABLE_SUBTYPES = [
  'restaurant', 'bistro', 'brasserie', 'eatery', 'diner',
  'gastropub', 'pub', 'wine_bar', 'bakery',
]
const LUNCH_TABLE_SET = new Set(LUNCH_TABLE_SUBTYPES)

/* Requirement: no day carries more than three "listings" — the count
   excludes the coffee and lunch (Table / Fine Grounds) anchors and the
   accommodation, all of which are handled separately below. */
export const MAX_ACTIVITIES_PER_DAY = 3

/* Keep the three activities varied — at most two of any one sub_type. */
const ACTIVITY_SUBTYPE_CAP = 2

/* Accommodation options offered per day for the visitor to choose from. */
const ACCOMMODATION_OPTIONS_PER_DAY = 6


/* ─── Predicates ─────────────────────────────────────────────────────── */
export function isCoffeeListing(c) {
  return c.vertical === 'fine_grounds'
    || (c.vertical === 'table' && COFFEE_TABLE_SUBTYPES.has(c.sub_type))
}

export function isLunchListing(c) {
  return c.vertical === 'table' && c.sub_type != null && LUNCH_TABLE_SET.has(c.sub_type)
}

export function isRestListing(c) {
  return c.vertical === 'rest'
}

/* An "activity" is anything that is not a meal anchor or accommodation.
   Note: Table producer stops (farm gates, markets, creameries, providores)
   are NOT meals — they stay as daytime activities. Only café / lunch
   Table sub_types are pulled out into the meal slots. */
export function isActivityListing(c) {
  if (isRestListing(c)) return false
  if (c.vertical === 'fine_grounds') return false
  if (c.vertical === 'table' &&
      (COFFEE_TABLE_SUBTYPES.has(c.sub_type) || LUNCH_TABLE_SET.has(c.sub_type))) {
    return false
  }
  return true
}


/* ─── Geo helper ─────────────────────────────────────────────────────── */
function haversineKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}


/* ─── Description excerpt ────────────────────────────────────────────── */
export function excerptDescription(desc, maxLen = 200) {
  if (!desc) return ''
  if (desc.length <= maxLen) return desc
  const slice = desc.slice(0, maxLen)
  const sentenceBreak = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? ')
  )
  if (sentenceBreak > maxLen * 0.5) return slice.slice(0, sentenceBreak + 1)
  const wordBreak = slice.lastIndexOf(' ')
  if (wordBreak > 0) return slice.slice(0, wordBreak) + '…'
  return slice + '…'
}


/* ─── Shape converters ───────────────────────────────────────────────── */
function toStop(c, descMap, mealSlot = null) {
  return {
    listing_id: c.id,
    name: c.name,
    slug: c.slug || null,
    vertical: c.vertical,
    sub_type: c.sub_type || null,
    lat: c.lat,
    lng: c.lng,
    suburb: c.suburb || null,
    description_excerpt: excerptDescription(descMap.get(c.id) || ''),
    meal_slot: mealSlot,
  }
}

function toStay(c) {
  return {
    listing_id: c.id,
    name: c.name,
    slug: c.slug || null,
    vertical: 'rest',
    sub_type: c.sub_type || null,
    lat: c.lat,
    lng: c.lng,
    suburb: c.suburb || null,
  }
}


/* ─── Pickers ────────────────────────────────────────────────────────── */
/* Activities: take up to `max`, deduped, with a per-sub_type variety cap.
   Input is assumed pre-ranked (retrieve returns clusters score-ordered). */
function pickActivities(candidates, max) {
  const picked = []
  const seen = new Set()
  const subtypeCounts = {}
  for (const c of candidates) {
    if (picked.length >= max) break
    if (seen.has(c.id)) continue
    const st = c.sub_type
    if (st) {
      if ((subtypeCounts[st] || 0) >= ACTIVITY_SUBTYPE_CAP) continue
      subtypeCounts[st] = (subtypeCounts[st] || 0) + 1
    }
    seen.add(c.id)
    picked.push(c)
  }
  return picked
}

/* Nearest unused pool member to a centroid, preferring `preferFn` matches.
   A listing is NEVER reused: once it has been placed anywhere in the trip it
   is off the table, and the slot is omitted (null) rather than repeated — a
   duplicate stop reads worse than an absent meal anchor. */
function pickNearest(pool, centroid, usedIds, { preferFn, excludeIds } = {}) {
  if (!pool || pool.length === 0) return null
  const source = pool.filter(p =>
    !usedIds.has(p.id) && !(excludeIds && excludeIds.has(p.id))
  )
  if (source.length === 0) return null
  const preferred = preferFn ? source.filter(preferFn) : []
  const pickFrom = preferred.length ? preferred : source
  let best = null
  let bestD = Infinity
  for (const p of pickFrom) {
    const d = haversineKm(p.lat, p.lng, centroid.lat, centroid.lng)
    if (d < bestD) { bestD = d; best = p }
  }
  return best
}

/* The nearest N pool members to a centroid. */
function nearestN(pool, centroid, n) {
  if (!pool || pool.length === 0) return []
  return pool
    .map(p => ({ p, d: haversineKm(p.lat, p.lng, centroid.lat, centroid.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(x => x.p)
}


/* ─── Day layout ─────────────────────────────────────────────────────── */
/* Order a day's fixed stops: coffee first, lunch in the middle, activities
   split around it. Accommodation is intentionally NOT included here — the
   visitor adds it at the bottom of the day at render time. */
function layoutStops(coffeeStop, lunchStop, activityStops) {
  const base = []
  if (coffeeStop) base.push(coffeeStop)
  base.push(...activityStops)

  if (!lunchStop) return base

  // Place lunch at the middle of the full (coffee + activities + lunch)
  // sequence, but never before the coffee anchor.
  const total = base.length + 1
  const floor = coffeeStop ? 1 : 0
  const insertAt = Math.min(base.length, Math.max(floor, Math.floor(total / 2)))
  return [...base.slice(0, insertAt), lunchStop, ...base.slice(insertAt)]
}


/* ═══════════════════════════════════════════════════════════════════════
   buildDays — main entry
   ═══════════════════════════════════════════════════════════════════════
   @param clusters    retrieval clusters: [{ centroid:{lat,lng}, candidates:[…] }]
   @param pools       { coffee:[…], lunch:[…], rest:[…] } region-wide listings
   @param answers     conversation answers (uses .pacing)
   @param descMap     Map<id, description> for excerpts
   @param tripCenter  { lat, lng } | null — for directional day headings
   @param buildMapUrl (stops) => string|null — injected static-map builder
   @returns Array<day> */
export function buildDays({
  clusters = [],
  pools = {},
  answers = {},
  descMap = new Map(),
  tripCenter = null,
  buildMapUrl = () => null,
}) {
  const coffeePool = pools.coffee || []
  const lunchPool = pools.lunch || []
  const restPool = pools.rest || []
  const usedCoffee = new Set()
  const usedLunch = new Set()
  const pacing = answers.pacing || null

  const days = clusters.map((cluster, i) => {
    const candidates = cluster.candidates || []
    const centroid = cluster.centroid && cluster.centroid.lat != null
      ? cluster.centroid
      : computeCentroid(candidates)

    // Activities — the up-to-three "things to do".
    const activities = pickActivities(candidates.filter(isActivityListing), MAX_ACTIVITIES_PER_DAY)
    const activityStops = activities.map(c => toStop(c, descMap, null))

    // Coffee — prefer an actual café over a roaster; never reuse until spent.
    const coffee = pickNearest(coffeePool, centroid, usedCoffee, {
      preferFn: p => p.sub_type === 'cafe' || p.sub_type === 'coffee_shop',
    })
    if (coffee) usedCoffee.add(coffee.id)
    const coffeeStop = coffee ? toStop(coffee, descMap, 'coffee') : null

    // Lunch — prefer a restaurant; never the same place as the coffee stop.
    const lunch = pickNearest(lunchPool, centroid, usedLunch, {
      preferFn: p => p.sub_type === 'restaurant',
      excludeIds: coffee ? new Set([coffee.id]) : undefined,
    })
    if (lunch) usedLunch.add(lunch.id)
    const lunchStop = lunch ? toStop(lunch, descMap, 'lunch') : null

    const stops = layoutStops(coffeeStop, lunchStop, activityStops)

    // Accommodation options near this day's centre (visitor-selectable).
    const accommodationOptions = nearestN(restPool, centroid, ACCOMMODATION_OPTIONS_PER_DAY).map(toStay)

    const loopKm = computeLoopKm(stops)
    const day = {
      day_number: i + 1,
      heading: generateDayHeading(stops, i, tripCenter, pacing),
      theme: generateDayTheme(stops),
      stops,
      accommodation_options: accommodationOptions,
      accommodation: null,
      low_diversity: activities.length === 0,
      day_disclosures: [],
      centroid,
      loop_km: loopKm,
      map_url: buildMapUrl(stops),
    }
    return day
  })

  // Day-level disclosures need the previous day for comparison.
  let prev = null
  for (const d of days) {
    d.day_disclosures = generateDayDisclosures(d, prev)
    prev = d
  }

  return days
}
