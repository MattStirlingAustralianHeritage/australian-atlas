/**
 * Resolve a natural-language search query to a geographic PLACE (town / suburb /
 * locality) so the search layer can pivot from token/semantic ranking to a
 * proximity-ranked geographic browse.
 *
 * Why this exists — the gap left by resolveQueryRegion + parseQueryLocation:
 *   - resolveQueryRegion binds queries that name a curated Atlas *region*.
 *   - parseQueryLocation binds a hand-maintained list of ~80 cities and ~60
 *     metro suburbs to their STATE (or SUBURB for the suburbs).
 *   - Everything else — the thousands of real Australian towns we have venues
 *     in (Apollo Bay, Daylesford-the-town, Port Fairy, Yackandandah, …) — falls
 *     through to pure lexical+semantic ranking, which is geographically blind:
 *       "apollo bay" → Apollo Bay Distillery, then Byron Bay listings 1,300km
 *                      away (the "bay" token), then Fannie Bay Gaol in the NT.
 *
 * This resolver matches the query against a data-driven gazetteer built from our
 * own active listings (the atlas_locality_gazetteer RPC, migration 190): every
 * (suburb, state) pair we hold venues in, with a venue centroid, dominant region
 * and venue count. A match yields a real lat/lng the search route turns into a
 * radius / bounding box.
 *
 * SAFE BY CONSTRUCTION:
 *   - The route only calls this AFTER resolveQueryRegion and parseQueryLocation
 *     both find nothing — so it never overrides existing curated bindings.
 *   - The ambiguous, common-word place names (Perth, Richmond, Orange, Newtown,
 *     Byron, …) are exactly the ones already intercepted upstream, so they never
 *     reach the gazetteer. What's left is overwhelmingly unambiguous town names.
 *   - Phrases are matched whole-word, longest-first; single generic tokens and
 *     sub-4-char fragments are excluded.
 *
 * Returns { place, matched, cleaned, prepositioned }:
 *   - place:   { suburb, state, region, lat, lng, n } | null
 *   - matched: the phrase that matched, or null
 *   - cleaned: the query with the matched place phrase (+ a leading preposition)
 *              removed — so "cafe in apollo bay" → "cafe" drives the ranking
 *   - prepositioned: true when the phrase followed in/near/around/at/of/from/on
 */

import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { extractStateFromPlaceName } from '@/lib/geo/stateDerivation'

// Single generic tokens that may exist as a one-word locality but read as
// search noise — never let one of these alone trigger a geographic pivot.
// (Multi-word names that merely END in one of these — "Apollo Bay", "Surfers
// Paradise" — are unaffected: matching is whole-phrase, not suffix.)
const PLACE_STOPWORDS = new Set([
  'central', 'city', 'park', 'beach', 'bay', 'hill', 'hills', 'heights',
  'gardens', 'grove', 'springs', 'point', 'harbour', 'creek', 'river',
  'north', 'south', 'east', 'west', 'the gap', 'valley', 'ranges', 'island',
])

const PREPOSITION = /\b(?:(?:in|near|around|at|of|on|from|by)\s+(?:the\s+)?)$/i

const TTL_MS = 5 * 60 * 1000
let _cache = { at: 0, entries: null }

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Load the locality gazetteer (one jsonb array) and compile it into a
 * phrase → locality lookup, longest phrase first. Cached in-process (5 min),
 * mirroring resolveQueryRegion. First writer wins per phrase, and the RPC
 * returns localities ordered by venue count desc, so for a name shared across
 * states the venue-richest instance is the canonical match.
 */
