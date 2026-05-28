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

  for (const segment of segments) {
    const stripped = segment.replace(/\s+\d{4}$/, '').trim()
    for (const [fullName, code] of Object.entries(FULL_NAME_TO_CODE)) {
      if (stripped === fullName) return code
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
