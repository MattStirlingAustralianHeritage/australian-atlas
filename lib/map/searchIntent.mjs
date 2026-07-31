// ─────────────────────────────────────────────────────────────────
// Plain-language understanding for the map's unified search field.
//
// Extracted from MapClient so the query pipeline is unit-testable —
// the "accommodation in Castlemaine" incident (Enter jumped to
// Castlemaine Vintage Bazaar, a market, and wiped the filter) lived
// entirely in untested inline logic. Everything here is pure: no
// mapbox, no React, no imports from app code. MapClient injects
// SUB_TYPE_LABELS through createQueryEngine so node --test can run
// this file without dragging in ESM-in-.js app modules.
// ─────────────────────────────────────────────────────────────────

// Intent words that don't literally appear in a listing's category labels —
// "whisky" should light up distilleries even when the description doesn't
// say so. Keys and values are matched against the same haystack.
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

// Full state names → folded into each listing's search haystack so a query
// like "accommodation in Victoria" matches on the state (listings only store
// the "VIC" code). Both name and code stay searchable.
export const STATE_FULL = {
  NSW: 'new south wales', VIC: 'victoria', QLD: 'queensland', SA: 'south australia',
  WA: 'western australia', TAS: 'tasmania', ACT: 'australian capital territory', NT: 'northern territory',
}

