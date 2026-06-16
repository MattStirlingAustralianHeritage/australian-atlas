/**
 * Candidate duplicate guardrail.
 *
 * Detects whether a prospective candidate would duplicate something already on
 * the network — a published listing or an open review candidate — BEFORE it is
 * inserted, so the manual creation paths ("Add a listing", "Sort a URL") can
 * refuse to queue an accidental duplicate. The auto-discovery pipeline already
 * has this protection (lib/prospector/gates.js, Gate 0); the manual paths did
 * not, which is how the same venue occasionally got added twice.
 *
 * Matching mirrors the post-hoc detector (scripts/detect-duplicates.mjs) so
 * prevention and clean-up agree: three signals — normalised website URL,
 * normalised exact name, and Dice trigram name similarity (geography-gated) —
 * plus a coordinate-proximity check when both sides are geocoded.
 *
 * Kept self-contained (its own tiny pure helpers, no prospector import) so it
 * is unit-testable under `node --test` and adds no coupling.
 */

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

export function verticalLabel(v) {
  return VERTICAL_LABELS[v] || v || 'the network'
}

/** Lowercase, drop quotes, &→and, collapse whitespace. Mirrors normalize() in
 *  scripts/detect-duplicates.mjs so both tools key names identically. */
export function normaliseName(str) {
  return (str || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Host (without leading www.) + path (no trailing slash), lowercased. Returns
 *  null for anything unparseable. A superset of the detector's website key
 *  (which keeps www.) so e.g. www.x.com.au and x.com.au collapse together. */
export function normaliseUrlKey(url) {
  if (!url) return null
  let u = String(url).trim()
  if (!u) return null
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  try {
    const parsed = new URL(u)
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()
    if (!host.includes('.')) return null
    const path = parsed.pathname.replace(/\/+$/, '')
    return host + path
  } catch {
    return null
  }
}

// Hosts shared by many distinct venues, where a bare-domain URL is weak
// identity: Australian government and council sites all sit under .gov.au and
// list dozens of parks/museums under one root; a handful of social/aggregator
// hosts behave the same. A dedicated business domain (ripple.com.au) is NOT
// shared — one bare domain there means one business.
const SHARED_AGGREGATOR_HOSTS = new Set([
  'facebook.com', 'm.facebook.com', 'instagram.com', 'linktr.ee', 'linktree.com',
  'tripadvisor.com', 'tripadvisor.com.au', 'eventbrite.com', 'eventbrite.com.au',
  'youtube.com',
])

export function isSharedHost(urlKey) {
  if (!urlKey) return false
  const host = urlKey.split('/')[0]
  return host === 'gov.au' || host.endsWith('.gov.au') || SHARED_AGGREGATOR_HOSTS.has(host)
}

function trigrams(str) {
  const s = `  ${str} `
  const set = new Set()
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3))
  return set
}

