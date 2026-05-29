#!/usr/bin/env node
/**
 * Seed Culture Atlas live-music-venue and comedy-club candidates into
 * listing_candidates, sourced live from Google Places.
 *
 * These are PROPOSALS for human review — they land in the Candidate Review
 * queue (status='pending'), never as live listings.
 *
 * Pipeline per (city × search term):
 *   1. Google Places Text Search (location-biased to the city)
 *   2. Within-batch dedup (place_id + normalised name)
 *   3. Drop non-OPERATIONAL businesses (Google business_status)
 *   4. Name dedup vs existing collection listings + candidates  (no API call)
 *   5. Google Place Details for survivors (website, phone, address, types) — rate-limited
 *   6. Independence pre-screen (chain groups + temporary live-entertainment majors)
 *   7. Host dedup vs existing collection listings
 *   8. Scope filter — drop clear non-venues (promoter/ticketing pages, festivals,
 *      schools, community sport clubs); stands in for the prospector's vertical-fit gate
 *   9. Classify clean vs VERIFY, build row, insert (or report under --dry-run)
 *
 * INDEPENDENCE is a light pre-screen, not a verdict. Only outright group/major
 * matches are excluded. Anything uncertain is INCLUDED and flagged VERIFY for
 * the human reviewer. Government/council venues are NOT excluded.
 *
 * Usage:
 *   node scripts/seed-livemusic-comedy-candidates.mjs --dry-run --max-cities=2
 *   node scripts/seed-livemusic-comedy-candidates.mjs --dry-run
 *   node scripts/seed-livemusic-comedy-candidates.mjs
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * GOOGLE_PLACES_API_KEY
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import {
  searchPlaces,
  getPlaceDetails,
  extractState,
  extractRegion,
} from '../lib/prospector/google-places.js'

config({ path: '.env.local' })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ─── Run controls ───────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run')
const MAX_CITIES = (() => {
  const a = process.argv.find(x => x.startsWith('--max-cities='))
  return a ? parseInt(a.split('=')[1], 10) : Infinity
})()

const VERTICAL = 'collection'
const SOURCE = 'automated_discovery' // SOURCE_MAP[google_places] in lib/prospector/pipeline.js
const SOURCE_DETAIL = 'culture_atlas_livemusic_comedy_seed_2026_05 (Google Places)'

const TOP_N_PER_SEARCH = 8
const MAX_INSERT = 100 // global ceiling — top of Matt's 50-100 guide
// Per-city, per-type caps keep the batch balanced: a heavy live-music skew,
// jazz/listening rooms represented (feature), scarce comedy included, and the
// two big cities prevented from swamping regional coverage.
const CAP_COMEDY_PER_CITY = 3
const CAP_JAZZ_PER_CITY = 2 // jazz/listening-room character
const CAP_MUSIC_PER_CITY = 5 // non-jazz live music
const SEARCH_SLEEP_MS = 1200
const DETAIL_SLEEP_MS = 1100
const SEARCH_RADIUS_M = 30000 // ~30km city bias

const CONF_CLEAN = 0.6
const CONF_VERIFY = 0.45

// ─── Targets ────────────────────────────────────────────────────
const CITIES = [
  { name: 'Melbourne', state: 'VIC', lat: -37.8136, lng: 144.9631 },
  { name: 'Sydney', state: 'NSW', lat: -33.8688, lng: 151.2093 },
  { name: 'Brisbane', state: 'QLD', lat: -27.4698, lng: 153.0251 },
  { name: 'Adelaide', state: 'SA', lat: -34.9285, lng: 138.6007 },
  { name: 'Perth', state: 'WA', lat: -31.9505, lng: 115.8605 },
  { name: 'Newcastle', state: 'NSW', lat: -32.9283, lng: 151.7817 },
  { name: 'Wollongong', state: 'NSW', lat: -34.4278, lng: 150.8931 },
  { name: 'Geelong', state: 'VIC', lat: -38.1499, lng: 144.3617 },
  { name: 'Castlemaine', state: 'VIC', lat: -37.0636, lng: 144.2169 },
  { name: 'Byron Bay', state: 'NSW', lat: -28.6474, lng: 153.6020 },
  { name: 'Hobart', state: 'TAS', lat: -42.8821, lng: 147.3272 },
  { name: 'Fremantle', state: 'WA', lat: -32.0569, lng: 115.7439 },
  { name: 'Gold Coast', state: 'QLD', lat: -28.0167, lng: 153.4000 },
]

// Search term → proposed primary type. Heavy skew to live music (4 terms) vs
// comedy (2 terms); comedy clubs are genuinely scarce, which is correct.
// 'jazz club' carries a finer "character" (recorded as Live Music Venue, not a
// separate type, per the type model).
const SEARCH_TERMS = [
  { term: 'live music venue', category: 'live_music_venue', character: null },
  { term: 'band room', category: 'live_music_venue', character: null },
  { term: 'music venue', category: 'live_music_venue', character: null },
  { term: 'jazz club', category: 'live_music_venue', character: 'jazz / listening room' },
  { term: 'comedy club', category: 'comedy_club', character: null },
  { term: 'comedy venue', category: 'comedy_club', character: null },
]

// ─── TEMPORARY inline exclusion list ────────────────────────────
// Live-entertainment corporates NOT yet modelled in commercial_groups. Match on
// venue NAME or the venue's OWN website domain only — NEVER on ticketing/booking
// usage (an independent room that merely sells tickets via Ticketmaster/Moshtix
// is IN scope). This is deliberately temporary: do NOT build permanent group
// infrastructure here. Remove once these are added to commercial_groups.
const LIVE_ENTERTAINMENT_MAJORS = [
  { name: 'Live Nation', nameTokens: ['live nation'], domains: ['livenation.com.au', 'livenation.com'] },
  { name: 'Ticketmaster', nameTokens: ['ticketmaster'], domains: ['ticketmaster.com.au', 'ticketmaster.com'] },
  { name: 'TEG / Ticketek', nameTokens: ['ticketek', 'teg dainty'], domains: ['teg.com.au', 'ticketek.com.au'] },
  { name: 'AEG Presents', nameTokens: ['aeg presents'], domains: ['aegpresents.com'] },
  { name: 'Frontier Touring', nameTokens: ['frontier touring'], domains: ['frontiertouring.com'] },
  { name: 'Mushroom Group', nameTokens: ['mushroom group'], domains: ['mushroomgroup.com'] },
  { name: 'Moshtix', nameTokens: ['moshtix'], domains: ['moshtix.com.au'] },
]
// Known directly-operated venues (venue-operating arms of a major). Tightly
// scoped to avoid false-positives on similarly-named community halls.
const MAJOR_OPERATED_VENUES = [
  { operator: 'Live Nation (VIC)', match: (name, state) => /\bfestival hall\b/i.test(name) && state === 'VIC' },
]

// Name signals that a venue may be a pub/hotel where live music could be
// incidental (pokies-pub risk) — INCLUDE but flag VERIFY for human judgement.
// Many iconic AU music rooms are "X Hotel"; the reviewer confirms scope.
const PUB_HOTEL_NAME_RE = /\b(hotel|tavern|pub|sports bar|rsl|leagues club|bowls club|workers club|services club)\b/i

// ─── Scope pre-screen (stands in for the prospector's vertical-fit gate) ──
// This direct-insert script bypasses the Prospector's Claude vertical-fit gate,
// so Google "comedy/music venue" searches drag in non-venues (promoter pages,
// festivals, classes, community sport clubs). Drop the clear non-venues here;
// flag the borderline civic/club rooms as VERIFY rather than excluding them.
//
// Domains where a "venue" result is really a promoter, ticketing agent, or
// social/link-tree page — NOT the venue's own site. A row whose only web
// presence is one of these is almost never a fixed, visitable room.
const PROMOTER_DOMAINS = [
  'koc.lol', 'standupsydney.com', 'trybooking.com', 'humanitix.com',
  'eventbrite.com', 'eventbrite.com.au', 'linktr.ee', 'linktree', 'bio.site',
  'moshtix.com.au', 'oztix.com.au', 'stickytickets.com.au', 'laughtix.com',
  'instagram.com', 'facebook.com', 'ticketek.com.au', 'ticketmaster.com',
  'ticketmaster.com.au',
]
const isPromoterDomain = (h) => !!h && PROMOTER_DOMAINS.some(d => h === d || h.endsWith('.' + d))

// Returns { exclude: <reason|null>, verify: [<reason>...] }. exclude → drop the
// row entirely (clear non-venue). verify reasons are merged into the candidate's
// VERIFY flags so the human reviewer makes the final call.
function classifyScope(name, host) {
  const n = name || ''
  if (isPromoterDomain(host)) {
    return { exclude: `promoter/ticketing/social domain "${host}" — not the venue's own site`, verify: [] }
  }
  if (/festival/i.test(n) && !/(hall|centre|center|theatre|theater|club|room)/i.test(n)) {
    return { exclude: 'name reads as a festival/event, not a fixed venue', verify: [] }
  }
  if (/\b(comedy|music|drama|acting|improv)\s+school\b/i.test(n)) {
    return { exclude: 'name reads as a school/class, not a performance venue', verify: [] }
  }
  if (/\b(bowling club|bowls club|surf life saving|surf club|golf club|yacht club|sailing club|lions club|rotary club)\b/i.test(n)) {
    return { exclude: 'community sport/service club — culture is incidental, out of scope', verify: [] }
  }
  const verify = []
  if (/\b(rsl|leagues club|services club|workers'? club)\b/i.test(n)) {
    verify.push('RSL/leagues/services club — confirm a genuine dedicated live-music/comedy room')
  }
  if (/\b(theatre|theater|playhouse|civic centre|civic hall|town hall|memorial hall|arts centre|arts center|performing arts)\b/i.test(n)) {
    verify.push('general performing-arts/civic venue — confirm dedicated live-music or comedy programming, not a hire hall')
  }
  return { exclude: null, verify }
}

// ─── Helpers ────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const lt = (s) => (s || '').toLowerCase().trim()
const normName = (s) => lt(s).replace(/[^a-z0-9]+/g, ' ').trim()

function parseHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.startsWith('www.') ? host.slice(4) : host
  } catch {
    return null
  }
}

// ─── commercial_groups (pub_venue + collection-scoped) ──────────
async function loadGroups() {
  const { data, error } = await sb
    .from('commercial_groups')
    .select('group_name, brands, domains, vertical_scope, category')
    .or('category.eq.pub_venue,vertical_scope.cs.{collection}')
  if (error) {
    console.error(`Failed to load commercial_groups: ${error.message}`)
    process.exit(1)
  }
  return data || []
}

function chainCheck(name, host, groups) {
  const candName = lt(name)
  for (const g of groups) {
    if (lt(g.group_name) === candName) return { matched: g.group_name, reason: `name == group_name "${g.group_name}"` }
    if (Array.isArray(g.brands)) {
      for (const b of g.brands) if (lt(b) === candName) return { matched: g.group_name, reason: `name == brand "${b}"` }
    }
    if (host && Array.isArray(g.domains)) {
      for (const d of g.domains) {
        const norm = (d || '').toLowerCase().trim().replace(/^www\./, '')
        if (norm && (host === norm || host.endsWith('.' + norm))) {
          return { matched: g.group_name, reason: `host "${host}" == domain "${d}"` }
        }
      }
    }
  }
  return null
}

function majorCheck(name, host, state) {
  const n = lt(name)
  for (const m of LIVE_ENTERTAINMENT_MAJORS) {
    for (const tok of m.nameTokens) if (n.includes(tok)) return { matched: m.name, reason: `name contains "${tok}"` }
    if (host) {
      for (const d of m.domains) {
        const norm = d.toLowerCase().replace(/^www\./, '')
        if (host === norm || host.endsWith('.' + norm)) return { matched: m.name, reason: `host "${host}" == "${d}"` }
      }
    }
  }
  for (const v of MAJOR_OPERATED_VENUES) {
    if (v.match(name, state)) return { matched: v.operator, reason: `directly-operated venue (name+state)` }
  }
  return null
}

// ─── Existing-listing / existing-candidate loads ───────────────
async function loadCollectionListings() {
  const all = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('listings')
      .select('name, website')
      .eq('vertical', VERTICAL)
      .range(from, from + pageSize - 1)
    if (error) {
      console.error(`Failed to load listings: ${error.message}`)
      process.exit(1)
    }
    all.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return all
}

async function loadCollectionCandidateNames() {
  const map = new Map() // normName -> status
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('listing_candidates')
      .select('name, status')
      .eq('vertical', VERTICAL)
      .range(from, from + pageSize - 1)
    if (error) {
      console.error(`Failed to load listing_candidates: ${error.message}`)
      process.exit(1)
    }
    for (const c of data || []) map.set(normName(c.name), c.status)
    if (!data || data.length < pageSize) break
  }
  return map
}

// ─── Insert ─────────────────────────────────────────────────────
async function insertCandidate(row) {
  const { error } = await sb.from('listing_candidates').insert(row)
  if (error) {
    if (error.code === '23505') return { outcome: 'already_exists' }
    return { outcome: 'error', error: `[${error.code}] ${error.message}` }
  }
  return { outcome: 'inserted' }
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  console.log(`\nCulture Atlas — Live Music + Comedy candidate seeder${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log('─'.repeat(64))
  const cities = MAX_CITIES === Infinity ? CITIES : CITIES.slice(0, MAX_CITIES)
  console.log(`Cities: ${cities.length}  |  Terms: ${SEARCH_TERMS.length}  |  topN/search: ${TOP_N_PER_SEARCH}`)
  console.log(`Searches planned: ${cities.length * SEARCH_TERMS.length}`)

  // Stage 0: load reference data
  const [groups, listings, existingCandNames] = await Promise.all([
    loadGroups(),
    loadCollectionListings(),
    loadCollectionCandidateNames(),
  ])
  console.log(`\nLoaded ${groups.length} independence groups: ${groups.map(g => g.group_name).join(', ')}`)
  console.log(`Loaded ${listings.length} existing collection listings, ${existingCandNames.size} existing candidates`)
  const listingNames = new Set(listings.map(l => normName(l.name)))
  const listingHosts = new Map()
  for (const l of listings) {
    const h = parseHost(l.website)
    if (h) listingHosts.set(h, l.name)
  }

  // ─── Stage 1: search + within-batch dedup ─────────────────────
  console.log('\n[1] Google Places search:')
  const batch = new Map() // place_id -> { ...raw, terms:Set, category, character }
  const seenNames = new Set()
  let searchCount = 0
  let rawResultCount = 0
  for (const city of cities) {
    for (const t of SEARCH_TERMS) {
      let results = []
      try {
        results = await searchPlaces(`${t.term} ${city.name}`, { lat: city.lat, lng: city.lng }, { radius: SEARCH_RADIUS_M })
      } catch (err) {
        console.log(`  [SEARCH-FAIL] "${t.term}" @ ${city.name}: ${err.message}`)
      }
      searchCount++
      rawResultCount += results.length
      for (const r of results.slice(0, TOP_N_PER_SEARCH)) {
        const nn = normName(r.name)
        if (batch.has(r.place_id)) {
          const ex = batch.get(r.place_id)
          ex.terms.add(t.term)
          // Jazz is a finer character, not a separate type — upgrade if any
          // matched term is the jazz one (only for live-music venues).
          if (t.character && ex.category === 'live_music_venue') ex.character = t.character
          continue
        }
        if (seenNames.has(nn)) continue // same name, different place_id
        seenNames.add(nn)
        batch.set(r.place_id, {
          place_id: r.place_id,
          name: r.name,
          lat: r.geometry?.location?.lat ?? null,
          lng: r.geometry?.location?.lng ?? null,
          rating: r.rating ?? null,
          rating_count: r.user_ratings_total ?? null,
          business_status: r.business_status ?? null,
          formatted_address: r.formatted_address ?? null,
          types: r.types ?? [],
          terms: new Set([t.term]),
          category: t.category,
          character: t.character,
          searchCity: city,
        })
      }
      await sleep(SEARCH_SLEEP_MS)
    }
    process.stdout.write(`\r  Searched ${searchCount}/${cities.length * SEARCH_TERMS.length} — unique places so far: ${batch.size}        `)
  }
  console.log(`\n  ${searchCount} searches, ${rawResultCount} raw results → ${batch.size} unique places`)

  // ─── Stage 2: cheap pre-details filters ───────────────────────
  console.log('\n[2] Pre-details filters (closed / existing-listing / existing-candidate):')
  const closed = [], dupListingName = [], dupCandName = []
  const toDetail = []
  for (const p of batch.values()) {
    if (p.business_status && p.business_status !== 'OPERATIONAL') { closed.push(p.name); continue }
    if (listingNames.has(normName(p.name))) { dupListingName.push(p.name); continue }
    const candStatus = existingCandNames.get(normName(p.name))
    if (candStatus) { dupCandName.push(`${p.name} (${candStatus})`); continue }
    toDetail.push(p)
  }
  console.log(`  closed=${closed.length}  dup-listing-name=${dupListingName.length}  dup-candidate-name=${dupCandName.length}`)
  console.log(`  → ${toDetail.length} proceed to Place Details`)

  // ─── Stage 3: details + independence + host dedup + classify ──
  console.log(`\n[3] Place Details + independence pre-screen (${toDetail.length} places, ~${DETAIL_SLEEP_MS}ms each):`)
  const chainRejected = [], majorRejected = [], dupListingHost = [], detailFailed = [], scopeExcluded = []
  const accepted = []
  let i = 0
  for (const p of toDetail) {
    i++
    let d = null
    try {
      d = await getPlaceDetails(p.place_id)
    } catch (err) {
      console.log(`\n  [DETAIL-FAIL] ${p.name}: ${err.message}`)
      detailFailed.push(p.name)
      await sleep(DETAIL_SLEEP_MS)
      continue
    }
    await sleep(DETAIL_SLEEP_MS)
    if (!d) { detailFailed.push(p.name); continue }

    const bizStatus = d.business_status || p.business_status || null
    if (bizStatus && bizStatus !== 'OPERATIONAL') { closed.push(p.name); continue }

    const website = d.website || null
    const host = parseHost(website)
    const phone = d.formatted_phone_number || null
    const address = d.formatted_address || p.formatted_address || null
    const state = extractState(address) || p.searchCity.state
    const region = extractRegion(address) || p.searchCity.name
    const types = (d.types && d.types.length ? d.types : p.types) || []
    const rating = d.rating ?? p.rating ?? null
    const ratingCount = d.user_ratings_total ?? p.rating_count ?? null

    // Independence: chain groups
    const chain = chainCheck(p.name, host, groups)
    if (chain) {
      console.log(`\n  [CHAIN-REJECT] ${p.name} → ${chain.matched}: ${chain.reason}`)
      chainRejected.push({ name: p.name, matched: chain.matched })
      continue
    }
    // Independence: temporary live-entertainment majors
    const major = majorCheck(p.name, host, state)
    if (major) {
      console.log(`\n  [MAJOR-REJECT] ${p.name} → ${major.matched}: ${major.reason}`)
      majorRejected.push({ name: p.name, matched: major.matched })
      continue
    }
    // Host dedup vs existing listings
    if (host && listingHosts.has(host)) {
      dupListingHost.push({ name: p.name, matched: listingHosts.get(host) })
      continue
    }
    // Scope: drop clear non-venues (promoter pages, festivals, schools, sport
    // clubs); softer civic/club concerns become VERIFY flags below.
    const scope = classifyScope(p.name, host)
    if (scope.exclude) {
      console.log(`\n  [SCOPE-EXCLUDE] ${p.name}: ${scope.exclude}`)
      scopeExcluded.push({ name: p.name, reason: scope.exclude })
      continue
    }

    // Classify clean vs VERIFY (include either way)
    const verifyReasons = [...scope.verify]
    if (PUB_HOTEL_NAME_RE.test(p.name)) verifyReasons.push('name suggests pub/hotel — confirm dedicated live-music room, not incidental pokies-pub gigs')
    if (!website) verifyReasons.push('no website returned by Google — needs URL verification')
    const status = verifyReasons.length ? 'verify' : 'clean'

    accepted.push({
      place: p, website, host, phone, address, state, region, types, rating, ratingCount,
      bizStatus, status, verifyReasons,
    })
    process.stdout.write(`\r  Detailed ${i}/${toDetail.length} — accepted ${accepted.length}        `)
  }
  console.log(`\n  chain-rejected=${chainRejected.length}  major-rejected=${majorRejected.length}  dup-listing-host=${dupListingHost.length}  scope-excluded=${scopeExcluded.length}  detail-failed=${detailFailed.length}`)
  console.log(`  → ${accepted.length} accepted (clean=${accepted.filter(a => a.status === 'clean').length}, verify=${accepted.filter(a => a.status === 'verify').length})`)

  // ─── Stage 4: balance the batch ───────────────────────────────
  const cleanFirst = (x, y) => (y.status === 'clean' ? 1 : 0) - (x.status === 'clean' ? 1 : 0)
  const byCityMap = new Map()
  for (const a of accepted) {
    const k = a.place.searchCity.name
    if (!byCityMap.has(k)) byCityMap.set(k, [])
    byCityMap.get(k).push(a)
  }
  let capped = []
  let cappedOut = 0
  for (const [, list] of byCityMap) {
    const comedy = list.filter(a => a.place.category === 'comedy_club').sort(cleanFirst)
    const jazz = list.filter(a => a.place.category === 'live_music_venue' && a.place.character).sort(cleanFirst)
    const music = list.filter(a => a.place.category === 'live_music_venue' && !a.place.character).sort(cleanFirst)
    const keep = [
      ...comedy.slice(0, CAP_COMEDY_PER_CITY),
      ...jazz.slice(0, CAP_JAZZ_PER_CITY),
      ...music.slice(0, CAP_MUSIC_PER_CITY),
    ]
    cappedOut += list.length - keep.length
    capped.push(...keep)
  }
  // Global ceiling — trim VERIFY rows before clean ones, type-agnostic. The
  // per-city caps above already enforce the heavy live-music skew and scarce-
  // comedy inclusion, so this trim must not re-bias the type mix (an earlier
  // comedy-first rule over-protected comedy against the intended music skew).
  const keepPriority = (a) => (a.status === 'clean' ? 0 : 1)
  capped.sort((a, b) => keepPriority(a) - keepPriority(b))
  const overflow = Math.max(0, capped.length - MAX_INSERT)
  if (overflow) capped = capped.slice(0, MAX_INSERT)

  console.log(`\n[4] ${DRY_RUN ? 'Insert plan (dry run)' : 'Inserting'}: ${capped.length} (per-city capped out ${cappedOut}${overflow ? `, global overflow ${overflow}` : ''})`)
  let inserted = 0, alreadyExists = 0
  const insertErrors = []
  const proposed = []

  for (const a of capped) {
    const p = a.place
    const term = [...p.terms][0]
    const confidence = a.status === 'clean' ? CONF_CLEAN : CONF_VERIFY
    const noteParts = [
      `Sourced via Google Places search "${term}" near ${p.searchCity.name}, ${a.state}.`,
      a.types.length ? `Google categories: ${a.types.slice(0, 5).join(', ')}.` : null,
      a.rating ? `Rating ${a.rating} (${a.ratingCount || 0} reviews).` : null,
      a.bizStatus ? `Status: ${a.bizStatus.toLowerCase()}.` : null,
      p.character ? `Search match suggests a ${p.character}; record as Live Music Venue with this as finer character.` : null,
      ...a.verifyReasons.map(r => `VERIFY: ${r}.`),
    ].filter(Boolean)

    const row = {
      name: p.name.trim(),
      region: a.region || null,
      vertical: VERTICAL,
      website_url: a.website || null,
      confidence,
      source: SOURCE,
      source_detail: SOURCE_DETAIL,
      notes: noteParts.join(' '),
      status: 'pending',
      gate_results: {
        category: p.category,            // read by Candidate Review to pre-select the type dropdown
        character: p.character || null,  // finer character (not a dropdown value)
        presence_type: 'permanent',
        visitable: true,
        pokies: 'unknown',               // flag only — needs human/site verification
        independence: { status: a.status, reason: a.verifyReasons.join('; ') || 'no group/major match' },
        source: 'google_places',
        google_places: {
          place_id: p.place_id,
          business_status: a.bizStatus,
          rating: a.rating,
          rating_count: a.ratingCount,
          types: a.types,
          google_maps_url: `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
        },
        discovery: { term, terms: [...p.terms], city: p.searchCity.name, state: a.state },
      },
      pipeline_stage: 'curate',
      stage_entered_at: new Date().toISOString(),
      priority: Math.round(confidence * 10),
      google_place_id: p.place_id,
      phone: a.phone || null,
      address: a.address || null,
      lat: p.lat,
      lng: p.lng,
      state: a.state || null,
    }

    proposed.push({
      name: row.name, category: p.category, character: p.character,
      suburb: row.region, state: row.state, website: row.website_url,
      independence: a.status, terms: [...p.terms],
    })

    if (DRY_RUN) {
      console.log(`  [WOULD-INSERT] ${row.name} (${p.category}${p.character ? '/' + p.character : ''}) ${row.region}, ${row.state} [${a.status}] — ${row.website_url || 'no site'}`)
    } else {
      const r = await insertCandidate(row)
      if (r.outcome === 'inserted') { inserted++; }
      else if (r.outcome === 'already_exists') { alreadyExists++; }
      else { insertErrors.push({ name: row.name, error: r.error }) }
    }
  }

  // ─── Summary ──────────────────────────────────────────────────
  const byCat = {}, byState = {}
  for (const pr of proposed) {
    byCat[pr.category] = (byCat[pr.category] || 0) + 1
    byState[pr.state] = (byState[pr.state] || 0) + 1
  }
  console.log('\n=== Live Music + Comedy seed summary ===')
  console.log(`Unique places found:    ${batch.size}`)
  console.log(`Closed (skipped):       ${closed.length}`)
  console.log(`Dup existing listing:   ${dupListingName.length + dupListingHost.length} (name=${dupListingName.length}, host=${dupListingHost.length})`)
  console.log(`Dup existing candidate: ${dupCandName.length}`)
  console.log(`Chain-rejected:         ${chainRejected.length}${chainRejected.length ? ' — ' + chainRejected.map(r => `${r.name}→${r.matched}`).join('; ') : ''}`)
  console.log(`Major-rejected:         ${majorRejected.length}${majorRejected.length ? ' — ' + majorRejected.map(r => `${r.name}→${r.matched}`).join('; ') : ''}`)
  console.log(`Scope-excluded:         ${scopeExcluded.length}${scopeExcluded.length ? ' — ' + scopeExcluded.map(r => `${r.name} (${r.reason})`).join('; ') : ''}`)
  console.log(`Detail-call failures:   ${detailFailed.length}`)
  console.log(`Accepted:               ${accepted.length}  (clean=${accepted.filter(a => a.status === 'clean').length}, verify=${accepted.filter(a => a.status === 'verify').length})`)
  console.log(`Per-city capped out:    ${cappedOut} (depth available for a later batch)`)
  if (overflow) console.log(`Over global ceiling:    ${overflow} not inserted (ceiling ${MAX_INSERT})`)
  console.log(`Batch size:             ${capped.length}`)
  console.log(`By type:   ${Object.entries(byCat).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  console.log(`By state:  ${Object.entries(byState).sort().map(([k, v]) => `${k}=${v}`).join(', ')}`)
  if (DRY_RUN) {
    console.log(`Would insert:           ${capped.length}`)
  } else {
    console.log(`Inserted:               ${inserted}`)
    console.log(`Already exists (23505): ${alreadyExists}`)
    console.log(`Insert errors:          ${insertErrors.length}`)
    insertErrors.forEach(e => console.log(`  [ERROR] ${e.name}: ${e.error}`))
  }
}

main().catch(err => {
  console.error('\nFatal error:', err)
  process.exit(1)
})
