const VALID_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

const FULL_NAME_TO_CODE = {
  'Australian Capital Territory': 'ACT',
  'New South Wales': 'NSW',
  'Northern Territory': 'NT',
  'Queensland': 'QLD',
  'South Australia': 'SA',
  'Tasmania': 'TAS',
  'Victoria': 'VIC',
  'Western Australia': 'WA',
}

const ABBREV_REGEX = /\b(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\b/

/**
 * Extract an Australian state code from a Mapbox place_name string.
 * Splits on comma-delimited segments and matches full state names
 * (with postcode stripped) to avoid false positives like "Victoria
 * Park" → VIC. Falls back to word-boundary abbreviation match.
 * @param {string|null|undefined} placeName
 * @returns {'ACT'|'NSW'|'NT'|'QLD'|'SA'|'TAS'|'VIC'|'WA'|null}
 */
export function extractStateFromPlaceName(placeName) {
  if (!placeName || typeof placeName !== 'string') return null

  const segments = placeName.split(', ')

  // Mapbox packs "{suburb} {State Full Name} {postcode}" into a single
  // comma-segment (e.g. "New Berrima New South Wales 2577"), so an exact
  // equality check almost never fires on real results. Match the full state
  // name as a trailing token — the state is always the last word(s) before the
  // postcode. Safe against "Victoria Park" (ends with "Park", not " Victoria").
  for (const segment of segments) {
    const stripped = segment.replace(/\s+\d{4}$/, '').trim()
    for (const [fullName, code] of Object.entries(FULL_NAME_TO_CODE)) {
      if (stripped === fullName || stripped.endsWith(` ${fullName}`)) return code
    }
  }

  for (const segment of segments) {
    const stripped = segment.replace(/\s+\d{4}$/, '').trim()
    if (VALID_STATES.includes(stripped)) return stripped
  }

  const abbrMatch = placeName.match(ABBREV_REGEX)
  if (abbrMatch) return abbrMatch[1]

  return null
}

// Australian postcode → state allocation. Postcodes are allocated by state, so
// they are an UNAMBIGUOUS state signal — more reliable than a free-text state
// token (which a data source can get wrong, e.g. tagging a Robinvale VIC venue
// "NSW"). Ranges mirror Australia Post allocation.
const POSTCODE_RANGES = [
  { state: 'NSW', ranges: [[1000, 2599], [2619, 2899], [2921, 2999]] },
  { state: 'VIC', ranges: [[3000, 3999], [8000, 8999]] },
  { state: 'QLD', ranges: [[4000, 4999], [9000, 9999]] },
  { state: 'SA',  ranges: [[5000, 5799], [5800, 5999]] },
  { state: 'WA',  ranges: [[6000, 6797], [6800, 6999]] },
  { state: 'TAS', ranges: [[7000, 7999]] },
  { state: 'NT',  ranges: [[800, 899], [900, 999]] },
  { state: 'ACT', ranges: [[200, 299], [2600, 2618], [2900, 2920]] },
]

/**
 * Map an Australian postcode to its state code. Postcode allocation is by
 * state, so this is unambiguous (unlike bounding boxes, which overlap at
 * borders).
 * @param {string|number|null|undefined} postcode
 * @returns {'ACT'|'NSW'|'NT'|'QLD'|'SA'|'TAS'|'VIC'|'WA'|null}
 */
export function stateFromPostcode(postcode) {
  const num = typeof postcode === 'number' ? postcode : parseInt(postcode, 10)
  if (!Number.isFinite(num)) return null
  for (const { state, ranges } of POSTCODE_RANGES) {
    for (const [min, max] of ranges) {
      if (num >= min && num <= max) return state
    }
  }
  return null
}

// Pull a 4-digit Australian postcode out of a free-text address. Prefers a
// postcode that trails a state token ("... VIC 3549"), then a trailing 4-digit
// group, then an NT-style leading-zero postcode ("0822").
function extractPostcode(address) {
  if (!address || typeof address !== 'string') return null
  const stateMatch = address.match(/\b(?:ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\s*(\d{4})\b/i)
  if (stateMatch) return stateMatch[1]
  const trailing = address.match(/\b(\d{4})\b\s*(?:,?\s*Australia)?\s*$/i)
  if (trailing) return trailing[1]
  const nt = address.match(/\b(0\d{3})\b/)
  if (nt) return nt[1]
  return null
}

/**
 * Derive the state from a free-text street address. The address the reviewer
 * sees and edits is the authoritative signal — prefer its postcode (unambiguous)
 * over any explicit state token, and fall back to the token only when there's no
 * postcode. Returns null when the address carries neither.
 * @param {string|null|undefined} address
 * @returns {'ACT'|'NSW'|'NT'|'QLD'|'SA'|'TAS'|'VIC'|'WA'|null}
 */
export function stateFromAddress(address) {
  if (!address || typeof address !== 'string') return null
  const byPostcode = stateFromPostcode(extractPostcode(address))
  if (byPostcode) return byPostcode
  return extractStateFromPlaceName(address)
}

// Bounding boxes for Australian states/territories. ACT is checked
// first because it's fully enclosed inside NSW. These are generous
// bounding boxes, not polygons — accuracy is ~98% inland, lower near
// state borders. For border venues, reviewer override is authoritative.
const STATE_BOXES = [
  { code: 'ACT', lngMin: 148.76, lngMax: 149.40, latMin: -35.92, latMax: -35.12 },
  { code: 'TAS', lngMin: 143.82, lngMax: 148.50, latMin: -43.65, latMax: -39.57 },
  { code: 'WA',  lngMin: 112.92, lngMax: 129.00, latMin: -35.14, latMax: -13.69 },
  { code: 'NT',  lngMin: 129.00, lngMax: 138.00, latMin: -26.00, latMax: -10.90 },
  { code: 'SA',  lngMin: 129.00, lngMax: 141.00, latMin: -38.06, latMax: -25.99 },
  { code: 'QLD', lngMin: 138.00, lngMax: 153.70, latMin: -29.20, latMax: -10.60 },
  { code: 'VIC', lngMin: 140.96, lngMax: 150.04, latMin: -39.16, latMax: -33.98 },
  { code: 'NSW', lngMin: 140.99, lngMax: 153.64, latMin: -37.51, latMax: -28.16 },
]

/**
 * Derive an Australian state code from lat/lng coordinates using
 * bounding-box containment. Returns the first matching state, or null
 * if the point falls in an overlap zone that matches multiple boxes
 * (ambiguous) or no box at all.
 * @param {number|null} lat
 * @param {number|null} lng
 * @returns {'ACT'|'NSW'|'NT'|'QLD'|'SA'|'TAS'|'VIC'|'WA'|null}
 */
export function deriveStateFromCoords(lat, lng) {
  if (lat == null || lng == null) return null
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const matches = []
  for (const box of STATE_BOXES) {
    if (lat >= box.latMin && lat <= box.latMax && lng >= box.lngMin && lng <= box.lngMax) {
      matches.push(box.code)
    }
  }

  if (matches.length === 1) return matches[0]

  // ACT is fully enclosed inside NSW (and its box overlaps VIC's
  // northern extent). If ACT is among the matches it always wins —
  // the ACT box is small and precise enough to be definitive.
  if (matches.includes('ACT')) return 'ACT'

  // Any other overlap is ambiguous — return null rather than guessing.
  return null
}

export { VALID_STATES }
