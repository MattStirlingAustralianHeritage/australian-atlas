/**
 * Shared pin-filter primitives for the Atlas Paper maps.
 *
 * These are the smart-filter building blocks first written inline in
 * components/MapClient.js (the fullscreen /map). They are pure and
 * dependency-light, so they live here for any surface that wants the same
 * behaviour — the region hero map reuses them so the token/synonym/category
 * logic stays identical to /map instead of drifting into a second copy.
 *
 * Everything here is client-safe (no DOM, no Mapbox) except that callers pass
 * plain listing objects: { name, vertical, sub_type, region, state, description,
 * lat, lng }.
 */

import { SUB_TYPE_LABELS } from '@/lib/subTypeLabels'
import { getVerticalBadge, getVerticalLabel } from '@/lib/verticalUrl'

// HTML-escape DB content before it goes into a popup HTML string.
export const escHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Fast flat-earth distance — fine at duplicate-detection ranges (metres).
export function approxMeters(aLat, aLng, bLat, bLng) {
  const dLat = (aLat - bLat) * 111320
  const dLng = (aLng - bLng) * 111320 * Math.cos(aLat * Math.PI / 180)
  return Math.hypot(dLat, dLng)
}

// ── Smart pin filter ──
// Intent words that don't literally appear in a listing's category labels —
// "whisky" should light up distilleries even when the description doesn't say
// so. Keys and values are matched against the same haystack.
export const QUERY_SYNONYMS = {
  whisky: 'distillery', whiskey: 'distillery', gin: 'distillery', vodka: 'distillery', rum: 'distillery',
  beer: 'brewery', ale: 'brewery', cider: 'cidery', mead: 'meadery',
  wine: 'winery', vineyard: 'winery',
  coffee: 'roaster cafe', espresso: 'cafe',
  homeware: 'homewares', clothes: 'clothing', fashion: 'clothing',
  book: 'bookshop', books: 'bookshop', vinyl: 'records',
  pottery: 'ceramics', ceramic: 'ceramics', jewelry: 'jewellery',
  antique: 'antiques', secondhand: 'vintage', hike: 'walk', hiking: 'walk',
  hotel: 'boutique hotel guesthouse', motel: 'boutique hotel', camping: 'glamping',
}

// Lowercased searchable text per listing, built once per data load: name,
// vertical + sub-type vocabulary, locality, and the description.
export function buildHaystack(l) {
  const subTypes = SUB_TYPE_LABELS[l.vertical] || {}
  return [
    l.name,
    getVerticalBadge(l.vertical), getVerticalLabel(l.vertical),
    l.sub_type ? String(l.sub_type).replace(/_/g, ' ') : '',
    subTypes[l.sub_type] || '',
    l.region, l.state,
    l.description,
  ].filter(Boolean).join(' ').toLowerCase()
}

// Every query token must hit the haystack, either literally or through its
// synonym expansion.
export function matchesPinQuery(l, tokens) {
  const hay = l._hay || ''
  return tokens.every(t => hay.includes(t) || (QUERY_SYNONYMS[t] && QUERY_SYNONYMS[t].split(' ').some(s => hay.includes(s))))
}

export const tokenizeQuery = (q) => String(q || '').toLowerCase().split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2)

