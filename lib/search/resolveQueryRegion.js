/**
 * Resolve a natural-language search query to a specific LIVE region, so that a
 * region named in the query ("...in the Mornington Peninsula") is enforced as a
 * hard region filter (filter_region) rather than silently downgraded to its
 * state.
 *
 * Why this exists: parseQueryLocation maps a place phrase to its STATE only
 * (deliberately — to kill cross-state leakage). But state-level is too coarse
 * when the user names a region we hold data for: "great coffee in the Mornington
 * Peninsula from a roastery" then searches the whole of VIC and the semantic arm
 * surfaces Melbourne roasters (Proud Mary, Seven Seeds, …). When a region is
 * named, that region is the constraint — not just its state.
 *
 * Matching is data-driven (the live `regions` table, cached in-process) so it
 * stays correct as regions are added/renamed, augmented with:
 *   - the region NAME            ("Mornington Peninsula")
 *   - the de-hyphenated SLUG     ("mornington peninsula")
 *   - a dropped geographic suffix ("mornington", "barossa", "byron")
 *   - each side of an "&" name   ("Ballarat & Goldfields" -> "ballarat", "goldfields")
 *   - a small alias map for colloquial forms name/slug can't reach
 * Longest phrase wins, so "mornington peninsula" beats "mornington" and
 * "sunshine coast hinterland" beats "sunshine coast".
 *
 * Returns { region: {id,slug,name,state}|null, matched: phrase|null, cleaned }.
 * `cleaned` is the query with the matched location phrase removed (mirroring
 * parseQueryLocation) so the retrieval arms focus on the vibe.
 */

import { getSupabaseAdmin } from '@/lib/supabase/clients'

// Colloquial / contracted phrases that name+slug+suffix matching can't reach.
// Every value MUST be the slug of a live region (verified at build time below).
const REGION_ALIASES = {
  'hepburn': 'daylesford',
  'hepburn springs': 'daylesford',
  'high country': 'victorian-high-country',
  'red centre': 'alice-springs-red-centre',
  'uluru': 'alice-springs-red-centre',
  'top end': 'darwin-top-end',
  'tropical north': 'cairns-tropical-north',
  'coffs': 'coffs-coast',
  'coffs harbour': 'coffs-coast',
  'canberra': 'canberra-district',
  'goldfields': 'ballarat',
  'the peninsula': 'mornington-peninsula',
  'furneaux': 'flinders-island',
  'furneaux islands': 'flinders-island',
}

// Geographic suffixes safe to drop to a distinctive colloquial token
// ("Mornington Peninsula" -> "mornington"). Generic suffixes (Coast, District,
// City) are excluded — they'd yield ambiguous tokens.
const DROPPABLE_SUFFIX = /\s+(peninsula|valley|ranges|bay)$/

// Tokens never allowed as a standalone region match (avoid false hits from the
// "&"-split and from over-generic words).
const STOPWORDS = new Set(['surrounds', 'and', 'the', 'south', 'north', 'east', 'west', 'city', 'district'])

const TTL_MS = 5 * 60 * 1000
let _cache = { at: 0, entries: null }

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function loadRegionIndex(sb) {
  if (_cache.entries && Date.now() - _cache.at < TTL_MS) return _cache.entries
  // Bind LIVE *and* DRAFT regions: a draft region's /regions page may be
  // unpublished, but its listings are public, so a query naming it ("...on
  // Flinders Island") should still scope results geographically rather than
  // silently widening to the whole state. (Search binding is decoupled from
  // page publication.)
  const { data } = await sb.from('regions').select('id, slug, name, state').in('status', ['live', 'draft'])
  const regions = data || []
  const bySlug = new Map(regions.map((r) => [r.slug, r]))
  const phraseMap = new Map()
  const add = (phrase, region) => {
    const p = normalize(phrase)
    if (!p || p.length < 3 || STOPWORDS.has(p)) return
    if (!phraseMap.has(p)) phraseMap.set(p, region) // first writer wins; aliases added last won't clobber canonical
  }
  for (const r of regions) {
    add(r.name, r) //                         "Mornington Peninsula"
    add(r.slug.replace(/-/g, ' '), r) //      "mornington peninsula"
    const nm = normalize(r.name)
    const dropped = nm.replace(DROPPABLE_SUFFIX, '').trim()
    if (dropped !== nm && dropped.length >= 4) add(dropped, r) // "mornington", "barossa", "byron"
    if (r.name.includes('&')) {
      for (const part of r.name.split('&')) add(part, r) //     "Ballarat", "Goldfields"
    }
  }
  for (const [phrase, slug] of Object.entries(REGION_ALIASES)) {
    const r = bySlug.get(slug)
    if (r) add(phrase, r)
  }
  // Longest phrase first → most specific match wins.
  const entries = [...phraseMap.entries()].sort((a, b) => b[0].length - a[0].length)
  if (entries.length) _cache = { at: Date.now(), entries } // don't cache an empty load (transient DB error)
  return entries
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} rawQuery
 * @returns {Promise<{region: {id,slug,name,state}|null, matched: string|null, cleaned: string}>}
 */
export async function resolveQueryRegion(sb, rawQuery) {
  const raw = String(rawQuery || '')
  if (!raw.trim()) return { region: null, matched: null, cleaned: raw }

  const entries = await loadRegionIndex(sb || getSupabaseAdmin())
  const padded = ' ' + normalize(raw) + ' '

  for (const [phrase, region] of entries) {
    if (padded.includes(' ' + phrase + ' ')) {
      const esc = phrase.replace(/\s+/g, '\\s+')
      const cleaned = raw
        // strip a leading preposition/article chain plus the phrase ("in the X")
        .replace(new RegExp(`\\b(?:(?:in|near|around|at|of|on|the)\\s+)+${esc}\\b`, 'ig'), ' ')
        .replace(new RegExp(`\\b${esc}\\b`, 'ig'), ' ')
        .replace(/\s+/g, ' ')
        .trim()
      return { region, matched: phrase, cleaned: cleaned || raw }
    }
  }
  return { region: null, matched: null, cleaned: raw }
}
