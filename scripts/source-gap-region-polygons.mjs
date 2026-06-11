#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// source-gap-region-polygons.mjs
//
// Source REAL spatial polygons for the 15 gap regions created by
// add-gap-regions-2026-06-11.mjs, from official ABS Tourism Regions
// (ASGS 2021 TR geography) — never hand-drawn (provenance discipline).
//
// Source of truth: ABS ASGS2021 Tourism Regions MapServer, queried by
//   tr_code_2021. Each gap region maps 1:1 to one ABS TR (see ABS_TR below).
//   Geometry is generalised at maxAllowableOffset≈100m and trimmed to 5dp —
//   irrelevant for point-in-region containment, keeps payloads sane for the
//   large outback/coast regions.
//
// Why this is safe (the "smallest polygon wins on overlap" mechanic, shared by
// the trigger listings_recompute_region() and RPC find_containing_region()):
//   - ABS TRs tile the country without overlap, and finer existing Atlas
//     regions (e.g. McLaren Vale inside Fleurieu) have SMALLER area, so they
//     keep their listings — these large TRs can never out-rank them.
//   - The trigger fires BEFORE INSERT OR UPDATE OF lat,lng; writing a polygon
//     does NOT retroactively reassign anything. We re-fire it ONLY on listings
//     whose region_computed_id is currently NULL. A NULL listing sits inside no
//     existing polygon, so nothing is stolen from another region.
//
// After backfill, each region's listing_count is recomputed exactly as
// lib/sync/updateRegionCounts.js does (listings_with_region by region_id) and
// status flips 'draft' → 'live' when count ≥ min_listing_threshold.
//
// Reversibility (per region):
//   UPDATE regions SET polygon = NULL WHERE slug = '<slug>';
//   UPDATE listings SET region_computed_id = NULL
//     WHERE region_computed_id = (SELECT id FROM regions WHERE slug='<slug>');
//
// Usage:
//   node scripts/source-gap-region-polygons.mjs           # dry-run (default)
//   node scripts/source-gap-region-polygons.mjs --apply   # write polygons + backfill + recount
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'

const APPLY = process.argv.includes('--apply')

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const ABS_TR_URL = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/TR/MapServer/0/query'
const OFFSET = '0.001'        // ~100m generalisation
const PRECISION = '5'         // 5 decimal places (~1m)

// slug → { tr, anchors: [[lat,lng], ...] (must be INSIDE the sourced polygon) }
const TARGETS = [
  { slug: 'snowy-mountains',            tr: '1R050', anchors: [[-36.416, 148.622]] },                  // Jindabyne
  { slug: 'riverina',                   tr: '1R080', anchors: [[-35.117, 147.367], [-34.289, 146.040]] }, // Wagga, Griffith
  { slug: 'new-england',                tr: '1R140', anchors: [[-30.512, 151.667], [-31.090, 150.929]] }, // Armidale, Tamworth
  { slug: 'outback-nsw',                tr: '1R150', anchors: [[-31.957, 141.467]] },                  // Broken Hill
  { slug: 'fleurieu-peninsula',         tr: '4R030', anchors: [[-35.551, 138.621]] },                  // Victor Harbor
  { slug: 'yorke-peninsula',            tr: '4R120', anchors: [[-33.963, 137.717]] },                  // Kadina
  { slug: 'murray-river-lakes-coorong', tr: '4R020', anchors: [[-35.119, 139.273]] },                  // Murray Bridge
  { slug: 'coral-coast',                tr: '5R170', anchors: [[-28.774, 114.609]] },                  // Geraldton
  { slug: 'golden-outback',             tr: '5R130', anchors: [[-30.749, 121.466], [-33.861, 121.891]] }, // Kalgoorlie, Esperance
  { slug: 'bundaberg',                  tr: '3R070', anchors: [[-24.866, 152.350]] },                  // Bundaberg
  { slug: 'capricorn',                  tr: '3R170', anchors: [[-23.378, 150.511]] },                  // Rockhampton
  { slug: 'fraser-coast',               tr: '3R040', anchors: [[-25.289, 152.840]] },                  // Hervey Bay
  { slug: 'phillip-island',             tr: '2R210', anchors: [[-38.452, 145.239]] },                  // Cowes
  { slug: 'goulburn-valley',            tr: '2R090', anchors: [[-36.383, 145.400]] },                  // Shepparton
  { slug: 'mildura-mallee',             tr: '2R030', anchors: [[-34.207, 142.137]] },                  // Mildura
]

