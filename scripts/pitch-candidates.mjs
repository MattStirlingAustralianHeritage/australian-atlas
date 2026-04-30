#!/usr/bin/env node

/**
 * scripts/pitch-candidates.mjs
 *
 * Phase 1 of the pitch system per docs/pitch-system-design.md —
 * deterministic candidate identification, no LLM, no DB writes.
 *
 * Usage:
 *   node --env-file=.env.local scripts/pitch-candidates.mjs <vertical> <slot_type> [limit]
 *
 *     <vertical>   sba | collection | craft | fine_grounds | rest |
 *                  field | corner | found | table
 *     <slot_type>  general | new_producer
 *     [limit]      number of top candidates to output (default 10)
 *
 * Outputs ranked candidates to stdout as JSON. Editor inspects to
 * confirm Phase 1 is surfacing editorially-sane candidates before
 * Phase 2 (LLM framing) is built.
 *
 * ─────────────────────────────────────────────────────────────────
 * Important semantics — read before changing scoring:
 *
 *   1. NULL on listings.is_owner_operator and listings.independence_confirmed
 *      means "no signal" — the corresponding positive scoring weight is NOT
 *      applied. NULL is "we don't know yet," not "explicitly false." Only an
 *      explicit `true` triggers the bonus. `false` and NULL both contribute
 *      zero. Documented in migration 106's column comments.
 *
 *   2. Commercial-group disqualifier matches STRUCTURED FIELDS ONLY:
 *        - case-insensitive equality of listing.name against group_name or
 *          any element of the brands array
 *        - host portion of listing.website matched against group host
 *      It does NOT substring-match against description, hero_intro, or any
 *      free-text field. Free-text matching produces false positives (a
 *      description legitimately referencing "next door to the Hilton" is not
 *      a Hilton listing). Documented in migration 107's header.
 *
 *   3. Articles → listings linkage uses listing UUID matching against the
 *      JSONB listing_tags array on articles. UUID, not slug — slugs change
 *      with editorial revision; UUIDs are stable. Documented in migration
 *      105's header.
 *
 *   4. Scoring weights are loaded from the pitch_score_weights table at
 *      runtime — NOT hardcoded here. Tuning is a SQL update, not a code
 *      change. Per-slot-type and per-vertical overrides are supported.
 *
 *   5. The "too old for new producer" disqualifier is OR semantics: if
 *      EITHER (added to network > 3 years ago) OR (founded > 3 years ago)
 *      is true, the listing is excluded from new-producer slots. Per design
 *      doc clarification: "either signal alone qualifies as 'too old'."
 * ─────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── CLI args ──────────────────────────────────────────────────────────

const [, , vertical, slotType, limitArg] = process.argv

const VALID_VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']
const VALID_SLOT_TYPES = ['general', 'new_producer']

if (!vertical || !slotType) {
  console.error('Usage: node --env-file=.env.local scripts/pitch-candidates.mjs <vertical> <slot_type> [limit]')
  console.error(`  <vertical>   one of: ${VALID_VERTICALS.join(', ')}`)
  console.error(`  <slot_type>  one of: ${VALID_SLOT_TYPES.join(', ')}`)
  process.exit(1)
}
if (!VALID_VERTICALS.includes(vertical)) {
  console.error(`Invalid vertical: ${vertical}. Must be one of: ${VALID_VERTICALS.join(', ')}`)
  process.exit(1)
}
if (!VALID_SLOT_TYPES.includes(slotType)) {
  console.error(`Invalid slot_type: ${slotType}. Must be one of: ${VALID_SLOT_TYPES.join(', ')}`)
  process.exit(1)
}
const limit = parseInt(limitArg || '10', 10)
if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
  console.error(`Invalid limit: ${limitArg}. Must be 1-200.`)
  process.exit(1)
}

// ── Capital-metro suburbs (CBD + metro-adjacent) for "regional location" signal
//
// Listings whose suburb is in the matching state's set do NOT earn the
// regional_location bonus. The set covers strict CBDs plus inner-metro
// suburbs that, while not CBD, aren't editorially "regional" (e.g.
// Surry Hills, Fitzroy, Fortitude Valley). Per editor decision
// 2026-04-30. Tunable by editing the sets.

const CAPITAL_METRO_SUBURBS = {
  NSW: new Set([
    'Sydney', 'Sydney CBD', 'Haymarket', 'The Rocks', 'Darling Harbour',
    'Surry Hills', 'Redfern', 'Newtown', 'Darlinghurst', 'Paddington', 'Glebe', 'Pyrmont',
  ]),
  VIC: new Set([
    'Melbourne', 'Melbourne CBD', 'Southbank', 'Docklands',
    'Fitzroy', 'Carlton', 'Collingwood', 'Brunswick', 'Richmond', 'South Yarra', 'Prahran',
  ]),
  QLD: new Set([
    'Brisbane', 'Brisbane City', 'South Brisbane', 'Spring Hill',
    'Fortitude Valley', 'New Farm', 'West End', 'Teneriffe',
  ]),
  WA: new Set([
    'Perth', 'Perth CBD', 'East Perth', 'Northbridge',
    'Subiaco', 'Leederville',
  ]),
  SA: new Set(['Adelaide', 'Adelaide CBD', 'North Adelaide']),
  TAS: new Set(['Hobart', 'Hobart CBD', 'Battery Point']),
  ACT: new Set(['Canberra', 'Civic', 'City']),
  NT: new Set(['Darwin', 'Darwin CBD', 'Darwin City']),
}

function isRegional(listing) {
  if (!listing.state) return false
  const metro = CAPITAL_METRO_SUBURBS[listing.state]
  if (!metro) return true // Unknown state → treat as regional
  if (!listing.suburb) return true // No suburb → treat as regional
  return !metro.has(listing.suburb)
}

// ── URL host helper ──────────────────────────────────────────────────

function urlHost(url) {
  if (!url) return null
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

function normaliseGroupName(s) {
  return (s || '').toLowerCase().trim()
}

// ── Loaders ──────────────────────────────────────────────────────────

async function loadCommercialGroups() {
  const { data, error } = await supabase
    .from('commercial_groups')
    .select('group_name, brands')
  if (error) throw new Error(`commercial_groups load failed: ${error.message}`)
  const names = new Set()
  const hosts = new Set()
  for (const g of data || []) {
    names.add(normaliseGroupName(g.group_name))
    for (const b of (g.brands || [])) names.add(normaliseGroupName(b))
    // Best-effort host extraction from group_name (e.g. "Spicers Retreats" + brand "worldsapart.club"
    // → host worldsapart.club is captured automatically).
    for (const b of (g.brands || [])) {
      const h = urlHost(b)
      if (h) hosts.add(h)
    }
  }
  return { names, hosts }
}

function commercialGroupDisqualified(listing, groups) {
  const nameMatch = listing.name && groups.names.has(normaliseGroupName(listing.name))
  if (nameMatch) return 'commercial_group_name_match'
  const host = urlHost(listing.website)
  if (host && groups.hosts.has(host)) return 'commercial_group_domain_match'
  return null
}

async function loadRecentArticleListingIds(months) {
  const since = new Date()
  since.setMonth(since.getMonth() - months)
  const { data, error } = await supabase
    .from('articles')
    .select('listing_tags, published_at')
    .eq('status', 'published')
    .gte('published_at', since.toISOString())
    .not('listing_tags', 'is', null)
  if (error) throw new Error(`articles load failed: ${error.message}`)
  const ids = new Set()
  for (const a of data || []) {
    const tags = Array.isArray(a.listing_tags) ? a.listing_tags : []
    for (const t of tags) {
      // Convention: listing_tags are listing UUID strings. Defensive: also
      // accept { id: <uuid> } shape in case future writes use objects.
      if (typeof t === 'string') ids.add(t)
      else if (t && typeof t === 'object' && t.id) ids.add(t.id)
    }
  }
  return ids
}

async function loadActivePitchListingIds() {
  const { data, error } = await supabase
    .from('pitches')
    .select('anchor_listing_id, supporting_listing_ids')
    .eq('status', 'active')
  if (error) throw new Error(`pitches load failed: ${error.message}`)
  const ids = new Set()
  for (const p of data || []) {
    if (p.anchor_listing_id) ids.add(p.anchor_listing_id)
    for (const id of (p.supporting_listing_ids || [])) ids.add(id)
  }
  return ids
}

async function loadAnyPitchListingIds() {
  // For the "no_prior_pitch_attempts" scoring signal: any pitch row,
  // active or otherwise, that includes the listing as anchor or supporting.
  const { data, error } = await supabase
    .from('pitches')
    .select('anchor_listing_id, supporting_listing_ids')
  if (error) throw new Error(`pitches (all) load failed: ${error.message}`)
  const ids = new Set()
  for (const p of data || []) {
    if (p.anchor_listing_id) ids.add(p.anchor_listing_id)
    for (const id of (p.supporting_listing_ids || [])) ids.add(id)
  }
  return ids
}

async function loadMediaCoverageDisqualifiedIds() {
  // New-producer disqualifier: > 4 entries OR any major_national entry.
  const { data, error } = await supabase
    .from('media_coverage_log')
    .select('listing_id, publication_tier')
  if (error) throw new Error(`media_coverage_log load failed: ${error.message}`)
  const counts = new Map()
  const majorNational = new Set()
  for (const m of data || []) {
    counts.set(m.listing_id, (counts.get(m.listing_id) || 0) + 1)
    if (m.publication_tier === 'major_national') majorNational.add(m.listing_id)
  }
  const disqualified = new Set(majorNational)
  for (const [id, n] of counts) if (n > 4) disqualified.add(id)
  return disqualified
}

async function loadScoreWeights(slotType, vertical) {
  const { data, error } = await supabase
    .from('pitch_score_weights')
    .select('signal_name, weight, slot_type, vertical')
    .eq('active', true)
  if (error) throw new Error(`pitch_score_weights load failed: ${error.message}`)
  // Resolution rules:
  //   - slot_type must equal 'both' or match the requested slotType
  //   - vertical must be NULL (applies to all) or match the requested vertical
  //   - more specific overrides less specific (slot_type-specific beats 'both';
  //     vertical-specific beats null vertical)
  const candidates = (data || []).filter(w => {
    const slotMatch = w.slot_type === 'both' || w.slot_type === slotType
    const vMatch = w.vertical === null || w.vertical === vertical
    return slotMatch && vMatch
  })
  // Build a map of signal_name → best-matching weight row.
  // Specificity: vertical-match (specific) > vertical-null (generic);
  //              slot_type-match (specific) > slot_type-both (generic).
  const specificity = (w) =>
    (w.vertical === vertical ? 2 : 0) + (w.slot_type === slotType ? 1 : 0)
  const map = new Map()
  for (const w of candidates) {
    const existing = map.get(w.signal_name)
    if (!existing || specificity(w) > specificity(existing)) {
      map.set(w.signal_name, w)
    }
  }
  return map
}

async function loadListings(vertical) {
  // Pull all active listings for the vertical, paginating in 1000-row pages.
  //
  // PostgREST applies a server-side `db-max-rows=1000` cap on every response,
  // which silently truncates `.limit(N)` when N > 1000. Verticals with more
  // than 1000 listings (SBA: 2141, Craft: 2310 as of 2026-04-30) need
  // explicit `.range()` pagination to retrieve the full set. We loop until
  // a page comes back shorter than the page size, which signals the tail.
  //
  // Order is stabilised on `id` so pages can't shuffle and skip rows.
  const PAGE_SIZE = 1000
  const all = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('listings')
      .select(`
        id, name, slug, vertical,
        description, website,
        region, state, suburb, lat, lng,
        created_at, founded_year,
        heritage_significance,
        is_owner_operator, independence_confirmed, single_location, awards,
        data_source, needs_review
      `)
      .eq('vertical', vertical)
      .eq('status', 'active')
      .neq('needs_review', true)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`listings load failed (offset ${offset}): ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return all
}

// ── Hard disqualifiers ───────────────────────────────────────────────

function applyHardDisqualifiers({ listing, slotType, groups, articleListingIds, activePitchIds, mediaDisqualifiedIds }) {
  const reasons = []

  const cgReason = commercialGroupDisqualified(listing, groups)
  if (cgReason) reasons.push(cgReason)

  if (articleListingIds.has(listing.id)) reasons.push('recent_journal_coverage')
  if (activePitchIds.has(listing.id)) reasons.push('in_active_pitch_slot')
  if (mediaDisqualifiedIds.has(listing.id)) reasons.push('media_coverage_threshold')

  if (slotType === 'new_producer') {
    // OR semantics: either signal alone disqualifies (per design doc).
    const now = Date.now()
    const networkAgeMs = now - new Date(listing.created_at).getTime()
    const networkAgeYears = networkAgeMs / (1000 * 60 * 60 * 24 * 365.25)
    const tooOldByNetwork = networkAgeYears > 3
    const tooOldByFounding = listing.founded_year && (new Date().getFullYear() - listing.founded_year) > 3
    if (tooOldByNetwork || tooOldByFounding) reasons.push('too_old_for_new_producer')
  }

  return reasons
}

// ── Minimum data thresholds ──────────────────────────────────────────

function generalSlotFloor(listing) {
  // Required base: name, region, website, description >= 200 chars.
  //
  // Then two further conditions, both must hold:
  //
  //   (a) Descriptive-data anchor: at least one of {founded_year, awards}
  //       must be populated. The booleans below are curatorial flags, not
  //       descriptive biographical data — they may contribute to the count
  //       (b) but cannot carry the floor alone. Per editor decision
  //       2026-04-30 and design doc Phase 1 implementation note.
  //
  //   (b) ≥3 of the following are positive:
  //         - founded_year populated
  //         - awards populated (non-empty array)
  //         - is_owner_operator = TRUE
  //         - independence_confirmed = TRUE
  //         - single_location = TRUE
  //         - heritage_significance = TRUE
  if (!listing.name || !listing.name.trim()) return false
  if (!listing.region || !listing.region.trim()) return false
  if (!listing.website || !listing.website.trim()) return false
  if (!listing.description || listing.description.length < 200) return false

  const hasFoundedYear = listing.founded_year && listing.founded_year > 0
  const hasAwards = Array.isArray(listing.awards) && listing.awards.length > 0
  // Anchor: must have at least one of the two descriptive fields.
  if (!hasFoundedYear && !hasAwards) return false

  let count = 0
  if (hasFoundedYear) count++
  if (hasAwards) count++
  if (listing.is_owner_operator === true) count++
  if (listing.independence_confirmed === true) count++
  if (listing.single_location === true) count++
  if (listing.heritage_significance === true) count++

  return count >= 3
}

function newProducerSlotFloor(listing) {
  // Required: name, region, AND ≥1 of {website, description >= 100,
  // is_owner_operator = TRUE}.
  if (!listing.name || !listing.name.trim()) return false
  if (!listing.region || !listing.region.trim()) return false

  const hasWebsite = !!listing.website
  const hasDescription = listing.description && listing.description.length >= 100
  const hasOperatorHint = listing.is_owner_operator === true

  return hasWebsite || hasDescription || hasOperatorHint
}

// ── Scoring ──────────────────────────────────────────────────────────

function descriptionLengthScore(listing, baseWeight) {
  // Linear ramp from 200 to 500 chars at full weight.
  if (!listing.description) return 0
  const len = listing.description.length
  if (len < 200) return 0
  const progress = Math.min((len - 200) / (500 - 200), 1)
  return Math.round(baseWeight * progress)
}

function geoClusterFlag(listing, allListings, radiusKm = 25) {
  // True if ≥1 other listing is within radiusKm. Haversine.
  if (!listing.lat || !listing.lng) return false
  const R = 6371
  const lat1 = parseFloat(listing.lat) * Math.PI / 180
  const lng1 = parseFloat(listing.lng) * Math.PI / 180
  for (const other of allListings) {
    if (other.id === listing.id) continue
    if (!other.lat || !other.lng) continue
    const lat2 = parseFloat(other.lat) * Math.PI / 180
    const lng2 = parseFloat(other.lng) * Math.PI / 180
    const dLat = lat2 - lat1
    const dLng = lng2 - lng1
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
    const d = 2 * R * Math.asin(Math.sqrt(a))
    if (d <= radiusKm) return true
  }
  return false
}

function scoreListing({ listing, slotType, weights, allListings, anyPitchIds }) {
  let score = 0
  const breakdown = {}

  const w = (name) => weights.get(name)?.weight ?? 0

  // description_length
  if (weights.has('description_length')) {
    const v = descriptionLengthScore(listing, w('description_length'))
    if (v > 0) { score += v; breakdown.description_length = v }
  }

  // founding_date
  if (weights.has('founding_date') && listing.founded_year && listing.founded_year > 0) {
    score += w('founding_date'); breakdown.founding_date = w('founding_date')
  }

  // independence_confirmed (TRUE only — NULL = no signal, do not score)
  if (weights.has('independence_confirmed') && listing.independence_confirmed === true) {
    score += w('independence_confirmed'); breakdown.independence_confirmed = w('independence_confirmed')
  }

  // is_owner_operator (TRUE only — NULL = no signal, do not score)
  if (weights.has('is_owner_operator') && listing.is_owner_operator === true) {
    score += w('is_owner_operator'); breakdown.is_owner_operator = w('is_owner_operator')
  }

  // single_location (TRUE only — NULL = unknown, do not score)
  if (weights.has('single_location') && listing.single_location === true) {
    score += w('single_location'); breakdown.single_location = w('single_location')
  }

  // regional_location (not capital-city CBD)
  if (weights.has('regional_location') && isRegional(listing)) {
    score += w('regional_location'); breakdown.regional_location = w('regional_location')
  }

  // recently_added (under 12 months) — applies to general slot only;
  // weights table enforces this via slot_type filtering on load.
  if (weights.has('recently_added') && listing.created_at) {
    const ageMonths = (Date.now() - new Date(listing.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    if (ageMonths <= 12) {
      score += w('recently_added'); breakdown.recently_added = w('recently_added')
    }
  }

  // new_producer_baseline — flat bonus for new-producer slot only;
  // weights table enforces this via slot_type filtering on load.
  if (weights.has('new_producer_baseline')) {
    score += w('new_producer_baseline'); breakdown.new_producer_baseline = w('new_producer_baseline')
  }

  // no_prior_pitch_attempts (no row in pitches with this listing_id)
  if (weights.has('no_prior_pitch_attempts') && !anyPitchIds.has(listing.id)) {
    score += w('no_prior_pitch_attempts'); breakdown.no_prior_pitch_attempts = w('no_prior_pitch_attempts')
  }

  // geographic_cluster (≥1 other listing within 25km)
  if (weights.has('geographic_cluster') && geoClusterFlag(listing, allListings, 25)) {
    score += w('geographic_cluster'); breakdown.geographic_cluster = w('geographic_cluster')
  }

  // heritage_significance (TRUE only)
  if (weights.has('heritage_significance') && listing.heritage_significance === true) {
    score += w('heritage_significance'); breakdown.heritage_significance = w('heritage_significance')
  }

  return { score: Math.min(score, 100), breakdown }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now()

  const [groups, articleListingIds, activePitchIds, anyPitchIds, mediaDisqualifiedIds, weights, listings] =
    await Promise.all([
      loadCommercialGroups(),
      loadRecentArticleListingIds(24),
      loadActivePitchListingIds(),
      loadAnyPitchListingIds(),
      loadMediaCoverageDisqualifiedIds(),
      loadScoreWeights(slotType, vertical),
      loadListings(vertical),
    ])

  const disqualified = []
  const passed = []

  for (const L of listings) {
    const reasons = applyHardDisqualifiers({
      listing: L, slotType, groups,
      articleListingIds, activePitchIds, mediaDisqualifiedIds,
    })
    if (reasons.length > 0) {
      disqualified.push({ id: L.id, name: L.name, reasons })
      continue
    }
    const passesFloor = slotType === 'general' ? generalSlotFloor(L) : newProducerSlotFloor(L)
    if (!passesFloor) {
      disqualified.push({ id: L.id, name: L.name, reasons: ['below_minimum_data_floor'] })
      continue
    }
    passed.push(L)
  }

  const scored = passed.map(L => {
    const { score, breakdown } = scoreListing({
      listing: L, slotType, weights, allListings: listings, anyPitchIds,
    })
    return { listing: L, score, breakdown }
  })

  scored.sort((a, b) => b.score - a.score)

  const out = {
    vertical,
    slot_type: slotType,
    elapsed_ms: Date.now() - t0,
    candidate_pool_size: listings.length,
    disqualified_count: disqualified.length,
    passed_floor_count: passed.length,
    weights_applied: Object.fromEntries(
      Array.from(weights.entries()).map(([name, w]) => [name, { weight: w.weight, slot_type: w.slot_type, vertical: w.vertical }])
    ),
    disqualified_breakdown: countReasons(disqualified),
    candidates: scored.slice(0, limit).map((c, i) => ({
      rank: i + 1,
      score: c.score,
      breakdown: c.breakdown,
      listing: {
        id: c.listing.id,
        name: c.listing.name,
        slug: c.listing.slug,
        vertical: c.listing.vertical,
        region: c.listing.region,
        state: c.listing.state,
        suburb: c.listing.suburb,
        founded_year: c.listing.founded_year,
        description_length: c.listing.description?.length || 0,
        is_owner_operator: c.listing.is_owner_operator,
        independence_confirmed: c.listing.independence_confirmed,
        single_location: c.listing.single_location,
        heritage_significance: c.listing.heritage_significance,
        awards_count: Array.isArray(c.listing.awards) ? c.listing.awards.length : 0,
        website: c.listing.website,
      },
    })),
  }

  console.log(JSON.stringify(out, null, 2))
}

function countReasons(disqualified) {
  const c = {}
  for (const d of disqualified) {
    for (const r of d.reasons) c[r] = (c[r] || 0) + 1
  }
  return c
}

main().catch(e => {
  console.error(e.stack || e.message || String(e))
  process.exit(1)
})
