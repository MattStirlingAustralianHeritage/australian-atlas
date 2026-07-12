'use client'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { createPortal } from 'react-dom'
import { getVerticalUrl, getVerticalBadge, getVerticalLabel, getVerticalBrandColour, getPublicVerticals } from '@/lib/verticalUrl'
import { listingVerticals } from '@/lib/listings/verticalFilter'
import { SUB_TYPE_LABELS } from '@/lib/subTypeLabels'
import { isApprovedImageSource } from '@/lib/image-utils'
import { ATLAS_PAPER_STYLE, ATLAS_LABEL_ROOF } from '@/lib/map/atlasPaperStyle'
import { attachDonutClusters } from '@/lib/map/donutClusters'
import DiscoveryPanel from '@/components/map/DiscoveryPanel'
import MapPreviewCard from '@/components/map/MapPreviewCard'
import TrailPanel from '@/components/map/TrailPanel'
import useTrailPlanner from '@/components/map/useTrailPlanner'
import AuthModal from '@/components/AuthModal'

const PRIMARY = '#5f8a7e'
const PREMIUM_COLOR = '#c8943a'
const PAPER = '#FBF9F4'

// Dev-only: headless / hidden-tab preview environments never fire
// requestAnimationFrame, which stalls mapbox-gl completely (its style parse
// and render loop are rAF-driven). Shim with a timer so the map still builds
// when the document starts hidden. Compiled out of production builds.
if (process.env.NODE_ENV !== 'production' && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
  const nativeRaf = typeof window !== 'undefined' ? window.requestAnimationFrame?.bind(window) : null
  if (nativeRaf) {
    let shimming = true
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') shimming = false })
    window.requestAnimationFrame = (cb) => shimming ? setTimeout(() => cb(performance.now()), 33) : nativeRaf(cb)
    window.cancelAnimationFrame = (id) => clearTimeout(id)
  }
}

// Brand colour lookup — sourced from lib/verticalUrl.js so all surfaces stay
// in sync. The vertical key list (legend + filter chips) is derived per-render
// from the public-vertical registry passed down from the server (see below).
const verticalColor = (key) => getVerticalBrandColour(key) || PRIMARY

