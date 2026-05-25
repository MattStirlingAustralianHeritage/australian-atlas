#!/usr/bin/env node
//
// verify-listing-redesign.mjs
//
// Verification harness for the listing-page redesign propagation (Part 6).
// Samples ~10 listings per vertical across cross-vertical states
// (multi-vertical, NULL region, single-vertical with region), fetches each
// from the vertical's dev server, and asserts the redesign's structural
// invariants.
//
// Designed to catch the kind of regression that escaped Part 4 verification:
// the cross-vertical chip rendered with a self-reference on 6,625 of 6,638
// active listings because the one test case happened to be a true multi-
// vertical sibling. A single hand-picked sample missed a bug affecting 99.8%
// of listings. This script samples across states so the same bug class can't
// hide.
//
// Run from the portal repo (uses the master listings table as the source of
// truth for cross-vertical sibling counts).
//
// Usage:
//   node scripts/verify-listing-redesign.mjs --vertical=found --base=http://localhost:3000
//
// Optional flags:
//   --count=10            How many listings to sample (default 10)
//   --seed=<int>          Reproducible sampling (default: random)
//   --quiet               Only print failures
//

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { argv, exit, env } from 'node:process'

// Listing-detail route per vertical, from lib/verticalUrl.js. Keep in sync
// if VERTICAL_URLS gains a new vertical.
const VERTICAL_PATHS = {
  sba:          '/venue',
  collection:   '/venue',
  craft:        '/venue',
  fine_grounds: '/roasters', // cafes get '/cafes' instead — handled in urlFor()
  rest:         '/stay',
  field:        '/places',
  corner:       '/shops',
  found:        '/shops',
  table:        '/listings',
}

function parseArgs(argv) {
  const out = {}
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/)
    if (m) out[m[1]] = m[2] === undefined ? true : m[2]
  }
  return out
}

// Seeded shuffle so failures are reproducible.
function mulberry32(seed) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6D2B79F5) >>> 0
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
function shuffle(arr, rand) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function findSamples(sb, vertical, totalCount, seed) {
  // Pull a manageable working set; we don't need the whole table.
  const { data: all = [] } = await sb
    .from('listings')
    .select('id, slug, name, vertical, region_computed_id, region_override_id, sub_type, is_claimed, lat, lng')
    .eq('vertical', vertical)
    .eq('status', 'active')
    .limit(2000)

  if (!all.length) return { samples: [], byState: { multiVertical: 0, nullRegion: 0, singleVertical: 0 } }

  // Cross-vertical sibling count per slug, looked up against the master
  // listings table (other verticals, active, same slug). PostgREST has a
  // practical URL-length cap on .in(), so chunk the slug list.
  const slugs = [...new Set(all.map(l => l.slug))]
  const CHUNK = 200
  const siblingCount = new Map()
  for (let i = 0; i < slugs.length; i += CHUNK) {
    const chunk = slugs.slice(i, i + CHUNK)
    const { data: siblings, error } = await sb
      .from('listings')
      .select('slug, vertical')
      .neq('vertical', vertical)
      .eq('status', 'active')
      .in('slug', chunk)
    if (error) {
      console.error(`siblings query failed for chunk ${i}–${i + chunk.length}: ${error.message}`)
      continue
    }
    for (const s of (siblings || [])) {
      siblingCount.set(s.slug, (siblingCount.get(s.slug) || 0) + 1)
    }
  }

  const enriched = all.map(l => ({
    ...l,
    crossListedCount: siblingCount.get(l.slug) || 0,
    hasRegion: !!(l.region_computed_id || l.region_override_id),
  }))

  const multiVertical  = enriched.filter(l => l.crossListedCount > 0)
  const nullRegion     = enriched.filter(l => l.crossListedCount === 0 && !l.hasRegion)
  const singleVertical = enriched.filter(l => l.crossListedCount === 0 && l.hasRegion)

  const rand = mulberry32(seed)
  const targetMulti  = Math.min(3, multiVertical.length)
  const targetNull   = Math.min(3, nullRegion.length)
  const remaining    = Math.max(0, totalCount - targetMulti - targetNull)
  const targetSingle = Math.min(remaining, singleVertical.length)

  const samples = [
    ...shuffle(multiVertical, rand).slice(0, targetMulti),
    ...shuffle(nullRegion, rand).slice(0, targetNull),
    ...shuffle(singleVertical, rand).slice(0, targetSingle),
  ]

  return {
    samples,
    byState: {
      multiVertical: multiVertical.length,
      nullRegion: nullRegion.length,
      singleVertical: singleVertical.length,
    },
  }
}

