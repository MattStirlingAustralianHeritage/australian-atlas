/**
 * Extract a location constraint from a natural-language search query so it can
 * be enforced as a hard filter rather than left to fuzzy semantic matching.
 *
 * Returns { state, suburb, cleaned, matched }:
 *   - state:   AU state code (e.g. 'SA') or null
 *   - suburb:  a specific suburb name (e.g. 'Richmond') when the matched place is
 *              a suburb, else null — lets the caller filter at SUBURB granularity
 *              ("Brewery in Richmond" → Richmond venues, not all of VIC)
 *   - cleaned: the query with the matched location phrase (+ a leading
 *              preposition) removed, so the semantic/lexical arms focus on the vibe
 *   - matched: the phrase that matched, or null
 *
 * Cities/regions resolve to STATE level (Adelaide → all SA, incl. the Hills/
 * Barossa). Suburbs resolve to SUBURB level + their state. Region NAMES we hold
 * data for are handled upstream by resolveQueryRegion (region-level).
 */

// State names + abbreviations -> code
const STATE_TOKENS = {
  'australian capital territory': 'ACT',
  'new south wales': 'NSW',
  'northern territory': 'NT',
  'south australia': 'SA',
  'western australia': 'WA',
  'tasmania': 'TAS',
  'queensland': 'QLD',
  'victoria': 'VIC',
  'tassie': 'TAS',
  nsw: 'NSW', qld: 'QLD', vic: 'VIC', tas: 'TAS', act: 'ACT', nt: 'NT', sa: 'SA', wa: 'WA',
}

// City / region phrase -> state code (STATE-level: include the whole state).
const PLACE_STATE = {
  // SA
  'adelaide hills': 'SA', adelaide: 'SA', 'barossa valley': 'SA', barossa: 'SA',
  'mclaren vale': 'SA', 'clare valley': 'SA', coonawarra: 'SA', 'kangaroo island': 'SA',
  hahndorf: 'SA', fleurieu: 'SA',
  // VIC
  melbourne: 'VIC', 'yarra valley': 'VIC', 'mornington peninsula': 'VIC', mornington: 'VIC',
  geelong: 'VIC', ballarat: 'VIC', bendigo: 'VIC', daylesford: 'VIC', 'macedon ranges': 'VIC',
  macedon: 'VIC', grampians: 'VIC', gippsland: 'VIC', bellarine: 'VIC', 'surf coast': 'VIC',
  'great ocean road': 'VIC', 'dandenong ranges': 'VIC', 'king valley': 'VIC', 'high country': 'VIC',
  // NSW
  sydney: 'NSW', 'hunter valley': 'NSW', hunter: 'NSW', 'byron bay': 'NSW', byron: 'NSW',
  'blue mountains': 'NSW', newcastle: 'NSW', 'southern highlands': 'NSW', 'central coast': 'NSW',
  orange: 'NSW', mudgee: 'NSW', riverina: 'NSW',
  // QLD
  brisbane: 'QLD', 'gold coast': 'QLD', 'sunshine coast': 'QLD', noosa: 'QLD', cairns: 'QLD',
  'scenic rim': 'QLD', 'granite belt': 'QLD', whitsundays: 'QLD',
  // WA
  perth: 'WA', 'margaret river': 'WA', 'swan valley': 'WA',
  // TAS
  hobart: 'TAS', launceston: 'TAS', freycinet: 'TAS', tamar: 'TAS',
  // NT / ACT
  darwin: 'NT', 'alice springs': 'NT', uluru: 'NT', canberra: 'ACT',
}