// ── geometry helpers ──
function toMultiPolygon(g) {
  if (g.type === 'MultiPolygon') return g
  if (g.type === 'Polygon') return { type: 'MultiPolygon', coordinates: [g.coordinates] }
  throw new Error(`unsupported geometry type: ${g.type}`)
}
function pipRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
function pip(lng, lat, mp) {
  for (const poly of mp.coordinates) {
    if (!pipRing(lng, lat, poly[0])) continue
    let hole = false
    for (let i = 1; i < poly.length; i++) { if (pipRing(lng, lat, poly[i])) { hole = true; break } }
    if (!hole) return true
  }
  return false
}
function bbox(mp) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const poly of mp.coordinates) for (const ring of poly) for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}
function vertCount(mp) { let v = 0; for (const poly of mp.coordinates) for (const ring of poly) v += ring.length; return v }
const hashGeom = g => createHash('sha256').update(JSON.stringify(g)).digest('hex').slice(0, 12)

async function fetchTr(trCode) {
  const url = new URL(ABS_TR_URL)
  url.searchParams.set('where', `tr_code_2021='${trCode}'`)
  url.searchParams.set('outFields', 'tr_code_2021,tr_name_2021,state_name_2021')
  url.searchParams.set('returnGeometry', 'true')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('maxAllowableOffset', OFFSET)
  url.searchParams.set('geometryPrecision', PRECISION)
  url.searchParams.set('f', 'geojson')
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`ABS HTTP ${res.status} for ${trCode}`)
  const data = await res.json()
  if (!data.features?.length) throw new Error(`ABS returned no features for ${trCode}`)
  return { props: data.features[0].properties, geom: data.features[0].geometry }
}