function urlFor(vertical, listing, baseUrl) {
  // Fine Grounds: cafes vs roasters split into different routes.
  if (vertical === 'fine_grounds' && listing.sub_type === 'cafe') {
    return `${baseUrl}/cafes/${listing.slug}`
  }
  return `${baseUrl}${VERTICAL_PATHS[vertical]}/${listing.slug}`
}

// Loose name match — strip non-word chars and check first 8 chars of either
// the venue name or its first non-trivial word appear in the HTML inside an
// h1. Venue names with leading articles ("The Heide…") still match.
function nameTokens(name) {
  const stripped = name.replace(/[^\w\s]/g, ' ').trim()
  const words = stripped.split(/\s+/).filter(w => w.length > 2 && !/^(the|and|of|in|at)$/i.test(w))
  return (words.length ? words : [stripped]).slice(0, 2)
}

function h1ContainsName(html, name) {
  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
  if (!h1Matches.length) return false
  const tokens = nameTokens(name)
  for (const m of h1Matches) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase()
    if (tokens.some(t => text.includes(t.toLowerCase()))) return true
  }
  return false
}

async function checkPage(url, expected) {
  const failures = []
  const warnings = []
  let html
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'atlas-redesign-verifier/1' } })
    if (!res.ok) {
      // 404s on the vertical may mean the listing isn't yet synced — warning,
      // not a failure of the redesign itself.
      const level = res.status === 404 ? warnings : failures
      level.push(`HTTP ${res.status} on ${url}`)
      return { ok: failures.length === 0, url, failures, warnings, info: {} }
    }
    html = await res.text()
  } catch (e) {
    failures.push(`fetch error: ${e.message}`)
    return { ok: false, url, failures, warnings, info: {} }
  }

  // (a) An h1 element exists and contains (some token of) the venue name.
  if (!h1ContainsName(html, expected.name)) {
    failures.push('h1 missing or does not contain venue name')
  }

  // (b) Cross-vertical regression check — the Part 4 bug class.
  //
  // Scope the check to <body> only so we don't false-positive on editorial
  // copy embedded in <meta name="description">, <title>, og: tags, etc.
  // ("Also at Murrabit Market" in a venue's blurb is not a cross-vertical
  // chip, but a literal phrase in the description.)
  //
  // The asymmetric design is deliberate:
  //
  // HARD FAIL — UI rendered when there are NO real siblings. This is the
  // exact regression that escaped Part 4 (6,625 of 6,638 listings showed a
  // self-reference). Wording variants both old and new ("Also on" chip,
  // "Also listed on" labelled section) trigger.
  //
  // SOFT WARN — UI missing when there ARE siblings. Some verticals render
  // cross-vertical UI via client-side components (e.g. Found's
  // <CrossVerticalNearby> fetches /api/nearby after hydration), so the
  // static HTML the script sees won't contain the wording even when the UI
  // is correct. Flagging this as a failure would force every client-rendered
  // mechanism into the script's blind spot. Treat as info-level instead.
  const bodyMatch = html.match(/<body[\s\S]*<\/body>/i)
  const body = bodyMatch ? bodyMatch[0] : html
  const xvUiInHtml = /also\s+(listed\s+on|on)\b/i.test(body)
  if (xvUiInHtml && expected.crossListedCount === 0) {
    failures.push('Cross-vertical UI rendered with NO real sibling — regression of Part 4 fix')
  }
  if (!xvUiInHtml && expected.crossListedCount > 0) {
    warnings.push(`No cross-vertical UI in server HTML — listing has ${expected.crossListedCount} sibling(s). May render client-side; manual check needed.`)
  }

  // Info-only signals about which parts of the redesign have propagated.
  // Not failures — a vertical that hasn't been ported yet will simply lack
  // these. After porting, the map header + deep-link should be true on
  // listings with coordinates.
  const info = {
    hasNewMapHeader:   /Nearby on\s+(Australian|Small Batch|Culture|Craft|Fine Grounds|Rest|Field|Corner|Found|Table)\s+Atlas/i.test(html),
    hasMapDeepLink:    /\/map\?lng=/.test(html),
    hasViewOnFullMap:  /View on full map/i.test(html),
    hasNewXvLabel:     /Also listed on/i.test(html),  // portal's labelled section
    hasOldXvChip:      !/Also listed on/i.test(html) && /Also on\b/i.test(html),
    hasMoreInRegion:   /More\s+(in|shops in|venues in)\s+\w/i.test(html),
  }

  return { ok: failures.length === 0, url, failures, warnings, info }
}