/** Dice trigram similarity in [0,1]. Mirrors scripts/detect-duplicates.mjs. */
export function trigramSimilarity(a, b) {
  if (!a || !b) return 0
  const ta = trigrams(normaliseName(a))
  const tb = trigrams(normaliseName(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let intersection = 0
  for (const t of ta) { if (tb.has(t)) intersection++ }
  return (2 * intersection) / (ta.size + tb.size)
}

/** Great-circle distance in metres. */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Match strength, lower = stronger. A shared website is near-certain; an exact
// name on the curated network is a near-certain duplicate; a shared building
// (coords) can legitimately be a cross-vertical pair so it ranks below an exact
// name; a fuzzy name is the weakest signal.
const PRIORITY = { url: 1, exact_name: 2, coordinate_proximity: 3, fuzzy_name: 4 }

function buildMessage(rec, matchType, extra) {
  const where = `${verticalLabel(rec.vertical)}${rec.state ? ` (${rec.state})` : ''}`
  const noun = rec.kind === 'candidate' ? 'Already in the review queue' : 'Already listed'
  const quoted = `“${rec.name}”`
  switch (matchType) {
    case 'url':
      return `${noun} — ${quoted} on ${where} (same website).`
    case 'exact_name':
      return `${noun} — ${quoted} on ${where} (same name).`
    case 'coordinate_proximity':
      return `${noun} — ${quoted} on ${where} (~${Math.round(extra.distance)}m away).`
    case 'fuzzy_name':
      return `Looks like ${noun.toLowerCase()} — ${quoted} on ${where} (${Math.round(extra.similarity * 100)}% name match).`
    default:
      return `${noun} — ${quoted} on ${where}.`
  }
}

function toMatch(rec, matchType, extra = {}) {
  return {
    kind: rec.kind,
    id: rec.id,
    name: rec.name,
    vertical: rec.vertical,
    slug: rec.slug || null,
    state: rec.state || null,
    status: rec.status || null,
    matchType,
    similarity: extra.similarity ?? null,
    distance: extra.distance ?? null,
    message: buildMessage(rec, matchType, extra),
  }
}

/**
 * Scan a set of normalised records for the strongest duplicate of `ctx`.
 * Records: { kind, id, name, vertical, website, state, lat, lng, slug?, status? }
 * Returns the best match object or null.
 */
function bestMatch(records, ctx) {
  let best = null
  const consider = (rec, matchType, extra) => {
    const p = PRIORITY[matchType]
    if (best && p >= best._p) return
    best = { ...toMatch(rec, matchType, extra), _p: p }
  }

  // A URL match is a strong, name-independent signal UNLESS it is a bare domain
  // (no path) on a shared host (gov.au / council / aggregator) — there one root
  // covers many venues, so require the names to agree too. A real path, or any
  // dedicated business domain, stays strong.
  const urlKeyHasPath = !!ctx.urlKey && ctx.urlKey.includes('/')
  const urlStrong = !!ctx.urlKey && (urlKeyHasPath || !isSharedHost(ctx.urlKey))

  for (const rec of records) {
    if (ctx.excludeId && rec.id === ctx.excludeId) continue
    if (!rec.name) continue

    const recNameKey = normaliseName(rec.name)

    // 1. Shared website — strongest signal, independent of geography.
    if (ctx.urlKey && normaliseUrlKey(rec.website) === ctx.urlKey) {
      const nameAgrees = recNameKey === ctx.nameKey || trigramSimilarity(ctx.nameKey, recNameKey) >= 0.5
      if (urlStrong || nameAgrees) {
        consider(rec, 'url')
        continue // nothing outranks a URL match for this record
      }
      // else: shared bare domain, unrelated name — fall through to name/coord.
    }

    // 2. Exact normalised name.
    if (recNameKey === ctx.nameKey) {
      consider(rec, 'exact_name')
    } else {
      // 4. Fuzzy name — geography-gated to avoid different-state namesakes.
      const recState = (rec.state || '').toUpperCase().trim() || null
      const stateOk = !ctx.stateUpper || !recState || recState === ctx.stateUpper
      if (stateOk) {
        const sim = trigramSimilarity(ctx.nameKey, recNameKey)
        if (sim >= ctx.fuzzyThreshold) consider(rec, 'fuzzy_name', { similarity: sim })
      }
    }

    // 3. Coordinate proximity — same physical place.
    if (ctx.lat != null && ctx.lng != null && rec.lat != null && rec.lng != null) {
      const distance = haversineMeters(ctx.lat, ctx.lng, rec.lat, rec.lng)
      if (distance < ctx.coordMeters) consider(rec, 'coordinate_proximity', { distance })
    }
  }

  if (best) delete best._p
  return best
}

const LISTING_COLUMNS = 'id, name, slug, vertical, website, state, lat, lng, status'
const CANDIDATE_COLUMNS = 'id, name, vertical, website_url, state, lat, lng, status'

/**
 * Page through an entire table. PostgREST caps a single response at ~1000 rows
 * regardless of `.limit()`, so a full-table scan (needed for the fuzzy-name
 * signal) MUST paginate — otherwise it silently sees only the first 1000 rows.
 * Ordered by id for stable, non-overlapping pages.
 */
async function loadAll(sb, table, columns, applyFilter) {
  const PAGE = 1000
  const HARD_CAP = 50000 // backstop; well above any real table size
  let rows = []
  let offset = 0
  while (offset < HARD_CAP) {
    let q = applyFilter(sb.from(table).select(columns))
    q = q.order('id', { ascending: true }).range(offset, offset + PAGE - 1)
    const { data, error } = await q
    if (error) { console.warn(`[duplicateCheck] ${table} read failed:`, error.message); break }
    if (!data?.length) break
    rows = rows.concat(data)
    offset += data.length
    if (data.length < PAGE) break
  }
  return rows
}

/**
 * Find the strongest existing duplicate of a prospective candidate.
 *
 * @param {object} input  - { name, website_url, vertical, state?, lat?, lng? }
 * @param {object} sb     - Supabase admin client
 * @param {object} [opts] - {
 *   excludeCandidateId?  : skip this candidate id (for re-scanning an existing row)
 *   checkCandidates?     : also match open candidates (default true)
 *   fuzzyThreshold?      : default 0.85
 *   coordMeters?         : default 150
 * }
 * @returns {Promise<{ duplicate: object|null, scanned: { listings: number, candidates: number } }>}
 *
 * Fails open: if a read errors, it returns no duplicate (logs a warning) rather
 * than blocking a legitimate create — this is a curation guardrail, not a
 * security boundary.
 */
export async function findDuplicate(input, sb, opts = {}) {
  if (!normaliseName(input?.name)) {
    return { duplicate: null, scanned: { listings: 0, candidates: 0 } }
  }

  // ── 1. Existing listings (the primary concern). ──────────────
  let listings = []
  try {
    listings = await loadAll(sb, 'listings', LISTING_COLUMNS, q => q.neq('status', 'deleted'))
  } catch (err) {
    console.warn('[duplicateCheck] listings read threw:', err?.message || err)
  }

  const listingResult = findDuplicateIn(input, { listings }, { ...opts, checkCandidates: false })
  if (listingResult.duplicate) return listingResult

  // ── 2. Open review candidates (avoid double-queuing). ────────
  if (opts.checkCandidates === false) {
    return { duplicate: null, scanned: { listings: listings.length, candidates: 0 } }
  }

  let candidates = []
  try {
    candidates = await loadAll(sb, 'listing_candidates', CANDIDATE_COLUMNS, q => q.in('status', ['pending', 'reviewing']))
  } catch (err) {
    console.warn('[duplicateCheck] candidates read threw:', err?.message || err)
  }

  // Listings already cleared above; scan candidates only.
  const candidateResult = findDuplicateIn(input, { listings: [], candidates }, opts)
  return {
    duplicate: candidateResult.duplicate,
    scanned: { listings: listings.length, candidates: candidates.length },
  }
}

/**
 * Pure, in-memory variant of {@link findDuplicate}. Matches `input` against
 * already-loaded `{ listings, candidates }` arrays — no DB access. Used by
 * scripts/scan-duplicate-candidates.mjs, which loads the network once and then
 * checks every open candidate against it.
 *
 * @param {object} input    - { name, website_url, vertical, state?, lat?, lng? }
 * @param {object} sources  - { listings?: row[], candidates?: row[] }
 * @param {object} [opts]   - same options as findDuplicate
 * @returns {{ duplicate: object|null, scanned: { listings: number, candidates: number } }}
 */
export function findDuplicateIn(input, sources = {}, opts = {}) {
  const ctx = {
    nameKey: normaliseName(input?.name),
    urlKey: normaliseUrlKey(input?.website_url),
    stateUpper: (input?.state || '').toUpperCase().trim() || null,
    lat: input?.lat != null ? Number(input.lat) : null,
    lng: input?.lng != null ? Number(input.lng) : null,
    fuzzyThreshold: opts.fuzzyThreshold ?? 0.85,
    coordMeters: opts.coordMeters ?? 150,
    excludeId: opts.excludeCandidateId || null,
  }
  const listings = sources.listings || []
  const candidates = sources.candidates || []
  if (!ctx.nameKey) {
    return { duplicate: null, scanned: { listings: listings.length, candidates: candidates.length } }
  }

  const listingMatch = bestMatch(listings.map(l => ({ kind: 'listing', ...l })), ctx)
  if (listingMatch) {
    return { duplicate: listingMatch, scanned: { listings: listings.length, candidates: 0 } }
  }

  if (opts.checkCandidates === false) {
    return { duplicate: null, scanned: { listings: listings.length, candidates: 0 } }
  }

  const candidateMatch = bestMatch(
    candidates.map(c => ({ kind: 'candidate', website: c.website_url, ...c })),
    ctx,
  )
  return {
    duplicate: candidateMatch,
    scanned: { listings: listings.length, candidates: candidates.length },
  }
}