async function fetchAllPages(buildQuery) {
  let all = [], from = 0
  for (;;) {
    const { data, error } = await buildQuery().order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}
const nullVisitable = () => sb.from('listings')
  .select('id, name, slug, vertical, region, lat, lng')
  .eq('status', 'active').eq('visitable', true).is('region_computed_id', null).not('lat', 'is', null)

// ─────────────────────────────────────────────────────────────────────────────
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} | source: ABS ASGS2021 Tourism Regions | offset=${OFFSET} precision=${PRECISION}\n`)

// 1. Resolve region rows (must exist — run add-gap-regions-2026-06-11.mjs first)
const slugs = TARGETS.map(t => t.slug)
const { data: regionRows, error: regErr } = await sb.from('regions')
  .select('id, name, slug, state, status, min_listing_threshold').in('slug', slugs)
if (regErr) { console.error('region lookup failed:', regErr.message); process.exit(1) }
const rowBySlug = Object.fromEntries(regionRows.map(r => [r.slug, r]))
const missing = slugs.filter(s => !rowBySlug[s])
if (missing.length) { console.error('Missing region rows (run add-gap-regions first):', missing.join(', ')); process.exit(1) }

// 2. Fetch + sanity-gate every polygon BEFORE any write
console.log('── Sourcing + sanity-gating polygons ──')
const sourced = []
let sanityFail = false
for (const t of TARGETS) {
  process.stdout.write(`  ${t.slug.padEnd(28)} TR ${t.tr} … `)
  let mp, props
  try {
    const r = await fetchTr(t.tr); props = r.props; mp = toMultiPolygon(r.geom)
  } catch (e) { console.log(`✗ fetch: ${e.message}`); sanityFail = true; continue }
  const anchorsOk = t.anchors.every(([lat, lng]) => pip(lng, lat, mp))
  const bb = bbox(mp)
  if (!anchorsOk) { console.log(`✗ anchor NOT inside polygon`); sanityFail = true; continue }
  console.log(`✓ "${props.tr_name_2021}" ${mp.coordinates.length}poly/${vertCount(mp)}v hash=${hashGeom(mp)} anchors✓`)
  sourced.push({ ...t, mp, bb, props, region: rowBySlug[t.slug] })
}
if (sanityFail) { console.log('\n✗ One or more polygons failed sanity — STOPPING (no writes).'); process.exit(1) }

// 3. Impact preview: how many currently-NULL listings fall inside each polygon
console.log('\n── Impact preview: NULL active+visitable listings captured per region ──')
const nullListings = await fetchAllPages(nullVisitable)
console.log(`  ${nullListings.length} NULL-region candidates in the network`)
let totalCaptured = 0
for (const s of sourced) {
  const hits = nullListings.filter(l => l.lng >= s.bb.minX && l.lng <= s.bb.maxX && l.lat >= s.bb.minY && l.lat <= s.bb.maxY && pip(l.lng, l.lat, s.mp))
  s.previewHits = hits
  totalCaptured += hits.length
  console.log(`  ${s.slug.padEnd(28)} ${String(hits.length).padStart(3)}  (threshold ${s.region.min_listing_threshold || 15} → ${hits.length >= (s.region.min_listing_threshold || 15) ? 'LIVE' : 'stays draft'})`)
}
console.log(`  ${'TOTAL'.padEnd(28)} ${String(totalCaptured).padStart(3)} listings would gain a region`)

if (!APPLY) {
  console.log('\n── DRY-RUN complete (no writes). Re-run with --apply to commit. ──')
  process.exit(0)
}

// 4. APPLY — write polygons
console.log('\n── Writing polygons ──')
for (const s of sourced) {
  const { error } = await sb.from('regions').update({ polygon: s.mp, updated_at: new Date().toISOString() }).eq('slug', s.slug)
  if (error) { console.log(`  ✗ ${s.slug}: ${error.message}`); process.exit(1) }
  const { data: after } = await sb.from('regions').select('polygon').eq('slug', s.slug).single()
  const ok = after?.polygon?.type === 'MultiPolygon'
  console.log(`  ${ok ? '✓' : '✗'} ${s.slug.padEnd(28)} stored ${after?.polygon?.coordinates?.length ?? '?'} polygon(s)`)
}

// 5. NULL-only re-backfill — re-fire the spatial trigger on exactly the NULL
//    listings that fall inside one of the new polygons (deduped union of the
//    per-region PIP hits). Recompute is global + smallest-wins, so each lands
//    in the correct region; we touch only the rows we intend to claim.
const seen = new Set()
const targets = []
for (const s of sourced) for (const l of s.previewHits) { if (!seen.has(l.id)) { seen.add(l.id); targets.push(l) } }
console.log(`\n── Re-backfill: firing spatial trigger on ${targets.length} NULL listing(s) inside new polygons ──`)
const CONCURRENCY = 10
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  const chunk = targets.slice(i, i + CONCURRENCY)
  const errs = await Promise.all(chunk.map(t => sb.from('listings').update({ lat: t.lat }).eq('id', t.id).then(r => r.error)))
  errs.forEach((e, j) => { if (e) console.log(`    WARN ${chunk[i + j]?.id}: ${e.message}`) })
}

// 6. Recount + live-flip (mirrors lib/sync/updateRegionCounts.js, scoped to new regions)
console.log('\n── Recount + status (listings_with_region by region_id) ──')
for (const s of sourced) {
  const { count } = await sb.from('listings_with_region')
    .select('id', { count: 'exact', head: true }).eq('status', 'active').eq('region_id', s.region.id)
  const total = count || 0
  const threshold = s.region.min_listing_threshold || 15
  const goLive = total >= threshold
  await sb.from('regions').update({ listing_count: total, ...(goLive ? { status: 'live' } : {}) }).eq('id', s.region.id)
  console.log(`  ${s.slug.padEnd(28)} listings=${String(total).padStart(3)} → ${goLive ? 'LIVE' : 'draft'}`)
}

console.log('\n── APPLY complete. Verify region pages next. ──')
