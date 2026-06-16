/**
 * Vertical replenishment — the single source of truth for topping a vertical's
 * candidate queue up to a target depth.
 *
 * Both the daily prospect cron and the floor-guarantee cron call
 * `replenishVertical`, so discovery behaviour (geography, dedup, gating) stays
 * consistent everywhere.
 *
 * Geography: the original prospector only searched the eight capital-city
 * centres, which became exhausted (~90% of hits were duplicates killed at
 * Gate 0). This module searches a rotating slice of regional towns FIRST —
 * fresh geography with un-prospected venues — and falls back to the capital
 * centres to top up. The town name is injected into the query text (not just
 * the location bias) because Google Places Text Search ranks by query text.
 *
 * Pipeline: each surviving candidate runs through the existing 5-gate
 * verification pipeline (runPipeline) unchanged — every candidate is a real,
 * Google-verified business. Nothing here invents venues.
 */

import { runPipeline } from './pipeline.js'
import { discoverCandidates, isInAustralia, STATE_CENTERS } from './google-places.js'
import { discoverFromOSM } from './osm-overpass.js'
import { trigramSimilarity } from './gates.js'
import { pickCenters, dayOfYear } from './regional-centers.js'

export const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']
export const WEBSITE_EXEMPT_VERTICALS = ['field']

