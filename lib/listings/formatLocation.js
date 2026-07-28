/**
 * Human-readable place location line: "Brisbane, Banyo, Queensland".
 *
 * The venue's region is the headline (it's what the network navigates by),
 * the suburb narrows it inside a city or town, and the state is spelled out
 * in full. Previously this was just "Brisbane, QLD", which told a reader
 * nothing about where in Brisbane the venue actually sits.
 *
 * The suburb is dropped when it adds nothing — a regional venue whose suburb
 * IS the region ("Williamstown" in region "Williamstown"), or a suburb the
 * region name already contains ("Alice Springs" in "Alice Springs & Red
 * Centre"). Those read as a stutter, not a refinement.
 */

const STATE_NAMES = {
  ACT: 'Australian Capital Territory',
  NSW: 'New South Wales',
  NT: 'Northern Territory',
  QLD: 'Queensland',
  SA: 'South Australia',
  TAS: 'Tasmania',
  VIC: 'Victoria',
  WA: 'Western Australia',
}

/** Strip punctuation/case so "St Kilda" and "St. Kilda" compare equal. */
function norm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Places data sometimes yields shouty localities ("BANYO"). Title-case those;
 * leave anything already mixed-case alone so "McLaren Vale" survives intact.
 */
function tidySuburb(suburb) {
  const s = String(suburb || '').trim()
  if (!s || s !== s.toUpperCase()) return s
  return s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())
}

/**
 * True when the suburb is already carried by the region name — either an exact
 * match, or one of the region's `&`/`and`/`/`-separated parts.
 */
export function suburbIsRedundant(suburb, region) {
  const s = norm(suburb)
  const r = norm(region)
  if (!s || !r) return false
  if (s === r) return true
  return String(region)
    .split(/\s*(?:&|\/|,|\band\b)\s*/i)
    .some(part => norm(part) === s)
}

/**
 * Expand a state code to its full name. Unknown values (or already-full names)
 * pass through untouched rather than being dropped.
 */
export function expandState(state) {
  const code = String(state || '').trim().toUpperCase()
  return STATE_NAMES[code] || (state ? String(state).trim() : '')
}

/**
 * Compose the location line.
 * @param {object} input
 * @param {string|null} [input.region] Canonical region name.
 * @param {string|null} [input.suburb] Suburb / locality.
 * @param {string|null} [input.state]  State code ('QLD') or full name.
 * @param {boolean} [input.fullState=true] Spell the state out in full.
 * @returns {string} e.g. "Brisbane, Banyo, Queensland" — '' when nothing is known.
 */
export function formatPlaceLocation({ region, suburb, state, fullState = true } = {}) {
  const cleanSuburb = tidySuburb(suburb)
  const parts = [
    region || null,
    cleanSuburb && !suburbIsRedundant(cleanSuburb, region) ? cleanSuburb : null,
    fullState ? expandState(state) : (state || null),
  ]
  return parts.filter(Boolean).join(', ')
}
