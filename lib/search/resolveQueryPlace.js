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