async function loadGazetteer(sb) {
  if (_cache.entries && Date.now() - _cache.at < TTL_MS) return _cache.entries
  let localities = []
  try {
    const { data } = await sb.rpc('atlas_locality_gazetteer', { min_count: 1 })
    localities = Array.isArray(data) ? data : []
  } catch {
    return _cache.entries || []
  }
  const phraseMap = new Map()
  for (const loc of localities) {
    const phrase = normalize(loc.suburb)
    if (!phrase || phrase.length < 4 || PLACE_STOPWORDS.has(phrase)) continue
    if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') continue
    if (!phraseMap.has(phrase)) {
      phraseMap.set(phrase, {
        suburb: loc.suburb, state: loc.state, region: loc.region,
        lat: loc.lat, lng: loc.lng, n: loc.n,
      })
    }
  }
  const entries = [...phraseMap.entries()].sort((a, b) => b[0].length - a[0].length)
  if (entries.length) _cache = { at: Date.now(), entries } // don't cache a transient empty load
  return entries
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} rawQuery
 */
export async function resolveQueryPlace(sb, rawQuery) {
  const raw = String(rawQuery || '')
  if (!raw.trim()) return { place: null, matched: null, cleaned: raw, prepositioned: false }

  const entries = await loadGazetteer(sb || getSupabaseAdmin())
  const padded = ' ' + normalize(raw) + ' '

  for (const [phrase, place] of entries) {
    const idx = padded.indexOf(' ' + phrase + ' ')
    if (idx === -1) continue
    // Was the phrase introduced by a locational preposition ("in/near …")?
    const before = padded.slice(0, idx + 1)
    const prepositioned = PREPOSITION.test(before)
    const esc = phrase.replace(/\s+/g, '\\s+')
    const cleaned = raw
      .replace(new RegExp(`\\b(?:(?:in|near|around|at|of|on|from|by|the)\\s+)+${esc}\\b`, 'ig'), ' ')
      .replace(new RegExp(`\\b${esc}\\b`, 'ig'), ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return { place, matched: phrase, cleaned, prepositioned }
  }
  return { place: null, matched: null, cleaned: raw, prepositioned: false }
}

const MAPBOX_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places'

/**
 * Forward-geocode a free-text query to an Australian place, for the long tail of
 * towns we hold NO venues in yet (so the gazetteer can't see them) — e.g. "Roma"
 * (QLD), "Sandringham". Restricted to settlement feature types so it resolves
 * towns/suburbs/regions, never a street or POI. Returns null on any failure so
 * the caller silently falls back to the normal ranking.
 *
 * @returns {Promise<null | { lat:number, lng:number, label:string, state:string|null, relevance:number, placeTypes:string[] }>}
 */
export async function geocodePlace(rawQuery, { token, signal } = {}) {
  const q = String(rawQuery || '').trim()
  const key = token || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN
  if (!q || q.length < 3 || q.length > 60 || !key) return null
  const url = `${MAPBOX_BASE}/${encodeURIComponent(q)}.json` +
    `?country=au&limit=1&types=${encodeURIComponent('place,locality,region,district')}&access_token=${key}`
  try {
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(2500) })
    if (!res.ok) return null
    const data = await res.json()
    const f = data.features?.[0]
    if (!f || !Array.isArray(f.center)) return null
    if (typeof f.relevance === 'number' && f.relevance < 0.6) return null
    return {
      lat: f.center[1],
      lng: f.center[0],
      label: (f.text || f.place_name || q).split(',')[0].trim(),
      state: extractStateFromPlaceName(f.place_name),
      relevance: typeof f.relevance === 'number' ? f.relevance : 0,
      placeTypes: f.place_type || [],
    }
  } catch {
    return null
  }
}

/**
 * Heuristic: does this query look like a bare place name (so a geocode fallback
 * is worth a shot)? Short, alphabetic, ≤ 3 words. Deliberately permissive — the
 * caller only invokes it when normal ranking already produced nothing strong.
 */
