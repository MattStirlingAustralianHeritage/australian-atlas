/* ═══════════════════════════════════════════════════════════════════════
   Day theme and heading generation for Plan-a-Stay v2
   ═══════════════════════════════════════════════════════════════════════
   Pure functions — no LLM, no network. Takes a cluster of stops and
   produces the editorial heading and theme line for a single day.       */


/* ─── Sub-type noun map ─────────────────────────────────────────────── */
const SUBTYPE_NOUNS = {
  // SBA
  winery:        { singular: 'cellar door',    plural: 'cellar doors' },
  brewery:       { singular: 'brewery',        plural: 'breweries' },
  distillery:    { singular: 'distillery',     plural: 'distilleries' },
  cidery:        { singular: 'cidery',         plural: 'cideries' },
  // Table
  restaurant:    { singular: 'long lunch',     plural: 'long lunches' },
  creamery:      { singular: 'creamery',       plural: 'creameries' },
  farm_gate:     { singular: 'farm gate',      plural: 'farm gates' },
  pick_your_own: { singular: 'pick-your-own farm', plural: 'pick-your-own farms' },
  bakery:        { singular: 'bakery',         plural: 'bakeries' },
  market:        { singular: 'market',         plural: 'markets' },
  chocolatier:   { singular: 'chocolatier',    plural: 'chocolatiers' },
  confectioner:  { singular: 'confectioner',   plural: 'confectioners' },
  tea_shop:      { singular: 'tea shop',       plural: 'tea shops' },
  wine_bar:      { singular: 'wine bar',       plural: 'wine bars' },
  providore:     { singular: 'providore',      plural: 'providores' },
  artisan_producer: { singular: 'producer',    plural: 'producers' },
  cafe:          { singular: 'café',           plural: 'cafés' },
  // Rest
  boutique_hotel: { singular: 'boutique hotel', plural: 'boutique hotels' },
  cottage:       { singular: 'cottage',        plural: 'cottages' },
  glamping:      { singular: 'glamping stay',  plural: 'glamping stays' },
  farm_stay:     { singular: 'farm stay',      plural: 'farm stays' },
  // Field
  lookout:       { singular: 'lookout',        plural: 'lookouts' },
  waterfall:     { singular: 'waterfall walk', plural: 'waterfall walks' },
  national_park: { singular: 'walk',           plural: 'walks' },
  swimming_hole: { singular: 'swimming hole',  plural: 'swimming holes' },
  coastal_walk:  { singular: 'coast walk',     plural: 'coast walks' },
  gorge:         { singular: 'gorge',          plural: 'gorges' },
  bush_walk:     { singular: 'bush walk',      plural: 'bush walks' },
  cave:          { singular: 'cave',           plural: 'caves' },
  hot_spring:    { singular: 'hot spring',     plural: 'hot springs' },
  wildlife_zoo:  { singular: 'wildlife park',  plural: 'wildlife parks' },
  botanic_garden:{ singular: 'botanic garden', plural: 'botanic gardens' },
  nature_reserve:{ singular: 'nature walk',    plural: 'nature walks' },
  // Corner
  bookshop:      { singular: 'bookshop',       plural: 'bookshops' },
  homewares:     { singular: 'homewares shop', plural: 'homewares shops' },
  records:       { singular: 'record shop',    plural: 'record shops' },
}

/* ─── Vertical-level fallback nouns ─────────────────────────────────── */
const VERTICAL_NOUNS = {
  craft:        { singular: 'studio',        plural: 'studios' },
  collection:   { singular: 'gallery',       plural: 'galleries' },
  table:        { singular: 'meal',          plural: 'meals' },
  sba:          { singular: 'producer',      plural: 'producers' },
  rest:         { singular: 'stay',          plural: 'stays' },
  field:        { singular: 'walk',          plural: 'walks' },
  found:        { singular: 'find',          plural: 'finds' },
  corner:       { singular: 'shop',          plural: 'shops' },
  fine_grounds: { singular: 'café',          plural: 'cafés' },
  culture:      { singular: 'cultural stop', plural: 'cultural stops' },
}

/* ─── Count words ───────────────────────────────────────────────────── */
const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four']

function countWord(n) {
  if (n >= 1 && n <= 4) return COUNT_WORDS[n]
  return String(n)
}


/* ─── Haversine helper ──────────────────────────────────────────────── */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}


/* ─── Compute loop distance ─────────────────────────────────────────── */
export function computeLoopKm(stops) {
  if (!stops || stops.length < 2) return 0
  let total = 0
  for (let i = 1; i < stops.length; i++) {
    total += haversineKm(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng)
  }
  // Return to start
  total += haversineKm(
    stops[stops.length - 1].lat, stops[stops.length - 1].lng,
    stops[0].lat, stops[0].lng
  )
  return Math.round(total * 10) / 10
}


/* ─── Compute centroid ──────────────────────────────────────────────── */
export function computeCentroid(stops) {
  if (!stops || stops.length === 0) return { lat: 0, lng: 0 }
  const lat = stops.reduce((s, c) => s + c.lat, 0) / stops.length
  const lng = stops.reduce((s, c) => s + c.lng, 0) / stops.length
  return {
    lat: Math.round(lat * 10000) / 10000,
    lng: Math.round(lng * 10000) / 10000,
  }
}


