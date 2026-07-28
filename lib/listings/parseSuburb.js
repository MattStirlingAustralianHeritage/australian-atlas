/**
 * Derive a suburb / locality from a free-text Australian street address.
 *
 * Used to backfill `listings.suburb` for rows that arrived from verticals
 * without one, so the place page can render "Brisbane, Banyo, Queensland"
 * instead of just "Brisbane, Queensland".
 *
 * This is deliberately conservative: a wrong suburb is worse than no suburb,
 * so anything ambiguous returns null and the location line simply falls back
 * to region + state. It never invents data — the locality must already be
 * present in the address string, which is itself displayed on the page.
 */

const STATE_CODES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']
const STATE_RE = new RegExp(`\\b(${STATE_CODES.join('|')})\\b`, 'i')
const POSTCODE_RE = /\b\d{4}\b/

const FULL_STATE_NAMES = {
  'australian capital territory': 'ACT',
  'new south wales': 'NSW',
  'northern territory': 'NT',
  queensland: 'QLD',
  'south australia': 'SA',
  tasmania: 'TAS',
  victoria: 'VIC',
  'western australia': 'WA',
}
const FULL_STATE_ALT = Object.keys(FULL_STATE_NAMES).join('|')
const FULL_STATE_RE = new RegExp(`\\b(${FULL_STATE_ALT})\\b`, 'i')
// Only ever stripped from the END of a segment. A leading/mid "Victoria" is far
// more likely part of a locality ("Victoria Park WA") than a state.
const FULL_STATE_TAIL_RE = new RegExp(`[,\\s]+(${FULL_STATE_ALT})\\s*$`, 'i')

// Street-type suffixes. A candidate ending in one of these is a street, not a
// locality — "Lot 3 Nildottie Road" must not become suburb "Nildottie Road".
const STREET_SUFFIXES = new Set([
  'rd', 'road', 'st', 'street', 'ave', 'av', 'avenue', 'hwy', 'highway',
  'dr', 'drive', 'ln', 'lane', 'ct', 'court', 'pde', 'parade', 'cres',
  'crescent', 'tce', 'terrace', 'way', 'blvd', 'boulevard', 'cct', 'circuit',
  'cl', 'close', 'pl', 'place', 'esp', 'esplanade', 'sq',
  'square', 'track', 'trail', 'walk', 'bypass', 'freeway', 'fwy', 'mwy',
  'motorway', 'arcade', 'mall', 'row', 'ridge', 'loop', 'link',
])
// 'grove' and 'rise' are deliberately absent: they end genuine localities
// (Forest Grove WA, Grove TAS). A numbered street is already rejected by the
// digit check, so the loss of coverage outweighs the risk here.

// Unambiguous street words. Unlike the suffix set above these are rejected
// ANYWHERE in the candidate, because a locality never contains one as a whole
// word: "Channel Highway Margate" and "Creek Road Westfield Carindale" are
// street lines that happen to trail a suburb. Ambiguous tokens (way, grove,
// place, walk…) stay out of this set — real localities use them.
const HARD_STREET_TOKENS = new Set([
  'rd', 'road', 'street', 'ave', 'avenue', 'hwy', 'highway', 'drive',
  'lane', 'court', 'pde', 'parade', 'crescent', 'terrace', 'boulevard',
  'circuit', 'esplanade', 'motorway', 'freeway', 'fwy',
])

// Commercial nouns that mark a segment as a venue/premises name rather than a
// locality ("Elizabeth's Bookshop Warehouse"). Deliberately narrow — words
// that also appear in genuine suburb names (farm, house, estate, park, bay)
// are excluded, or "New Farm" would be thrown away.
const PREMISES_TOKENS = new Set([
  'bookshop', 'warehouse', 'hypermarket', 'shopping', 'factory', 'showroom',
  'carpark', 'trailhead', 'visitor', 'tenancy', 'westfield', 'showgrounds',
])

// Reserves are not suburbs. A walk in Kakadu has no locality worth showing —
// "Kakadu, Kakadu National Park, Northern Territory" stutters and tells the
// reader nothing. These parse cleanly but are rejected on purpose.
const RESERVE_RE = /\b(national park|state forest|conservation park|conservation area|nature reserve|regional park|marine park|state park)\b/i

/**
 * Is this name a reserve rather than a locality? Exported for the reverse-
 * geocode backfill, which gets authoritative locality names from Mapbox and so
 * must NOT apply the street/premises heuristics above — those exist to sift
 * free-text addresses and would throw away real suburbs like Lane Cove or
 * Petrie Terrace. The reserve rule is the only one that still applies.
 */
export function isReserveName(value) {
  return RESERVE_RE.test(String(value || ''))
}

// Unit/level/shop prefixes — segments that are address detail, never a suburb.
const DETAIL_RE = /^(unit|shop|suite|level|lot|building|bldg|floor|apt|apartment|tenancy|kiosk|stall|gate|po box|locked bag|c\/-)\b/i

// Segments that carry no locality information at all — country names, and the
// states themselves in either abbreviated or full form.
const NOISE = new Set([
  'australia', 'aus', 'au',
  ...STATE_CODES.map(s => s.toLowerCase()),
  'australian capital territory', 'new south wales', 'northern territory',
  'queensland', 'south australia', 'tasmania', 'victoria', 'western australia',
])