// ── Category → sub_type constraint ──
// A query that names a category ("brewery") must NOT sweep in the other
// sub_types that share its vertical. Maps every category word to the exact
// sub_type key(s) it names, built from SUB_TYPE_LABELS (key + label words)
// plus everyday synonyms where the spoken word differs from the stored label.
export const SUBTYPE_WORD_INDEX = (() => {
  const idx = {}
  const add = (word, key) => {
    const w = String(word).toLowerCase()
    if (w.length < 3) return
    ;(idx[w] = idx[w] || new Set()).add(key)
  }
  for (const subs of Object.values(SUB_TYPE_LABELS)) {
    for (const [key, label] of Object.entries(subs)) {
      key.split('_').forEach(p => add(p, key))
      String(label).toLowerCase().split(/[^a-z]+/).forEach(p => add(p, key))
    }
  }
  const SYN = {
    beer: 'brewery', beers: 'brewery', ale: 'brewery', ales: 'brewery', lager: 'brewery',
    lagers: 'brewery', pilsner: 'brewery', ipa: 'brewery', stout: 'brewery', brewing: 'brewery',
    brewer: 'brewery', brewers: 'brewery', breweries: 'brewery', brewhouse: 'brewery', taproom: 'brewery',
    wine: 'winery', wines: 'winery', vineyard: 'winery', vineyards: 'winery', wineries: 'winery', vino: 'winery',
    whisky: 'distillery', whiskey: 'distillery', gin: 'distillery', vodka: 'distillery', rum: 'distillery',
    spirits: 'distillery', distilling: 'distillery', distilleries: 'distillery',
    cider: 'cidery', ciders: 'cidery', mead: 'meadery',
    coffee: 'roaster cafe', roastery: 'roaster', roasters: 'roaster', espresso: 'cafe', cafes: 'cafe',
    books: 'bookshop', bookshops: 'bookshop', bookstore: 'bookshop', bookstores: 'bookshop',
    homeware: 'homewares', clothes: 'clothing', clothier: 'clothing', fashion: 'clothing', apparel: 'clothing',
    vinyl: 'records', antique: 'antiques', pottery: 'ceramics', ceramic: 'ceramics',
    jewelry: 'jewellery', hikes: 'walk', hiking: 'walk',
  }
  for (const [word, targets] of Object.entries(SYN)) {
    for (const target of targets.split(' ')) {
      const keys = idx[target]
      if (keys) for (const k of keys) add(word, k)
      else add(word, target)
    }
  }
  return idx
})()

// The sub_type keys a query's tokens explicitly name (empty = no category named).
export function requiredSubtypes(tokens) {
  const req = new Set()
  for (const t of tokens) {
    const keys = SUBTYPE_WORD_INDEX[t]
    if (keys) for (const k of keys) req.add(k)
  }
  return req
}

// A listing satisfies a named category if its sub_type is one named, or (safety
// net for un-typed rows) its name literally contains a category token.
export function passesCategory(l, reqSub, catTokens) {
  if (reqSub.size === 0) return true
  if (l.sub_type && reqSub.has(l.sub_type)) return true
  const n = (l.name || '').toLowerCase()
  return catTokens.some(t => n.includes(t))
}

/**
 * Display-geometry pass over the listing set, run once per data load.
 *  1. Fan-out (`_dlng`/`_dlat`): listings sharing an ~11m cell are spread onto
 *     a ~15m ring so co-located venues don't stack into one dot.
 *  2. Label ownership (`_labelShow`): only ONE name label per (normalised
 *     name × ~150m) so duplicate venues don't print stacked labels.
 * Also stashes `_hay` (the search haystack) on every row.
 */
export function annotateDisplayGeometry(listings) {
  const out = listings.map(l => ({ ...l, _hay: buildHaystack(l) }))

  const cells = new Map()
  for (const l of out) {
    if (l.lat == null || l.lng == null) continue
    const key = (+l.lat).toFixed(4) + ',' + (+l.lng).toFixed(4)
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(l)
  }
  for (const group of cells.values()) {
    if (group.length === 1) {
      const l = group[0]
      l._dlng = parseFloat(l.lng); l._dlat = parseFloat(l.lat)
      continue
    }
    const R = 0.00014 // ≈ 15m of latitude
    group.forEach((l, i) => {
      const lat = parseFloat(l.lat), lng = parseFloat(l.lng)
      const angle = (2 * Math.PI * i) / group.length
      l._dlat = lat + R * Math.sin(angle)
      l._dlng = lng + (R * Math.cos(angle)) / Math.max(0.2, Math.cos(lat * Math.PI / 180))
    })
  }

  const byName = new Map()
  for (const l of out) {
    if (l.lat == null || l.lng == null) continue
    const key = String(l.name || '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key).push(l)
  }
  for (const group of byName.values()) {
    const shown = []
    for (const l of group) {
      const isNearShown = shown.some(s => approxMeters(+s.lat, +s.lng, +l.lat, +l.lng) < 150)
      l._labelShow = !isNearShown
      if (!isNearShown) shown.push(l)
    }
  }
  return out
}

// Display coordinates for a listing — fan-out-adjusted when present.
export const displayCoords = (l) => [
  l._dlng != null ? l._dlng : parseFloat(l.lng),
  l._dlat != null ? l._dlat : parseFloat(l.lat),
]