export function looksLikePlaceQuery(rawQuery) {
  const q = String(rawQuery || '').trim()
  if (q.length < 3 || q.length > 40) return false
  if (!/^[a-z][a-z\s'’.-]*$/i.test(q)) return false   // letters/spaces/apostrophes only
  return q.split(/\s+/).length <= 3
}

// A locative preposition immediately preceding a place name in a full sentence
// ("what to do in Ararat?", "cafes near Yackandandah"). "of/from/to/by" are
// deliberately excluded — they read as place markers far less often than as
// noise ("made of clay", "gifts from mum", "want to do", "art by locals"), and
// "to do" would otherwise capture "do" before the real "in <town>" downstream.
const SENTENCE_LOCATIVE = /\b(?:in|near|nearby|around|surrounding|outside|at)\s+(?:the\s+)?([a-z][a-z'’\-\s]*)/i

// Connectives/articles that end a captured place phrase — everything from the
// first one onward is trailing sentence, not part of the town name. None is a
// real second word of an Australian town name ("Alice Springs", "Apollo Bay",
// "Port Fairy" all survive), so cutting here is safe.
const CANDIDATE_STOP = new Set([
  'and', 'or', 'but', 'so', 'with', 'for', 'that', 'the', 'a', 'an',
  'my', 'your', 'our', 'is', 'are', 'of', 'to', 'on', 'in', 'at', 'i',
  'like', 'love', 'want', 'looking', 'near', 'where', 'what', 'who',
])

// The country itself and its adjective are not a state — "made in Australia"
// must not bind to any one state (Mapbox otherwise resolves "Australia" to a
// region and leaks e.g. ACT). Full state names ("in Victoria") are intercepted
// upstream by parseQueryLocation, so they never reach the geocode tier.
const CANDIDATE_REJECT = new Set(['australia', 'australian'])

/**
 * Pull the place name a visitor most likely NAMED in a free-text query, so the
 * geocode fallback can resolve towns we hold no venues in yet (e.g. Ararat) even
 * when they're embedded in a sentence. Two shapes, in priority order:
 *   - a locative preposition + noun phrase ("...in Ararat?" -> "Ararat"). Tried
 *     first so "cafes near Yackandandah" yields the town, not the whole string.
 *   - the whole query when it already looks like a bare place ("Roma")
 * The phrase is trimmed to at most 3 leading non-connective words and rejected
 * if it's only a generic place stopword ("in the city") or the country itself.
 * @returns {string|null} the candidate phrase (original case) or null
 */
export function extractPlaceCandidate(rawQuery) {
  const raw = String(rawQuery || '').trim()
  if (!raw) return null

  let cand = null
  const m = raw.match(SENTENCE_LOCATIVE)
  if (m && m[1]) {
    const words = []
    for (const w of m[1].trim().split(/\s+/)) {
      if (CANDIDATE_STOP.has(w.toLowerCase())) break
      words.push(w)
      if (words.length >= 3) break
    }
    cand = words.join(' ').trim()
  }
  // No prepositional place, but the whole query may itself be a bare town name.
  if (!cand && looksLikePlaceQuery(raw)) cand = raw

  if (!cand || cand.length < 3) return null
  const norm = normalize(cand)
  if (PLACE_STOPWORDS.has(norm) || CANDIDATE_REJECT.has(norm)) return null
  return cand
}

/**
 * Resolve the STATE of a real Australian town NAMED in a free-text query by
 * geocoding it — the long-tail complement to resolveQueryPlace (which only sees
 * towns we already hold venues in). Extracts the named place from the sentence,
 * geocodes it (settlement types only), and binds its state ONLY when a valid AU
 * state parses from the result — so an unresolved or off-country candidate
 * silently leaves ranking nationwide rather than guessing.
 *
 * @returns {Promise<null | { state:string, label:string, lat:number, lng:number, matched:string, cleaned:string }>}
 */
export async function geocodeQueryLocality(rawQuery, opts = {}) {
  const raw = String(rawQuery || '')
  const candidate = extractPlaceCandidate(raw)
  if (!candidate) return null

  const geo = await geocodePlace(candidate, opts)
  if (!geo || !geo.state) return null

  // Strip the matched place phrase (+ any leading preposition/article) so the
  // ranking arms focus on the actual need, mirroring resolveQueryPlace.cleaned.
  const esc = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const cleaned = raw
    .replace(new RegExp(`\\b(?:(?:in|near|nearby|around|surrounding|outside|at|the)\\s+)*${esc}\\b`, 'ig'), ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return { state: geo.state, label: geo.label, lat: geo.lat, lng: geo.lng, matched: candidate, cleaned: cleaned || raw }
}
