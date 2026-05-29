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
 *   9. Pokies pre-screen — fetch the venue's OWN site, scan for gaming signals;
 *      confirmed pokies → HARD EXCLUDE; can't determine → INCLUDE + VERIFY (pokies)
 *  10. Classify clean vs VERIFY, build row, insert (or report under --dry-run)
 *
 * Step 4 dedups against every existing collection candidate, so re-running is
 * ADDITIVE — it only proposes venues not already in the queue or live listings.
 *
 * Two pre-screens, two different finalities:
 *  - INDEPENDENCE is a light pre-screen, not a verdict. Only outright group/major
 *    matches are excluded; uncertainty is INCLUDED + flagged VERIFY. Government/
 *    council venues are NOT excluded on independence grounds.
 *  - POKIES is a HARD EXCLUDE (network pokies-free editorial line). Confirmed gaming
 *    excludes outright, same finality as a group match — even for public venues.
 *    Uncertainty is INCLUDED + flagged VERIFY (pokies) for review to resolve.
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
// Canonical source tag for the fit-ranked re-seed. The prior '...seed_2026_05b
// (Google Places, pokies-screened)' batch was deleted before this run: it was
// establishment-ranked (Google review count), which surfaced civic concert halls
// and pokies barns over the dedicated independent rooms that are the point. This
// batch ranks on dedicated-room FIT instead; a distinct tag keeps the trail clear.
const SOURCE_DETAIL = 'culture_atlas_livemusic_comedy_seed_2026_05c (Google Places, pokies-screened, fit-ranked)'

const TOP_N_PER_SEARCH = 12 // deeper than the first pass — its top results are deduped out
const MAX_INSERT = 100 // global ceiling — top of Matt's 50-100 guide
// Comedy floor: dedicated stand-up rooms are scarce nationally and get crushed
// by a global fit-ranked ceiling dominated by live-music rooms. Reserve the top
// DEDICATED comedy rooms BEFORE the global trim so comedy lands honestly in the
// low-20s. NOT a pad — if fewer dedicated comedy rooms exist, fewer are taken.
const COMEDY_FLOOR = 22
const SEARCH_SLEEP_MS = 500    // polite pacing for Google Places Text Search (~2 QPS)
const DETAIL_SLEEP_MS = 400    // polite pacing for Google Place Details (~2.5 QPS)
const DETAIL_TIMEOUT_MS = 12000 // HARD wall on a single Place Details call — never hang
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
  // NOTE: civic/presenting-house determination (concert halls, recital/arts
  // centres, powerhouses, the heritage-"theatre" guardrail) is handled by
  // classifyFit AFTER the site fetch, where the venue's own text can settle the
  // dedicated-room-vs-presenting-house call. Not flagged here to avoid double
  // handling — classifyFit hard-excludes true presenting houses and routes
  // genuinely uncertain heritage theatres to BORDERLINE + VERIFY (scope).
  return { exclude: null, verify }
}

// ─── Fit classification (dedicated-room fit, NOT review count) ──────────────
// The selection is ranked on whether a result is a DEDICATED room — the point of
// this vertical — not on Google review volume (which surfaced civic concert halls
// and pokies barns). Three buckets, judged from the venue's OWN site text + name
// + Google Places types:
//   DEDICATED  — a clear dedicated live-music room (band room / music venue /
//                live-music bar / listening room) OR a clear dedicated stand-up
//                comedy room. These are the batch.
//   BORDERLINE — plausibly in scope but unclear (mixed-use bar that may/may not
//                be gig-led, ambiguous self-description, heritage "theatre" name
//                we can't confirm). INCLUDED + VERIFY so the reviewer decides.
//   OFF_BRIEF  — affirmatively out: multi-purpose presenting houses, cabaret/
//                dinner-theatre/burlesque, backpacker hostels. DROPPED here.
// Absence of a clear signal is BORDERLINE, never OFF_BRIEF — we flag, not drop.