async function main() {
  const args = parseArgs(argv)
  if (!args.vertical || !VERTICAL_PATHS[args.vertical]) {
    console.error('Usage: node scripts/verify-listing-redesign.mjs --vertical=<key> --base=http://localhost:3000')
    console.error(`Valid verticals: ${Object.keys(VERTICAL_PATHS).join(', ')}`)
    exit(2)
  }
  const baseUrl = (args.base || 'http://localhost:3000').replace(/\/$/, '')
  const count = Math.max(1, Math.min(50, Number(args.count) || 10))
  const seed = Number.isFinite(Number(args.seed)) ? Number(args.seed) : Math.floor(Math.random() * 0xffffffff)
  const quiet = !!args.quiet

  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.')
    console.error('Run with: node --env-file=.env.local scripts/verify-listing-redesign.mjs --vertical=...')
    exit(2)
  }
  const sb = createClient(url, key)

  const { samples, byState } = await findSamples(sb, args.vertical, count, seed)
  if (!samples.length) {
    console.error(`No active listings found for vertical=${args.vertical}.`)
    exit(2)
  }

  console.log(`\nverify-listing-redesign / vertical=${args.vertical} / seed=${seed}`)
  console.log(`base=${baseUrl}`)
  console.log(`population: ${byState.multiVertical} multi-vertical, ${byState.nullRegion} null-region, ${byState.singleVertical} single-vertical-with-region`)
  console.log(`sampling: ${samples.length} listings\n`)

  const totals = {
    pass: 0, fail: 0,
    hasNewMapHeader: 0, hasMapDeepLink: 0, hasViewOnFullMap: 0,
    hasNewXvLabel: 0, hasOldXvChip: 0, hasMoreInRegion: 0,
  }

  for (const l of samples) {
    const state = l.crossListedCount > 0
      ? `multi(${l.crossListedCount})`
      : !l.hasRegion ? 'null-region' : 'single'
    const target = urlFor(args.vertical, l, baseUrl)
    const result = await checkPage(target, {
      name: l.name,
      crossListedCount: l.crossListedCount,
    })

    if (result.ok) {
      totals.pass++
      if (!quiet) console.log(`  ✓ [${state.padEnd(12)}] ${l.name}`)
    } else {
      totals.fail++
      console.log(`  ✗ [${state.padEnd(12)}] ${l.name}`)
      console.log(`        URL: ${target}`)
      for (const f of result.failures) console.log(`        → ${f}`)
      for (const w of result.warnings) console.log(`        ⚠ ${w}`)
    }

    for (const k of Object.keys(result.info)) {
      if (result.info[k]) totals[k]++
    }
  }

  console.log(`\nresult: ${totals.pass}/${samples.length} passed`)
  console.log(`portable signals seen across sample:`)
  console.log(`  new map header  : ${totals.hasNewMapHeader}/${samples.length}`)
  console.log(`  map deep-link   : ${totals.hasMapDeepLink}/${samples.length}`)
  console.log(`  view-full-map   : ${totals.hasViewOnFullMap}/${samples.length}`)
  console.log(`  new XV label    : ${totals.hasNewXvLabel}/${samples.length}  (multi-vertical only)`)
  console.log(`  old XV chip     : ${totals.hasOldXvChip}/${samples.length}  (should be 0 after port)`)
  console.log(`  more-in-region  : ${totals.hasMoreInRegion}/${samples.length}`)
  exit(totals.fail > 0 ? 1 : 0)
}

main().catch(err => { console.error(err); exit(1) })