/* ─── Directional phrase from centroid ──────────────────────────────── */
function directionalPhrase(clusterCentroid, tripCenter) {
  if (!tripCenter) return null
  const dLat = clusterCentroid.lat - tripCenter.lat
  const dLng = clusterCentroid.lng - tripCenter.lng
  const dist = haversineKm(clusterCentroid.lat, clusterCentroid.lng, tripCenter.lat, tripCenter.lng)

  // If very close to centre, use "around"
  if (dist < 5) return null

  const angle = Math.atan2(dLng, dLat) * 180 / Math.PI
  // North = 0, East = 90, South = 180/-180, West = -90
  if (angle > -22.5 && angle <= 22.5) return 'North'
  if (angle > 22.5 && angle <= 67.5) return 'Northeast'
  if (angle > 67.5 && angle <= 112.5) return 'East'
  if (angle > 112.5 && angle <= 157.5) return 'Southeast'
  if (angle > 157.5 || angle <= -157.5) return 'South'
  if (angle > -157.5 && angle <= -112.5) return 'Southwest'
  if (angle > -112.5 && angle <= -67.5) return 'West'
  if (angle > -67.5 && angle <= -22.5) return 'Northwest'
  return null
}


/* ─── Dominant locality from suburb data ──────────────────────────── */
function dominantLocality(stops) {
  const counts = {}
  for (const s of stops) {
    const loc = s.suburb?.trim()
    if (!loc) continue
    counts[loc] = (counts[loc] || 0) + 1
  }
  const entries = Object.entries(counts)
  if (entries.length === 0) return null
  entries.sort((a, b) => b[1] - a[1])
  // Use locality if it covers at least half the stops
  const [topLocality, topCount] = entries[0]
  return topCount >= Math.ceil(stops.length / 2) ? topLocality : null
}


/* ═══════════════════════════════════════════════════════════════════════
   Public API
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Generate the day heading line.
 * Pattern: "Day N — [Locality or directional], [mode hint]."
 * @param {Array} stops
 * @param {number} dayIndex
 * @param {object|null} tripCenter
 * @param {string|null} pacing - pacing slug from answers
 */
export function generateDayHeading(stops, dayIndex, tripCenter, pacing) {
  const dayNum = dayIndex + 1
  const centroid = computeCentroid(stops)
  const loopKm = computeLoopKm(stops)

  // Geographic descriptor — prefer suburb locality over directional
  let geo = ''
  const locality = dominantLocality(stops)
  if (locality) {
    geo = `around ${locality}`
  } else {
    const direction = directionalPhrase(centroid, tripCenter)
    if (direction) {
      geo = `${direction.toLowerCase()} of centre`
    }
  }

  // Mode hint — "mostly on foot" only when pacing is as-little-driving
  let mode = ''
  if (loopKm < 15 && pacing === 'as-little-driving') {
    mode = 'mostly on foot'
  } else if (loopKm > 60) {
    mode = 'with a longer drive'
  }

  // Compose
  const parts = [geo, mode].filter(Boolean)
  if (parts.length > 0) {
    const suffix = parts.join(', ')
    return `Day ${dayNum} — ${suffix.charAt(0).toUpperCase() + suffix.slice(1)}.`
  }

  return `Day ${dayNum}`
}


/**
 * Generate the day theme line.
 * Pattern: counted inventory of sub-types / verticals.
 * Example: "Three cellar doors and one distillery."
 */
export function generateDayTheme(stops) {
  if (!stops || stops.length === 0) return ''

  // Count by sub_type where present, vertical otherwise
  const counts = new Map()
  for (const stop of stops) {
    const key = stop.sub_type && SUBTYPE_NOUNS[stop.sub_type]
      ? `subtype:${stop.sub_type}`
      : `vertical:${stop.vertical}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  // Single stop — simpler form
  if (stops.length === 1) {
    const [key, count] = [...counts.entries()][0]
    const [type, slug] = key.split(':')
    const nouns = type === 'subtype' ? SUBTYPE_NOUNS[slug] : VERTICAL_NOUNS[slug]
    if (!nouns) return 'One stop.'
    return `One ${nouns.singular}.`
  }

  // Build phrase segments
  const segments = []
  for (const [key, count] of counts) {
    const [type, slug] = key.split(':')
    const nouns = type === 'subtype' ? SUBTYPE_NOUNS[slug] : VERTICAL_NOUNS[slug]
    if (!nouns) continue
    const word = countWord(count)
    const noun = count === 1 ? nouns.singular : nouns.plural
    segments.push(`${word} ${noun}`)
  }

  if (segments.length === 0) return ''
  if (segments.length === 1) return `${segments[0].charAt(0).toUpperCase() + segments[0].slice(1)}.`

  // "A, B, and C." or "A and B."
  if (segments.length === 2) {
    return `${segments[0].charAt(0).toUpperCase() + segments[0].slice(1)} and ${segments[1]}.`
  }

  const last = segments.pop()
  return `${segments[0].charAt(0).toUpperCase() + segments[0].slice(1)}, ${segments.slice(1).join(', ')}, and ${last}.`
}