// Multi-purpose civic / presenting houses — hard scope-exclude. Strong civic
// tokens only; bare "theatre"/"playhouse" is deliberately NOT here (guardrail: a
// heritage venue now run as a dedicated gig/comedy room IS in scope).
const PRESENTING_HOUSE_RE = /\b(concert hall|recital (?:centre|center|hall)|performing arts (?:centre|center)|arts (?:centre|center)|powerhouse|festival (?:centre|center)|opera house|civic (?:centre|center|hall|theatre|theater)|town hall|memorial hall|entertainment centre|entertainment center|convention centre|convention center)\b/i
// Named presenting houses the strong regex misses by token alone (the cluster the
// establishment-ranked batch surfaced). Matched on the venue's normalised name.
const PRESENTING_HOUSE_NAMES = ['hamer hall', 'her majesty', 'comedy theatre', 'ipac', 'athenaeum theatre']
// Cabaret / dinner-theatre / burlesque — not a dedicated stand-up or music room.
const CABARET_RE = /\b(cabaret|dinner (?:theatre|theater|show)|burlesque|spiegeltent|dracula'?s)\b/i
// Backpacker / hostel lodging that runs only incidental gigs.
const HOSTEL_RE = /\b(backpackers?|hostel|nomads|yha)\b/i

// Dedicated-room signals. Name signals are strong (worth 2); site phrases are
// medium and counted (capped at 3); a night_club Google type is a weak nudge.
const MUSIC_NAME_RE = /\b(band ?room|live music|music venue|music hall|music club|music bar|listening room|jazz club|jazz bar|jazz room|blues bar|rock room)\b/i
const COMEDY_NAME_RE = /\b(comedy club|comedy room|comedy lounge|comedy cellar|comedy store|comedy bar|comics?|stand[- ]?up|rhino room|ha ha bar)\b/i
const MUSIC_SITE_RES = [/live music/i, /\blive bands?\b/i, /gig guide/i, /upcoming (?:gigs|shows)/i, /\bband room\b/i, /music venue/i, /touring (?:acts|bands)/i, /on stage tonight/i, /local bands/i, /lineup of (?:bands|artists)/i]
const COMEDY_SITE_RES = [/stand[- ]?up comedy/i, /comedy club/i, /comedy room/i, /open mic comedy/i, /comedy (?:lineup|line-up)/i, /\bcomedians?\b/i, /comedy night/i, /headline (?:comic|comedian)/i]

function scoreSignals(name, siteText, types) {
  const n = name || ''
  const s = siteText || ''
  const t = (types || []).map(x => lt(x))
  let music = 0, comedy = 0
  if (MUSIC_NAME_RE.test(n)) music += 2
  if (COMEDY_NAME_RE.test(n)) comedy += 2
  let ms = 0, cs = 0
  for (const re of MUSIC_SITE_RES) if (re.test(s)) ms++
  for (const re of COMEDY_SITE_RES) if (re.test(s)) cs++
  music += Math.min(ms, 3)
  comedy += Math.min(cs, 3)
  if (t.includes('night_club')) music += 0.5
  return { music, comedy }
}

// Returns { offBrief:<reason|null>, fit:'DEDICATED'|'BORDERLINE'|null,
//           verify:[{type,reason}], category, character, signals:{music,comedy} }.
// category/character may be RE-TYPED from the venue's self-description (it wins
// over the surfacing search term). offBrief != null → drop the row at script level.
function classifyFit({ name, siteText, types, category, character }) {
  const n = name || ''
  const nn = normName(n)
  const isPub = PUB_HOTEL_NAME_RE.test(n)
  const signals = scoreSignals(n, siteText, types)

  // 1. Hard scope-exclude. The pub guard keeps "X Town Hall Hotel"-style gig pubs
  //    out of the civic net (the hall token is coincidental in a pub name).
  if ((PRESENTING_HOUSE_RE.test(n) && !isPub) || PRESENTING_HOUSE_NAMES.some(x => nn === x || nn.startsWith(x + ' '))) {
    return { offBrief: `multi-purpose presenting house / civic venue ("${n}")`, fit: null, verify: [], category, character, signals }
  }
  if (CABARET_RE.test(n)) {
    return { offBrief: `cabaret / dinner-theatre / burlesque — not a dedicated stand-up or music room ("${n}")`, fit: null, verify: [], category, character, signals }
  }
  if (HOSTEL_RE.test(n)) {
    return { offBrief: `backpacker / hostel lodging — gigs incidental ("${n}")`, fit: null, verify: [], category, character, signals }
  }

  const verify = []
  let cat = category, chr = character
  const { music, comedy } = signals

  // 2. Type-override: self-description wins over the surfacing term, but only on a
  //    STRONG, one-sided signal (Rhino Room surfaces under a music term but is a
  //    flagship comedy room). A venue that genuinely does both is NOT flipped.
  if (cat === 'live_music_venue' && comedy >= 3 && comedy - music >= 2) {
    cat = 'comedy_club'; chr = null
    verify.push({ type: 'fit', reason: `re-typed to comedy_club from self-description (comedy signal ${comedy} vs music ${music}); confirm primary programme` })
  } else if (cat === 'comedy_club' && music >= 3 && music - comedy >= 2) {
    cat = 'live_music_venue'
    verify.push({ type: 'fit', reason: `re-typed to live_music_venue from self-description (music signal ${music} vs comedy ${comedy}); confirm primary programme` })
  }

  const dedicatedScore = cat === 'comedy_club' ? comedy : music
  const theatreName = /\b(theatre|theater|playhouse)\b/i.test(n)

  // 3. Bucket. A clear dedicated signal → DEDICATED, EXCEPT a heritage "theatre"
  //    name with only a borderline signal, which stays BORDERLINE + VERIFY(scope)
  //    until a human confirms it's a dedicated room and not a presenting house.
  if (dedicatedScore >= 2) {
    if (theatreName && dedicatedScore < 3) {
      verify.push({ type: 'scope', reason: `heritage "theatre" name — site hints at a dedicated room but confirm it isn't a presenting house` })
      return { offBrief: null, fit: 'BORDERLINE', verify, category: cat, character: chr, signals }
    }
    return { offBrief: null, fit: 'DEDICATED', verify, category: cat, character: chr, signals }
  }

  // 4. Unclear (no decisive signal) → BORDERLINE + VERIFY. Heritage-theatre names
  //    get the scope-flavoured reason; everything else gets the fit reason.
  if (theatreName) {
    verify.push({ type: 'scope', reason: `heritage "theatre" name with no clear dedicated-room signal — confirm dedicated gig/comedy room vs presenting house` })
  } else {
    verify.push({ type: 'fit', reason: `no clear dedicated live-music/comedy signal on site or name — confirm a dedicated room, not a mixed-use bar where music/comedy is incidental` })
  }
  return { offBrief: null, fit: 'BORDERLINE', verify, category: cat, character: chr, signals }
}

// ─── Pokies pre-screen (HARD EXCLUDE — network pokies-free editorial line) ──
// Unambiguous gaming signals on the venue's OWN site → confirmed pokies → EXCLUDE
// (same finality as a group match, public venues included). Pokies are often
// absent from a venue's music-facing pages even when a gaming room exists, so
// silence is NOT proof of pokies-free: pub/hotel/club-class names, a failed
// fetch, or a missing site all yield "unknown" → INCLUDE + VERIFY (pokies).
const POKIES_EXCLUDE_RE = /(pokies?|poker machine|gaming machine|electronic gaming|\begms?\b|gaming lounge|gaming room|gaming floor|gamble responsibly|responsible gambling|gambling helpline|gambler.{0,3}s help)/i
// Softer gambling-adjacent terms — INCLUDE but flag VERIFY (pokies), don't exclude.
const POKIES_VERIFY_RE = /(\bkeno\b|wagering|sports betting|sportsbet|tab & keno|tab and keno|tab outlet|tab agency)/i
const FETCH_TIMEOUT_MS = 9000 // HARD per-fetch wall (Promise.race) — abandon a slow/dead site, never hang
const FETCH_SLEEP_MS = 300 // polite pacing between venue-site fetches
const FETCH_DEADLINE_MS = 15 * 60 * 1000 // global site-fetch budget: after this, stop fetching and classify from name + Google only (keeps the whole run well under ~20 min)

// Hard wall-clock timeout. Resolves to `fallback` if `promise` hasn't settled
// within `ms`, regardless of whether the underlying op ever settles. This is the
// bulletproof guard: a hung third-party site (or a stuck API call) can never
// block the pipeline — the race resolves and the loop continues.
function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms)
    promise.then(
      (v) => { clearTimeout(t); resolve(v) },
      () => { clearTimeout(t); resolve(fallback) },
    )
  })
}