export const VERTICAL_NAMES = {
  sba: 'Small Batch Atlas',
  collection: 'Culture Atlas',
  craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas',
  rest: 'Rest Atlas',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

// The verticals the Google-Places prospector can replenish automatically.
// `way` is intentionally excluded — Way listings require cultural-authority
// vetting (Aboriginal-led experiences etc.) and are seeded through a separate,
// supervised web-discovery pipeline, not auto-prospected from Google Places.
export const AUTO_VERTICALS = Object.keys(VERTICAL_NAMES)

/**
 * Build the dedup sets once, shared across a multi-vertical run.
 * @returns {Promise<{existingNames:Set<string>, existingDomains:Set<string>, existingCoords:{lat:number,lng:number}[]}>}
 */
export async function buildDedupSets(sb) {
  const existingNames = new Set()
  const existingDomains = new Set()
  const existingCoords = []

  const { data: existingListings } = await sb
    .from('listings')
    .select('name, website, lat, lng')
    .eq('status', 'active')
    .limit(20000)

  for (const l of (existingListings || [])) {
    if (l.name) existingNames.add(l.name.toLowerCase().trim())
    if (l.website) existingDomains.add(normaliseDomain(l.website))
    if (l.lat && l.lng) existingCoords.push({ lat: l.lat, lng: l.lng })
  }

  // All candidates (any status) — converted/rejected ones are still dupes.
  const { data: existingCandidates } = await sb
    .from('listing_candidates')
    .select('name, website_url')
    .limit(20000)

  for (const c of (existingCandidates || [])) {
    if (c.name) existingNames.add(c.name.toLowerCase().trim())
    if (c.website_url) existingDomains.add(normaliseDomain(c.website_url))
  }

  return { existingNames, existingDomains, existingCoords }
}

/**
 * Build the ordered list of search areas for a vertical.
 * Regional towns first (fresh supply), capital cities last (top-up), the whole
 * thing ordered by state coverage so the thinnest states are searched first.
 *
 * @param {Record<string,number>} coverageByState
 * @param {object} opts - { regionalPerState, rotationSeed }
 * @returns {{state:string, placeLabel:string, center:{lat,lng}, radius:number, kind:string}[]}
 */
export function buildSearchAreas(coverageByState, { regionalPerState = 3, rotationSeed = 0 } = {}) {
  const statesThinFirst = STATES
    .map(s => ({ state: s, count: coverageByState[s] || 0 }))
    .sort((a, b) => a.count - b.count)
    .map(s => s.state)

  const areas = []
  for (const state of statesThinFirst) {
    // Regional towns (fresh geography) — a rotating slice so different runs
    // probe different towns over the week.
    for (const c of pickCenters(state, regionalPerState, rotationSeed)) {
      areas.push({ state, placeLabel: c.name, center: { lat: c.lat, lng: c.lng }, radius: 70000, kind: 'regional' })
    }
    // Capital centre (broad) — the historical, mostly-mined area.
    areas.push({ state, placeLabel: state, center: STATE_CENTERS[state], radius: 200000, kind: 'capital' })
  }
  return areas
}

/**
 * Top up one vertical toward `target`, queuing at most `maxNew` this run.
 *
 * @param {object} sb - Supabase admin client
 * @param {string} vertical
 * @param {object} opts
 *   - target: desired pending depth (default 100)
 *   - maxNew: cap on new candidates queued this run (default 12)
 *   - dryRun: run gates but don't insert (default false)
 *   - dedup: shared dedup sets from buildDedupSets (built lazily if omitted)
 *   - regionalPerState: regional towns to probe per state (default 3)
 *   - rotationSeed: rotation offset (default = day-of-year)
 *   - deadlineMs: absolute Date.now() budget; stop discovering past it
 *   - maxPerSearch: results per query (default 8)
 *   - log: (msg) => void
 * @returns detailed per-vertical report
 */
export async function replenishVertical(sb, vertical, opts = {}) {
  const {
    target = 100,
    maxNew = 12,
    dryRun = false,
    regionalPerState = 3,
    rotationSeed = dayOfYear(),
    deadlineMs = null,
    maxPerSearch = 8,
    // OSM Overpass is the primary, quota-free discovery source. Google Places is
    // an optional top-up — only swept when its quota is healthy (the cron probes
    // it once and passes the verdict down here).
    osmEnabled = true,
    osmMaxResults = 150,
    // Override the OSM sweep areas. Default is per-state (thinnest-first) — good
    // for the daily cron (light queries, rotating geography). A one-shot bulk
    // seed can pass ['AU'] to do a single continent-wide query per vertical,
    // which makes far fewer Overpass requests (no public-instance rate-limiting).
    osmAreaOverride = null,
    placesAvailable = true,
    log = () => {},
  } = opts

  const dedup = opts.dedup || await buildDedupSets(sb)
  const verticalName = VERTICAL_NAMES[vertical] || vertical

  // Current depth → slots to fill this run.
  const { count: pendingCount } = await sb
    .from('listing_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('vertical', vertical)

  const pendingBefore = pendingCount || 0
  const slotsAvailable = Math.max(0, target - pendingBefore)
  const maxToQueue = Math.min(slotsAvailable, maxNew)

  if (maxToQueue === 0) {
    return {
      vertical, verticalName, pending_before: pendingBefore,
      discovered: 0, queued: 0, gates_passed_but_not_inserted: 0, disqualified: 0,
      disqualified_by_gate: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
      reached_target: true, status: 'skipped',
      reason: `Already at ${pendingBefore}/${target} pending`,
    }
  }

  log(`[replenish] ${vertical}: ${pendingBefore} pending, targeting up to ${maxToQueue} new`)

  // State coverage → order areas thinnest-first.
  const coverage = {}
  for (const s of STATES) {
    const { count } = await sb
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('vertical', vertical)
      .eq('state', s)
    coverage[s] = count || 0
  }

  // Discovery areas, in priority order:
  //   1. OSM per-state (free, no quota, reliable) — the primary supply. States
  //      are swept thinnest-coverage-first so the weakest states fill first.
  //   2. Google Places regional + capital sweeps — only when its quota is
  //      healthy; otherwise skipped entirely (every call would OVER_QUERY_LIMIT).
  const statesThinFirst = STATES
    .map(s => ({ state: s, count: coverage[s] || 0 }))
    .sort((a, b) => a.count - b.count)
    .map(s => s.state)

  const osmAreaList = osmAreaOverride || statesThinFirst
  const osmAreas = osmEnabled
    ? osmAreaList.map(state => ({ source: 'osm', state, placeLabel: `${state} (OSM)` }))
    : []
  const placesAreas = placesAvailable
    ? buildSearchAreas(coverage, { regionalPerState, rotationSeed }).map(a => ({ ...a, source: 'places' }))
    : []
  const areas = [...osmAreas, ...placesAreas]

  let queued = 0
  let gatesPassedButNotInserted = 0
  let disqualified = 0
  let discovered = 0
  const disqualifiedByGate = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }
  const areasSearched = []
  let timedOut = false

  for (const area of areas) {
    if (queued >= maxToQueue) break
    if (deadlineMs && Date.now() >= deadlineMs) { timedOut = true; break }

    let raw = []
    try {
      if (area.source === 'osm') {
        raw = await discoverFromOSM(vertical, area.state, { maxResults: osmMaxResults, deadlineMs, log })
      } else {
        raw = await discoverCandidates(vertical, area.state, {
          maxPerSearch,
          regionCenter: area.center,
          radius: area.radius,
          placeLabel: area.placeLabel,
          // Skip the paid detail call for venues already known to us.
          skipIfKnown: (name) => dedup.existingNames.has(name.toLowerCase().trim()),
        })
      }
    } catch (err) {
      log(`[replenish] ${vertical} discover failed @ ${area.placeLabel}: ${err.message}`)
      continue
    }
    areasSearched.push(area.placeLabel)

    // Pre-filter: dedup against master DB + intra-run.
    const filtered = []
    for (const candidate of raw) {
      const nameLower = candidate.name.toLowerCase().trim()
      if (dedup.existingNames.has(nameLower)) continue

      let fuzzyDupe = false
      for (const existing of dedup.existingNames) {
        if (trigramSimilarity(nameLower, existing) > 0.85) { fuzzyDupe = true; break }
      }
      if (fuzzyDupe) continue

      if (candidate.website_url) {
        const domain = normaliseDomain(candidate.website_url)
        if (domain && dedup.existingDomains.has(domain)) continue
      }
      if (candidate.lat && candidate.lng) {
        const tooClose = dedup.existingCoords.some(c =>
          haversineMeters(c.lat, c.lng, candidate.lat, candidate.lng) < 100)
        if (tooClose) continue
      }
      if (candidate.lat && candidate.lng && !isInAustralia(candidate.lat, candidate.lng)) continue
      if (!candidate.website_url && !WEBSITE_EXEMPT_VERTICALS.includes(vertical)) continue

      filtered.push(candidate)
      dedup.existingNames.add(nameLower)
      if (candidate.website_url) dedup.existingDomains.add(normaliseDomain(candidate.website_url))
      if (candidate.lat && candidate.lng) dedup.existingCoords.push({ lat: candidate.lat, lng: candidate.lng })
    }

    discovered += filtered.length

    for (const candidate of filtered) {
      if (queued >= maxToQueue) break
      try {
        const result = await runPipeline(candidate, sb, { dryRun, verbose: false })
        if (result.inserted) {
          queued++
          log(`[replenish] QUEUED "${candidate.name}" (${area.placeLabel}) score ${result.score}`)
        } else if (result.passed && !result.inserted) {
          gatesPassedButNotInserted++
        } else {
          disqualified++
          if (result.failedGate != null) {
            disqualifiedByGate[result.failedGate] = (disqualifiedByGate[result.failedGate] || 0) + 1
          }
        }
      } catch (err) {
        log(`[replenish] pipeline error "${candidate.name}": ${err.message}`)
        disqualified++
      }
      await new Promise(r => setTimeout(r, 800))
    }
  }

  const pendingAfter = pendingBefore + queued
  return {
    vertical, verticalName,
    pending_before: pendingBefore,
    pending_after: pendingAfter,
    discovered, queued,
    gates_passed_but_not_inserted: gatesPassedButNotInserted,
    disqualified,
    disqualified_by_gate: disqualifiedByGate,
    areas_searched: areasSearched,
    reached_target: pendingAfter >= target,
    timed_out: timedOut,
    status: 'ok',
  }
}

// ─── Helpers (mirrors the prospect cron's originals) ─────────────

export function normaliseDomain(url) {
  if (!url) return null
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname
      .replace(/^www\./, '').toLowerCase()
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase()
  }
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
