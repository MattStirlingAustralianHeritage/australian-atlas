#!/usr/bin/env node
/**
 * Town-by-town gap crawler — methodical, quota-free coverage discovery.
 *
 * WHY: the daily prospector and floor-seeder sweep whole-state bboxes with a
 * result cap. Dense metros consume that cap first, so long-tail regional towns
 * are systematically under-discovered. This crawler works one town at a time
 * with a tight bbox, so it surfaces the venues those broad sweeps never reach.
 *
 * SOURCE: OpenStreetMap Overpass only — free, keyless, no quota. NO Google
 * Places. Every candidate is a real, crowd-mapped POI with a website tag; the
 * combined-bbox query already excludes brand/chain outlets. Survivors run
 * through the EXACT SAME 5-gate pipeline as every other candidate, so the
 * quality bar is unchanged — only the geography of discovery is finer.
 *
 * OUTPUT:
 *   • a dated markdown gap report (always) — what OSM has that Atlas lacks,
 *     per town, per vertical, with the current Atlas count nearby for contrast.
 *   • queued candidates in listing_candidates (only with --queue) — gated,
 *     ready for human review at /admin/candidates.
 *
 * TWO PACK FAMILIES:
 *   REGION_PACKS (town-gap-packs.js)   — thin regional Atlas regions, by town.
 *   SUBURB_PACKS (metro-suburb-packs.js) — the middle and outer suburbs of
 *     cities we already "cover". The 2026-07-25 ring audit found Atlas density
 *     falls 177 → 12.9 → 3.2 listings per 100 km² across the 0–5 / 5–15 / 15–30km
 *     rings: a 14× cliff at 5km that real venue density cannot explain. Same
 *     blind spot as the regional long tail, different geometry.
 * Slugs are unique across both, so --region= accepts either.
 *
 * USAGE:
 *   node --env-file=.env.local scripts/crawl-town-gaps.mjs --region=sapphire-coast
 *   node --env-file=.env.local scripts/crawl-town-gaps.mjs --region=sapphire-coast --queue --max=20
 *   node --env-file=.env.local scripts/crawl-town-gaps.mjs --list          # list every pack
 *   node --env-file=.env.local scripts/crawl-town-gaps.mjs --all           # report every pack (no queue)
 *   node --env-file=.env.local scripts/crawl-town-gaps.mjs --metro         # every SUBURB pack
 *   node --env-file=.env.local scripts/crawl-town-gaps.mjs --metro --queue --max=150
 *
 * FLAGS:
 *   --region=SLUG   run one built-in anchor pack (region OR suburb pack)
 *   --all           run every pack, report only
 *   --metro         run every metro suburb pack
 *   --queue         actually run the pipeline + insert candidates (default: report only)
 *   --max=N         cap candidates QUEUED this run across all towns (default 25)
 *   --max-per-vertical=N  additionally cap per vertical, so `table` does not
 *                   consume the whole budget (OSM tags restaurants far more
 *                   thoroughly than makers, shops or accommodation)
 *   --recrawl       redo anchors already recorded as crawled
 *   --radius=KM     default anchor radius in km (default 12; suburb anchors
 *                   carry their own tighter radiusKm and ignore this)
 *   --list          print the available packs and exit
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { discoverAllVerticalsInBBox, bboxFromCenter } from '../lib/prospector/osm-overpass.js'
import { buildDedupSets, normaliseDomain, haversineMeters, VERTICAL_NAMES } from '../lib/prospector/replenish.js'
import { runPipeline } from '../lib/prospector/pipeline.js'
import { trigramSimilarity } from '../lib/prospector/gates.js'
import { REGION_PACKS } from './town-gap-packs.js'
import { SUBURB_PACKS } from './metro-suburb-packs.js'

// One flat registry — slugs are unique across both families.
const ALL_PACKS = { ...REGION_PACKS, ...SUBURB_PACKS }
// Suburb packs carry the inner-ring exclusion wherever they are run from, so
// --region=sydney-inner-west behaves the same as --metro.
const SUBURB_PACK_SLUGS = new Set(Object.keys(SUBURB_PACKS))

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!MASTER_URL || !MASTER_KEY) { console.error('Missing Supabase env'); process.exit(1) }
const sb = createClient(MASTER_URL, MASTER_KEY, {
  global: { fetch: (url, o = {}) => fetch(url, { ...o, cache: 'no-store' }) },
})

// ── CLI ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const arg = (name) => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
const has = (name) => args.includes(`--${name}`)
const doQueue = has('queue')
const maxQueue = parseInt(arg('max') || '25', 10)
const defRadiusKm = parseFloat(arg('radius') || '12')
const regionArg = arg('region')
const runAll = has('all')
const runMetro = has('metro')
// Anchors already crawled are recorded so a later run resumes instead of
// restarting. Re-crawling a harvested anchor is near-pure cost: dedup already
// knows everything it found, so it re-runs the full gate pipeline over the
// leftovers that failed last time and queues almost nothing. Finishing 193
// anchors is only practical if each run picks up where the last stopped.
const recrawl = has('recrawl')
// Per-vertical ceiling on QUEUEING. OSM's two most-used tags in existence are
// amenity=restaurant and amenity=cafe, so `table` dominates every gap pool it is
// in — 115 of the first 150 queued candidates, and 76 of 89 published. The other
// verticals' selectors are deliberately narrow (see OSM_SELECTORS), so this is
// mostly a real discovery ceiling rather than a bug. What is fixable is letting
// table eat the whole --max budget: with a per-vertical cap, a run spends its
// remaining capacity on the thin verticals instead of a 40th restaurant.
const maxPerVertical = parseInt(arg('max-per-vertical') || '0', 10) || null
// Report wording: these anchors are suburbs in metro mode, towns otherwise.
const placeNoun = runMetro ? 'suburb' : 'town'
// Optional single-vertical focus (e.g. --vertical=rest). When set, only that
// vertical's gaps are reported/queued and the "Atlas nearby" count is scoped to
// it, so the report reads as a coverage audit for one vertical. Default: all.
const verticalFilter = arg('vertical') || null

if (has('list')) {
  for (const [title, group] of [['Regional town packs', REGION_PACKS], ['Metro suburb packs', SUBURB_PACKS]]) {
    console.log(`\n${title}:\n`)
    for (const [slug, pack] of Object.entries(group)) {
      console.log(`  ${slug.padEnd(24)} ${pack.state.padEnd(4)} — ${String(pack.anchors.length).padStart(2)}: ${pack.anchors.map(a => a.name).join(', ')}`)
    }
  }
  process.exit(0)
}

// --region accepts one slug or a comma-separated list (thinnest-first targeting).
const packs = runMetro ? Object.entries(SUBURB_PACKS)
  : runAll ? Object.entries(ALL_PACKS)
  : regionArg ? regionArg.split(',').map(s => s.trim()).filter(Boolean).map(s => [s, ALL_PACKS[s]])
  : null
if (!packs) { console.error('Pass --region=SLUG[,SLUG…], --all, --metro, or --list'); process.exit(1) }
if (packs.some(([, p]) => !p)) {
  const bad = packs.filter(([, p]) => !p).map(([s]) => s).join(', ')
  console.error(`Unknown pack(s): ${bad}. Try --list`); process.exit(1)
}

// ── Dedup sets (existing listings + all candidates) ────────────────────
console.log('Building dedup sets from live listings + candidates…')
const dedup = await buildDedupSets(sb)
console.log(`  ${dedup.existingNames.size} names, ${dedup.existingDomains.size} domains known.\n`)

function isDupe(c) {
  const nameLower = c.name.toLowerCase().trim()
  if (dedup.existingNames.has(nameLower)) return 'exact-name'
  for (const existing of dedup.existingNames) {
    if (trigramSimilarity(nameLower, existing) > 0.85) return 'fuzzy-name'
  }
  if (c.website_url) {
    const d = normaliseDomain(c.website_url)
    if (d && dedup.existingDomains.has(d)) return 'domain'
  }
  if (c.lat && c.lng && dedup.existingCoords.some(e => haversineMeters(e.lat, e.lng, c.lat, c.lng) < 100)) return 'coords'
  return null
}
function remember(c) {
  dedup.existingNames.add(c.name.toLowerCase().trim())
  if (c.website_url) dedup.existingDomains.add(normaliseDomain(c.website_url))
  if (c.lat && c.lng) dedup.existingCoords.push({ lat: c.lat, lng: c.lng })
}

// Editorial precision filter — cheap source-side cuts so the report and the
// gated queue stay high-signal (and we don't spend Gate-4 Claude calls on
// obvious non-fits). Anything subtler is left to the pipeline's Gate 4.
const CLUB_RE = /\b(rsl|r\.s\.l|bowling club|bowls club|golf club|leagues club|services club|workers club|workingmen|social club|country club|sports club|surf life saving|slsc|yacht club|football club|cricket club|sailing club|memorial club|citizens club|diggers club)\b|^club\s/i
function passesPrecision(c) {
  if (CLUB_RE.test(c.name)) return false
  // Field without a website: Gate 1 falls back to slow URL-guessing that almost
  // always fails, throttling the crawl for near-zero yield. Only surface websited
  // field venues (private reserves, botanic/wildlife parks with operator sites).
  // Parks without an operator site are better curated by hand and are already
  // captured in the report-only landscape.
  if (c.vertical === 'field' && !c.website_url) return false
  return true
}

// ── Inner-ring exclusion (metro mode) ────────────────────────────────
// The point of the suburb packs is the ring the sweeps never reach. But a
// suburb anchor plus its radius can reach back toward the CBD: Marrickville
// sits 7km out, and a 4km bbox around it takes in Newtown at 3.9km. A first run
// queued 14 of 24 candidates inside 5km — i.e. mostly in the already-saturated
// ring the packs exist to avoid. So in metro mode a gap must be at least
// INNER_RING_KM from every major city centre to be surfaced at all.
const INNER_RING_KM = 5
const CITY_CENTRES = [
  [-33.8688, 151.2093], // Sydney
  [-37.8136, 144.9631], // Melbourne
  [-27.4698, 153.0251], // Brisbane
  [-31.9523, 115.8613], // Perth
  [-34.9285, 138.6007], // Adelaide
  [-42.8821, 147.3272], // Hobart
  [-35.2809, 149.1300], // Canberra
  [-12.4634, 130.8456], // Darwin
  [-32.9283, 151.7817], // Newcastle
  [-34.4278, 150.8931], // Wollongong
  [-38.1499, 144.3617], // Geelong
  [-27.9678, 153.4143], // Gold Coast
  [-26.6580, 153.0920], // Sunshine Coast
  [-16.9186, 145.7781], // Cairns
  [-19.2590, 146.8169], // Townsville
]
function kmFromNearestCBD(lat, lng) {
  let best = Infinity
  for (const [cLat, cLng] of CITY_CENTRES) {
    best = Math.min(best, haversineMeters(lat, lng, cLat, cLng) / 1000)
  }
  return best
}

// Full state names OSM uses as a coarse region fallback — treated as "no useful
// region" so the pack's own label wins.
const STATE_FULL_NAMES = new Set([
  'New South Wales', 'Victoria', 'Queensland', 'South Australia',
  'Western Australia', 'Tasmania', 'Australian Capital Territory', 'Northern Territory',
])

// Count Atlas listings inside an anchor bbox (rough "current coverage").
// Scoped to `verticalFilter` when set, so a Rest crawl reports Rest-nearby.
async function atlasCountInBBox(bbox) {
  const [s, w, n, e] = bbox
  let q = sb.from('listings').select('*', { count: 'exact', head: true })
    .eq('status', 'active').gte('lat', s).lte('lat', n).gte('lng', w).lte('lng', e)
  if (verticalFilter) q = q.eq('vertical', verticalFilter)
  const { count } = await q
  return count || 0
}

// ── Crawl ──────────────────────────────────────────────────────────────
const startedAt = new Date().toISOString()
let queuedTotal = 0
let skippedByCap = 0
let innerRingSkipped = 0
let alreadyCrawled = 0
let skippedByVerticalCap = 0
const queuedByVertical = {}
// Manifest of what this run actually inserted, so a downstream describe/publish
// step can act on exactly this run's candidates rather than guessing by timestamp.
const queuedIds = []
const crawledPath = new URL('../reports/suburb-crawl-state.json', import.meta.url)
let crawled = { anchors: [] }
try { crawled = JSON.parse(readFileSync(crawledPath, 'utf8')) } catch { crawled = { anchors: [] } }
const crawledSet = new Set(recrawl ? [] : crawled.anchors)
function markCrawled(slug, anchorName) {
  const key = `${slug}/${anchorName}`
  if (!crawled.anchors.includes(key)) crawled.anchors.push(key)
  writeFileSync(crawledPath, JSON.stringify(crawled, null, 2))
}
const reportLines = []
const grandGaps = {}   // vertical → count
const perTown = []

// Flatten to one work list. When more than one pack is in play we INTERLEAVE
// them — first anchor of every pack, then the second of every pack, and so on —
// so that a --max cap spreads across the country instead of being spent entirely
// inside the first city. Depth-first ordering exhausted a 130 cap in Sydney
// before Brisbane or Perth were reached, which is the opposite of a broad sweep.
const anchorTasks = []
if (packs.length > 1) {
  const deepest = Math.max(...packs.map(([, p]) => p.anchors.length))
  for (let i = 0; i < deepest; i++) {
    for (const [slug, pack] of packs) {
      if (pack.anchors[i]) anchorTasks.push({ slug, pack, anchor: pack.anchors[i] })
    }
  }
} else {
  for (const [slug, pack] of packs) for (const anchor of pack.anchors) anchorTasks.push({ slug, pack, anchor })
}
console.log(`${anchorTasks.length} anchors across ${packs.length} pack(s)${packs.length > 1 ? ', interleaved' : ''}.`)
if (crawledSet.size) console.log(`${crawledSet.size} anchors already crawled in a previous run — skipping (use --recrawl to redo).`)

let lastPackSlug = null
{
  for (const { slug, pack, anchor } of anchorTasks) {
    const isSuburbPack = SUBURB_PACK_SLUGS.has(slug)
    if (crawledSet.has(`${slug}/${anchor.name}`)) { alreadyCrawled++; continue }
    if (slug !== lastPackSlug) { console.log(`\n── ${pack.name || slug} (${pack.state}) ──`); lastPackSlug = slug }
    const radiusKm = anchor.radiusKm || defRadiusKm
    const bbox = bboxFromCenter(anchor.lat, anchor.lng, radiusKm * 1000)
    process.stdout.write(`  ${anchor.name} (r=${radiusKm}km) … `)
    let raw = []
    try {
      raw = await discoverAllVerticalsInBBox(bbox, { maxResults: 400, log: () => {} })
    } catch (err) {
      console.log(`ERROR ${err.message}`); continue
    }
    const atlasNearby = await atlasCountInBBox(bbox)

    // Filter to genuine gaps.
    const gaps = []
    for (const c of raw) {
      if (verticalFilter && c.vertical !== verticalFilter) continue
      if (isSuburbPack && c.lat && c.lng && kmFromNearestCBD(c.lat, c.lng) < INNER_RING_KM) { innerRingSkipped++; continue }
      if (isDupe(c)) continue
      if (!passesPrecision(c)) continue
      // OSM often only knows the state name (or nothing) for a POI's region.
      // Prefer the pack's region label / town so reviewers see "Sapphire Coast"
      // or "Bermagui", not "New South Wales".
      if (!c.region || STATE_FULL_NAMES.has(c.region)) c.region = pack.regionLabel || anchor.name
      if (!c.state) c.state = pack.state
      gaps.push(c)
      remember(c)   // avoid re-surfacing the same POI in overlapping anchors
    }
    console.log(`OSM ${raw.length} · Atlas nearby ${atlasNearby} · NEW gaps ${gaps.length}`)

    const byVert = {}
    for (const g of gaps) { (byVert[g.vertical] ||= []).push(g); grandGaps[g.vertical] = (grandGaps[g.vertical] || 0) + 1 }
    perTown.push({ town: anchor.name, state: pack.state, osm: raw.length, atlas: atlasNearby, gaps: gaps.length, byVert })

    // Queue the gaps through the pipeline (quality-gated) if requested.
    //
    // Bounded concurrency, not serial. Gate 1 fetches each candidate's website
    // and most OSM `website` tags are dead, so the loop spent nearly all its
    // wall-clock waiting on connection timeouts — about ten minutes per dense
    // anchor, which does not finish 193 of them. Candidates are independent
    // (separate domains, separate rows), so running a few at a time is safe;
    // PIPELINE_CONCURRENCY stays low to remain polite to the sites being probed
    // and to the Gate-4 model budget.
    // Interleave the anchor's gaps by vertical before queueing. Otherwise the
    // pipeline works through them in discovery order, which is table-first, and
    // a cap reached mid-anchor takes only restaurants.
    if (gaps.length) {
      const byVertical = new Map()
      for (const g of gaps) {
        if (!byVertical.has(g.vertical)) byVertical.set(g.vertical, [])
        byVertical.get(g.vertical).push(g)
      }
      const queues = [...byVertical.values()]
      const interleaved = []
      for (let i = 0; queues.some(q => q.length > i); i++) {
        for (const q of queues) if (q[i]) interleaved.push(q[i])
      }
      gaps.length = 0
      gaps.push(...interleaved)
    }

    let anchorSkipped = 0
    if (doQueue && gaps.length) {
      // Gate 1 spends up to 10s per candidate waiting on a dead OSM `website`
      // tag, and most tags are dead, so throughput here is almost entirely
      // timeout latency rather than work. Every candidate in a batch is a
      // different domain, so raising this does not concentrate load on any one
      // site — it just stops us idling. 5 was not enough to finish 193 anchors.
      const PIPELINE_CONCURRENCY = 12
      let idx = 0
      const runOne = async () => {
        while (true) {
          if (queuedTotal >= maxQueue) {
            // Count every remaining gap once, then stop this worker.
            while (idx < gaps.length) { idx++; skippedByCap += 1; anchorSkipped += 1 }
            return
          }
          const g = gaps[idx++]
          if (!g) return
          if (maxPerVertical && (queuedByVertical[g.vertical] || 0) >= maxPerVertical) { skippedByVerticalCap += 1; anchorSkipped += 1; continue }
          try {
            const result = await runPipeline(g, sb, { dryRun: false, verbose: false })
            if (result.inserted) {
              queuedTotal++
              queuedByVertical[g.vertical] = (queuedByVertical[g.vertical] || 0) + 1
              queuedIds.push({ id: result.candidateId, name: g.name, vertical: g.vertical, town: anchor.name, state: pack.state, score: result.score })
              console.log(`     ✓ QUEUED ${g.name} [${g.vertical}] score ${result.score}`)
            }
            else if (result.failedGate != null) console.log(`     ✗ ${g.name} [${g.vertical}] gate${result.failedGate}`)
          } catch (err) { console.log(`     ! ${g.name}: ${err.message}`) }
        }
      }
      await Promise.all(Array.from({ length: PIPELINE_CONCURRENCY }, runOne))
    }
    // Only record the anchor as done when every gap it produced was actually
    // put through the pipeline. Marking it while a cap skipped some would
    // silently strand those venues: the next run skips the anchor entirely and
    // they are never seen again.
    if (anchorSkipped === 0) markCrawled(slug, anchor.name)
    else console.log(`  (not marking ${anchor.name} crawled — ${anchorSkipped} gap(s) skipped by a cap)`)

    // The --max cap bounds how many candidates we QUEUE, not how far we crawl.
    // Aborting the whole crawl here (the previous behaviour) silently truncated
    // the gap report at the cap, so a capped run read as "this is all there is".
    // Keep crawling and reporting; just stop spending pipeline calls.
    await new Promise(r => setTimeout(r, 1200)) // be kind to Overpass
  }
}

// ── Report ──────────────────────────────────────────────────────────────
const date = startedAt.slice(0, 10)
reportLines.push(`# Town Gap Crawl — ${date}`)
reportLines.push('')
reportLines.push(`Source: OpenStreetMap Overpass (quota-free, no Google Places). Packs: ${packs.map(([s]) => s).join(', ')}.`)
if (packs.some(([s2]) => SUBURB_PACK_SLUGS.has(s2))) reportLines.push(`Inner-ring exclusion: gaps within ${INNER_RING_KM}km of a major city centre were skipped (${innerRingSkipped} POIs) — that ring is already saturated and is not what these packs are for.`)
if (verticalFilter) reportLines.push(`Vertical focus: ${VERTICAL_NAMES[verticalFilter] || verticalFilter} only. "Atlas nearby" counts are scoped to this vertical.`)
reportLines.push(`Mode: ${doQueue ? `QUEUED up to ${maxQueue} candidates through the 5-gate pipeline` : 'REPORT ONLY (no writes)'}.`)
if (doQueue && skippedByCap > 0) {
  // Say out loud what the cap dropped — a silent truncation reads as full coverage.
  reportLines.push('')
  reportLines.push(`> **Cap reached.** ${queuedTotal} candidates were queued and **${skippedByCap} eligible gaps were NOT queued** because of \`--max=${maxQueue}\`. The landscape below is complete; the queue is not. Re-run with a higher \`--max\` to work the remainder.`)
}
reportLines.push('')
reportLines.push('## Gaps by vertical (net-new, deduped vs Atlas)')
reportLines.push('')
reportLines.push('| Vertical | New gaps found |')
reportLines.push('|---|---|')
for (const [v, n] of Object.entries(grandGaps).sort((a, b) => b[1] - a[1])) {
  reportLines.push(`| ${VERTICAL_NAMES[v] || v} | ${n} |`)
}
reportLines.push('')
reportLines.push(`## By ${placeNoun}`)
reportLines.push('')
reportLines.push(`| ${placeNoun[0].toUpperCase()+placeNoun.slice(1)} | State | OSM POIs | Atlas nearby | New gaps |`)
reportLines.push('|---|---|---|---|---|')
for (const t of perTown) reportLines.push(`| ${t.town} | ${t.state} | ${t.osm} | ${t.atlas} | ${t.gaps} |`)
reportLines.push('')
reportLines.push(`## Detail — net-new candidates by ${placeNoun}`)
for (const t of perTown) {
  if (!t.gaps) continue
  reportLines.push('')
  reportLines.push(`### ${t.town}, ${t.state}  (${t.gaps} gaps)`)
  for (const [v, list] of Object.entries(t.byVert)) {
    reportLines.push('')
    reportLines.push(`**${VERTICAL_NAMES[v] || v}**`)
    for (const g of list) {
      reportLines.push(`- ${g.name}${g.website_url ? ` — ${g.website_url}` : ''}  \`${g.source_detail?.replace('OpenStreetMap — ', '')}\``)
    }
  }
}

const vSuffix = verticalFilter ? '-' + verticalFilter : ''
// A comma-list of regions makes an unwieldy filename; collapse to a short tag.
const rSuffix = regionArg
  ? (regionArg.includes(',') ? `-${packs.length}regions` : '-' + regionArg)
  : runMetro ? '-metro-suburbs' : runAll ? '-all' : ''
// Reports live in reports/. Metro runs get their own prefix so a suburb sweep
// never overwrites a same-day regional town sweep.
const prefix = runMetro ? 'suburb-gap-crawl' : 'town-gap-crawl'
mkdirSync(new URL('../reports/', import.meta.url), { recursive: true })
const outPath = `../reports/${prefix}-${date}${rSuffix}${vSuffix}.md`
writeFileSync(new URL(outPath, import.meta.url), reportLines.join('\n'))

console.log('\n\n=== SUMMARY ===')
console.log(`${placeNoun[0].toUpperCase()+placeNoun.slice(1)}s crawled: ${perTown.length}`)
console.log(`Net-new gaps: ${Object.values(grandGaps).reduce((a, b) => a + b, 0)}`)
if (alreadyCrawled) console.log(`Anchors skipped as already crawled: ${alreadyCrawled}`)
if (skippedByVerticalCap) console.log(`Not queued (hit --max-per-vertical=${maxPerVertical}): ${skippedByVerticalCap}`)
if (doQueue) { console.log('Queued by vertical:'); for (const [v, n] of Object.entries(queuedByVertical).sort((a, b) => b[1] - a[1])) console.log(`  ${(VERTICAL_NAMES[v] || v).padEnd(18)} ${n}`) }
if (innerRingSkipped) console.log(`Skipped inside ${INNER_RING_KM}km of a CBD: ${innerRingSkipped}`)
for (const [v, n] of Object.entries(grandGaps).sort((a, b) => b[1] - a[1])) console.log(`  ${(VERTICAL_NAMES[v] || v).padEnd(16)} ${n}`)
if (doQueue) {
  console.log(`Queued to candidate pipeline: ${queuedTotal}`)
  if (skippedByCap) console.log(`NOT queued (hit --max=${maxQueue}): ${skippedByCap} eligible gaps`)
  const manifestPath = new URL(`../reports/${prefix}-${date}${rSuffix}${vSuffix}.queued.json`, import.meta.url)
  writeFileSync(manifestPath, JSON.stringify({ startedAt, maxQueue, queuedTotal, skippedByCap, candidates: queuedIds }, null, 2))
  console.log(`Manifest: reports/${prefix}-${date}${rSuffix}${vSuffix}.queued.json`)
}
console.log(`Report: reports/${prefix}-${date}${rSuffix}${vSuffix}.md`)