// Fetch a venue's own site and return { text, status }. text is de-tagged page
// text (or null); status ∈ 'ok' | 'timeout' | 'http_error' | 'network_error' |
// 'no_url'. HARD-bounded by FETCH_TIMEOUT_MS via Promise.race — one unresponsive
// site can never stall the run; on timeout we abort the socket and move on.
async function fetchSiteText(url) {
  if (!url) return { text: null, status: 'no_url' }
  const ctrl = new AbortController()
  const core = (async () => {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'AtlasProspector/1.0 (venue independence + pokies pre-screen)' },
    })
    if (!res.ok) return { text: null, status: 'http_error' }
    const html = (await res.text()).slice(0, 500000)
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
    return { text, status: 'ok' }
  })().catch(() => ({ text: null, status: 'network_error' }))

  // The race is the hard guarantee: even if fetch/abort misbehave, this resolves.
  const result = await withTimeout(core, FETCH_TIMEOUT_MS, { text: null, status: 'timeout' })
  if (result.status === 'timeout') { try { ctrl.abort() } catch {} }
  return result
}

// Returns { pokies:'true'|'false'|'unknown', exclude, verify:[reason...], signal }.
function screenPokies(name, website, siteText) {
  if (siteText && POKIES_EXCLUDE_RE.test(siteText)) {
    return { pokies: 'true', exclude: true, verify: [], signal: (siteText.match(POKIES_EXCLUDE_RE) || [''])[0] }
  }
  const verify = []
  if (PUB_HOTEL_NAME_RE.test(name)) {
    verify.push('pub/hotel/club-class venue — pokies common in this class and often absent from music pages; confirm pokies-free')
  }
  if (siteText && POKIES_VERIFY_RE.test(siteText)) {
    verify.push(`gambling-adjacent term "${(siteText.match(POKIES_VERIFY_RE) || [''])[0]}" on site — confirm no pokies/gaming machines`)
  }
  if (!website) verify.push('no website to check for gaming — confirm pokies-free')
  else if (siteText === null) verify.push('venue site fetch failed — could not check for gaming; confirm pokies-free')
  if (verify.length) return { pokies: 'unknown', exclude: false, verify, signal: null }
  return { pokies: 'false', exclude: false, verify: [], signal: null }
}

