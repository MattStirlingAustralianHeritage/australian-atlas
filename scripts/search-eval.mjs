#!/usr/bin/env node
/**
 * Search quality + latency eval harness.
 * Runs a golden query set against a running instance of the app (default
 * http://localhost:3000) which itself talks to the production DB.
 *
 * Usage: node _eval-search.mjs [baseUrl] [snapshotLabel]
 * Writes scripts/out/search-eval-<label>.json for before/after diffing.
 */

const BASE = process.argv[2] || 'http://localhost:3000'
const LABEL = process.argv[3] || 'run'

// ── Golden cases ────────────────────────────────────────────────────────────
// kinds of check:
//   expectSlugTop: [slug, k]  — slug appears in the top k listings
//   expectVerticalShare: [vertical, minShare, topN] — share of topN in vertical
//   expectState: state of majority of top 10
//   expectNonZero / expectZero
const CASES = [
  // 1. exact name lookups
  { class: 'name', q: "T'Arts Collective", expectSlugTop: ['tarts-collective', 1] },
  { class: 'name', q: 'Deep South Brewing Co', expectSlugTop: ['deep-south-brewing-co', 1] },
  { class: 'name', q: 'Readings Carlton', expectSlugTop: ['readings-carlton', 3] },
  { class: 'name', q: 'Ceramiques Kew', expectSlugTop: ['c-ramiques-kew', 1] },
  { class: 'name', q: 'Feather and Lawry Gallery', expectSlugTop: ['feather-and-lawry-gallery', 1] },
  { class: 'name', q: 'Meekz Contemporary Jewellery', expectSlugTop: ['meekz-contemporary-jewellery', 1] },
  { class: 'name', q: 'Furneaux Distillery', expectSlugTop: ['furneaux-distillery', 1] },

  // 2. typos (these MISSED in production telemetry)
  { class: 'typo', q: 'meekz contemporry jewellry', expectSlugTop: ['meekz-contemporary-jewellery', 3] },
  { class: 'typo', q: 'Furneax Distilery', expectSlugTop: ['furneaux-distillery', 3] },
  { class: 'typo', q: 'Deep South Brewwing', expectSlugTop: ['deep-south-brewing-co', 3] },
  { class: 'typo', q: 'Cermiques Kew', expectSlugTop: ['c-ramiques-kew', 5] },
  { class: 'typo', q: 'tarts collective adelaide', expectSlugTop: ['tarts-collective', 3] },

  // 3. category
  { class: 'category', q: 'craft brewery', expectVerticalShare: ['sba', 0.6, 10], expectNonZero: true },
  { class: 'category', q: 'wine bar', expectNonZero: true, expectSubTypeShare: ['wine_bar', 0.5, 10] },
  { class: 'category', q: 'bottle shop', expectNonZero: true, expectSubTypeShare: ['bottle_shop', 0.5, 10] },
  { class: 'category', q: 'plant nursery', expectNonZero: true, expectSubTypeShare: ['nursery', 0.5, 10] },
  { class: 'category', q: 'bookshop', expectNonZero: true, expectSubTypeShare: ['bookshop', 0.5, 10] },
  { class: 'category', q: 'specialty coffee', expectVerticalShare: ['fine_grounds', 0.6, 10], expectNonZero: true },

  // 4. category + location
  { class: 'geo', q: 'coffee brisbane', expectNonZero: true, expectStateShare: ['QLD', 0.8, 10] },
  { class: 'geo', q: 'galleries on the gold coast', expectNonZero: true, expectStateShare: ['QLD', 0.8, 10] },
  { class: 'geo', q: 'wineries in macedon ranges', expectNonZero: true, expectStateShare: ['VIC', 0.9, 10] },
  { class: 'geo', q: 'whisky in tasmania', expectNonZero: true, expectStateShare: ['TAS', 0.9, 10] },
  { class: 'geo', q: 'breweries in burleigh heads', expectNonZero: true, expectStateShare: ['QLD', 0.8, 10] },

  // 5. synonym-dependent
  { class: 'synonym', q: 'bottleo', expectNonZero: true, expectSubTypeShare: ['bottle_shop', 0.4, 10] },
  { class: 'synonym', q: 'enoteca', expectNonZero: true },
  { class: 'synonym', q: 'teahouse', expectNonZero: true },

  // 6. descriptive / vibe
  { class: 'vibe', q: 'wood fired oven brewery', expectNonZero: true },
  { class: 'vibe', q: 'somewhere quiet to read on a rainy day', expectNonZero: true },
  { class: 'vibe', q: 'a business run by the same family for generations', expectNonZero: true },

  // 7. place queries (production misses included)
  { class: 'place', q: 'apollo bay', expectNonZero: true },
  { class: 'place', q: 'broulee', expectNonZero: true },
  { class: 'place', q: 'brewery in flinders island', expectNonZero: true, expectSlugTop: ['furneaux-distillery', 10] },

  // 8. traps: gibberish stays zero; plausible-but-off-catalog queries must not
  // claim any STRONG results (the UI then labels them "closest matches").
  { class: 'trap', q: 'zzzqqqxx', expectZero: true },
  { class: 'trap', q: 'xkcd quantum flux capacitor rental', expectNoStrong: true },
]