const STATES = ['All States', 'NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

const STATE_BOUNDS = {
  'NSW':  [140.99, -37.51, 153.64, -28.16],
  'VIC':  [140.96, -39.16, 149.97, -33.98],
  'QLD':  [137.99, -29.18, 153.55, -10.68],
  'SA':   [129.00, -38.06, 141.00, -26.00],
  'WA':   [112.92, -35.13, 129.00, -13.69],
  'TAS':  [143.83, -43.65, 148.48, -39.57],
  'NT':   [129.00, -26.00, 138.00, -10.97],
  'ACT':  [148.76, -35.92, 149.40, -35.12],
}

// Full state names → folded into each listing's search haystack so a query
// like "accommodation in Victoria" matches on the state (listings only store
// the "VIC" code). Both name and code stay searchable.
const STATE_FULL = {
  NSW: 'new south wales', VIC: 'victoria', QLD: 'queensland', SA: 'south australia',
  WA: 'western australia', TAS: 'tasmania', ACT: 'australian capital territory', NT: 'northern territory',
}

// Mainland + Tasmania. The initial camera and the "All States" reset both
// fit these bounds so the country fills the viewport on any screen size or
// aspect ratio — a fixed centre/zoom either strands Australia in a sea of
// empty ocean on large monitors or crops the coasts on small ones.
const AUSTRALIA_BOUNDS = [[112.7, -43.9], [153.9, -10.4]]

// Zoom-out floor — keeps the map from shrinking to a speck. Deliberately NOT
// a maxBounds cage: on portrait phones, fitting Australia's width means the
// viewport spans far more latitude than any sane cage allows, and Mapbox
// resolves that conflict by force-zooming in and cropping the coasts.
const MIN_ZOOM = 2

// Desktop discovery panel width. Every camera call passes explicit padding
// (mapbox persists whatever padding a camera call carries — by passing it
// everywhere we own that state instead of being surprised by it).
const PANEL_W = 384

// Desktop trail panel width (right rail).
const TRAIL_W = 364

// Cap on rendered gazetteer rows — the list is a scanning surface, not a
// database dump; past this the answer is "zoom in".
const PANEL_CAP = 60

// Base (unfiltered) standard-pin radius by zoom, as [zoom, r] stop pairs. The
// filter-emphasis scaler multiplies the OUTPUT stops (not the whole
// expression) so `zoom` stays the top-level interpolate input — mapbox forbids
// wrapping a zoom interpolate in `['*', …]`.
const PIN_RADIUS_STOPS = [3, 4.5, 6, 6, 10, 7, 14, 9]
function pinRadius(mult = 1) {
  const out = ['interpolate', ['linear'], ['zoom']]
  for (let i = 0; i < PIN_RADIUS_STOPS.length; i += 2) out.push(PIN_RADIUS_STOPS[i], PIN_RADIUS_STOPS[i + 1] * mult)
  return out
}
const PIN_RADIUS = pinRadius(1)

// As a filter narrows the field, the survivors should grow and pop off the
// greyed-out rest. `matchEmphasis` maps the live match COUNT to 0..1 — near 1
// when only a handful survive, a gentle floor when a broad filter is active,
// 0 when no filter is on. Everything prominence-related scales off this.
function matchEmphasis(count, active) {
  if (!active || count <= 0) return 0
  const e = 1 - Math.min(1, Math.max(0, (count - 6) / (250 - 6))) // 1 at ≤6, 0 at ≥250
  return Math.max(0.14, e) // always a touch more prominent while filtering
}

const VISITED_KEY = 'aa_map_visited_v1'
const VISITED_CAP = 500

// Reverse of the slug map in app/map/page.js — used to keep the URL in sync
// with the active filters so map views are shareable / refresh-safe.
const SLUG_BY_KEY = {
  sba: 'small-batch', collection: 'collections', craft: 'craft',
  fine_grounds: 'fine-grounds', rest: 'rest', field: 'field',
  corner: 'corner', found: 'found', table: 'table', way: 'way',
}

// Listing names/descriptions are DB content rendered into popup HTML strings.
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Fast flat-earth distance — fine at duplicate-detection ranges.
function approxMeters(aLat, aLng, bLat, bLng) {
  const dLat = (aLat - bLat) * 111320
  const dLng = (aLng - bLng) * 111320 * Math.cos(aLat * Math.PI / 180)
  return Math.hypot(dLat, dLng)
}

/**
 * Display-geometry pass over the listing set, run once per data load.
 * Returns annotated copies; originals are untouched.
 *
 * 1. Pin fan-out (`_dlng`/`_dlat`): listings sharing an ~11m coordinate cell
 *    (usually duplicate rows or two businesses at one address) are spread
 *    onto a ~15m ring so each renders as its own visible, clickable dot —
 *    sub-pixel at national zoom, clearly separate at street zoom.
 * 2. Label ownership (`_labelShow`): only ONE name label per (normalised
 *    name × ~150m). Without this, duplicate venues get the same text placed
 *    at two different anchors — stacked "Sawtooth ARI / Sawtooth ARI".
 */
function annotateDisplayGeometry(listings) {
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
const displayCoords = (l) => [
  l._dlng != null ? l._dlng : parseFloat(l.lng),
  l._dlat != null ? l._dlat : parseFloat(l.lat),
]

// ── Smart pin filter ──
// Intent words that don't literally appear in a listing's category labels —
// "whisky" should light up distilleries even when the description doesn't
// say so. Keys and values are matched against the same haystack.
const QUERY_SYNONYMS = {
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
// vertical + sub-type vocabulary, locality, and the (160-char) description.
function buildHaystack(l) {
  const subTypes = SUB_TYPE_LABELS[l.vertical] || {}
  return [
    l.name,
    getVerticalBadge(l.vertical), getVerticalLabel(l.vertical),
    l.sub_type ? String(l.sub_type).replace(/_/g, ' ') : '',
    subTypes[l.sub_type] || '',
    l.region, l.state, STATE_FULL[l.state] || '',
    l.description,
  ].filter(Boolean).join(' ').toLowerCase()
}

// Every query token must hit the haystack, either literally or through its
// synonym expansion.
function matchesPinQuery(l, tokens) {
  const hay = l._hay || ''
  return tokens.every(t => hay.includes(t) || (QUERY_SYNONYMS[t] && QUERY_SYNONYMS[t].split(' ').some(s => hay.includes(s))))
}

const tokenizeQuery = (q) => String(q || '').toLowerCase().split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2)

// ── Category → sub_type constraint ──
// A query that names a category ("brewery") must NOT sweep in the other
// sub_types that share its vertical — Mornington has 11 breweries but 35
// wineries, all "Small Batch", and the semantic pool returns them together.
// This maps every category word to the exact sub_type key(s) it names, built
// from SUB_TYPE_LABELS (key + label words) plus everyday synonyms where the
// spoken word differs from the stored label (beer→brewery, whisky→distillery…).
const SUBTYPE_WORD_INDEX = (() => {
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
  // Everyday words → the label word already indexed above (space-delimited
  // when a word legitimately spans two sub_types, e.g. coffee → roaster+cafe).
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

// A listing satisfies a named category if its sub_type is one named, or (as a
// safety net for un-typed rows) its name literally contains a category token.
function passesCategory(l, reqSub, catTokens) {
  if (reqSub.size === 0) return true
  if (l.sub_type && reqSub.has(l.sub_type)) return true
  const n = (l.name || '').toLowerCase()
  return catTokens.some(t => n.includes(t))
}

// ── Plain-language understanding ──
// Filler words that carry no filtering intent. Stripped before matching so
// "places to sleep in Ballarat" reduces to the words that matter (sleep +
// Ballarat) instead of demanding every listing literally contain "places".
const STOPWORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'of', 'to', 'for', 'and', 'or', 'with', 'near',
  'nearby', 'around', 'about', 'me', 'my', 'i', 'we', 'us', 'our', 'is', 'are', 'am',
  'be', 'was', 'some', 'any', 'all', 'best', 'good', 'great', 'nice', 'top', 'cool',
  'find', 'show', 'see', 'go', 'going', 'get', 'take', 'want', 'wanting', 'need', 'looking',
  'look', 'search', 'searching', 'where', 'here', 'there', 'that', 'this', 'these', 'those',
  'place', 'places', 'somewhere', 'spot', 'spots', 'area', 'areas', 'thing', 'things',
  'can', 'could', 'would', 'should', 'do', 'you', 'it', 'give', 'got', 'have',
])

// Everyday intent words that name a WHOLE vertical rather than one sub_type —
// they never appear literally in a listing's category vocabulary, so they
// constrain the vertical instead of being required in the haystack. Keeps the
// semantic pool honest too: "places to sleep in Ballarat" can't leak galleries.
const VERTICAL_INTENT = {
  // Rest — the "places to stay" vertical
  accommodation: 'rest', accom: 'rest', accomodation: 'rest', accommodations: 'rest',
  sleep: 'rest', sleeping: 'rest', stay: 'rest', stays: 'rest', staying: 'rest',
  lodging: 'rest', overnight: 'rest',
  // Table — the food/eat vertical
  eat: 'table', eating: 'table', eatery: 'table', eateries: 'table', food: 'table',
  dining: 'table', dine: 'table',
}

// ── Typo tolerance ──
// A misspelled query must not silently return zero. We spell-correct each query
// token against the live corpus vocabulary (every word the listings actually
// use, plus the category/intent/state vocabulary) so "acommodation", "brewrey"
// and "restaurants" resolve to real words before matching runs.

// Levenshtein with a hard ceiling and per-row early-out — returns max+1 the
// moment the edit distance is known to exceed `max`, so most comparisons bail
// in a couple of rows.
function boundedLev(a, b, max) {
  const al = a.length, bl = b.length
  if (Math.abs(al - bl) > max) return max + 1
  let prev = new Array(bl + 1)
  for (let j = 0; j <= bl; j++) prev[j] = j
  for (let i = 1; i <= al; i++) {
    const cur = new Array(bl + 1)
    cur[0] = i
    let rowMin = i
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[bl] <= max ? prev[bl] : max + 1
}

// Build the correction vocabulary from the loaded listings + the fixed
// category/intent/state vocabulary. Bucketed by length so correction only
// scans candidates of a compatible length.
function buildVocab(listings) {
  const set = new Set()
  const add = (w) => { if (w && w.length >= 3) set.add(w) }
  for (const l of listings) {
    const hay = l._hay || ''
    for (const w of hay.split(/[^a-z0-9]+/)) add(w)
  }
  for (const k of Object.keys(SUBTYPE_WORD_INDEX)) add(k)
  for (const k of Object.keys(QUERY_SYNONYMS)) add(k)
  for (const k of Object.keys(VERTICAL_INTENT)) add(k)
  for (const v of Object.values(STATE_FULL)) for (const w of v.split(' ')) add(w)
  const byLen = new Map()
  for (const w of set) {
    const a = byLen.get(w.length); if (a) a.push(w); else byLen.set(w.length, [w])
  }
  return { set, byLen }
}

// Correct one token. Left unchanged when it's already known, is a prefix of a
// known word (partial typing / a valid substring the matcher would hit anyway),
// or has no close neighbour. Only tokens of 4+ chars are eligible.
function correctToken(tok, vocab) {
  if (!vocab || tok.length < 4 || vocab.set.has(tok)) return tok
  // A prefix of any longer known word ("brew" → "brewery", "accom" → …) already
  // matches via substring, so never rewrite it.
  for (let len = tok.length + 1; len <= tok.length + 8; len++) {
    const bucket = vocab.byLen.get(len)
    if (!bucket) continue
    for (const w of bucket) if (w.charCodeAt(0) === tok.charCodeAt(0) && w.startsWith(tok)) return tok
  }
  const maxDist = tok.length >= 8 ? 2 : 1
  let best = null, bestD = maxDist + 1
  for (let len = tok.length - maxDist; len <= tok.length + maxDist; len++) {
    if (len < 3) continue
    const bucket = vocab.byLen.get(len)
    if (!bucket) continue
    for (const w of bucket) {
      const d = boundedLev(tok, w, maxDist)
      if (d < bestD) { bestD = d; best = w; if (d === 1 && w.charCodeAt(0) === tok.charCodeAt(0)) break }
    }
    if (bestD === 1 && best && best.charCodeAt(0) === tok.charCodeAt(0)) break
  }
  return best && bestD <= maxDist ? best : tok
}

// Parse a raw filter query into its constituent constraints. Every token is
// spell-corrected, then classified: stopwords drop out; cuisine/dietary words
// become HARD literals; whole-vertical intent words constrain the vertical;
// category words constrain the sub_type; everything else must appear in the
// haystack (fuzzily, via the correction above).
function parsePinQuery(raw, vocab) {
  const reqVerticals = new Set()
  const reqSubtypes = new Set()
  const hardTerms = []
  const matchTokens = []
  const catTokens = []
  for (const rt of tokenizeQuery(raw)) {
    const t = correctToken(rt, vocab)
    if (STOPWORDS.has(t)) continue
    if (HARD_TERMS.has(t)) { hardTerms.push(t); continue }
    const vk = VERTICAL_INTENT[t]
    if (vk) { reqVerticals.add(vk); continue }
    const subs = SUBTYPE_WORD_INDEX[t]
    if (subs) { for (const k of subs) reqSubtypes.add(k); catTokens.push(t); matchTokens.push(t); continue }
    matchTokens.push(t)
  }
  const hasQuery = reqVerticals.size > 0 || reqSubtypes.size > 0 || hardTerms.length > 0 || matchTokens.length > 0
  return { reqVerticals, reqSubtypes, hardTerms, matchTokens, catTokens, hasQuery }
}

// A named vertical ("accommodation", "somewhere to eat") gates the vertical the
// same way a named category gates the sub_type — applied to the semantic pool
// too, so an off-vertical neighbour can never sneak in.
function passesVertical(l, reqVert) {
  return reqVert.size === 0 || reqVert.has(l.vertical)
}

// ── Cuisine / attribute HARD terms ──
// The semantic pipeline fuzzes a cuisine word into "the neighbouring cuisines":
// "Korean restaurant" pulled in Japanese ramen bars. A cuisine, nationality or
// dietary/religious attribute is NOT interchangeable — it must appear LITERALLY
// in the venue's own text (name/description) to count. This gates the semantic
// pool (the local matcher already requires every token). It stays accurate as
// listings are added because it reads each venue's text, never a fixed list.
const HARD_TERMS = new Set([
  // Cuisines / nationalities (adjective forms as venues advertise them)
  'korean', 'japanese', 'chinese', 'cantonese', 'sichuan', 'szechuan', 'taiwanese',
  'thai', 'vietnamese', 'malaysian', 'indonesian', 'singaporean', 'filipino', 'burmese',
  'indian', 'nepalese', 'nepali', 'sri', 'lankan', 'pakistani', 'bangladeshi', 'tibetan',
  'italian', 'french', 'spanish', 'portuguese', 'greek', 'turkish', 'lebanese', 'israeli',
  'moroccan', 'ethiopian', 'egyptian', 'persian', 'iranian', 'afghan', 'syrian',
  'mexican', 'peruvian', 'argentinian', 'argentine', 'brazilian', 'colombian', 'cuban',
  'american', 'british', 'irish', 'german', 'polish', 'hungarian', 'russian', 'ukrainian',
  'mongolian', 'hawaiian', 'caribbean', 'jamaican', 'cajun', 'creole', 'basque', 'sicilian',
  // Dietary / religious attributes — accuracy here matters as much as cuisine
  'vegan', 'vegetarian', 'halal', 'kosher', 'kasher',
])

const placesLabel = (n, t) => t('placesCount', { count: n })

// Human label for a Mapbox geocoding result's primary type, so a town reads as
// a distinct, selectable thing in the location dropdown (vs a suburb/postcode).
// Maps to translation keys resolved in the component (t is locale-aware).
const PLACE_TYPE_KEY = {
  place: 'placeTypeTownCity', locality: 'placeTypeLocality', neighborhood: 'placeTypeSuburb',
  postcode: 'placeTypePostcode', region: 'placeTypeStateRegion', district: 'placeTypeDistrict',
  address: 'placeTypeAddress', country: 'placeTypeCountry',
}
const placeTypeLabel = (f, t) => t(PLACE_TYPE_KEY[f?.place_type?.[0]] || 'placeTypePlace')

// Small location-pin glyph — marks town/place rows in the search dropdown so
// they read distinct from the venue-name results above them.
function PlacePin() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5f8a7e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

/**
 * MapClient
 *
 * mode='fullscreen' (default) — the network-wide /map page. Locks body scroll,
 *   hides nav/footer, fetches all listings, renders all chrome (discovery
 *   panel, unified search, filters, legend, mobile sheet, builder tab toggle).
 *
 * mode='embedded' — for in-page sections (e.g. /place/[slug] "Nearby on
 *   Australian Atlas"). No body lock, no nav/footer hiding, no chrome, and it
 *   keeps the classic popup interaction (the fullscreen page uses the richer
 *   selection card instead). Caller must pass `prefilteredListings` (skips
 *   the /api/map fetch) and may pass `initialBounds` to constrain the view and
 *   `highlightListingId` to render the matching pin distinctly.
 */
export default function MapClient({
  initialVertical = '',
  initialState = '',
  initialCenter = null,  // [lng, lat] — overrides the Australia-overview default
  initialZoom = null,    // number — used with initialCenter
  initialQuery = '',     // smart pin filter, restored from ?q=
  mode = 'fullscreen',
  prefilteredListings = null,
  initialBounds = null,
  highlightListingId = null,
  focusListingId = null,
  publicVerticals = null,
  initialTrailOpen = false,   // ?trail=1 — open the trail panel on load
  initialTrailEdit = null,    // ?trail=<uuid> — hydrate a saved trail for editing
  initialTrailResume = false, // ?resume=1 — finish an interrupted save after OAuth
  initialTrailRegion = '',    // ?region=Name — frame that region (from "build a trail here" links)
}) {
  const isEmbedded = mode === 'embedded'
  const t = useTranslations('map')
  // Active locale — appended to the pin + card fetches so popups/preview cards
  // show translated listing content under /ko (English default unchanged).
  const locale = useLocale()

  // Translated strings for the raw-HTML popup (embedded mode). buildPopupHTML
  // is a module-level function so it can't call the hook itself.
  const popupStrings = {
    featured: t('featured'),
    youAreHere: t('youAreHere'),
    viewListing: t('viewListing'),
    kmAwayShort: t('kmAwayUnderOne'),
    kmAway: (n) => t('kmAway', { distance: n }),
  }
  const popupStringsRef = useRef(popupStrings)
  useEffect(() => { popupStringsRef.current = popupStrings })

  // Legend + filter chips derive from the public-vertical list. Fullscreen
  // /map passes it from the server so the WAY_ATLAS_PUBLIC override is honoured;
  // other callers fall back to the registry default (gated verticals excluded).
  const verticalKeys = publicVerticals || getPublicVerticals()
  const verticalFilters = [{ key: 'all', label: t('all') }, ...verticalKeys.map(k => ({ key: k, label: getVerticalBadge(k) }))]
  const mapContainer = useRef(null)
  const map = useRef(null)
  const popup = useRef(null)      // embedded mode only
  const hoverTip = useRef(null)
  const donuts = useRef(null)

  const [allListings, setAllListings] = useState([])
  // Spell-correction vocabulary, rebuilt once per data load. Powers the
  // typo-tolerant filter (misspellings resolve to real corpus words).
  const vocab = useMemo(() => buildVocab(allListings), [allListings])
  // Multi-select vertical filter — empty Set = "all"
  const [selectedVerticals, setSelectedVerticals] = useState(() => {
    if (initialVertical && initialVertical !== 'all') return new Set([initialVertical])
    return new Set()
  })
  const [subTypeFilter, setSubTypeFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState(initialState || 'All States')
  // Smart pin filter — pinQuery follows the keystroke, appliedPinQuery is the
  // debounced value the (re-clustering) map pipeline actually runs on.
  const [pinQuery, setPinQuery] = useState(initialQuery)
  const [appliedPinQuery, setAppliedPinQuery] = useState(initialQuery)
  useEffect(() => {
    const t = setTimeout(() => setAppliedPinQuery(pinQuery.trim()), 220)
    return () => clearTimeout(t)
  }, [pinQuery])

  // Semantic half of the filter: the same hybrid pipeline as /search
  // (embeddings + RRF + synonym enrichment + cross-encoder rerank). The
  // response's `pins` array is the WHOLE ranked pool with the portal listing
  // ids the map already uses, plus a per-vertical relevance-floor `strong`
  // flag. Local token matching answers instantly; these results union in
  // ~a second later and re-rank the gazetteer. Fails open to local-only.
  const [semantic, setSemantic] = useState(null) // { query, ids:Set, rank:Map, placeDetected }
  const [semanticLoading, setSemanticLoading] = useState(false)
  const semanticCache = useRef(new Map())
  const semanticAbort = useRef(null)
  useEffect(() => {
    if (isEmbedded) return
    const q = appliedPinQuery
    if (!q || q.length < 3) { setSemantic(null); setSemanticLoading(false); return }
    const cached = semanticCache.current.get(q)
    if (cached) { setSemantic(cached); setSemanticLoading(false); return }
    const ctrl = new AbortController()
    semanticAbort.current?.abort()
    semanticAbort.current = ctrl
    setSemanticLoading(true)
    // Extra pause on top of the applied-query debounce — the search route
    // embeds the query (rate-limited 60/min), so only fire on a real pause.
    const t = setTimeout(async () => {
      try {
        // Full pipeline WITH place binding: "breweries in Mornington Peninsula"
        // must resolve the place and return only breweries there, not breweries
        // everywhere. The response exposes detectedPlace/Region/Suburb so the
        // camera can fly to the answer. limit=1 keeps the paged payload minimal;
        // `pins` is always the whole ranked pool.
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=1`, { signal: ctrl.signal })
        if (!res.ok) throw new Error(`search ${res.status}`)
        const data = await res.json()
        const pins = Array.isArray(data.pins) ? data.pins : []
        // Strong rows cleared the calibrated relevance floor — that's the
        // filter's quality bar. Weak-only pools are better than nothing.
        const usable = pins.some(p => p.strong) ? pins.filter(p => p.strong) : pins
        // The search parses the QUERY TEXT for places (never result clustering),
        // so its detected* fields are a confidence-gated "user named a place"
        // signal. A specific place/region/suburb → fly to the matched venues;
        // a bare state ("cidery in victoria") → fly to the whole state.
        const st = typeof data.detectedState === 'string' ? data.detectedState.toUpperCase() : null
        const entry = {
          query: q,
          ids: new Set(usable.map(p => p.id)),
          rank: new Map(usable.map((p, i) => [p.id, i])),
          placeDetected: !!(data.detectedPlace || data.detectedRegion || data.detectedSuburb),
          stateCode: st && STATE_BOUNDS[st] ? st : null,
        }
        semanticCache.current.set(q, entry)
        if (semanticCache.current.size > 40) semanticCache.current.delete(semanticCache.current.keys().next().value)
        setSemantic(entry)
      } catch (e) {
        if (e.name !== 'AbortError') setSemantic(null) // fail open: local matching still applies
      } finally {
        if (!ctrl.signal.aborted) setSemanticLoading(false)
      }
    }, 450)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [appliedPinQuery, isEmbedded])

  // Rank map for the gazetteer sort — only when it belongs to the live query.
  const semanticRankRef = useRef(null)
  useEffect(() => {
    semanticRankRef.current = semantic && semantic.query === appliedPinQuery ? semantic.rank : null
  }, [semantic, appliedPinQuery])
  const [loading, setLoading] = useState(true)
  const [count, setCount] = useState(0)
  const [mapReady, setMapReady] = useState(false)
  const [legendCollapsed, setLegendCollapsed] = useState(true)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false)
  const [mobileListOpen, setMobileListOpen] = useState(false)

  // ── Trail planner — the "Build a trail" function folded into the map.
  // The hook owns draft persistence, routing, day structure, taste-ranked
  // suggestions and saving; MapClient renders its pins, route and panel. ──
  const trail = useTrailPlanner({
    allListings,
    initialOpen: initialTrailOpen,
    initialEditId: initialTrailEdit,
    initialResume: initialTrailResume,
  })
  const trailOpen = !isEmbedded && trail.open
  const trailOpenRef = useRef(trailOpen)
  useEffect(() => { trailOpenRef.current = trailOpen }, [trailOpen])
  const trailIds = new Set(trail.stops.map(s => String(s.id)))

  // Discovery panel (desktop) — open by default: split view is the difference
  // between a map people use and a map people bounce off. Trail mode is the
  // exception: arriving IN the planner (?trail=…), the browse list would fight
  // the trail rail for the reader's attention, so it starts folded away.
  const startedInTrailMode = !isEmbedded && (initialTrailOpen || !!initialTrailEdit)
  const [panelOpen, setPanelOpen] = useState(!startedInTrailMode)
  const panelOpenRef = useRef(!startedInTrailMode)
  useEffect(() => { panelOpenRef.current = panelOpen }, [panelOpen])
  // Whether closing the trail should bring the browse list back.
  const panelFoldedForTrail = useRef(startedInTrailMode)

  // The toolbar wraps at narrow widths, so the panel can't assume its height —
  // measure it and hang the panel off its real bottom edge.
  const toolbarRef = useRef(null)
  const [toolbarH, setToolbarH] = useState(106)
  useEffect(() => {
    if (isEmbedded || !toolbarRef.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect?.height
      if (h) setToolbarH(Math.round(h))
    })
    ro.observe(toolbarRef.current)
    return () => ro.disconnect()
  }, [isEmbedded])

  // What's in the current viewport (drives the panel + mobile list)
  const [inView, setInView] = useState({ items: [], total: 0 })

  // Selected venue — fullscreen replaces the old popup with a card (anchored
  // marker portal on desktop, docked bottom card on mobile).
  const [selected, setSelected] = useState(null)
  const selectedRef = useRef(null)
  useEffect(() => { selectedRef.current = selected }, [selected])
  const [cardPortalEl, setCardPortalEl] = useState(null)
  const cardMarker = useRef(null)

  // Per-listing display extras (image / suburb / editors_pick), hydrated
  // lazily for on-screen listings from /api/map/cards.
  const [cardMeta, setCardMeta] = useState({})
  const cardMetaRef = useRef({})
  useEffect(() => { cardMetaRef.current = cardMeta }, [cardMeta])
  const cardFetchInFlight = useRef(new Set())

  // Visited listings (grey-out pins the reader has already opened — the
  // Zillow/Airbnb long-browse courtesy). localStorage, capped FIFO.
  const visitedRef = useRef(null)
  const [visitedVersion, setVisitedVersion] = useState(0)
  if (visitedRef.current === null) {
    visitedRef.current = new Set()
    if (typeof window !== 'undefined') {
      try {
        const raw = JSON.parse(window.localStorage.getItem(VISITED_KEY) || '[]')
        if (Array.isArray(raw)) visitedRef.current = new Set(raw.slice(-VISITED_CAP))
      } catch { /* ignore */ }
    }
  }

  // Unified search + filter: pinQuery is the single field. As the user types it
  // (a) filters the map live (the smart filter) and (b) offers a dropdown of
  // precise jumps — matching venues and towns/POIs from the geocoder — so one
  // box both narrows the map and navigates to a specific place.
  const [placeResults, setPlaceResults] = useState([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const searchRef = useRef(null)        // desktop pill wrapper (click-outside)
  const mobileSearchRef = useRef(null)  // mobile search box wrapper
  // Picking a result sets the query programmatically, which would otherwise
  // re-fire the debounced geocoder and pop the dropdown back open.
  const suppressSearch = useRef(false)

  const listingsRef = useRef([])
  useEffect(() => { listingsRef.current = allListings }, [allListings])
  const filteredRef = useRef([])

  // Multi-select vertical toggle
  function toggleVertical(key) {
    setSubTypeFilter('all') // reset sub-type when vertical selection changes
    if (key === 'all') {
      setSelectedVerticals(new Set())
      return
    }
    setSelectedVerticals(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Derived: single-selected vertical for sub-type pills
  const singleSelectedVertical = selectedVerticals.size === 1 ? [...selectedVerticals][0] : null

  // Debounced geocoding half of the unified field — towns, suburbs, regions AND
  // named businesses (poi), so "Tar Barrel Brewery" resolves and flies there
  // even when it isn't one of our listings.
  useEffect(() => {
    if (suppressSearch.current) { suppressSearch.current = false; return }
    const q = pinQuery.trim()
    if (!q || q.length < 2) { setPlaceResults([]); return }
    const timer = setTimeout(async () => {
      try {
        // Bias the geocoder to the current view — searching over Hobart should
        // offer Hobart's places before same-named spots interstate.
        const c = map.current ? map.current.getCenter() : null
        const prox = c ? `&proximity=${c.lng.toFixed(4)},${c.lat.toFixed(4)}` : ''
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=AU&types=region,postcode,district,place,locality,neighborhood,address,poi${prox}&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`)
        const data = await res.json()
        setPlaceResults(data.features || [])
      } catch (e) { console.error('Geocoding error:', e) }
    }, 350)
    return () => clearTimeout(timer)
  }, [pinQuery])

  useEffect(() => {
    function handleClickOutside(e) {
      const inDesktop = searchRef.current && searchRef.current.contains(e.target)
      const inMobile = mobileSearchRef.current && mobileSearchRef.current.contains(e.target)
      if (!inDesktop && !inMobile) setShowSearchDropdown(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Feature-state helpers (hover / selected / visited pins) ──
  const hoverStateId = useRef(null)
  const setHoverState = useCallback((id) => {
    const m = map.current
    if (!m || !m.getSource('listings-clustered')) return
    if (hoverStateId.current && hoverStateId.current !== id) {
      m.setFeatureState({ source: 'listings-clustered', id: hoverStateId.current }, { hover: false })
    }
    if (id) m.setFeatureState({ source: 'listings-clustered', id }, { hover: true })
    hoverStateId.current = id || null
  }, [])

  const selectStateId = useRef(null)
  const setSelectedState = useCallback((id) => {
    const m = map.current
    if (!m || !m.getSource('listings-clustered')) return
    if (selectStateId.current && selectStateId.current !== id) {
      m.setFeatureState({ source: 'listings-clustered', id: selectStateId.current }, { selected: false })
    }
    if (id) m.setFeatureState({ source: 'listings-clustered', id }, { selected: true })
    selectStateId.current = id || null
  }, [])

  const markVisited = useCallback((listing) => {
    const id = listing?.id
    if (!id || visitedRef.current.has(id)) return
    visitedRef.current.add(id)
    try {
      window.localStorage.setItem(VISITED_KEY, JSON.stringify([...visitedRef.current].slice(-VISITED_CAP)))
    } catch { /* storage full/blocked — the pin state is a courtesy */ }
    if (map.current?.getSource('listings-clustered')) {
      map.current.setFeatureState({ source: 'listings-clustered', id }, { visited: true })
    }
    setVisitedVersion(v => v + 1)
  }, [])

  // Explicit camera padding for every camera call — panel-aware on desktop.
  const cameraPadding = useCallback((panelIsOpen = panelOpenRef.current, trailIsOpen = trailOpenRef.current) => {
    if (typeof window === 'undefined' || isEmbedded) return 40
    const mobile = window.matchMedia('(max-width: 768px)').matches
    if (mobile) return { top: 116, bottom: 96, left: 28, right: 28 }
    return { top: 138, bottom: 48, left: (panelIsOpen ? PANEL_W : 0) + 56, right: (trailIsOpen ? TRAIL_W : 0) + 56 }
  }, [isEmbedded])

  // ── Selection ──
  const selectListing = useCallback((l, { fly = false } = {}) => {
    if (!l || l.lat == null || l.lng == null) return
    setSelected(l)
    setSelectedState(l.id)
    hoverTip.current?.remove()
    if (fly && map.current) {
      const target = Math.max(map.current.getZoom(), 12.5)
      map.current.flyTo({
        center: displayCoords(l),
        zoom: target,
        padding: cameraPadding(),
        speed: 1.4,
        curve: 1.42,
        maxDuration: 2600,
      })
    }
  }, [cameraPadding, setSelectedState])

  const clearSelected = useCallback(() => {
    setSelected(null)
    setSelectedState(null)
  }, [setSelectedState])

  // ESC closes the selection card / list sheet
  useEffect(() => {
    if (isEmbedded) return
    function onKey(e) {
      if (e.key === 'Escape') {
        clearSelected()
        setMobileListOpen(false)
        setShowSearchDropdown(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isEmbedded, clearSelected])

  // Jump straight to a venue picked from the unified search — a "take me there"
  // action: clear the filter (focus on this one place, not a category sweep),
  // fly to it, and open its card.
  function jumpToVenue(l) {
    setShowSearchDropdown(false)
    setMobileSheetOpen(false)
    setMobileListOpen(false)
    setPlaceResults([])
    suppressSearch.current = true
    setPinQuery('')
    if (typeof document !== 'undefined' && document.activeElement?.blur) document.activeElement.blur()
    selectListing(l, { fly: true })
  }

  function getZoomForPlaceType(placeType) {
    const zooms = { country: 4, region: 6, postcode: 9, district: 9, place: 11, locality: 13, neighborhood: 13, address: 15, poi: 15 }
    return zooms[placeType] || 11
  }

  function handlePlaceSelect(feature) {
    const [lng, lat] = feature.center
    const placeType = feature.place_type?.[0] || 'place'
    map.current?.flyTo({ center: [lng, lat], zoom: getZoomForPlaceType(placeType), padding: cameraPadding(), duration: 1500 })
    suppressSearch.current = true
    // We've flown here explicitly — mark it so the filter's own place-detection
    // fly (which runs when the query resolves) doesn't re-frame a beat later.
    if (placeType !== 'poi') flownForQuery.current = feature.text
    // A named business (poi) is a "take me there" jump — clear the filter so the
    // venues around it stay visible. A town/region/suburb scopes the filter to
    // that place (its short name matches the listings' region text).
    setPinQuery(placeType === 'poi' ? '' : feature.text)
    setPlaceResults([])
    setShowSearchDropdown(false)
    setMobileListOpen(false)
    // Drop the soft keyboard on mobile so the fly-to is unobstructed.
    if (typeof document !== 'undefined' && document.activeElement?.blur) document.activeElement.blur()
  }

  // Lock body scroll and hide footer + nav so the map takes full viewport.
  // Skipped for embedded mode — the map is just a section in a normal page.
  useEffect(() => {
    if (isEmbedded) return
    document.body.style.overflow = 'hidden'
    document.body.style.height = '100dvh'
    // Hide footer — it's rendered by the root layout outside our control
    const footer = document.querySelector('footer')
    if (footer) footer.style.display = 'none'
    // Hide the sticky nav — the map has its own toolbar
    const nav = document.querySelector('nav')
    if (nav) nav.style.display = 'none'
    return () => {
      document.body.style.overflow = ''
      document.body.style.height = ''
      if (footer) footer.style.display = ''
      if (nav) nav.style.display = ''
    }
  }, [isEmbedded])

  // Listings source: embedded callers pass a pre-filtered array; fullscreen
  // mode fetches the full network listing set from /api/map.
  useEffect(() => {
    if (prefilteredListings) {
      setAllListings(annotateDisplayGeometry(prefilteredListings))
      setCount(prefilteredListings.length)
      setLoading(false)
      return
    }
    async function fetchData() {
      try {
        const res = await fetch(`/api/map?locale=${encodeURIComponent(locale)}`)
        if (!res.ok) throw new Error('fetch failed')
        const { listings: data } = await res.json()
        setAllListings(annotateDisplayGeometry(data || []))
        setCount(data?.length || 0)
      } catch (err) {
        console.error('[map] Fetch error:', err)
      }
      setLoading(false)
    }
    fetchData()
  }, [prefilteredListings, locale])

  // ── Viewport → gazetteer sync ──
  const updateInView = useCallback(() => {
    const m = map.current
    if (!m || isEmbedded) return
    const b = m.getBounds()
    const west = b.getWest(), east = b.getEast(), south = b.getSouth(), north = b.getNorth()
    const within = []
    for (const l of filteredRef.current) {
      const lng = parseFloat(l.lng), lat = parseFloat(l.lat)
      if (lng >= west && lng <= east && lat >= south && lat <= north) within.push(l)
    }
    // Claimed listings ALWAYS lead the list — an operator who has claimed and
    // is tending their listing earns the top slot. Then, with an active
    // semantic filter, relevance order; otherwise featured tier; then A–Z
    // (stable ordering keeps the list calm while the user pans).
    const rank = semanticRankRef.current
    within.sort((a, b2) => {
      if (!!a.is_claimed !== !!b2.is_claimed) return a.is_claimed ? -1 : 1
      if (rank) {
        const ra = rank.has(a.id) ? rank.get(a.id) : Infinity
        const rb = rank.has(b2.id) ? rank.get(b2.id) : Infinity
        if (ra !== rb) return ra - rb
      }
      if (!!a.is_featured !== !!b2.is_featured) return a.is_featured ? -1 : 1
      return String(a.name).localeCompare(String(b2.name))
    })
    setInView({ items: within.slice(0, PANEL_CAP), total: within.length })
  }, [isEmbedded])

  // Hydrate card extras (image/suburb/editors_pick) for what's on screen.
  useEffect(() => {
    if (isEmbedded || !inView.items.length) return
    const missing = inView.items
      .map(l => l.id)
      .filter(id => !(id in cardMetaRef.current) && !cardFetchInFlight.current.has(id))
      .slice(0, 60)
    if (!missing.length) return
    missing.forEach(id => cardFetchInFlight.current.add(id))
    const idsParam = [...missing].sort().join(',')
    fetch(`/api/map/cards?ids=${idsParam}&locale=${encodeURIComponent(locale)}`)
      .then(r => r.json())
      .then(({ cards }) => {
        setCardMeta(prev => {
          const next = { ...prev }
          for (const id of missing) next[id] = cards?.[id] || { image: null, suburb: null, editors_pick: false }
          return next
        })
      })
      .catch(() => { /* cosmetic hydration — silently degrade to typographic rows */ })
      .finally(() => missing.forEach(id => cardFetchInFlight.current.delete(id)))
  }, [inView, isEmbedded])

  // ── URL state: filters + camera, all shareable ──
  const urlTimer = useRef(null)
  const trailUrlRef = useRef({ open: false, editId: null })
  useEffect(() => {
    trailUrlRef.current = { open: trailOpen, editId: trail.editingTrail?.id || initialTrailEdit || null }
  }, [trailOpen, trail.editingTrail, initialTrailEdit])
  const writeUrl = useCallback(() => {
    if (isEmbedded || typeof window === 'undefined') return
    const m = map.current
    const url = new URL(window.location.href)
    const single = selectedVerticals.size === 1 ? [...selectedVerticals][0] : null
    if (single && SLUG_BY_KEY[single]) url.searchParams.set('vertical', SLUG_BY_KEY[single])
    else url.searchParams.delete('vertical')
    if (stateFilter && stateFilter !== 'All States') url.searchParams.set('state', stateFilter)
    else url.searchParams.delete('state')
    if (appliedPinQuery) url.searchParams.set('q', appliedPinQuery)
    else url.searchParams.delete('q')
    // Trail state: editing keeps its id; an open panel keeps trail=1 so
    // refresh/share restores the planning session.
    const trailUrl = trailUrlRef.current
    if (trailUrl.editId) url.searchParams.set('trail', trailUrl.editId)
    else if (trailUrl.open) url.searchParams.set('trail', '1')
    else url.searchParams.delete('trail')
    if (m) {
      const c = m.getCenter()
      url.searchParams.set('lng', c.lng.toFixed(4))
      url.searchParams.set('lat', c.lat.toFixed(4))
      url.searchParams.set('zoom', m.getZoom().toFixed(2))
    }
    window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''))
  }, [isEmbedded, selectedVerticals, stateFilter, appliedPinQuery])
  const writeUrlRef = useRef(writeUrl)
  useEffect(() => { writeUrlRef.current = writeUrl }, [writeUrl])

  // Build map once listings are loaded
  useEffect(() => {
    if (!allListings.length || !mapContainer.current) return
    if (map.current) { try { map.current.remove() } catch (e) {} map.current = null }

    // Cancellation guard for the async import + 'load' callback below. If the
    // effect re-runs (or unmounts) while the import is still in flight, the
    // stale closure must not build a second map — and because the handlers
    // capture the instance `m` (never the live `map.current` ref), a late
    // 'load' can't double-add sources to whichever map is current.
    let cancelled = false
    import('mapbox-gl').then(mapboxgl => {
      if (cancelled || !mapContainer.current) return
      mapboxgl.default.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      const m = new mapboxgl.default.Map({
        container: mapContainer.current,
        // "Atlas Paper" — the code-defined editorial basemap (see
        // lib/map/atlasPaperStyle.js). Not a Studio style: the palette lives
        // in the repo beside the design tokens it mirrors.
        style: ATLAS_PAPER_STYLE,
        // Default camera fits the whole country to the actual viewport.
        // An explicit centre/zoom (from a "View on full map →" link) wins.
        ...(initialCenter
          ? { center: initialCenter, zoom: initialZoom != null ? initialZoom : 3.8 }
          : { bounds: AUSTRALIA_BOUNDS, fitBoundsOptions: { padding: cameraPadding() } }),
        // Flat utility map: no globe-with-stars at low zoom, no accidental
        // rotation/pitch. The globe treatment stays on the homepage section.
        projection: 'mercator',
        minZoom: MIN_ZOOM,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: false,
        // Embedded maps drop the scroll-zoom hijack; mobile users still get
        // pinch + double-tap, desktop users use the +/- nav control.
        scrollZoom: !isEmbedded,
      })
      map.current = m

      // Surface style/source/tile problems — a silently-blank map is the
      // worst failure mode this page has.
      m.on('error', (e) => console.error('[map error]', e?.error?.message || e))
      if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') window.__atlasMap = m

      m.addControl(new mapboxgl.default.AttributionControl({ compact: true }), 'bottom-left')
      m.addControl(new mapboxgl.default.NavigationControl({ showCompass: false }), 'bottom-right')
      if (!isEmbedded) {
        // Desktop gets a locate button too (mobile keeps its bigger FAB —
        // the control is hidden there via CSS below).
        m.addControl(new mapboxgl.default.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          showUserHeading: false,
        }), 'bottom-right')
      }

      if (initialBounds) {
        m.fitBounds(initialBounds, { padding: 60, animate: false })
      }

      // Popup machinery is embedded-only now — the fullscreen map renders a
      // React selection card instead (anchored marker portal / docked sheet).
      if (isEmbedded) {
        popup.current = new mapboxgl.default.Popup({
          closeButton: true,
          closeOnClick: false,
          maxWidth: '280px',
          offset: 18,
          className: 'nbx-popup',
        })
      }

      // Lightweight name tooltip for desktop hover — saves a click per pin
      // when scanning an area. pointer-events: none (see CSS) so it can
      // never trap the cursor and flicker.
      hoverTip.current = new mapboxgl.default.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: '240px',
        offset: 12,
        className: 'map-hover-tip',
      })
      const hoverEnabled = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

      m.on('load', () => {
        if (cancelled) return
        // Circle layers can't render glyphs, so the claimed seal (gold roundel
        // + white check) is drawn once on a canvas and registered as an icon
        // for the pins-claimed symbol layer below.
        if (!m.hasImage('claimed-seal')) {
          m.addImage('claimed-seal', makeClaimedSealImage(), { pixelRatio: 2 })
        }
        const filtered = getFiltered(allListings, selectedVerticals, subTypeFilter, stateFilter)
        filteredRef.current = filtered

        // Per-vertical accumulators feed the donut cluster charts.
        const clusterProperties = {}
        for (const k of verticalKeys) {
          clusterProperties[k] = ['+', ['case', ['==', ['get', 'vertical'], k], 1, 0]]
        }

        // Embedded (nearby) maps hold a small, already-near set — clustering
        // would roll close neighbours into a count bubble and hide the very
        // places the section exists to surface. Keep every pin individual.
        // (The cluster keys must be absent, not undefined — the source
        // validator rejects explicit undefineds.)
        const clusterOptions = isEmbedded ? { cluster: false } : {
          cluster: true,
          clusterMaxZoom: 10,
          clusterMinPoints: 10,
          clusterRadius: 50,
          clusterProperties,
        }
        m.addSource('listings-clustered', {
          type: 'geojson',
          ...clusterOptions,
          // Stable feature ids (the listing uuid) so hover/selected/visited
          // live in feature-state — no setData/filter churn per interaction.
          promoteId: 'id',
          data: buildGeoJSON(filtered),
        })

        // ── Pins (inserted below the label roof so town names float above) ──
        const roof = m.getLayer(ATLAS_LABEL_ROOF) ? ATLAS_LABEL_ROOF : undefined

        // Grey underlay for the smart filter: listings that DON'T match the
        // active query stay visible as quiet grey dots (context, not noise),
        // while matches keep colour, clustering, labels and counts.
        if (!isEmbedded) {
          m.addSource('listings-dimmed', {
            type: 'geojson',
            cluster: false,
            promoteId: 'id',
            data: { type: 'FeatureCollection', features: [] },
          })
          m.addLayer({
            id: 'pins-dimmed', type: 'circle', source: 'listings-dimmed',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 6, 4, 10, 5, 14, 6.5],
              'circle-color': '#BAB2A2',
              'circle-opacity': 0.45,
              'circle-opacity-transition': { duration: 420 },
              'circle-stroke-width': 1,
              'circle-stroke-color': PAPER,
              'circle-stroke-opacity': 0.5,
            },
          }, roof)
        }

        // Hover / selected halo — invisible until feature-state flips.
        m.addLayer({
          id: 'pins-halo', type: 'circle', source: 'listings-clustered',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 11, 6, 13, 10, 14, 14, 17],
            'circle-color': ['get', 'color'],
            'circle-opacity': ['case',
              ['boolean', ['feature-state', 'selected'], false], 0.28,
              ['boolean', ['feature-state', 'hover'], false], 0.20,
              0],
          },
        }, roof)

        // Filter-emphasis glow — a soft vertical-colour halo behind matched
        // pins that swells as the filter narrows (driven by setPaintProperty
        // from the filter effect). Invisible when no filter is active.
        if (!isEmbedded) {
          m.addLayer({
            id: 'pins-match-glow', type: 'circle', source: 'listings-clustered',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-radius': PIN_RADIUS,
              'circle-color': ['get', 'color'],
              'circle-opacity': 0,
              'circle-blur': 0.35,
              // The emphasis swells in, rather than snapping, as you narrow.
              'circle-radius-transition': { duration: 420 },
              'circle-opacity-transition': { duration: 420 },
            },
          }, roof)
        }

        // Standard pins — radius scales with zoom so dots stay visible at the
        // national view and grow into comfortable tap targets up close.
        // Claimed pins are excluded — they render as the gold seal below.
        m.addLayer({
          id: 'pins-basic', type: 'circle', source: 'listings-clustered',
          filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'featured'], true], ['!=', ['get', 'claimed'], true]],
          paint: {
            'circle-radius': PIN_RADIUS,
            'circle-radius-transition': { duration: 420 },
            'circle-stroke-width-transition': { duration: 420 },
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 1.75,
            'circle-stroke-color': PAPER,
            // Visited pins sit back — a long browse shouldn't re-sell the
            // places the reader has already opened.
            'circle-opacity': ['case', ['boolean', ['feature-state', 'visited'], false], 0.45, 1],
            'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'visited'], false], 0.6, 1],
          },
        }, roof)

        // Featured pins — larger, gold, with a standing glow ring.
        m.addLayer({
          id: 'pins-featured-glow', type: 'circle', source: 'listings-clustered',
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'featured'], true]],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 11, 6, 14, 10, 15, 14, 17],
            'circle-color': 'transparent', 'circle-stroke-width': 1.5, 'circle-stroke-color': PREMIUM_COLOR, 'circle-stroke-opacity': 0.5, 'circle-opacity': 0,
          },
        }, roof)
        m.addLayer({
          id: 'pins-featured', type: 'circle', source: 'listings-clustered',
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'featured'], true], ['!=', ['get', 'claimed'], true]],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 7, 6, 9, 10, 10, 14, 12],
            'circle-color': PREMIUM_COLOR, 'circle-stroke-width': 2.25, 'circle-stroke-color': PAPER, 'circle-opacity': 1,
          },
        }, roof)

        // Claimed pins — venues whose operator has claimed the listing wear
        // the gold seal, matching the "✓ Claimed by the owner" mark on their
        // place pages: a soft standing halo under a sealed white check.
        m.addLayer({
          id: 'pins-claimed-glow', type: 'circle', source: 'listings-clustered',
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'claimed'], true]],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 11, 6, 14, 10, 15, 14, 17],
            'circle-color': 'transparent', 'circle-stroke-width': 1.5, 'circle-stroke-color': PREMIUM_COLOR, 'circle-stroke-opacity': 0.5, 'circle-opacity': 0,
          },
        }, roof)
        m.addLayer({
          id: 'pins-claimed', type: 'symbol', source: 'listings-clustered',
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'claimed'], true]],
          layout: {
            'icon-image': 'claimed-seal',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 6, 0.75, 10, 0.85, 14, 1],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        }, roof)

        // Selected ring — crisp outline on the active pin.
        m.addLayer({
          id: 'pins-selected-ring', type: 'circle', source: 'listings-clustered',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 9, 6, 11, 10, 12, 14, 15],
            'circle-color': 'transparent',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': ['get', 'color'],
            'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.95, 0],
          },
        }, roof)

        // Highlight pin — only used in embedded mode to mark the current
        // listing on the page. Larger ring + dot, on top of standard pins.
        if (highlightListingId) {
          m.addLayer({
            id: 'pin-highlight-ring', type: 'circle', source: 'listings-clustered',
            filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], highlightListingId]],
            paint: { 'circle-radius': 16, 'circle-color': 'transparent', 'circle-stroke-width': 2, 'circle-stroke-color': ['get', 'color'], 'circle-stroke-opacity': 0.45 },
          })
          m.addLayer({
            id: 'pin-highlight', type: 'circle', source: 'listings-clustered',
            filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], highlightListingId]],
            paint: { 'circle-radius': 10, 'circle-color': ['get', 'color'], 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' },
          })
        }

        // Focus halo + ring — emphasise the pin whose card is hovered/open in
        // the nearby list so it's unmistakable which place the popup describes.
        // Filters start matching nothing and are set from the focus effect.
        if (isEmbedded) {
          m.addLayer({
            id: 'pin-focus-halo', type: 'circle', source: 'listings-clustered',
            filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], '__none__']],
            paint: { 'circle-radius': 22, 'circle-color': ['get', 'color'], 'circle-opacity': 0.14 },
          })
          m.addLayer({
            id: 'pin-focus-ring', type: 'circle', source: 'listings-clustered',
            filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], '__none__']],
            paint: { 'circle-radius': 13, 'circle-color': 'transparent', 'circle-stroke-width': 3, 'circle-stroke-color': ['get', 'color'], 'circle-stroke-opacity': 0.95 },
          })
        }

        // Venue name labels at town zoom — the map answers "what's here"
        // without a hover. text-only symbols: collisions simply hide the
        // clutter, and featured venues win placement via symbol-sort-key.
        if (!isEmbedded) {
          m.addLayer({
            id: 'pin-labels', type: 'symbol', source: 'listings-clustered',
            minzoom: 11,
            // labelShow: one label per (name × ~150m) — duplicate venue rows
            // otherwise print the same name twice at different anchors.
            filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'labelShow'], true]],
            layout: {
              'text-field': ['get', 'name'],
              'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10.5, 14, 12],
              'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
              'text-radial-offset': 1.05,
              'text-justify': 'auto',
              'text-max-width': 10,
              // Breathing room in the collision index — in dense CBDs fewer,
              // clearly-separated labels beat an interleaved jumble.
              'text-padding': 6,
              'symbol-sort-key': ['case', ['==', ['get', 'claimed'], true], 0, ['==', ['get', 'featured'], true], 0, 1],
            },
            paint: {
              'text-color': '#4A443B',
              'text-halo-color': 'rgba(251,249,244,0.92)',
              'text-halo-width': 1.4,
            },
          })
        }

        // Donut cluster markers — the cluster tells you what's inside, not
        // just how many. (Fullscreen only; embedded maps never cluster.)
        if (!isEmbedded) {
          donuts.current = attachDonutClusters(mapboxgl.default, m, 'listings-clustered', {
            segments: verticalKeys.map(k => ({ key: k, color: verticalColor(k) })),
            onClusterClick: (clusterId, coords) => {
              m.getSource('listings-clustered').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return
                m.easeTo({ center: coords, zoom: zoom + 0.5, padding: cameraPadding(), duration: 650 })
              })
            },
          })
        }

        // ── Trail layers: the route line rides under the pins; the numbered
        // stop markers ride above everything, town labels included — when
        // you're building a trail, your stops are the headline. ──
        if (!isEmbedded) {
          const emptyFC = { type: 'FeatureCollection', features: [] }
          m.addSource('trail-route', { type: 'geojson', data: emptyFC })
          m.addLayer({
            id: 'trail-route-casing', type: 'line', source: 'trail-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': PAPER, 'line-width': 6, 'line-opacity': 0.85 },
          }, 'pins-halo')
          m.addLayer({
            id: 'trail-route-line', type: 'line', source: 'trail-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            // Warm editorial ink, not stark black — a quiet thread between the
            // coloured stop coins.
            paint: { 'line-color': '#5A4A38', 'line-width': 2.4, 'line-opacity': 0.7 },
          }, 'pins-halo')
          m.addSource('trail-stops', { type: 'geojson', data: emptyFC, promoteId: 'id' })
          m.addLayer({
            id: 'trail-stop-halo', type: 'circle', source: 'trail-stops',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 14, 10, 17, 14, 19],
              // Soft warm shadow beneath each coin.
              'circle-color': '#5A4A38', 'circle-opacity': 0.14,
            },
          })
          m.addLayer({
            id: 'trail-stop-circle', type: 'circle', source: 'trail-stops',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 9.5, 10, 12, 14, 13.5],
              // The stop's own category colour — ties each numbered coin to its
              // vertical, matching the editorial wayfinding across the Atlas.
              'circle-color': ['coalesce', ['get', 'color'], '#5f8a7e'],
              'circle-stroke-width': 2.5,
              'circle-stroke-color': PAPER,
            },
          })
          m.addLayer({
            id: 'trail-stop-number', type: 'symbol', source: 'trail-stops',
            layout: {
              'text-field': ['get', 'label'],
              'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10.5, 10, 12, 14, 13.5],
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            },
            // A soft dark halo keeps the white numeral legible on lighter
            // category colours (gold, ochre) as well as the deep ones.
            paint: { 'text-color': '#FBF9F4', 'text-halo-color': 'rgba(28,26,23,0.35)', 'text-halo-width': 1.1 },
          })
          m.on('mousemove', 'trail-stop-circle', () => { m.getCanvas().style.cursor = 'pointer' })
          m.on('mouseleave', 'trail-stop-circle', () => { m.getCanvas().style.cursor = '' })
          m.on('click', 'trail-stop-circle', (e) => {
            if (!e.features?.length) return
            const id = e.features[0].properties.id
            const l = listingsRef.current.find(x => String(x.id) === String(id))
            if (l) selectListing(l)
          })
        }

        // Click + hover handlers
        const pinLayers = ['pins-basic', 'pins-featured-glow', 'pins-featured', 'pins-claimed']
        if (highlightListingId) pinLayers.push('pin-highlight-ring', 'pin-highlight')
        pinLayers.forEach(layer => {
          m.on('mousemove', layer, (e) => {
            m.getCanvas().style.cursor = 'pointer'
            if (!e.features?.length) return
            const f = e.features[0]
            if (hoverStateId.current !== f.id) {
              if (hoverStateId.current) m.setFeatureState({ source: 'listings-clustered', id: hoverStateId.current }, { hover: false })
              if (f.id) m.setFeatureState({ source: 'listings-clustered', id: f.id }, { hover: true })
              hoverStateId.current = f.id || null
            }
            if (!hoverEnabled) return
            if (selectedRef.current && f.properties.id === selectedRef.current.id) { hoverTip.current?.remove(); return }
            const p = f.properties
            const sub = p.subTypeLabel && p.subTypeLabel !== 'null' ? p.subTypeLabel : p.verticalLabel
            hoverTip.current.setLngLat(f.geometry.coordinates.slice()).setHTML(
              `<div style="font-family:system-ui,-apple-system,sans-serif;padding:1px 2px;">
                <div style="font-family:Georgia,serif;font-size:13px;color:#1a1614;line-height:1.25;">${esc(p.name)}</div>
                <div style="font-size:10px;color:#9a8878;margin-top:2px;">${esc(sub)}${p.location && p.location !== 'null' ? ` · ${esc(p.location)}` : ''}</div>
              </div>`
            ).addTo(m)
          })
          m.on('mouseleave', layer, () => {
            m.getCanvas().style.cursor = ''
            if (hoverStateId.current) {
              m.setFeatureState({ source: 'listings-clustered', id: hoverStateId.current }, { hover: false })
              hoverStateId.current = null
            }
            hoverTip.current?.remove()
          })
          m.on('click', layer, (e) => {
            const props = e.features[0].properties
            const coords = e.features[0].geometry.coordinates.slice()
            hoverTip.current?.remove()
            if (isEmbedded) {
              // The pin for the current listing (when highlightListingId is
              // set) shows a "You are here" badge instead of a self-linking
              // "View listing →" button — clicking the page you're already on
              // would be a dead end.
              const isCurrent = highlightListingId && props.id === highlightListingId
              popup.current.setLngLat(coords).setHTML(buildPopupHTML(props, { isCurrent, strings: popupStringsRef.current })).addTo(m)
            } else {
              const l = listingsRef.current.find(x => x.id === props.id)
              if (l) selectListing(l)
            }
          })
        })

        // Dismiss card/popup on empty click
        m.on('click', (e) => {
          const clickLayers = [...pinLayers, 'trail-stop-circle'].filter(l2 => m.getLayer(l2))
          const features = m.queryRenderedFeatures(e.point, { layers: clickLayers })
          if (features.length) return
          if (isEmbedded) popup.current?.remove()
          else clearSelected()
        })

        // Apply remembered visited states so pins the reader has already
        // opened arrive pre-dimmed.
        if (!isEmbedded) {
          for (const id of visitedRef.current) {
            m.setFeatureState({ source: 'listings-clustered', id }, { visited: true })
          }
        }

        // Viewport sync — the gazetteer follows the map (debounced; data is
        // fully client-side so a pan costs nothing).
        if (!isEmbedded) {
          let t = null
          m.on('moveend', () => {
            clearTimeout(t)
            t = setTimeout(() => {
              updateInView()
              clearTimeout(urlTimer.current)
              urlTimer.current = setTimeout(() => writeUrlRef.current(), 250)
            }, 160)
          })
          updateInView()
        }

        setMapReady(true)
      })
    })

    return () => {
      cancelled = true
      if (donuts.current) { donuts.current.detach(); donuts.current = null }
      if (cardMarker.current) { try { cardMarker.current.remove() } catch (e) {} cardMarker.current = null }
      if (popup.current) popup.current.remove()
      if (hoverTip.current) hoverTip.current.remove()
      if (map.current) { try { map.current.remove() } catch (e) {} map.current = null }
    }
  }, [allListings])

  // Update map sources when filters or the smart query change
  const prevFilterKey = useRef(null)
  const flownForQuery = useRef(null)
  useEffect(() => {
    if (!mapReady || !map.current) return
    const base = getFiltered(allListings, selectedVerticals, subTypeFilter, stateFilter)
    // The smart query splits the base set: matches keep colour, clustering,
    // labels and counts; the rest grey out underneath as context. A listing
    // matches on local tokens (instant, complete for category words) OR on
    // the semantic result set from the /search pipeline (rice-lager-grade
    // recall, landing a beat later).
    // Parse the plain-language query: stopwords stripped, typos corrected, and
    // intent classified. A named vertical ("accommodation") or category
    // ("brewery") hard-constrains the result — applied to the semantic pool too,
    // so the vertical's other members never sneak in.
    const parsed = parsePinQuery(appliedPinQuery, vocab)
    const sem = semantic && semantic.query === appliedPinQuery ? semantic : null
    // A cuisine/nationality/dietary word must appear literally in the venue's
    // text — "Korean" must never fuzz into a Japanese ramen bar via semantics.
    const passesHard = (l) => parsed.hardTerms.length === 0 || parsed.hardTerms.every(t => (l._hay || '').includes(t))
    const isMatch = (l) => passesVertical(l, parsed.reqVerticals) && passesCategory(l, parsed.reqSubtypes, parsed.catTokens) && passesHard(l) && (matchesPinQuery(l, parsed.matchTokens) || (sem !== null && sem.ids.has(l.id)))
    const matches = parsed.hasQuery ? base.filter(isMatch) : base
    const rest = parsed.hasQuery ? base.filter(l => !isMatch(l)) : []
    filteredRef.current = matches
    setCount(matches.length)
    const source = map.current.getSource('listings-clustered')
    if (source) {
      source.setData(buildGeoJSON(matches))
      // Cluster ids and mixes change with the data — stale donuts must go.
      donuts.current?.invalidate()
    }
    const dimmedSource = map.current.getSource('listings-dimmed')
    if (dimmedSource) dimmedSource.setData(buildGeoJSON(rest))

    // Prominence scales with how far the filter has narrowed the field: as the
    // survivors get fewer, they grow, gain a swelling colour glow and a bolder
    // rim, while the greyed-out rest fades further back so the matches pop.
    const m = map.current
    const e = matchEmphasis(matches.length, parsed.hasQuery)
    if (m.getLayer('pins-basic')) {
      m.setPaintProperty('pins-basic', 'circle-radius', pinRadius(1 + 0.95 * e))
      m.setPaintProperty('pins-basic', 'circle-stroke-width', 1.75 + 1.35 * e)
    }
    if (m.getLayer('pins-match-glow')) {
      m.setPaintProperty('pins-match-glow', 'circle-radius', pinRadius(1 + 2.4 * e))
      m.setPaintProperty('pins-match-glow', 'circle-opacity', 0.34 * e)
    }
    if (m.getLayer('pins-dimmed')) {
      m.setPaintProperty('pins-dimmed', 'circle-opacity', 0.45 - 0.24 * e)
    }

    const key = [...selectedVerticals].sort().join(',') + '|' + subTypeFilter + '|' + stateFilter + '|' + appliedPinQuery
    if (prevFilterKey.current !== null && prevFilterKey.current !== key) {
      // Close an open selection when the filters actually change — its pin
      // may have just been filtered away, leaving an orphaned card.
      if (selectedRef.current && !matches.some(l => l.id === selectedRef.current.id)) clearSelected()
      popup.current?.remove()
      writeUrlRef.current()
    }
    prevFilterKey.current = key

    // When a geographic query resolves, fly the camera to it — otherwise the
    // accurate, place-scoped results sit off-screen and the map reads as empty.
    // A specific place/region/suburb frames the matched venues; a bare state
    // ("cidery in victoria") frames the whole state. Fires once per resolved
    // query (flownForQuery guard), never on pan.
    if (sem && (sem.placeDetected || sem.stateCode) && flownForQuery.current !== sem.query) {
      flownForQuery.current = sem.query
      if (sem.placeDetected) {
        // Fit to the category-constrained matches, not the raw semantic pool —
        // "breweries in Mornington" flies to the breweries, not the wineries too.
        let pts = matches.filter(l => sem.ids.has(l.id)).map(displayCoords)
        if (!pts.length) pts = matches.map(displayCoords)
        if (pts.length) {
          let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
          for (const [lng, lat] of pts) {
            if (lng < minLng) minLng = lng
            if (lat < minLat) minLat = lat
            if (lng > maxLng) maxLng = lng
            if (lat > maxLat) maxLat = lat
          }
          map.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: cameraPadding(), maxZoom: 12.5, duration: 900 })
        }
      } else if (sem.stateCode && STATE_BOUNDS[sem.stateCode]) {
        // Bare state named — frame the whole state (predictable, and robust
        // when only a handful of venues match so fitting to pins would over-zoom).
        const b = STATE_BOUNDS[sem.stateCode]
        map.current.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: cameraPadding(), duration: 900 })
      }
    }
    if (!appliedPinQuery) flownForQuery.current = null

    updateInView()
  }, [allListings, selectedVerticals, subTypeFilter, stateFilter, appliedPinQuery, semantic, mapReady, vocab])

  // ── Anchored selection card (desktop): one marker as a React portal, so
  // the map engine keeps the card glued to its pin through pan/zoom. ──
  useEffect(() => {
    if (isEmbedded || !mapReady || !map.current) return
    if (cardMarker.current) { try { cardMarker.current.remove() } catch (e) {} cardMarker.current = null; setCardPortalEl(null) }
    if (!selected) return
    const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
    if (mobile) return // mobile renders the docked card instead
    let alive = true
    import('mapbox-gl').then(mapboxgl => {
      if (!alive || !map.current || selectedRef.current?.id !== selected.id) return
      const el = document.createElement('div')
      el.className = 'map-card-anchor'
      cardMarker.current = new mapboxgl.default.Marker({ element: el, anchor: 'bottom', offset: [0, -22] })
        .setLngLat(displayCoords(selected))
        .addTo(map.current)
      setCardPortalEl(el)
    })
    return () => {
      alive = false
      if (cardMarker.current) { try { cardMarker.current.remove() } catch (e) {} cardMarker.current = null }
      setCardPortalEl(null)
    }
  }, [selected, mapReady, isEmbedded])

  // Embedded list ↔ map sync: when a nearby-list row is hovered/focused, open
  // that listing's popup on the map so the reader can see where it sits. No
  // camera move — the map is already fit to the radius, so every pin is in
  // view and panning on hover would feel twitchy. A null focus closes it.
  useEffect(() => {
    if (!isEmbedded || !mapReady || !map.current || !popup.current) return
    const m = map.current
    const setFocusFilter = (id) => {
      const f = ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], id || '__none__']]
      if (m.getLayer('pin-focus-halo')) m.setFilter('pin-focus-halo', f)
      if (m.getLayer('pin-focus-ring')) m.setFilter('pin-focus-ring', f)
    }
    if (!focusListingId) { popup.current.remove(); setFocusFilter(null); return }
    const l = listingsRef.current.find(x => x.id === focusListingId)
    if (!l || l.lat == null || l.lng == null) { setFocusFilter(null); return }
    setFocusFilter(l.id)
    const coords = displayCoords(l)
    const isCurrent = highlightListingId && l.id === highlightListingId
    popup.current.setLngLat(coords).setHTML(buildPopupHTML(listingToProps(l), { isCurrent, strings: popupStringsRef.current })).addTo(m)
  }, [focusListingId, mapReady, highlightListingId, isEmbedded])

  // ── Trail → map sync: numbered stop pins + route line ──
  useEffect(() => {
    if (!mapReady || !map.current || isEmbedded) return
    const m = map.current
    const stopSource = m.getSource('trail-stops')
    const routeSource = m.getSource('trail-route')
    if (!stopSource || !routeSource) return
    stopSource.setData({
      type: 'FeatureCollection',
      features: trail.stops
        .filter(s => s.latitude != null && s.longitude != null)
        .map((s, i) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [parseFloat(s.longitude), parseFloat(s.latitude)] },
          properties: { id: s.id, label: String(i + 1), color: verticalColor(s.vertical) },
        })),
    })
    routeSource.setData(
      trail.route.geometry && trail.stops.length >= 2
        ? { type: 'Feature', geometry: trail.route.geometry, properties: {} }
        : { type: 'FeatureCollection', features: [] }
    )
    // Straight-line fallback geometry renders dashed — an honest sketch,
    // not a road promise.
    if (m.getLayer('trail-route-line')) {
      m.setPaintProperty('trail-route-line', 'line-dasharray', trail.route.approx ? [2.4, 1.8] : [1, 0])
    }
  }, [trail.stops, trail.route, mapReady, isEmbedded])

  // Seeding a trail (wizard, template, plan-a-stay import, saved-trail edit)
  // lands several stops at once — frame them. Single hand-adds never move
  // the camera; the reader is already looking where they're working.
  const prevTrailCount = useRef(0)
  const framedInitial = useRef(false)
  useEffect(() => {
    // Only advance the baseline once the map can actually act on it — otherwise
    // a draft that hydrates before the map is ready would leave prev === n and
    // the trail would never get framed.
    if (!mapReady || !map.current || isEmbedded || !trailOpenRef.current) return
    const n = trail.stops.length
    const prev = prevTrailCount.current
    prevTrailCount.current = n
    // Frame when a batch lands at once (wizard / plan-a-stay import / template),
    // or on the first ready render of a restored/edited trail. Single hand-adds
    // never yank the camera — the reader is already looking where they work.
    const batchLanded = n >= 2 && n - prev >= 2
    const initialRestore = !framedInitial.current && n >= 2
    if (n >= 2) framedInitial.current = true
    if (batchLanded || initialRestore) {
      const pts = trail.stops
        .filter(s => s.latitude != null && s.longitude != null)
        .map(s => [parseFloat(s.longitude), parseFloat(s.latitude)])
      if (!pts.length) return
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
      for (const [lng, lat] of pts) {
        if (lng < minLng) minLng = lng
        if (lat < minLat) minLat = lat
        if (lng > maxLng) maxLng = lng
        if (lat > maxLat) maxLat = lat
      }
      map.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: cameraPadding(), maxZoom: 11.5, duration: 1100 })
    }
  }, [trail.stops, mapReady, isEmbedded, cameraPadding])

  // ── Region deep-link (?region=Name from "build a trail here" links):
  // once pins are in, frame that region. ──
  const regionFitDone = useRef(false)
  useEffect(() => {
    if (!initialTrailRegion || regionFitDone.current || !mapReady || !map.current || !allListings.length) return
    const matches = allListings.filter(l => (l.region || '').toLowerCase().includes(initialTrailRegion.toLowerCase()))
    if (matches.length < 2) return
    const lats = matches.map(l => parseFloat(l.lat)).filter(Number.isFinite)
    const lngs = matches.map(l => parseFloat(l.lng)).filter(Number.isFinite)
    if (!lats.length) return
    regionFitDone.current = true
    map.current.fitBounds(
      [[Math.min(...lngs) - 0.1, Math.min(...lats) - 0.1], [Math.max(...lngs) + 0.1, Math.max(...lats) + 0.1]],
      { padding: cameraPadding(), duration: 900 }
    )
  }, [initialTrailRegion, mapReady, allListings, cameraPadding])

  // Zoom to state — but ONLY on a real stateFilter change. The effect can
  // re-fire without one (dep identity churn in dev, prop re-renders), and an
  // unconditional fit here yanks the camera back to the country/state view
  // mid-browse. First run after load fits a ?state= deep link only when no
  // explicit camera (?lng/lat/zoom or "View on full map") was supplied.
  const prevStateFilter = useRef(null)
  useEffect(() => {
    if (!mapReady || !map.current || isEmbedded) return
    const prev = prevStateFilter.current
    prevStateFilter.current = stateFilter
    if (prev === stateFilter) return
    if (prev === null && (initialCenter || stateFilter === 'All States')) return
    if (stateFilter === 'All States') {
      map.current.fitBounds(AUSTRALIA_BOUNDS, { padding: cameraPadding(), duration: 800 })
    } else {
      const bounds = STATE_BOUNDS[stateFilter]
      if (bounds) map.current.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: cameraPadding(), duration: 800 })
    }
  }, [stateFilter, mapReady, isEmbedded, initialCenter])

  // Panel toggle — the camera re-centres into the uncovered area. A manual
  // toggle while the trail is open overrides focus mode: the reader has
  // chosen their own layout, so closing the trail won't second-guess it.
  function togglePanel() {
    const next = !panelOpen
    if (trailOpenRef.current) panelFoldedForTrail.current = false
    setPanelOpen(next)
    if (map.current) map.current.easeTo({ padding: cameraPadding(next), duration: 380 })
  }

  // Trail panel toggle — same camera courtesy on the right edge.
  // `focus` = a deliberate step into trail mode (the header button, not an
  // incidental add): the browse list folds away so the two rails never fight,
  // and comes back when the trail closes. Adding from the list never yanks
  // the list out from under the reader.
  const setTrailOpen = useCallback((next, { focus = false } = {}) => {
    trail.setOpen(next)
    const desktop = typeof window !== 'undefined' && !window.matchMedia('(max-width: 768px)').matches
    let panelNext = panelOpenRef.current
    if (desktop) {
      if (next && focus && panelOpenRef.current) {
        panelFoldedForTrail.current = true
        panelNext = false
        setPanelOpen(false)
      } else if (!next && panelFoldedForTrail.current) {
        panelFoldedForTrail.current = false
        panelNext = true
        setPanelOpen(true)
      }
      if (map.current) map.current.easeTo({ padding: cameraPadding(panelNext, next), duration: 380 })
    }
    clearTimeout(urlTimer.current)
    urlTimer.current = setTimeout(() => writeUrlRef.current(), 80)
  }, [trail, cameraPadding])

  // Adding a stop from a card or list row: panel opens alongside on desktop
  // (there's room to see both); on mobile the pill count ticking up is the
  // feedback — a sheet popping over the map would bury what they just did.
  const handleAddToTrail = useCallback((l) => {
    trail.addStop(l)
    if (typeof window !== 'undefined' && !window.matchMedia('(max-width: 768px)').matches) {
      if (!trailOpenRef.current) setTrailOpen(true)
    }
  }, [trail, setTrailOpen])

  const handleRemoveFromTrail = useCallback((l) => {
    trail.removeStop(l.id)
  }, [trail])

  // Trail panel rows fly the camera to the stop and open its card.
  const handleTrailSelect = useCallback((s) => {
    const l = listingsRef.current.find(x => String(x.id) === String(s.id))
    if (l) {
      selectListing(l, { fly: true })
    } else if (s.latitude != null && s.longitude != null && map.current) {
      map.current.flyTo({ center: [parseFloat(s.longitude), parseFloat(s.latitude)], zoom: Math.max(map.current.getZoom(), 11), padding: cameraPadding(), maxDuration: 2200 })
    }
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      trail.setOpen(false) // drop the sheet so the map is visible
    }
  }, [selectListing, cameraPadding, trail])

  const isAllVerticals = selectedVerticals.size === 0
  const activeFilterCount = (!isAllVerticals ? 1 : 0) + (subTypeFilter !== 'all' ? 1 : 0) + (stateFilter !== 'All States' ? 1 : 0) + (appliedPinQuery ? 1 : 0)

  // Smart-filter lifecycle flags. `filterBusy` is the crucial one: the map's
  // "no matches" empty states must be suppressed while a query is still
  // settling (debounce) or its semantic request is in flight — during that
  // window count===0 means "not answered yet", NOT "nothing matches".
  const filterActive = appliedPinQuery.length > 0
  const filterBusy = filterActive && (pinQuery.trim() !== appliedPinQuery || semanticLoading)

  // Embedded legend — the nearby map ships no chrome, so coloured dots are
  // otherwise unexplained. Build a compact key from the verticals actually
  // present, plus a "This place" swatch for the highlighted pin.
  const highlightListing = highlightListingId ? allListings.find(l => l.id === highlightListingId) : null
  const highlightColor = highlightListing ? verticalColor(highlightListing.vertical) : PRIMARY
  const embeddedLegend = isEmbedded
    ? [...new Set(allListings.filter(l => l.id !== highlightListingId).map(l => l.vertical).filter(Boolean))]
        .map(v => ({ key: v, label: getVerticalBadge(v), color: verticalColor(v) }))
    : []

  function clearAllFilters() {
    setSelectedVerticals(new Set())
    setSubTypeFilter('all')
    setStateFilter('All States')
    setPinQuery('')
  }

  // Venue half of the unified field — name matches tiered prefix → substring →
  // all-word (so "Tar Barrel brewery" still finds "Tar Barrel" once the generic
  // category word is set aside), then ranked by GEOGRAPHY: venues inside the
  // current viewport lead (tier, then nearest the centre), everything off-screen
  // follows by plain distance — typing "coffee" over Hobart offers Hobart's
  // coffee, not Marrickville's. Capped at 5 (towns/POIs sit beneath).
  const venueMatches = useMemo(() => {
    const q = pinQuery.trim().toLowerCase()
    if (q.length < 2) return []
    // Words that must appear in the NAME — drop stopwords and generic category/
    // intent words so a trailing "brewery"/"cafe" doesn't exclude the venue.
    const nameToks = q.split(/\s+/).filter(w => w.length >= 2 && !STOPWORDS.has(w) && !SUBTYPE_WORD_INDEX[w] && !VERTICAL_INTENT[w])
    const m = map.current
    const b = m ? m.getBounds() : null
    const c = m ? m.getCenter() : null
    const cosLat = c ? Math.cos((c.lat * Math.PI) / 180) : 1
    const scored = []
    for (const l of allListings) {
      const n = l.name ? l.name.toLowerCase() : ''
      if (!n) continue
      let tier
      if (n.startsWith(q)) tier = 0
      else if (n.includes(q)) tier = 1
      else if (nameToks.length && nameToks.every(w => n.includes(w))) tier = 2
      else continue
      const lng = parseFloat(l.lng), lat = parseFloat(l.lat)
      const hasCoords = Number.isFinite(lng) && Number.isFinite(lat)
      const within = !!(b && hasCoords &&
        lng >= b.getWest() && lng <= b.getEast() && lat >= b.getSouth() && lat <= b.getNorth())
      // Equirectangular squared distance — cheap and monotonic, all we need for ordering.
      const dx = (c && hasCoords) ? (lng - c.lng) * cosLat : 0
      const dy = (c && hasCoords) ? lat - c.lat : 0
      const dist = (c && hasCoords) ? dx * dx + dy * dy : Infinity
      scored.push({ l, tier, within, dist })
    }
    scored.sort((a, b2) => {
      if (a.within !== b2.within) return a.within ? -1 : 1
      // On-screen: completion feel — prefix beats substring, nearest breaks ties.
      if (a.within) return (a.tier - b2.tier) || (a.dist - b2.dist)
      // Off-screen: how close it is matters more than how the name matched.
      return (a.dist - b2.dist) || (a.tier - b2.tier)
    })
    return scored.slice(0, 5).map(s => s.l)
    // inView changes on every moveend — keying on it re-ranks an open dropdown
    // around wherever the map has been panned to.
  }, [pinQuery, allListings, inView])

  const hasSearchResults = venueMatches.length > 0 || placeResults.length > 0

  // Sub-type pills only shown when exactly one vertical is selected
  const currentSubTypes = singleSelectedVertical ? SUB_TYPE_LABELS[singleSelectedVertical] || {} : {}
  const hasSubTypes = Object.keys(currentSubTypes).length > 0

  const rootStyle = isEmbedded
    ? { position: 'relative', width: '100%', height: '100%', background: '#faf8f5' }
    : { position: 'fixed', inset: 0, zIndex: 50, background: '#F1EADB' }

  // "Build a trail" toggle — the builder is no longer a separate tab; it's a
  // mode of this map. The button carries the live stop count so a draft in
  // progress is never invisible.
  const trailCount = trail.stops.length
  const renderTrailButton = () => {
    const filled = trailOpen || trailCount > 0
    return (
      <button
        onClick={() => setTrailOpen(!trailOpen, { focus: true })}
        aria-pressed={trailOpen}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 999, cursor: 'pointer', minHeight: 34,
          border: `1px solid ${filled ? 'transparent' : 'var(--color-border)'}`,
          background: filled ? PRIMARY : '#fff',
          color: filled ? '#fff' : 'var(--color-ink)',
          fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)', letterSpacing: '0.01em',
          boxShadow: filled ? '0 2px 10px rgba(82,58,30,0.14)' : 'none',
          transition: 'all 0.18s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" />
          <path d="M9 19h6.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H15" />
        </svg>
        {trailCount > 0 ? t('trailButtonCount', { count: trailCount }) : t('trailButton')}
      </button>
    )
  }

  // Unified search dropdown — venues first, then towns/places. Opens downward
  // by default; `up` anchors it above the input (for the bottom filter pill).
  const renderSearchDropdown = (widthStyle, { up = false } = {}) => (
    <div style={{
      position: 'absolute', left: 0, background: '#fff',
      ...(up ? { bottom: '100%', marginBottom: 6 } : { top: '100%', marginTop: 4 }),
      border: '1px solid var(--color-border)', borderRadius: 8,
      boxShadow: '0 8px 28px rgba(28,26,23,0.16)', zIndex: 1000, maxHeight: 340, overflowY: 'auto',
      ...widthStyle,
    }}>
      {venueMatches.length > 0 && (
        <div style={{ padding: '7px 11px 3px', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>{t('venues')}</div>
      )}
      {venueMatches.map(l => (
        <button key={l.id} onClick={() => jumpToVenue(l)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 11px', minHeight: 40, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: verticalColor(l.vertical), flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--color-ink)', fontWeight: 500, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
            <span style={{ display: 'block', fontSize: 10, color: 'var(--color-muted)', marginTop: 1 }}>{[getVerticalBadge(l.vertical), l.region, l.state].filter(Boolean).join(' · ')}</span>
          </span>
        </button>
      ))}
      {placeResults.length > 0 && (
        <div style={{ padding: '7px 11px 3px', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted)', borderTop: venueMatches.length ? '1px solid var(--color-border)' : 'none' }}>{t('townsAndPlaces')}</div>
      )}
      {placeResults.slice(0, 5).map(f => (
        <button key={f.id} onClick={() => handlePlaceSelect(f)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 11px', minHeight: 40, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
          <PlacePin />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--color-ink)', fontWeight: 500, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.text}</span>
            <span style={{ display: 'block', fontSize: 10, color: 'var(--color-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.place_name.replace(f.text + ', ', '')}</span>
          </span>
          <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5f8a7e', background: 'rgba(95,138,126,0.1)', borderRadius: 3, padding: '2px 6px' }}>{placeTypeLabel(f, t)}</span>
        </button>
      ))}
    </div>
  )

  // Shared handlers for the unified field (bottom pill on desktop, top box on
  // mobile). Typing both filters the map (pinQuery) and opens the jump dropdown;
  // Enter takes the top precise match (a specific venue, then a town/POI) so a
  // name like "Tar Barrel Brewery" flies straight there.
  const searchInputProps = {
    value: pinQuery,
    onChange: e => { setPinQuery(e.target.value); setShowSearchDropdown(!!e.target.value) },
    onFocus: () => { if (hasSearchResults) setShowSearchDropdown(true) },
    onKeyDown: e => {
      if (e.key === 'Enter') {
        if (venueMatches.length) jumpToVenue(venueMatches[0])
        else if (placeResults.length) handlePlaceSelect(placeResults[0])
        else setShowSearchDropdown(false)
      }
      if (e.key === 'Escape') { setShowSearchDropdown(false); setPinQuery('') }
    },
    placeholder: t('searchPlaceholder'),
    'aria-label': t('searchAriaLabel'),
  }

  const selectedMeta = selected ? cardMeta[selected.id] : null

  return (
    <div style={rootStyle}>
      {/* ── MAP — fills the container ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        {/* ── DESKTOP TOOLBAR (overlays map) — fullscreen mode only ── */}
        {!isEmbedded && (
        <div ref={toolbarRef} className="map-desktop-toolbar" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
          {/* Row 0: brand + the trail mode toggle. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 20px 1px', background: 'rgba(250,248,245,0.97)', backdropFilter: 'blur(8px)' }}>
            <a href="/" className="map-wordmark" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
              <svg className="map-wordmark-star" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C4973B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)' }}>
                <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1" />
              </svg>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 400, color: 'var(--color-ink)', letterSpacing: '0.005em' }}>
                Australian Atlas
              </span>
            </a>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-muted)', paddingLeft: 2 }}>
              {t('mapWordmarkKicker')}
            </span>
            <div style={{ marginLeft: 'auto' }}>
              {renderTrailButton()}
            </div>
          </div>
          {/* Row 1: vertical chips, state select, count. The former top-left
              search box is folded into the one bottom "search & filter" pill —
              a single surface that both filters the map and jumps to a place. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px 9px', borderBottom: hasSubTypes ? 'none' : '1px solid var(--color-border)', background: 'rgba(250,248,245,0.97)', backdropFilter: 'blur(8px)', flexWrap: 'wrap' }}>
            {verticalFilters.map(v => {
              const active = v.key === 'all' ? isAllVerticals : selectedVerticals.has(v.key)
              const c = v.key === 'all' ? PRIMARY : verticalColor(v.key)
              return (
                <button key={v.key} onClick={() => toggleVertical(v.key)} aria-pressed={active} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 11px', borderRadius: 14, cursor: 'pointer',
                  fontSize: 11, fontWeight: active ? 600 : 500, fontFamily: 'var(--font-sans)',
                  border: `1px solid ${active ? c : 'var(--color-border)'}`,
                  background: active ? c : 'transparent',
                  color: active ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                }}>
                  {v.key !== 'all' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#fff' : c, flexShrink: 0 }} />}
                  {v.label}
                </button>
              )
            })}
            <div style={{ width: 1, height: 18, background: 'var(--color-border)' }} />
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value)}
              aria-label={t('filterByState')}
              style={{
                padding: '7px 12px', borderRadius: 999, border: '1px solid var(--color-border)',
                background: stateFilter !== 'All States' ? 'rgba(95,138,126,0.12)' : '#fff',
                color: 'var(--color-ink)', fontSize: 11.5, fontWeight: 500, fontFamily: 'var(--font-sans)', cursor: 'pointer', outline: 'none',
              }}
            >
              {STATES.map(s => <option key={s} value={s}>{s === 'All States' ? t('allStates') : s}</option>)}
            </select>
            <div role="status" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--color-muted)' }}>
              <span>{loading ? t('loading') : filterBusy ? t('searchingShort') : placesLabel(count, t)}</span>
              {activeFilterCount > 0 && (
                <button onClick={clearAllFilters} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: PRIMARY, fontFamily: 'var(--font-sans)' }}>
                  {t('clearFilters')}
                </button>
              )}
            </div>
          </div>

          {/* Row 2: sub-type pills (only visible when a vertical is selected) */}
          {hasSubTypes && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 20px 10px', borderBottom: '1px solid var(--color-border)', background: 'rgba(250,248,245,0.97)', backdropFilter: 'blur(8px)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-sans)', marginRight: 4 }}>{t('type')}</span>
              <button onClick={() => setSubTypeFilter('all')} style={{
                padding: '4px 10px', borderRadius: 12, border: `1px solid ${subTypeFilter === 'all' ? verticalColor(singleSelectedVertical) : 'var(--color-border)'}`,
                cursor: 'pointer', fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-sans)',
                background: subTypeFilter === 'all' ? verticalColor(singleSelectedVertical) : 'transparent',
                color: subTypeFilter === 'all' ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
              }}>{t('all')}</button>
              {Object.entries(currentSubTypes).map(([key, label]) => (
                <button key={key} onClick={() => setSubTypeFilter(key)} style={{
                  padding: '4px 10px', borderRadius: 12, border: `1px solid ${subTypeFilter === key ? verticalColor(singleSelectedVertical) : 'var(--color-border)'}`,
                  cursor: 'pointer', fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-sans)',
                  background: subTypeFilter === key ? verticalColor(singleSelectedVertical) : 'transparent',
                  color: subTypeFilter === key ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                }}>{label}</button>
              ))}
            </div>
          )}
        </div>
        )}
        {/* Map canvas */}
        <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

        {/* ── DESKTOP DISCOVERY PANEL — the gazetteer ── */}
        {!isEmbedded && (
          <div className="map-desktop-toolbar" style={{
            position: 'absolute', top: toolbarH, bottom: 0, left: 0, zIndex: 9,
            width: PANEL_W,
            transform: panelOpen ? 'translateX(0)' : `translateX(-${PANEL_W}px)`,
            transition: 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
          }}>
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(251,249,244,0.98)',
              borderRight: '1px solid var(--color-border)', boxShadow: '4px 0 24px rgba(28,26,23,0.07)',
            }}>
              {mapReady && (
                <DiscoveryPanel
                  mode="panel"
                  items={inView.items}
                  totalInView={inView.total}
                  totalAll={count}
                  loading={loading}
                  cardMeta={cardMeta}
                  selectedId={selected?.id || null}
                  visitedIds={visitedRef.current}
                  filterQuery={pinQuery}
                  onFilterQuery={setPinQuery}
                  filterBusy={filterBusy}
                  onHover={setHoverState}
                  onSelect={(l) => selectListing(l, { fly: true })}
                  trailIds={trailIds}
                  onToggleTrail={(l) => trailIds.has(String(l.id)) ? handleRemoveFromTrail(l) : handleAddToTrail(l)}
                  trailAtCapacity={trail.atCapacity}
                />
              )}
            </div>
            {/* Collapse handle */}
            <button
              onClick={togglePanel}
              aria-label={panelOpen ? t('hideList') : t('showList')}
              aria-expanded={panelOpen}
              style={{
                position: 'absolute', top: '50%', right: -22, transform: 'translateY(-50%)',
                width: 22, height: 56, borderRadius: '0 8px 8px 0',
                background: 'rgba(251,249,244,0.98)', border: '1px solid var(--color-border)', borderLeft: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '3px 0 10px rgba(28,26,23,0.08)',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2.5" strokeLinecap="round"
                style={{ transform: panelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        )}

        {/* ── DESKTOP TRAIL PANEL — the trail under construction, right rail ── */}
        {!isEmbedded && (
          <div className="map-desktop-toolbar" style={{
            position: 'absolute', top: toolbarH, bottom: 0, right: 0, zIndex: 9,
            width: TRAIL_W,
            transform: trailOpen ? 'translateX(0)' : `translateX(${TRAIL_W}px)`,
            transition: 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
          }}>
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(251,249,244,0.98)',
              borderLeft: '1px solid var(--color-border)', boxShadow: '-4px 0 24px rgba(28,26,23,0.07)',
            }}>
              <TrailPanel
                trail={trail}
                mode="panel"
                onClose={() => setTrailOpen(false)}
                onSelectListing={handleTrailSelect}
              />
            </div>
          </div>
        )}

        {/* Anchored selection card — portalled into a Mapbox marker */}
        {!isEmbedded && selected && cardPortalEl && createPortal(
          <MapPreviewCard
            listing={selected}
            meta={selectedMeta}
            variant="anchored"
            onClose={clearSelected}
            onVisit={markVisited}
            inTrail={trailIds.has(String(selected.id))}
            onAddToTrail={trail.atCapacity && !trailIds.has(String(selected.id)) ? null : (trailIds.has(String(selected.id)) ? () => handleRemoveFromTrail(selected) : () => handleAddToTrail(selected))}
          />,
          cardPortalEl
        )}

        {/* Embedded legend — compact colour key for the nearby pins */}
        {isEmbedded && mapReady && (embeddedLegend.length > 0 || highlightListing) && (
          <div style={{
            position: 'absolute', top: 10, left: 10, zIndex: 5, maxWidth: 'calc(100% - 80px)',
            display: 'flex', flexWrap: 'wrap', gap: '5px 10px', alignItems: 'center',
            background: 'rgba(250,248,245,0.95)', border: '1px solid var(--color-border)',
            borderRadius: 8, padding: '6px 9px', backdropFilter: 'blur(6px)',
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          }}>
            {highlightListing && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--color-muted)', fontFamily: 'var(--font-sans, sans-serif)' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: highlightColor, boxShadow: `0 0 0 2px ${highlightColor}55` }} />
                {t('thisPlace')}
              </span>
            )}
            {embeddedLegend.map(v => (
              <span key={v.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--color-muted)', fontFamily: 'var(--font-sans, sans-serif)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: v.color }} />
                {v.label}
              </span>
            ))}
          </div>
        )}

        {/* Loading overlay — the canvas stays blank until pins arrive, so say so */}
        {!isEmbedded && loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6, pointerEvents: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '12px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              <span className="map-spinner" />
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-muted)', letterSpacing: '0.04em' }}>{t('loadingTheAtlas')}</span>
            </div>
          </div>
        )}

        {/* Empty state — every pin filtered away. Suppressed while the smart
            filter is still resolving (filterBusy): count===0 then means "not
            answered yet", not "nothing matches", so the card must not flash. */}
        {!isEmbedded && !loading && mapReady && count === 0 && !filterBusy && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6, pointerEvents: 'none' }}>
            <div style={{ pointerEvents: 'auto', textAlign: 'center', background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '20px 26px', boxShadow: '0 4px 20px rgba(0,0,0,0.10)', maxWidth: 320 }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, color: 'var(--color-ink)', marginBottom: 6 }}>
                {filterActive ? t('nothingMatchesQuery', { query: appliedPinQuery }) : t('noPlacesMatchFilters')}
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.5, marginBottom: 14 }}>
                {filterActive ? t('filterEmptyHint') : t('filtersEmptyHint')}
              </div>
              <button onClick={clearAllFilters} style={{ padding: '8px 18px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 2, cursor: 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-sans)' }}>
                {t('clearAllFilters')}
              </button>
            </div>
          </div>
        )}

        {/* ── MOBILE SEARCH — unified venues + towns finder ── */}
        {!isEmbedded && (
          <div ref={mobileSearchRef} className="map-mobile-only" style={{
            position: 'absolute', top: 12, left: 12, right: 12, zIndex: 12, flexDirection: 'column',
          }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
              <span style={{ position: 'absolute', left: 12, display: 'flex', pointerEvents: 'none' }} aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </span>
              <input type="text" inputMode="search" {...searchInputProps}
                style={{ width: '100%', padding: '11px 38px 11px 34px', background: 'rgba(255,255,255,0.98)', border: '1px solid var(--color-border)', color: 'var(--color-ink)', fontSize: 14, outline: 'none', borderRadius: 10, fontFamily: 'var(--font-sans)', boxSizing: 'border-box', boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }} />
              {pinQuery && (
                <button onClick={() => { setPinQuery(''); setPlaceResults([]); setShowSearchDropdown(false) }} aria-label={t('clearSearch')} style={{ position: 'absolute', right: 6, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              )}
            </div>
            {showSearchDropdown && hasSearchResults && (
              <div style={{ position: 'relative' }}>
                {renderSearchDropdown({ width: '100%', maxHeight: '50vh' })}
              </div>
            )}
          </div>
        )}

        {/* Mobile count chip — the toolbar (and its count) is desktop-only.
            Sits just under the search bar; hidden while its dropdown is open
            so the two never collide. */}
        {!isEmbedded && !mobileSheetOpen && !(showSearchDropdown && hasSearchResults) && (
          <div className="map-mobile-only" role="status" style={{
            position: 'absolute', top: 62, left: '50%', transform: 'translateX(-50%)', zIndex: 8,
            background: 'rgba(250,248,245,0.95)', border: '1px solid var(--color-border)', borderRadius: 12,
            padding: '4px 12px', pointerEvents: 'none', alignItems: 'center',
            fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--color-muted)',
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          }}>
            {loading ? t('loading') : filterBusy ? t('searchingShort') : placesLabel(count, t)}
          </div>
        )}

        {/* ── FLOATING SMART FILTER (desktop) — the hero filter, centred over
            the map so it's reachable without hunting the sidebar. Its wrapper
            spans the map area (right of the panel) and centres the pill; the
            wrapper is click-through so the bottom-corner controls stay live.
            The live match count and status live INSIDE the bar (a quiet sage
            chip / spinner) — no separate floating caption. */}
        {!isEmbedded && (
          <div className="map-desktop-toolbar" style={{
            position: 'absolute', bottom: 30, left: panelOpen ? PANEL_W : 0, right: trailOpen ? TRAIL_W : 0, zIndex: 12,
            display: 'flex', justifyContent: 'center',
            pointerEvents: 'none', transition: 'left 0.38s cubic-bezier(0.22, 1, 0.36, 1), right 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
            padding: '0 88px',
          }}>
            <div ref={searchRef} style={{
              position: 'relative', pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 9,
              width: 'min(520px, 100%)', boxSizing: 'border-box',
              background: 'rgba(251,249,244,0.94)', backdropFilter: 'blur(14px) saturate(1.2)',
              border: `1px solid ${filterActive ? 'rgba(95,138,126,0.5)' : 'rgba(28,26,23,0.1)'}`,
              borderRadius: 999, padding: '8px 10px 8px 16px',
              boxShadow: filterActive
                ? '0 12px 34px rgba(28,26,23,0.18), 0 0 0 4px rgba(95,138,126,0.09)'
                : '0 12px 34px rgba(28,26,23,0.16)',
              transition: 'border-color 0.25s, box-shadow 0.25s',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={filterActive ? '#5f8a7e' : 'var(--color-muted)'} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, transition: 'stroke 0.2s' }} aria-hidden="true">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              <input
                type="text"
                value={pinQuery}
                onChange={e => { setPinQuery(e.target.value); setShowSearchDropdown(!!e.target.value) }}
                onFocus={() => { if (hasSearchResults) setShowSearchDropdown(true) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (venueMatches.length) jumpToVenue(venueMatches[0])
                    else if (placeResults.length) handlePlaceSelect(placeResults[0])
                    else setShowSearchDropdown(false)
                  }
                  if (e.key === 'Escape') { setShowSearchDropdown(false); setPinQuery('') }
                }}
                placeholder={t('filterPlaceholderLong')}
                aria-label={t('filterAriaLabel')}
                style={{
                  flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                  fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--color-ink)', letterSpacing: '0.005em',
                }}
              />
              {/* Status cluster: spinner while resolving; a sage count chip once
                  matches are known; a clear button always available with a query. */}
              {filterBusy && (
                <span aria-label={t('searching')} title={t('searchingAtlas')} style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  border: '2px solid rgba(95,138,126,0.28)', borderTopColor: '#5f8a7e',
                  animation: 'map-spin 0.7s linear infinite',
                }} />
              )}
              {filterActive && !filterBusy && (
                <span style={{
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center',
                  height: 24, padding: '0 10px', borderRadius: 999,
                  background: count > 0 ? 'rgba(95,138,126,0.14)' : 'rgba(196,96,58,0.12)',
                  color: count > 0 ? 'var(--color-sage-dark)' : 'var(--color-accent)',
                  fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}>
                  {count > 0 ? t('matchesCount', { count }) : t('noMatches')}
                </span>
              )}
              {pinQuery && (
                <button onClick={() => setPinQuery('')} aria-label={t('clearFilter')} style={{
                  flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: 'rgba(28,26,23,0.06)', color: 'var(--color-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              )}
              {/* Jump dropdown — specific venues + towns/POIs, opening upward
                  above the pill. Picking one flies straight there. */}
              {showSearchDropdown && hasSearchResults && renderSearchDropdown({ width: '100%' }, { up: true })}
            </div>
          </div>
        )}

        {/* Desktop legend — fullscreen mode only; slides with the panel */}
        {!isEmbedded && (
        <div className="map-desktop-toolbar" style={{ position: 'absolute', bottom: 40, left: panelOpen ? PANEL_W + 16 : 16, transition: 'left 0.38s cubic-bezier(0.22, 1, 0.36, 1)', background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)', borderRadius: 4, zIndex: 5, overflow: 'hidden' }}>
          <button onClick={() => setLegendCollapsed(c => !c)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', gap: 24 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-sans)' }}>{t('legend')}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2.5" style={{ transform: legendCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {!legendCollapsed && (
            <div style={{ padding: '0 14px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8, fontFamily: 'var(--font-sans)' }}>{t('atlasVerticals')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                {verticalKeys.map(v => (
                  <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: verticalColor(v), display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{getVerticalBadge(v)}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 6, fontFamily: 'var(--font-sans)' }}>{t('listingType')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9a8878', display: 'inline-block' }} /><span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{t('standard')}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: PREMIUM_COLOR, display: 'inline-block' }} /><span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{t('featured')}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: PREMIUM_COLOR, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="6" height="6" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 5.4L4.2 7.5L8 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{t('claimedByOwner')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* ── MOBILE FABs — fullscreen mode only ── */}
        {!isEmbedded && (
        <>
        <button className="map-mobile-only" onClick={() => setMobileSheetOpen(o => !o)} aria-label={t('filters')} style={{
          position: 'absolute', bottom: 100, right: 16, zIndex: 10,
          width: 48, height: 48, borderRadius: '50%',
          background: mobileSheetOpen ? PRIMARY : 'rgba(250,248,245,0.97)',
          border: `1px solid ${mobileSheetOpen ? PRIMARY : 'var(--color-border)'}`,
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s',
        }}>
          {mobileSheetOpen
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={activeFilterCount > 0 ? PRIMARY : 'var(--color-muted)'} strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
          }
          {activeFilterCount > 0 && !mobileSheetOpen && (
            <span style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: PRIMARY, border: '1.5px solid white' }} />
          )}
        </button>

        <button className="map-mobile-only" onClick={() => {
          if (!navigator.geolocation) return
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              map.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 12, padding: cameraPadding(), duration: 1200 })
            },
            () => {},
            { enableHighAccuracy: true, timeout: 8000 }
          )
        }} style={{
          position: 'absolute', bottom: 160, right: 16, zIndex: 10,
          width: 48, height: 48, borderRadius: '50%',
          background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }} aria-label={t('useMyLocation')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </button>

        <button className="map-mobile-only" onClick={() => setMobileLegendOpen(o => !o)} aria-label={t('legend')} style={{
          position: 'absolute', bottom: 220, right: 16, zIndex: 10,
          width: 48, height: 48, borderRadius: '50%',
          background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 16, color: 'var(--color-muted)', fontWeight: 600,
        }}>ⓘ</button>

        {/* Mobile legend popover */}
        {mobileLegendOpen && (
          <div className="map-mobile-only" style={{
            position: 'absolute', bottom: 280, right: 16, zIndex: 10,
            flexDirection: 'column',
            background: 'rgba(250,248,245,0.97)', border: '1px solid var(--color-border)',
            borderRadius: 6, padding: '12px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8 }}>{t('atlasVerticals')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
              {verticalKeys.map(v => (
                <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: verticalColor(v), display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{getVerticalBadge(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mobile "List" + "Trail" pills — persistent, labelled (a hidden
            toggle is a dead toggle). List opens the gazetteer sheet; Trail
            opens the trail planner sheet, its count always live. */}
        {!mobileSheetOpen && !mobileListOpen && !trailOpen && (
          <div className="map-mobile-only" style={{
            position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 11,
            alignItems: 'center', gap: 8,
          }}>
            <button onClick={() => { clearSelected(); setMobileListOpen(true) }} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 24,
              background: 'var(--color-ink)', color: 'var(--color-cream)', border: 'none',
              boxShadow: '0 4px 16px rgba(28,26,23,0.3)', cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.03em',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
              {t('list')}{mapReady && !loading ? ` · ${inView.total.toLocaleString()}` : ''}
            </button>
            <button onClick={() => { clearSelected(); setMobileListOpen(false); trail.setOpen(true) }} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 24,
              background: trailCount > 0 ? PRIMARY : 'rgba(250,248,245,0.97)',
              color: trailCount > 0 ? '#fff' : 'var(--color-ink)',
              border: trailCount > 0 ? 'none' : '1px solid var(--color-border)',
              boxShadow: '0 4px 16px rgba(28,26,23,0.22)', cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.03em',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" />
                <path d="M9 19h6.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H15" />
              </svg>
              {trailCount > 0 ? t('trailButtonCount', { count: trailCount }) : t('trailButton')}
            </button>
          </div>
        )}

        {/* Mobile trail sheet — the planner, full height */}
        {trailOpen && (
          <div className="map-mobile-only" style={{
            position: 'absolute', inset: 0, top: 12, zIndex: 23, flexDirection: 'column',
            background: 'rgba(251,249,244,0.99)', borderRadius: '16px 16px 0 0',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.14)', overflow: 'hidden',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)', margin: '8px auto 6px', flexShrink: 0 }} />
            <TrailPanel
              trail={trail}
              mode="sheet"
              onClose={() => trail.setOpen(false)}
              onSelectListing={handleTrailSelect}
            />
          </div>
        )}

        {/* Mobile list sheet — the gazetteer, full height */}
        {mobileListOpen && (
          <div className="map-mobile-only" style={{
            position: 'absolute', inset: 0, top: 44, zIndex: 22, flexDirection: 'column',
            background: 'rgba(251,249,244,0.99)', borderRadius: '16px 16px 0 0',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.14)', overflow: 'hidden',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)', margin: '8px auto 6px', flexShrink: 0 }} />
            <DiscoveryPanel
              mode="sheet"
              items={inView.items}
              totalInView={inView.total}
              totalAll={count}
              loading={loading}
              cardMeta={cardMeta}
              selectedId={selected?.id || null}
              visitedIds={visitedRef.current}
              filterQuery={pinQuery}
              onFilterQuery={setPinQuery}
              filterBusy={filterBusy}
              onHover={() => {}}
              onSelect={(l) => { setMobileListOpen(false); selectListing(l, { fly: true }) }}
              onClose={() => setMobileListOpen(false)}
              trailIds={trailIds}
              onToggleTrail={(l) => trailIds.has(String(l.id)) ? handleRemoveFromTrail(l) : handleAddToTrail(l)}
              trailAtCapacity={trail.atCapacity}
            />
          </div>
        )}

        {/* Mobile docked selection card — Google Maps pattern: the map stays
            pannable behind it; explicit X to dismiss. */}
        {selected && !mobileListOpen && !trailOpen && (
          <div className="map-mobile-only" style={{ position: 'absolute', left: 10, right: 10, bottom: 84, zIndex: 21, flexDirection: 'column' }}>
            <MapPreviewCard
              listing={selected}
              meta={selectedMeta}
              variant="docked"
              onClose={clearSelected}
              onVisit={markVisited}
              inTrail={trailIds.has(String(selected.id))}
              onAddToTrail={trail.atCapacity && !trailIds.has(String(selected.id)) ? null : (trailIds.has(String(selected.id)) ? () => handleRemoveFromTrail(selected) : () => handleAddToTrail(selected))}
            />
          </div>
        )}

        {/* ── MOBILE FILTER SHEET ── */}
        {mobileSheetOpen && (
          <div className="map-mobile-only" style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
            // .map-mobile-only forces display:flex — without an explicit
            // column direction the sheet's sections lay out side by side.
            flexDirection: 'column',
            background: 'rgba(250,248,245,0.99)', borderTop: '1px solid var(--color-border)',
            borderRadius: '16px 16px 0 0', boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
            padding: '8px 0 32px', maxHeight: '70vh', overflowY: 'auto',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)', margin: '4px auto 16px' }} />

            {/* Vertical filters */}
            <div style={{ padding: '0 20px 14px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10, fontFamily: 'var(--font-sans)' }}>{t('category')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {verticalFilters.map(v => {
                  const active = v.key === 'all' ? isAllVerticals : selectedVerticals.has(v.key)
                  return (
                    <button key={v.key} onClick={() => toggleVertical(v.key)} style={{
                      padding: '10px 16px', borderRadius: 20, minHeight: 44,
                      border: `1px solid ${active ? verticalColor(v.key) : 'var(--color-border)'}`,
                      cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
                      background: active ? verticalColor(v.key) : 'transparent',
                      color: active ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                    }}>{v.label}</button>
                  )
                })}
              </div>
            </div>

            {/* Sub-type filters (only when vertical is selected) */}
            {hasSubTypes && (
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10, fontFamily: 'var(--font-sans)' }}>{t('type')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button onClick={() => setSubTypeFilter('all')} style={{
                    padding: '10px 16px', borderRadius: 20, minHeight: 44,
                    border: `1px solid ${subTypeFilter === 'all' ? verticalColor(singleSelectedVertical) : 'var(--color-border)'}`,
                    cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
                    background: subTypeFilter === 'all' ? verticalColor(singleSelectedVertical) : 'transparent',
                    color: subTypeFilter === 'all' ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                  }}>{t('all')}</button>
                  {Object.entries(currentSubTypes).map(([key, label]) => (
                    <button key={key} onClick={() => { setSubTypeFilter(key); setMobileSheetOpen(false) }} style={{
                      padding: '10px 16px', borderRadius: 20, minHeight: 44,
                      border: `1px solid ${subTypeFilter === key ? verticalColor(singleSelectedVertical) : 'var(--color-border)'}`,
                      cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
                      background: subTypeFilter === key ? verticalColor(singleSelectedVertical) : 'transparent',
                      color: subTypeFilter === key ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                    }}>{label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* State filters */}
            <div style={{ padding: '14px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10, fontFamily: 'var(--font-sans)' }}>{t('state')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {STATES.map(s => (
                  <button key={s} onClick={() => { setStateFilter(s); setMobileSheetOpen(false) }} style={{
                    padding: '10px 16px', borderRadius: 20, minHeight: 44,
                    border: `1px solid ${stateFilter === s ? PRIMARY : 'var(--color-border)'}`,
                    cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-sans)',
                    background: stateFilter === s ? PRIMARY : 'transparent',
                    color: stateFilter === s ? '#fff' : 'var(--color-muted)', transition: 'all 0.15s',
                  }}>{s === 'All States' ? t('allStates') : s}</button>
                ))}
              </div>
            </div>

            {/* Count + clear */}
            <div style={{ padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span role="status" style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--color-muted)' }}>
                {loading ? t('loading') : placesLabel(count, t)}
              </span>
              {activeFilterCount > 0 && (
                <button onClick={clearAllFilters}
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: PRIMARY, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  {t('clearAllFilters')}
                </button>
              )}
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* Sign-in for "Save trail" — draft persists through the round-trip;
          resume=1 finishes the save on return from Google OAuth. */}
      {!isEmbedded && (
        <AuthModal
          open={trail.authOpen}
          onClose={() => trail.setAuthOpen(false)}
          returnTo={typeof window !== 'undefined' ? `${window.location.origin}/map?trail=1&resume=1` : '/map?trail=1&resume=1'}
          onAuthSuccess={trail.handleAuthSuccess}
        />
      )}

      <style>{`
        .mapboxgl-popup-content { border-radius: 4px !important; padding: 14px 16px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.12) !important; border: 1px solid rgba(95,138,126,0.15) !important; background: #faf8f5 !important; }
        .mapboxgl-popup-tip { display: none !important; }
        /* Nearby-map popups restore a tip that points back at the pin (the
           fullscreen /map keeps the tip-less floating card). Colour the visible
           edge to match the cream popup body, per anchor. */
        .nbx-popup .mapboxgl-popup-tip { display: block !important; }
        .nbx-popup.mapboxgl-popup-anchor-top .mapboxgl-popup-tip,
        .nbx-popup.mapboxgl-popup-anchor-top-left .mapboxgl-popup-tip,
        .nbx-popup.mapboxgl-popup-anchor-top-right .mapboxgl-popup-tip { border-bottom-color: #faf8f5 !important; }
        .nbx-popup.mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip,
        .nbx-popup.mapboxgl-popup-anchor-bottom-left .mapboxgl-popup-tip,
        .nbx-popup.mapboxgl-popup-anchor-bottom-right .mapboxgl-popup-tip { border-top-color: #faf8f5 !important; }
        .nbx-popup.mapboxgl-popup-anchor-left .mapboxgl-popup-tip { border-right-color: #faf8f5 !important; }
        .nbx-popup.mapboxgl-popup-anchor-right .mapboxgl-popup-tip { border-left-color: #faf8f5 !important; }
        .mapboxgl-popup-close-button { font-size: 18px !important; padding: 4px 8px !important; color: #9a8878 !important; }
        .map-hover-tip { pointer-events: none !important; }
        .map-hover-tip .mapboxgl-popup-content { padding: 8px 11px !important; box-shadow: 0 2px 10px rgba(0,0,0,0.10) !important; border-radius: 7px !important; }
        .map-wordmark .map-wordmark-star { transform: rotate(0deg); }
        .map-wordmark:hover .map-wordmark-star { transform: rotate(90deg); }
        .map-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(95,138,126,0.25); border-top-color: #5f8a7e; animation: map-spin 0.8s linear infinite; display: inline-block; flex-shrink: 0; }
        @keyframes map-spin { to { transform: rotate(360deg); } }
        .atlas-donut { cursor: pointer; filter: drop-shadow(0 2px 6px rgba(28,26,23,0.22)); transition: transform 0.16s ease; }
        .atlas-donut:hover { transform: scale(1.08); }
        @media (prefers-reduced-motion: reduce) {
          .atlas-donut, .atlas-donut:hover { transition: none; transform: none; }
        }
        .map-card-anchor { z-index: 30; }
        .map-panel-row:hover { background: rgba(95,138,126,0.06) !important; }
        .map-panel-row:focus-visible { outline: 2px solid #5f8a7e; outline-offset: -2px; }
        .map-mobile-only { display: none !important; }
        @media (max-width: 768px) {
          .map-desktop-toolbar { display: none !important; }
          .map-mobile-only { display: flex !important; }
          /* Mobile keeps the larger locate FAB; hide the duplicate Mapbox control */
          .mapboxgl-ctrl-group:has(.mapboxgl-ctrl-geolocate) { display: none !important; }
        }
      `}</style>
    </div>
  )
}

// ── Helpers ──

function getFiltered(listings, selectedVerticals, subTypeFilter, stateFilter) {
  return listings.filter(l => {
    const matchVertical = selectedVerticals.size === 0 || listingVerticals(l).some(v => selectedVerticals.has(v))
    const matchSubType = subTypeFilter === 'all' || l.sub_type === subTypeFilter
    const matchState = stateFilter === 'All States' || l.state === stateFilter
    return matchVertical && matchSubType && matchState
  })
}

// Shared between the GeoJSON pin source and the embedded popup path, so a
// popup opened from a pin or from the nearby list renders identically.
function listingToProps(l) {
  const subTypes = SUB_TYPE_LABELS[l.vertical] || {}
  // _dist (place-page nearby set) or distance_km (RPC rows) — either is the
  // km from the viewed place; absent in the full /map set, where it's omitted.
  const dist = l._dist != null ? l._dist : (l.distance_km != null ? l.distance_km : null)
  return {
    id: l.id,
    name: l.name,
    slug: l.slug,
    vertical: l.vertical,
    verticalLabel: getVerticalBadge(l.vertical),
    verticalSite: getVerticalLabel(l.vertical),
    subTypeLabel: subTypes[l.sub_type] || null,
    color: verticalColor(l.vertical),
    featured: l.is_featured || false,
    // is_claimed on /api/map rows is overlaid server-side from listing_claims
    // (the raw column is unreliable); image_url is its server-gated card image.
    claimed: l.is_claimed === true,
    labelShow: l._labelShow !== false,
    location: [l.region, l.state].filter(Boolean).join(', '),
    description: l.description || '',
    image: isApprovedImageSource(l.hero_image_url) ? l.hero_image_url : (l.image_url || ''),
    distance: dist != null ? dist : '',
    url: `/place/${l.slug}`,
  }
}

// Claimed-seal map icon — gold roundel, white check, soft halo — drawn on an
// offscreen canvas because Mapbox circle layers can't render glyphs. Returned
// as ImageData for map.addImage(); registered at pixelRatio 2 so it stays
// crisp on retina displays.
function makeClaimedSealImage(size = 64) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const c = size / 2
  const halo = ctx.createRadialGradient(c, c, size * 0.26, c, c, c)
  halo.addColorStop(0, 'rgba(200,148,58,0.35)')
  halo.addColorStop(1, 'rgba(200,148,58,0)')
  ctx.fillStyle = halo
  ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(c, c, size * 0.3, 0, Math.PI * 2)
  ctx.fillStyle = PREMIUM_COLOR; ctx.fill()
  ctx.lineWidth = size * 0.055
  ctx.strokeStyle = '#ffffff'; ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(c - size * 0.13, c + size * 0.01)
  ctx.lineTo(c - size * 0.03, c + size * 0.11)
  ctx.lineTo(c + size * 0.15, c - size * 0.1)
  ctx.lineWidth = size * 0.075
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.stroke()
  return ctx.getImageData(0, 0, size, size)
}

// `props` is either listingToProps() output or mapbox feature.properties —
// the latter stringifies values, hence the 'null'/'true' string checks.
// (Embedded mode only — the fullscreen map renders <MapPreviewCard/> instead.)
function buildPopupHTML(props, { isCurrent = false, strings = {} } = {}) {
  const s = {
    featured: 'Featured', youAreHere: 'You are here', viewListing: 'View listing',
    kmAwayShort: '<1 km away', kmAway: (n) => `${n} km away`,
    ...strings,
  }
  const desc = props.description && props.description !== 'null'
    ? (props.description.length > 120 ? props.description.slice(0, 120).trimEnd() + '…' : props.description)
    : ''
  const featuredBadge = props.featured === true || props.featured === 'true'
    ? `<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(200,148,58,0.12);border:1px solid rgba(200,148,58,0.3);padding:2px 7px;border-radius:2px;font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${PREMIUM_COLOR};">★ ${esc(s.featured)}</span>`
    : ''
  const subLabel = props.subTypeLabel && props.subTypeLabel !== 'null'
    ? `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(95,138,126,0.08);border:1px solid rgba(95,138,126,0.2);padding:3px 9px;border-radius:2px;"><span style="font-size:9px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6b6560;">${esc(props.subTypeLabel)}</span></span>`
    : ''

  // Thumbnail — only from a whitelisted image host (listingToProps already
  // applied isApprovedImageSource; the 'null' guard catches stringified props).
  const imgHtml = props.image && props.image !== 'null'
    ? `<div style="width:100%;height:118px;border-radius:3px;overflow:hidden;margin-bottom:9px;background:#efe9e1;"><img src="${esc(props.image)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;"/></div>`
    : ''

  // Distance from the viewed place — shown for neighbours, never for the
  // current listing (its distance is 0).
  const distNum = props.distance != null && props.distance !== '' && props.distance !== 'null'
    ? parseFloat(props.distance) : NaN
  const distText = !isCurrent && !Number.isNaN(distNum) && distNum > 0
    ? (distNum < 1 ? s.kmAwayShort : s.kmAway(distNum < 10 ? distNum.toFixed(1) : Math.round(distNum)))
    : ''

  // The pin for the current listing (embedded mode) shows a "You are here"
  // badge instead of a self-linking "View listing →" button — clicking the
  // page you're already on would be a dead end.
  const ctaHtml = isCurrent
    ? `<div style="display:block;margin-top:10px;padding:7px 0;text-align:center;background:rgba(95,138,126,0.10);color:${PRIMARY};font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;border-radius:2px;border:1px dashed rgba(95,138,126,0.35);">${esc(s.youAreHere)}</div>`
    : `<a href="${esc(props.url)}" style="display:block;margin-top:10px;padding:7px 0;text-align:center;background:${PRIMARY};color:#fff;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;border-radius:2px;">${esc(s.viewListing)} →</a>`

  const locLine = [esc(props.location), distText ? `<span style="color:${PRIMARY};font-weight:600;">${distText}</span>` : '']
    .filter(Boolean).join(' · ')

  return (
    `<div style="font-family:system-ui,-apple-system,sans-serif;padding:4px 2px;max-width:260px;">
      ${imgHtml}
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
        <span style="display:inline-flex;align-items:center;gap:5px;background:${props.color}18;border:1px solid ${props.color}33;padding:3px 9px;border-radius:2px;">
          <span style="width:5px;height:5px;border-radius:50%;background:${props.color};display:inline-block;"></span>
          <span style="font-size:9px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${props.color};">${esc(props.verticalLabel)}</span>
        </span>${subLabel}${featuredBadge}
      </div>
      <div style="font-family:Georgia,serif;font-size:17px;font-weight:400;color:#1a1614;margin-bottom:3px;letter-spacing:-0.01em;line-height:1.2;">${esc(props.name)}</div>
      <div style="font-size:11px;color:#9a8878;margin-bottom:${desc ? 8 : 10}px;">${locLine}</div>
      ${desc ? `<div style="font-size:12px;color:#5a4e45;line-height:1.5;margin-bottom:10px;">${esc(desc)}</div>` : ''}
      ${ctaHtml}
    </div>`
  )
}

function buildGeoJSON(listings) {
  return {
    type: 'FeatureCollection',
    features: listings.filter(l => l.lat && l.lng && !l.address_on_request).map(l => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: displayCoords(l) },
      properties: listingToProps(l),
    })),
  }
}