// Approx capacity from the venue's own site, if it states one plainly. Factual
// only — returns null when nothing credible is found (never fabricate).
function extractCapacity(siteText) {
  if (!siteText) return null
  const m = siteText.match(/capacity[^0-9]{0,15}(\d{2,4})/i)
        || siteText.match(/(\d{2,4})[\s-]*(?:person|people|patron|capacity|cap\.)/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return (n >= 20 && n <= 6000) ? n : null
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
  const chainRejected = [], majorRejected = [], dupListingHost = [], detailFailed = [], scopeExcluded = [], pokiesRejected = [], offBrief = []
  const accepted = []
  let i = 0
  const loopStart = Date.now()       // start of the fetch-bearing stage (for the budget)
  let fetchSkipped = 0               // venues past the fetch budget — classified without a site
  const fetchStatusCounts = {}       // tally of site-fetch outcomes for the report
  for (const p of toDetail) {
    i++
    // HARD-bounded Place Details call — a stuck API call can never hang the loop.
    const d = await withTimeout(getPlaceDetails(p.place_id), DETAIL_TIMEOUT_MS, null)
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

    // Pokies (HARD EXCLUDE) + fit both need the venue's OWN site. The fetch is
    // HARD-bounded (FETCH_TIMEOUT_MS) and gated by a global fetch budget: once the
    // budget is spent, stop fetching and classify the rest from name + Google
    // signals so the whole run completes. An unread site → VERIFY (fit-nofetch).
    let siteText = null, fetchStatus = 'no_url'
    if (website) {
      if (Date.now() - loopStart < FETCH_DEADLINE_MS) {
        const fetched = await fetchSiteText(website)
        siteText = fetched.text
        fetchStatus = fetched.status
        await sleep(FETCH_SLEEP_MS)
      } else {
        fetchStatus = 'skipped_budget'
        fetchSkipped++
      }
    }
    fetchStatusCounts[fetchStatus] = (fetchStatusCounts[fetchStatus] || 0) + 1
    const pk = screenPokies(p.name, website, siteText)
    if (pk.exclude) {
      console.log(`\n  [POKIES-REJECT] ${p.name}: gaming signal "${pk.signal}"`)
      pokiesRejected.push({ name: p.name, signal: pk.signal, website })
      continue
    }
    const capacity = extractCapacity(siteText)

    // Fit (dedicated-room) classification, using the site text already fetched.
    // OFF_BRIEF (presenting house / cabaret / hostel) is dropped at script level;
    // DEDICATED/BORDERLINE proceed, BORDERLINE carrying typed VERIFY flags. The
    // category/character returned may be re-typed from the venue's self-description.
    const fit = classifyFit({ name: p.name, siteText, types, category: p.category, character: p.character })
    if (fit.offBrief) {
      console.log(`\n  [OFF-BRIEF] ${p.name}: ${fit.offBrief}`)
      offBrief.push({ name: p.name, reason: fit.offBrief })
      continue
    }

    // Typed VERIFY flags (scope / fit / independence / pokies) — INCLUDE either way.
    const verifyFlags = []
    for (const r of scope.verify) verifyFlags.push({ type: 'scope', reason: r })
    for (const f of fit.verify) verifyFlags.push(f) // typed 'fit' or 'scope'
    // Site went unread (timeout / http / network error / budget-skipped) — the fit
    // call leaned on name + Google signals only. Flag so the reviewer re-confirms.
    if (website && fetchStatus !== 'ok') verifyFlags.push({ type: 'fit-nofetch', reason: `venue site not read (${fetchStatus}) — classified from name + Google signals only; confirm dedicated room` })
    if (PUB_HOTEL_NAME_RE.test(p.name)) verifyFlags.push({ type: 'independence', reason: 'name suggests pub/hotel/club — confirm a dedicated, independently-operated room' })
    if (!website) verifyFlags.push({ type: 'independence', reason: 'no website returned by Google — verify operator and URL' })
    for (const r of pk.verify) verifyFlags.push({ type: 'pokies', reason: r })
    const status = verifyFlags.length ? 'verify' : 'clean'

    accepted.push({
      place: p, website, host, phone, address, state, region, types, rating, ratingCount,
      bizStatus, status, verifyFlags, pokies: pk.pokies, capacity,
      fit: fit.fit, category: fit.category, character: fit.character, signals: fit.signals,
    })
    process.stdout.write(`\r  Detailed ${i}/${toDetail.length} — accepted ${accepted.length}        `)
  }
  console.log(`\n  chain-rejected=${chainRejected.length}  major-rejected=${majorRejected.length}  dup-listing-host=${dupListingHost.length}  scope-excluded=${scopeExcluded.length}  off-brief=${offBrief.length}  pokies-rejected=${pokiesRejected.length}  detail-failed=${detailFailed.length}`)
  console.log(`  site-fetch outcomes: ${Object.entries(fetchStatusCounts).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}${fetchSkipped ? `  (budget-skipped ${fetchSkipped})` : ''}`)
  console.log(`  → ${accepted.length} accepted (clean=${accepted.filter(a => a.status === 'clean').length}, verify=${accepted.filter(a => a.status === 'verify').length}; DEDICATED=${accepted.filter(a => a.fit === 'DEDICATED').length}, BORDERLINE=${accepted.filter(a => a.fit === 'BORDERLINE').length})`)

  // ─── Stage 4: rank on dedicated-room FIT, with a comedy floor ─────────────
  // Primary sort is the fit bucket (DEDICATED before BORDERLINE); Google review
  // count is only a WEAK TIEBREAK within a bucket, never the primary sort. This
  // surfaces dedicated independent rooms instead of the high-traffic civic halls
  // and pokies barns that review-count ranking pushed to the top last batch.
  const bucketRank = { DEDICATED: 0, BORDERLINE: 1 }
  const byReview = (x, y) => (y.ratingCount || 0) - (x.ratingCount || 0)
  const byFit = (x, y) => (bucketRank[x.fit] - bucketRank[y.fit]) || byReview(x, y)

  const dedicatedCount = accepted.filter(a => a.fit === 'DEDICATED').length
  const borderlineCount = accepted.filter(a => a.fit === 'BORDERLINE').length

  // Comedy floor: reserve the top DEDICATED comedy rooms BEFORE the global ceiling
  // trims, so scarce dedicated comedy isn't crushed by the live-music-heavy field.
  // Ranked by review tiebreak within the DEDICATED-comedy bucket. NOT padded — if
  // fewer than COMEDY_FLOOR exist nationally, only that many are reserved.
  const dedicatedComedy = accepted
    .filter(a => a.fit === 'DEDICATED' && a.category === 'comedy_club')
    .sort(byReview)
  const reservedComedy = dedicatedComedy.slice(0, COMEDY_FLOOR)

  // Build the batch: reserved comedy first (guaranteed in), then fill the rest by
  // fit rank up to the global ceiling. Reserved comedy is never trimmed.
  const ranked = [...accepted].sort(byFit)
  let capped = [...reservedComedy]
  const inBatch = new Set(reservedComedy.map(a => a.place.place_id))
  for (const a of ranked) {
    if (capped.length >= MAX_INSERT) break
    if (inBatch.has(a.place.place_id)) continue
    capped.push(a)
    inBatch.add(a.place.place_id)
  }
  const overflow = Math.max(0, accepted.length - capped.length)
  capped.sort(byFit) // final batch ordered by fit for stable reporting/insert

  const comedyInBatch = capped.filter(a => a.category === 'comedy_club').length
  const comedyFloorBound = reservedComedy.length > 0 && dedicatedCount + borderlineCount > MAX_INSERT

  console.log(`\n[4] ${DRY_RUN ? 'Insert plan (dry run)' : 'Inserting'}: ${capped.length}  (DEDICATED=${capped.filter(a => a.fit === 'DEDICATED').length}, BORDERLINE=${capped.filter(a => a.fit === 'BORDERLINE').length}${overflow ? `; ${overflow} over global ceiling not inserted` : ''})`)
  console.log(`    comedy floor: ${dedicatedComedy.length} dedicated comedy rooms nationally, ${reservedComedy.length} reserved before trim; comedy in final batch = ${comedyInBatch}${comedyFloorBound ? ' (floor was load-bearing — global trim active)' : ' (floor not load-bearing — no global trim)'}`)

  // DIAGNOSTIC — top ranked venues with their fit signal, to confirm the ranking
  // surfaces dedicated rooms (not civic halls or pokies barns).
  console.log(`\n  Top ${Math.min(15, capped.length)} ranked (fit | music/comedy signal | reviews | type):`)
  for (const a of capped.slice(0, 15)) {
    console.log(`    [${a.fit}] m=${a.signals.music} c=${a.signals.comedy} rev=${a.ratingCount ?? 0}  ${a.place.name}  → ${a.category}${a.character ? '/' + a.character : ''}`)
  }
  let inserted = 0, alreadyExists = 0
  const insertErrors = []
  const proposed = []

  for (const a of capped) {
    const p = a.place
    const term = [...p.terms][0]
    const confidence = a.status === 'clean' ? CONF_CLEAN : CONF_VERIFY
    const typeLabel = a.category === 'comedy_club' ? 'Comedy Club' : 'Live Music Venue'
    // SHORT factual note: kind of room + fit bucket + (site-sourced) capacity +
    // pokies flag + VERIFY flags + source. No editorial copy, no banned phrases.
    const noteParts = [
      `Proposed ${typeLabel}${a.character ? ` — ${a.character}` : ''} (fit: ${a.fit}).`,
      a.capacity ? `Venue site lists approx capacity ${a.capacity}.` : null,
      `Pokies: ${a.pokies}.`,
      ...a.verifyFlags.map(f => `VERIFY (${f.type}): ${f.reason}.`),
      `Source: Google Places search "${term}" near ${p.searchCity.name}, ${a.state}.`,
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
        category: a.category,            // read by Candidate Review to pre-select the type dropdown (may be re-typed from self-description)
        character: a.character || null,  // finer character (not a dropdown value)
        fit: a.fit,                      // 'DEDICATED' | 'BORDERLINE' — dedicated-room fit bucket (selection ranking)
        fit_signals: a.signals,          // { music, comedy } numeric dedicated-room signal scores
        presence_type: 'permanent',
        visitable: true,
        pokies: a.pokies,                // 'false' (site checked, clear) or 'unknown' (VERIFY); 'true' never reaches here (hard-excluded)
        independence: { status: a.status, reason: a.verifyFlags.filter(f => f.type === 'independence').map(f => f.reason).join('; ') || 'no group/major match' },
        verify_flags: a.verifyFlags,     // typed [{type:'scope'|'independence'|'pokies', reason}]
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
      name: row.name, category: a.category, character: a.character, fit: a.fit,
      suburb: row.region, state: row.state, website: row.website_url,
      status: a.status, pokies: a.pokies, verify: a.verifyFlags, terms: [...p.terms],
    })

    if (DRY_RUN) {
      console.log(`  [WOULD-INSERT] ${row.name} (${a.category}${a.character ? '/' + a.character : ''}) [${a.fit}] ${row.region}, ${row.state} [${a.status}, pokies=${a.pokies}] — ${row.website_url || 'no site'}`)
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
  console.log(`Off-brief (excluded):   ${offBrief.length}${offBrief.length ? ' — ' + offBrief.map(r => `${r.name} (${r.reason})`).join('; ') : ''}`)
  console.log(`Pokies-rejected (HARD): ${pokiesRejected.length}${pokiesRejected.length ? ' — ' + pokiesRejected.map(r => `${r.name} ("${r.signal}")`).join('; ') : ''}`)
  console.log(`Detail-call failures:   ${detailFailed.length}`)
  console.log(`Accepted:               ${accepted.length}  (clean=${accepted.filter(a => a.status === 'clean').length}, verify=${accepted.filter(a => a.status === 'verify').length})`)
  console.log(`Accepted by fit:        DEDICATED=${dedicatedCount}, BORDERLINE=${borderlineCount}`)
  console.log(`Dedicated comedy rooms: ${dedicatedComedy.length} found nationally, ${reservedComedy.length} reserved (comedy floor ${COMEDY_FLOOR})`)
  if (overflow) console.log(`Over global ceiling:    ${overflow} not inserted (ceiling ${MAX_INSERT})`)
  console.log(`Batch size:             ${capped.length}`)
  console.log(`By type:   ${Object.entries(byCat).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  console.log(`By state:  ${Object.entries(byState).sort().map(([k, v]) => `${k}=${v}`).join(', ')}`)
  const byPokies = {}
  for (const pr of proposed) byPokies[pr.pokies] = (byPokies[pr.pokies] || 0) + 1
  console.log(`Batch by fit:           DEDICATED=${capped.filter(a => a.fit === 'DEDICATED').length}, BORDERLINE=${capped.filter(a => a.fit === 'BORDERLINE').length}`)
  console.log(`By pokies: ${Object.entries(byPokies).sort().map(([k, v]) => `${k}=${v}`).join(', ')}`)
  // VERIFY piles, split by type so the reviewer can work each kind separately.
  const verifyPile = (t) => proposed.filter(pr => pr.verify.some(f => f.type === t))
  for (const t of ['pokies', 'fit', 'fit-nofetch', 'scope', 'independence']) {
    const pile = verifyPile(t)
    console.log(`VERIFY (${t}): ${pile.length}${pile.length ? ' — ' + pile.map(pr => pr.name).join(', ') : ''}`)
  }
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