function tidy(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

/**
 * Title-case a locality. An apostrophe does not start a new word in general
 * ("Elizabeth's", not "Elizabeth'S") — except after a single leading letter,
 * which is the Irish-prefix shape Australian place names use: O'Connor,
 * D'Aguilar.
 */
function titleCase(value) {
  return value
    .toLowerCase()
    .replace(/(^|[\s\-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase())
    .replace(/\b([a-z])(['’])([a-z])/gi, (_, a, apos, b) => a.toUpperCase() + apos + b.toUpperCase())
}

/**
 * Is this string a plausible Australian locality name?
 * 1–4 words, letters only (plus apostrophes / hyphens / periods), not a street,
 * not an address detail line.
 */
export function isPlausibleLocality(candidate) {
  const c = tidy(candidate)
  if (c.length < 3 || c.length > 40) return false
  if (DETAIL_RE.test(c)) return false
  if (RESERVE_RE.test(c)) return false
  if (/\d/.test(c)) return false
  if (!/^[A-Za-z][A-Za-z'’.\- ]*$/.test(c)) return false

  const words = c.split(' ').filter(Boolean)
  if (words.length < 1 || words.length > 4) return false
  if (NOISE.has(c.toLowerCase())) return false

  const bare = w => w.toLowerCase().replace(/[.'’]/g, '')
  if (STREET_SUFFIXES.has(bare(words[words.length - 1]))) return false
  if (words.some(w => HARD_STREET_TOKENS.has(bare(w)))) return false
  if (words.some(w => PREMISES_TOKENS.has(bare(w)))) return false

  return true
}

/**
 * Strip the postcode and state out of a segment, returning what's left.
 * "Banyo QLD 4014" → { locality: 'Banyo', state: 'QLD' }
 * "Parkes Australian Capital Territory 2600" → { locality: 'Parkes', state: 'ACT' }
 *
 * Order matters: the postcode goes first so a trailing full state name is
 * actually at the end of the string when we look for it.
 */
function splitStateSegment(segment) {
  let s = tidy(String(segment).replace(POSTCODE_RE, ' '))
  let state = null

  const full = s.match(FULL_STATE_TAIL_RE)
  if (full) {
    state = FULL_STATE_NAMES[full[1].toLowerCase()]
    s = s.slice(0, full.index)
  }

  const code = s.match(STATE_RE)
  if (code) {
    state = state || code[1].toUpperCase()
    s = s.replace(STATE_RE, ' ')
  }

  return { locality: tidy(s), state }
}

/**
 * @param {string|null} address    Free-text address.
 * @param {string|null} [expectedState] Listing's state code. When both this and
 *   a state parsed from the address are present and disagree, the parse is
 *   rejected — a cross-state address means the row has a bigger problem than a
 *   missing suburb.
 * @returns {{ suburb: string, confidence: 'state_anchored'|'tail_segment' }|null}
 */
export function parseSuburbFromAddress(address, expectedState = null) {
  const raw = tidy(address)
  if (!raw) return null

  const segments = raw
    .split(',')
    .map(tidy)
    .filter(s => s && !NOISE.has(s.toLowerCase()))

  if (!segments.length) return null

  // ── Preferred: the segment carrying the state / postcode also carries the
  // locality ("…, Banyo QLD 4014"). Scan from the end — the tail is the
  // authoritative one when an address repeats a state (a known data tail).
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]
    if (!STATE_RE.test(seg) && !FULL_STATE_RE.test(seg) && !POSTCODE_RE.test(seg)) continue

    const { locality, state } = splitStateSegment(seg)
    if (expectedState && state && state !== String(expectedState).toUpperCase()) return null

    // The state segment carried a locality — accept it, or reject the whole
    // parse. Falling back to an earlier segment here would mean overriding a
    // locality we deliberately rejected ("…, Kalbarri National Park WA 6536"
    // must not become the street line before it).
    if (locality) {
      return isPlausibleLocality(locality)
        ? { suburb: titleCase(locality), confidence: 'state_anchored' }
        : null
    }

    // The state segment held no locality of its own ("…, NSW 2015"). Walk back
    // over any further bare state / postcode segments — addresses in this
    // corpus can end "…, Marrickville, NSW, 2203, NSW" — and take the first
    // plausible locality behind them.
    for (let j = i - 1; j >= 0; j--) {
      const prev = segments[j]
      if (isPlausibleLocality(prev)) {
        return { suburb: titleCase(prev), confidence: 'state_anchored' }
      }
      const bareStateOrPostcode =
        /^\d{4}$/.test(prev) ||
        ((STATE_RE.test(prev) || FULL_STATE_RE.test(prev)) && !splitStateSegment(prev).locality)
      if (!bareStateOrPostcode) break
    }
    return null
  }

  // ── Fallback: no state or postcode anywhere. Only trust a multi-segment
  // address, where the final segment is a plain locality ("199 Lighthouse
  // Road, Byron Bay"). A single-segment address is just a street.
  if (segments.length >= 2) {
    const tail = segments[segments.length - 1]
    if (isPlausibleLocality(tail)) {
      return { suburb: titleCase(tail), confidence: 'tail_segment' }
    }
  }

  return null
}
