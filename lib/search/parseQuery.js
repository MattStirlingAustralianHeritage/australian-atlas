/**
 * Extract a location constraint from a natural-language search query so it can
 * be enforced as a hard filter (filter_state) rather than left to fuzzy semantic
 * matching. Without this, "dog friendly brewery in Adelaide" ranks dog-friendly
 * breweries (and name-likeness hits such as "Moon Dog World", Preston VIC)
 * nationwide; the city/region is just another token in the embedding.
 *
 * Returns { state, cleaned, matched }:
 *   - state:   AU state code (e.g. 'SA') or null
 *   - cleaned: the query with the matched location phrase (+ a leading
 *              preposition) removed, so the semantic/lexical arms focus on the
 *              vibe; falls back to the original if removal would empty it
 *   - matched: the phrase that matched, or null
 *
 * State-level is deliberate: a city like "Adelaide" should include the whole
 * state's relevant venues (Adelaide Hills, Barossa, …), not over-narrow — the
 * reported bug is cross-STATE leakage. Intra-state ranking is left to the vibe.
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

// City / region phrase -> state code
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
  perth: 'WA', fremantle: 'WA', 'margaret river': 'WA', 'swan valley': 'WA',
  // TAS
  hobart: 'TAS', launceston: 'TAS', freycinet: 'TAS', tamar: 'TAS',
  // NT / ACT
  darwin: 'NT', 'alice springs': 'NT', uluru: 'NT', canberra: 'ACT',
}

// Well-known, dominant-venue metro suburbs -> state. Curated to avoid genuinely
// ambiguous names (e.g. Paddington NSW/QLD, Northbridge NSW/WA, West End QLD are
// omitted); each entry's famous instance is unambiguous for venue search.
const SUBURB_STATE = {
  // Melbourne (VIC)
  fitzroy: 'VIC', collingwood: 'VIC', carlton: 'VIC', brunswick: 'VIC', richmond: 'VIC',
  'st kilda': 'VIC', prahran: 'VIC', northcote: 'VIC', footscray: 'VIC', abbotsford: 'VIC',
  'fitzroy north': 'VIC', 'brunswick east': 'VIC', windsor: 'VIC',
  // Sydney (NSW)
  'surry hills': 'NSW', newtown: 'NSW', marrickville: 'NSW', bondi: 'NSW', redfern: 'NSW',
  chippendale: 'NSW', glebe: 'NSW', manly: 'NSW', enmore: 'NSW', alexandria: 'NSW',
  // Brisbane (QLD)
  'fortitude valley': 'QLD', 'new farm': 'QLD', woolloongabba: 'QLD', teneriffe: 'QLD',
  // Perth (WA)
  leederville: 'WA', 'mount lawley': 'WA', subiaco: 'WA',
  // Adelaide (SA)
  norwood: 'SA', unley: 'SA', glenelg: 'SA', prospect: 'SA',
}

// Longest phrases first so multi-word phrases ("adelaide hills", "new south
// wales", "surry hills", "fortitude valley") beat shorter ones ("adelaide",
// "wa", "hills", "valley").
const ENTRIES = [...Object.entries(PLACE_STATE), ...Object.entries(SUBURB_STATE), ...Object.entries(STATE_TOKENS)]
  .sort((a, b) => b[0].length - a[0].length)

export function parseQueryLocation(rawQuery) {
  const raw = String(rawQuery || '')
  // Normalise to spaced, punctuation-free, padded so whole-word matching is exact.
  const padded = ' ' + raw.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' '

  for (const [phrase, code] of ENTRIES) {
    if (padded.includes(' ' + phrase + ' ')) {
      const cleaned = raw
        .replace(new RegExp(`\\b(?:in|near|around|at|of|the)\\s+${phrase.replace(/\s+/g, '\\s+')}\\b`, 'ig'), ' ')
        .replace(new RegExp(`\\b${phrase.replace(/\s+/g, '\\s+')}\\b`, 'ig'), ' ')
        .replace(/\s+/g, ' ')
        .trim()
      return { state: code, cleaned: cleaned || raw, matched: phrase }
    }
  }
  return { state: null, cleaned: raw, matched: null }
}