// Filler words that carry no filtering intent. Stripped before matching so
// "places to sleep in Ballarat" reduces to the words that matter (sleep +
// Ballarat) instead of demanding every listing literally contain "places".
export const STOPWORDS = new Set([
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
export const VERTICAL_INTENT = {
  // Rest — the "places to stay" vertical
  accommodation: 'rest', accom: 'rest', accomodation: 'rest', accommodations: 'rest',
  sleep: 'rest', sleeping: 'rest', stay: 'rest', stays: 'rest', staying: 'rest',
  lodging: 'rest', overnight: 'rest',
  // Table — the food/eat vertical
  eat: 'table', eating: 'table', eatery: 'table', eateries: 'table', food: 'table',
  dining: 'table', dine: 'table',
}

// ── Cuisine / attribute HARD terms ──
// The semantic pipeline fuzzes a cuisine word into "the neighbouring cuisines":
// "Korean restaurant" pulled in Japanese ramen bars. A cuisine, nationality or
// dietary/religious attribute is NOT interchangeable — it must appear LITERALLY
// in the venue's own text (name/description) to count. This gates the semantic
// pool (the local matcher already requires every token). It stays accurate as
// listings are added because it reads each venue's text, never a fixed list.
export const HARD_TERMS = new Set([
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

// Geocoder feature types that name a locality a person would say they're
// visiting — the "fly the map there" kinds, as opposed to a poi/address.
export const PLACEISH_TYPES = new Set(['place', 'locality', 'neighborhood', 'district', 'postcode', 'region'])

export const tokenizeQuery = (q) => String(q || '').toLowerCase().split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2)

// Levenshtein with a hard ceiling and per-row early-out — returns max+1 the
// moment the edit distance is known to exceed `max`, so most comparisons bail
// in a couple of rows.
export function boundedLev(a, b, max) {
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

/**
 * Build the query engine around a SUB_TYPE_LABELS shape (vertical → sub_type
 * key → human label). Injected rather than imported so this module stays free
 * of app-code imports and node --test can exercise it directly.
 */
export function createQueryEngine(subTypeLabels) {
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
    for (const subs of Object.values(subTypeLabels)) {
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
  //
  // `placeTokens` is the residue once every category/vertical word is set
  // aside — for "beer in Mornington" that's ["mornington"]. It's what the
  // geocoder should resolve and what Enter routing tests against known towns.
  function parsePinQuery(raw, vocab) {
    const reqVerticals = new Set()
    const reqSubtypes = new Set()
    const hardTerms = []
    const matchTokens = []
    const catTokens = []
    const placeTokens = []
    for (const rt of tokenizeQuery(raw)) {
      const t = correctToken(rt, vocab)
      if (STOPWORDS.has(t)) continue
      if (HARD_TERMS.has(t)) { hardTerms.push(t); continue }
      const vk = VERTICAL_INTENT[t]
      if (vk) { reqVerticals.add(vk); continue }
      const subs = SUBTYPE_WORD_INDEX[t]
      if (subs) { for (const k of subs) reqSubtypes.add(k); catTokens.push(t); matchTokens.push(t); continue }
      matchTokens.push(t)
      placeTokens.push(t)
    }
    const hasIntent = reqVerticals.size > 0 || reqSubtypes.size > 0 || hardTerms.length > 0
    const hasQuery = hasIntent || matchTokens.length > 0
    return { reqVerticals, reqSubtypes, hardTerms, matchTokens, catTokens, placeTokens, hasQuery, hasIntent }
  }

  // Every query token must hit the haystack, either literally or through its
  // synonym expansion.
  function matchesPinQuery(l, tokens) {
    const hay = l._hay || ''
    return tokens.every(t => hay.includes(t) || (QUERY_SYNONYMS[t] && QUERY_SYNONYMS[t].split(' ').some(s => hay.includes(s))))
  }

  // A listing satisfies a named category if its sub_type is one named, or (as a
  // safety net for un-typed rows) its name literally contains a category token.
  function passesCategory(l, reqSub, catTokens) {
    if (reqSub.size === 0) return true
    if (l.sub_type && reqSub.has(l.sub_type)) return true
    const n = (l.name || '').toLowerCase()
    return catTokens.some(t => n.includes(t))
  }

  // A named vertical ("accommodation", "somewhere to eat") gates the vertical the
  // same way a named category gates the sub_type — applied to the semantic pool
  // too, so an off-vertical neighbour can never sneak in.
  function passesVertical(l, reqVert) {
    return reqVert.size === 0 || reqVert.has(l.vertical)
  }

  // A cuisine/nationality/dietary word must appear literally in the venue's
  // text — "Korean" must never fuzz into a Japanese ramen bar via semantics.
  function passesHardTerms(l, hardTerms) {
    return hardTerms.length === 0 || hardTerms.every(t => (l._hay || '').includes(t))
  }

  // The full category-side gate for one listing against a parsed query.
  function matchesIntent(l, parsed) {
    return passesVertical(l, parsed.reqVerticals) &&
      passesCategory(l, parsed.reqSubtypes, parsed.catTokens) &&
      passesHardTerms(l, parsed.hardTerms)
  }

  // Venue half of the unified field — name matches tiered prefix → substring →
  // all-word (so "Tar Barrel brewery" still finds "Tar Barrel" once the generic
  // category word is set aside), then ranked by GEOGRAPHY: venues inside the
  // current viewport lead (tier, then nearest the centre), everything off-screen
  // follows by plain distance — typing "coffee" over Hobart offers Hobart's
  // coffee, not Marrickville's. Capped at 5 (towns/POIs sit beneath).
  //
  // When the query carries category/vertical intent, every candidate must ALSO
  // satisfy it. This is the "accommodation in Castlemaine" rule: with the
  // intent words set aside, the leftover is the TOWN name, and tier-2 matching
  // would otherwise surface any venue that carries the town in its name —
  // Castlemaine Vintage Bazaar, a market, as the top "venue" for an
  // accommodation query. Gating by intent leaves only venues of the asked-for
  // kind; usually none carry the town name, and the towns list takes over.
  //
  // viewport: { bounds: {west,east,south,north}|null, center: {lng,lat}|null }
  // Returns up to 5 of { listing, tier }.
  function rankVenueMatches(listings, rawQuery, vocab, viewport = {}) {
    const q = String(rawQuery || '').trim().toLowerCase()
    if (q.length < 2) return []
    const parsed = parsePinQuery(q, vocab)
    // Words that must appear in the NAME — drop stopwords and generic category/
    // intent words so a trailing "brewery"/"cafe" doesn't exclude the venue.
    const nameToks = q.split(/\s+/).filter(w => w.length >= 2 && !STOPWORDS.has(w) && !SUBTYPE_WORD_INDEX[w] && !VERTICAL_INTENT[w])
    const b = viewport.bounds || null
    const c = viewport.center || null
    const cosLat = c ? Math.cos((c.lat * Math.PI) / 180) : 1
    const scored = []
    for (const l of listings) {
      const n = l.name ? l.name.toLowerCase() : ''
      if (!n) continue
      if (parsed.hasIntent && !matchesIntent(l, parsed)) continue
      let tier
      if (n.startsWith(q)) tier = 0
      else if (n.includes(q)) tier = 1
      else if (nameToks.length && nameToks.every(w => n.includes(w))) tier = 2
      else continue
      const lng = parseFloat(l.lng), lat = parseFloat(l.lat)
      const hasCoords = Number.isFinite(lng) && Number.isFinite(lat)
      const within = !!(b && hasCoords &&
        lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north)
      // Equirectangular squared distance — cheap and monotonic, all we need for ordering.
      const dx = (c && hasCoords) ? (lng - c.lng) * cosLat : 0
      const dy = (c && hasCoords) ? lat - c.lat : 0
      const dist = (c && hasCoords) ? dx * dx + dy * dy : Infinity
      scored.push({ listing: l, tier, within, dist })
    }
    scored.sort((a, b2) => {
      if (a.within !== b2.within) return a.within ? -1 : 1
      // On-screen: completion feel — prefix beats substring, nearest breaks ties.
      if (a.within) return (a.tier - b2.tier) || (a.dist - b2.dist)
      // Off-screen: how close it is matters more than how the name matched.
      return (a.dist - b2.dist) || (a.tier - b2.tier)
    })
    return scored.slice(0, 5).map(({ listing, tier }) => ({ listing, tier }))
  }

  /**
   * What Enter should do with the current query. One decision point instead of
   * "always jump to the first venue" — which is how "beer in Mornington" flew
   * to Mornington Sea Glass (jewellery) and cleared the filter on the way.
   *
   *  { type: 'venue',        listing }            → jump & clear (take-me-there)
   *  { type: 'place',        feature }            → fly to town, query becomes the town
   *  { type: 'filter-place', feature?, leftover } → KEEP the filter, fly to the named place
   *  { type: 'filter' }                           → keep the filter, just close the dropdown
   *  { type: 'none' }                             → nothing actionable
   *
   * regionNames: lowercased Set of the corpus's own region/town strings — a
   * geocoder-independent way to know the leftover names a place we cover.
   */
  function decideEnterAction({ rawQuery, vocab, venueMatches = [], placeResults = [], regionNames = new Set() }) {
    const q = String(rawQuery || '').trim().toLowerCase()
    if (!q) return { type: 'none' }
    const parsed = parsePinQuery(q, vocab)
    const top = venueMatches[0] || null
    const placeFeatures = placeResults.filter(f => PLACEISH_TYPES.has(f?.place_type?.[0]))

    if (parsed.hasIntent) {
      // The query literally names a venue ("tar barrel brewery" is a prefix of
      // Tar Barrel Brewery & Distillery) — that's still a take-me-there.
      if (top && top.tier <= 1) return { type: 'venue', listing: top.listing }
      const leftover = parsed.placeTokens.join(' ')
      if (leftover) {
        const feature = placeFeatures.find(f => (f.text || '').toLowerCase() === leftover) || null
        // A leftover that names a town we know (our own region strings, or an
        // exact geocoder hit) means "this category, in that place" — apply the
        // filter and go there. Never a single venue, never a cleared filter.
        if (feature || regionNames.has(leftover)) return { type: 'filter-place', feature, leftover }
      }
      // Intent + a venue-ish remainder ("beer smith") — the all-words name
      // match is the best guess we have.
      if (top) return { type: 'venue', listing: top.listing }
      return { type: 'filter' }
    }

    // No category intent. A bare query that IS a town name ("castlemaine")
    // means the town, not whichever venue happens to carry it in its name.
    const exactPlace = placeFeatures.find(f => (f.text || '').toLowerCase() === q)
    if (exactPlace) return { type: 'place', feature: exactPlace }
    if (top) return { type: 'venue', listing: top.listing }
    if (placeResults.length) return { type: 'place', feature: placeResults[0] }
    return { type: 'none' }
  }

  return {
    SUBTYPE_WORD_INDEX,
    buildVocab,
    correctToken,
    parsePinQuery,
    matchesPinQuery,
    passesCategory,
    passesVertical,
    passesHardTerms,
    matchesIntent,
    rankVenueMatches,
    decideEnterAction,
  }
}