function checkCase(c, body) {
  const listings = body.listings || []
  const nameMatchRow = body.nameMatch || null
  const failures = []
  const totalNonZero = (body.total || 0) > 0

  if (c.expectZero && totalNonZero) failures.push(`expected zero, got ${body.total}`)
  if (c.expectNonZero && !totalNonZero && !nameMatchRow) failures.push('expected results, got zero')
  if (c.expectNoStrong && listings.some((l) => l.strong === true)) failures.push('junk query claimed a strong result')

  if (c.expectSlugTop) {
    const [slug, k] = c.expectSlugTop
    const idx = listings.findIndex((l) => l.slug === slug)
    const inNameMatch = nameMatchRow?.slug === slug
    if (!(idx >= 0 && idx < k) && !inNameMatch) {
      failures.push(`${slug} not in top ${k} (found at ${idx < 0 ? 'none' : idx + 1}${inNameMatch ? ', nameMatch' : ''})`)
    }
  }
  const share = (topN, fn) => {
    const rows = listings.slice(0, topN)
    return rows.length ? rows.filter(fn).length / rows.length : 0
  }
  if (c.expectVerticalShare) {
    const [v, min, topN] = c.expectVerticalShare
    const s = share(topN, (l) => l.vertical === v || (l.also_in || []).includes(v))
    if (s < min) failures.push(`vertical ${v} share ${s.toFixed(2)} < ${min}`)
  }
  if (c.expectSubTypeShare) {
    const [st, min, topN] = c.expectSubTypeShare
    const s = share(topN, (l) => l.sub_type === st)
    if (s < min) failures.push(`sub_type ${st} share ${s.toFixed(2)} < ${min}`)
  }
  if (c.expectStateShare) {
    const [st, min, topN] = c.expectStateShare
    const s = share(topN, (l) => l.state === st)
    if (s < min) failures.push(`state ${st} share ${s.toFixed(2)} < ${min}`)
  }
  return failures
}

const results = []
let pass = 0
for (const c of CASES) {
  const url = `${BASE}/api/search?q=${encodeURIComponent(c.q)}`
  const t0 = Date.now()
  let body, ms, status
  try {
    const res = await fetch(url)
    status = res.status
    body = await res.json()
    ms = Date.now() - t0
  } catch (e) {
    results.push({ ...c, status: 'FETCH_ERROR', error: e.message })
    console.log(`✗ [${c.class}] "${c.q}" — FETCH ERROR ${e.message}`)
    continue
  }
  const failures = status === 200 ? checkCase(c, body) : [`HTTP ${status}`]
  const ok = failures.length === 0
  if (ok) pass++
  results.push({
    class: c.class, q: c.q, ok, failures, ms, total: body.total,
    reranked: body.reranked, expanded: body.expanded,
    detectedState: body.detectedState, detectedRegion: body.detectedRegion?.slug || null,
    detectedPlace: body.detectedPlace?.label || null, detectedVertical: body.detectedVertical,
    nameMatch: body.nameMatch?.slug || null,
    top5: (body.listings || []).slice(0, 5).map((l) => `${l.slug}(${l.vertical}${l.state ? ',' + l.state : ''})`),
  })
  console.log(`${ok ? '✓' : '✗'} [${c.class}] "${c.q}" ${ms}ms n=${body.total}${ok ? '' : ' — ' + failures.join('; ')}`)
}

const lats = results.filter((r) => r.ms).map((r) => r.ms).sort((a, b) => a - b)
const pct = (p) => lats[Math.min(lats.length - 1, Math.floor(p * lats.length))]
console.log(`\n=== ${pass}/${CASES.length} passed | latency p50=${pct(0.5)}ms p90=${pct(0.9)}ms max=${lats[lats.length - 1]}ms ===`)

const byClass = {}
for (const r of results) {
  byClass[r.class] = byClass[r.class] || { pass: 0, total: 0 }
  byClass[r.class].total++
  if (r.ok) byClass[r.class].pass++
}
for (const [k, v] of Object.entries(byClass)) console.log(`  ${k}: ${v.pass}/${v.total}`)

const { writeFileSync, mkdirSync } = await import('fs')
mkdirSync('scripts/out', { recursive: true })
writeFileSync(`scripts/out/search-eval-${LABEL}.json`, JSON.stringify({ label: LABEL, when: new Date().toISOString(), pass, total: CASES.length, results }, null, 2))
console.log(`\nsnapshot: scripts/out/search-eval-${LABEL}.json`)