// Well-known, high-venue metro suburbs -> state (SUBURB-level granularity). The
// state is a curated judgment of the dominant-venue instance, NOT a row count:
// e.g. Richmond TAS has ~as many rows as Richmond VIC, but "brewery in Richmond"
// means Melbourne's Richmond. Genuinely coin-flip names (Paddington NSW/QLD,
// Brighton VIC/SA/QLD) are omitted rather than guessed.
const SUBURB_STATE = {
  // Melbourne (VIC)
  fitzroy: 'VIC', collingwood: 'VIC', carlton: 'VIC', brunswick: 'VIC', richmond: 'VIC',
  'st kilda': 'VIC', prahran: 'VIC', northcote: 'VIC', footscray: 'VIC', abbotsford: 'VIC',
  'fitzroy north': 'VIC', 'brunswick east': 'VIC', windsor: 'VIC', thornbury: 'VIC',
  yarraville: 'VIC', kensington: 'VIC', 'port melbourne': 'VIC', 'south melbourne': 'VIC',
  cremorne: 'VIC', hawthorn: 'VIC', kew: 'VIC', elwood: 'VIC', fairfield: 'VIC',
  preston: 'VIC', coburg: 'VIC', williamstown: 'VIC', 'fitzroy n': 'VIC',
  // Sydney (NSW)
  'surry hills': 'NSW', newtown: 'NSW', marrickville: 'NSW', bondi: 'NSW', redfern: 'NSW',
  chippendale: 'NSW', glebe: 'NSW', manly: 'NSW', enmore: 'NSW', alexandria: 'NSW',
  darlinghurst: 'NSW', 'potts point': 'NSW', rozelle: 'NSW', balmain: 'NSW', leichhardt: 'NSW',
  erskineville: 'NSW', cronulla: 'NSW', mosman: 'NSW',
  // Brisbane (QLD)
  'fortitude valley': 'QLD', 'new farm': 'QLD', woolloongabba: 'QLD', teneriffe: 'QLD',
  milton: 'QLD', newstead: 'QLD', bulimba: 'QLD',
  // Perth (WA)
  leederville: 'WA', 'mount lawley': 'WA', subiaco: 'WA', fremantle: 'WA',
  'north fremantle': 'WA', 'victoria park': 'WA', scarborough: 'WA', cottesloe: 'WA',
  // Adelaide (SA)
  norwood: 'SA', unley: 'SA', glenelg: 'SA', prospect: 'SA', hindmarsh: 'SA',
  semaphore: 'SA', 'port adelaide': 'SA', goodwood: 'SA',
  // Hobart (TAS)
  salamanca: 'TAS', 'battery point': 'TAS', 'sandy bay': 'TAS', 'north hobart': 'TAS',
}

// Every place token we recognise (for resolvers that must NOT treat a city/region
// or state word as a suburb).
export const KNOWN_PLACES = new Set([
  ...Object.keys(PLACE_STATE), ...Object.keys(STATE_TOKENS),
])

// type-tagged, longest phrase first so multi-word phrases beat shorter ones.
const ENTRIES = [
  ...Object.entries(PLACE_STATE).map(([p, s]) => [p, s, 'place']),
  ...Object.entries(SUBURB_STATE).map(([p, s]) => [p, s, 'suburb']),
  ...Object.entries(STATE_TOKENS).map(([p, s]) => [p, s, 'state']),
].sort((a, b) => b[0].length - a[0].length)

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase())

export function parseQueryLocation(rawQuery) {
  const raw = String(rawQuery || '')
  const padded = ' ' + raw.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' '

  for (const [phrase, code, type] of ENTRIES) {
    if (padded.includes(' ' + phrase + ' ')) {
      const esc = phrase.replace(/\s+/g, '\\s+')
      const cleaned = raw
        .replace(new RegExp(`\\b(?:in|near|around|at|of|the)\\s+${esc}\\b`, 'ig'), ' ')
        .replace(new RegExp(`\\b${esc}\\b`, 'ig'), ' ')
        .replace(/\s+/g, ' ')
        .trim()
      return {
        state: code,
        suburb: type === 'suburb' ? titleCase(phrase) : null,
        cleaned: cleaned || raw,
        matched: phrase,
      }
    }
  }
  return { state: null, suburb: null, cleaned: raw, matched: null }
}
