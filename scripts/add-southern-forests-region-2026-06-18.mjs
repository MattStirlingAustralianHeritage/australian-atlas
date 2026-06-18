#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// add-southern-forests-region-2026-06-18.mjs
//
// Create the SOUTHERN FORESTS region of Western Australia.
//
// WHAT / WHERE — the tall-timber country of WA's South West, inland and south of
//   the Margaret River wine region: the karri/jarrah/marri/tingle forests around
//   Manjimup, Pemberton, Northcliffe and Walpole, and the farming centres of
//   Bridgetown, Greenbushes, Nannup and Boyup Brook. Home of the Manjimup black
//   truffle, marron, the cool-climate Pemberton wine district, the Gloucester
//   Tree, the Valley of the Giants tingle forest, and long stretches of the
//   Bibbulmun Track and Munda Biddi Trail.
//
// WHY THIS EXISTS — confirmed gap (2026-06-18): WA already has Perth, Margaret
//   River, the Great Southern (Albany/Denmark), the Coral Coast and the Golden
//   Outback, but the Southern Forests — a distinct, well-known food-and-forest
//   region between Margaret River and the Great Southern — had no region row.
//   Any current or future venue around Manjimup/Pemberton/Bridgetown/Nannup
//   falls in no polygon → orphaned with a NULL region. This row gives the region
//   (and the venues in it) a home and scaffolds it so future listings auto-bind.
//
// PROVENANCE (never hand-drawn) — the region polygon is the UNION of the four
//   official ABS ASGS2021 Local Government Area boundaries that make up the
//   Southern Forests (this is the same four-shire footprint used by the Southern
//   Forests Food Council):
//     • Manjimup               lga_code_2021 = 55180  (incl. Pemberton, Northcliffe, Walpole)
//     • Bridgetown-Greenbushes lga_code_2021 = 50840
//     • Nannup                 lga_code_2021 = 56300
//     • Boyup Brook            lga_code_2021 = 50770
//   Each is fetched live at ~30 m generalisation and gated on its exact name AND
//   Tasmanian-style state/code check (Western Australia) before any write, so we
//   can never grab a same-named LGA from another state. The four are adjacent and
//   mutually exclusive (administrative partition) — the union is a single
//   MultiPolygon of all their parts.
//
// SAFETY (smallest-polygon-wins, per 097_spatial_containment_trigger.sql): the
//   trigger recomputes region_computed_id on UPDATE OF lat,lng and picks the
//   SMALLEST-area region whose polygon contains the point. We re-fire it ONLY on
//   listings whose region_computed_id is currently NULL, so nothing is stolen
//   from Margaret River, the Great Southern, or any other region. Writing the
//   polygon does not retroactively reassign anything already bound elsewhere.
//   (A diagnostic below reports any overlap of our anchors with those neighbours.)
//
// DATA INTEGRITY (cross-state guard, no-hallucination rule): the NULL-only
//   backfill adopts an orphan only if its own `state` column is WA or unset. A
//   row whose lat/lng land inside the polygon but whose `state` is some other
//   state is a mis-geocoded interstate venue — it is listed and SKIPPED (left
//   NULL, flagged for separate geocode repair), never bound here.
//
// STATUS: created 'draft', then flipped to 'live' iff it adopts at least
//   LIVE_FLOOR (6) real, grounded venues — same floor used for the recent
//   eurobodalla / sapphire-coast / Bass-Strait island regions. updateRegionCounts
//   only ever flips UP to live, never down, so a manual live flip is durable.
//   Editorial (generated_intro / long_description) is left NULL — no fabricated
//   copy (no-hallucination rule); the detail page falls back to the grounded
//   `description` below (verifiable geography only).
//
// Reversibility:
//   UPDATE regions SET polygon = NULL, status='draft' WHERE slug='southern-forests';
//   UPDATE listings SET region_computed_id = NULL
//     WHERE region_computed_id = (SELECT id FROM regions WHERE slug='southern-forests');
//   DELETE FROM regions WHERE slug='southern-forests';   -- if removing entirely
//
// Usage:
//   node scripts/add-southern-forests-region-2026-06-18.mjs           # dry-run
//   node scripts/add-southern-forests-region-2026-06-18.mjs --apply   # write
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

const MAPBOX_TOKEN = env.NEXT_PUBLIC_MAPBOX_TOKEN
const MAPBOX_STYLE = 'mapbox/light-v11'
const staticUrl = (lng, lat, zoom, w, h) =>
  `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${lng},${lat},${zoom},0/${w}x${h}@2x?access_token=${MAPBOX_TOKEN}`

const LIVE_FLOOR = 6

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
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}
function vertCount(mp) { let v = 0; for (const poly of mp.coordinates) for (const ring of poly) v += ring.length; return v }
const hashGeom = g => createHash('sha256').update(JSON.stringify(g)).digest('hex').slice(0, 12)

const ABS_LGA_URL = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/LGA/MapServer/0/query'
const OFFSET = '0.0003'   // ~30 m — fine enough for town containment, keeps payload small
const PRECISION = '6'

async function fetchLga(name) {
  const url = new URL(ABS_LGA_URL)
  url.searchParams.set('where', `LGA_NAME_2021='${name}'`)
  url.searchParams.set('outFields', 'lga_code_2021,lga_name_2021,state_name_2021')
  url.searchParams.set('returnGeometry', 'true')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('maxAllowableOffset', OFFSET)
  url.searchParams.set('geometryPrecision', PRECISION)
  url.searchParams.set('f', 'geojson')
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`ABS HTTP ${res.status}`)
  const data = await res.json()
  if (!data.features?.length) throw new Error(`ABS returned no features for LGA "${name}"`)
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

// ── the region ────────────────────────────────────────────────────────────────
const REGION = {
  name: 'Southern Forests',
  slug: 'southern-forests',
  state: 'WA',
  zoom: 8,
  description:
    "The tall-timber country of Western Australia's South West, inland and south " +
    "of the Margaret River wine region. Karri, jarrah, marri and red-tingle " +
    "forests rise around the towns of Manjimup, Pemberton, Northcliffe and " +
    "Walpole, and the farming centres of Bridgetown, Greenbushes, Nannup and " +
    "Boyup Brook. This is the home of the Manjimup black truffle, of marron, " +
    "stone fruit and the cool-climate Pemberton wine district; of the Gloucester " +
    "Tree and the Valley of the Giants tingle forest at Walpole; and of long-" +
    "distance walking on the Bibbulmun Track and cycling on the Munda Biddi " +
    "Trail. The region takes in the shires of Manjimup, Bridgetown-Greenbushes, " +
    "Nannup and Boyup Brook.",
  // The four ABS LGAs that make up the region. Gated on exact name + WA state.
  lgas: [
    { lga_name: 'Manjimup',               lga_code: '55180' },
    { lga_name: 'Bridgetown-Greenbushes', lga_code: '50840' },
    { lga_name: 'Nannup',                 lga_code: '56300' },
    { lga_name: 'Boyup Brook',            lga_code: '50770' },
  ],
  // Town points that MUST land inside the union (interior points, not waterline).
  anchors_in: [
    ['Manjimup',    -34.2410, 116.1466],
    ['Pemberton',   -34.4419, 116.0376],
    ['Northcliffe', -34.6394, 116.1228],
    ['Bridgetown',  -33.9572, 116.1372],
    ['Greenbushes', -33.8478, 116.0594],
    ['Nannup',      -33.9810, 115.7672],
    ['Boyup Brook', -33.8331, 116.3897],
  ],
  // Points that must NOT be inside (neighbouring regions / outside the four shires)
  anchors_out: [
    ['Margaret River town (Augusta-MR shire)', -33.9550, 115.0750],
    ['Albany (Great Southern)',                -35.0269, 117.8837],
    ['Bunbury (South West coast)',             -33.3271, 115.6414],
    ['Busselton',                              -33.6555, 115.3450],
  ],
}

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} | source: ABS ASGS2021 LGA union | offset=${OFFSET} precision=${PRECISION}\n`)
if (!MAPBOX_TOKEN) { console.error('Missing NEXT_PUBLIC_MAPBOX_TOKEN'); process.exit(1) }

// pre-flight: slug must not already exist
{
  const { data: dup } = await sb.from('regions').select('id,slug,status').eq('slug', REGION.slug)
  if (dup?.length) { console.error(`✗ region slug "${REGION.slug}" already exists (id=${dup[0].id}) — STOPPING`); process.exit(1) }
}

// ── 1. Fetch each LGA, gate identity, build the UNION MultiPolygon ────────────
console.log('── Sourcing + gating the four LGA polygons, then unioning ──')
const unionCoords = []
for (const l of REGION.lgas) {
  const { props, geom } = await fetchLga(l.lga_name)
  const mp = toMultiPolygon(geom)
  console.log(`\n  ${l.lga_name}  (expect code ${l.lga_code})`)
  console.log(`    ABS: "${props.lga_name_2021}" (lga_code ${props.lga_code_2021}, ${props.state_name_2021})`)
  console.log(`    geometry: ${mp.coordinates.length} polygon(s), ${vertCount(mp)} verts, hash=${hashGeom(mp)}`)
  if (props.state_name_2021 !== 'Western Australia' || props.lga_code_2021 !== l.lga_code || props.lga_name_2021 !== l.lga_name) {
    console.error(`    ✗ unexpected LGA identity — STOPPING (no writes)`); process.exit(1)
  }
  console.log('    ✓ identity confirmed')
  unionCoords.push(...mp.coordinates)
}
const UNION = { type: 'MultiPolygon', coordinates: unionCoords }
const bb = bbox(UNION)
console.log(`\n  UNION: ${UNION.coordinates.length} polygon(s), ${vertCount(UNION)} verts, hash=${hashGeom(UNION)}`)
console.log(`  bbox: lat ${bb.minY.toFixed(3)}→${bb.maxY.toFixed(3)}, lng ${bb.minX.toFixed(3)}→${bb.maxX.toFixed(3)}`)

// data-driven centre = bbox midpoint
const centerLat = +((bb.minY + bb.maxY) / 2).toFixed(5)
const centerLng = +((bb.minX + bb.maxX) / 2).toFixed(5)
console.log(`  centre (bbox midpoint): ${centerLat}, ${centerLng}  zoom ${REGION.zoom}`)

// ── 2. Anchor sanity gate ─────────────────────────────────────────────────────
console.log('\n── Anchor sanity gate ──')
let gateFail = false
for (const [n, lat, lng] of REGION.anchors_in)  { const ok = pip(lng, lat, UNION);  console.log(`  IN  ${n.padEnd(42)} ${ok ? '✓' : '✗ NOT INSIDE'}`); if (!ok) gateFail = true }
for (const [n, lat, lng] of REGION.anchors_out) { const ok = !pip(lng, lat, UNION); console.log(`  OUT ${n.padEnd(42)} ${ok ? '✓' : '✗ INSIDE (too big)'}`); if (!ok) gateFail = true }
if (gateFail) { console.error('\n✗ Anchor sanity failed — STOPPING (no writes).'); process.exit(1) }
console.log('  ✓ all anchors pass')

// ── 3. Neighbour-overlap diagnostic (report only — no action) ─────────────────
console.log('\n── Neighbour-overlap diagnostic (Margaret River / Great Southern) ──')
{
  const { data: nbrs } = await sb.from('regions').select('slug,polygon').in('slug', ['margaret-river', 'great-southern'])
  for (const nbr of nbrs || []) {
    if (!nbr.polygon) { console.log(`  ${nbr.slug}: no polygon`); continue }
    const hits = REGION.anchors_in.filter(([, lat, lng]) => pip(lng, lat, nbr.polygon)).map(a => a[0])
    console.log(`  ${nbr.slug}: ${hits.length ? 'overlaps our anchors → ' + hits.join(', ') : 'no overlap with our anchors'}`)
  }
  console.log('  (overlap is harmless: smallest-polygon-wins on NEW points; existing bound listings are never re-fired)')
}

// ── 4. Impact preview: NULL-region active+visitable listings inside the union ─
console.log('\n── Impact preview: NULL-region active+visitable listings inside the union ──')
const nullInBbox = await fetchAllPages(() => sb.from('listings')
  .select('id, name, slug, vertical, state, region, lat, lng')
  .eq('status', 'active').eq('visitable', true).is('region_computed_id', null)
  .not('lat', 'is', null)
  .gte('lat', bb.minY - 0.02).lte('lat', bb.maxY + 0.02)
  .gte('lng', bb.minX - 0.02).lte('lng', bb.maxX + 0.02))
const inPolygon = nullInBbox.filter(l => pip(l.lng, l.lat, UNION))
const isCrossState = l => l.state && l.state.toUpperCase() !== 'WA'
const skipped = inPolygon.filter(isCrossState)
const captured = inPolygon.filter(l => !isCrossState(l))
console.log(`  ${nullInBbox.length} NULL in bbox → ${inPolygon.length} inside union → ${captured.length} kept (WA), ${skipped.length} skipped (cross-state):`)
for (const l of captured) console.log(`    keep · ${l.name}  (${l.vertical}, state=${l.state || '∅'}, text-region="${l.region || ''}")  [${l.lat},${l.lng}]`)
for (const l of skipped)  console.log(`    SKIP ✗ ${l.name}  (${l.vertical}, state=${l.state}) — interstate mis-geocode, left NULL`)
console.log(`  → captured ${captured.length} (LIVE_FLOOR ${LIVE_FLOOR}) → region will be ${captured.length >= LIVE_FLOOR ? 'LIVE' : 'draft'}`)

if (!APPLY) {
  console.log('\n── DRY-RUN complete (no writes). Re-run with --apply to commit. ──')
  process.exit(0)
}

// ── 5. APPLY: upsert row → write polygon → NULL-only backfill → recount ───────
async function recount(regionId) {
  const { count } = await sb.from('listings_with_region')
    .select('id', { count: 'exact', head: true }).eq('status', 'active').eq('region_id', regionId)
  return count || 0
}

console.log('\n════ APPLY southern-forests ════')
const row = {
  name: REGION.name, slug: REGION.slug, state: REGION.state, description: REGION.description,
  center_lat: centerLat, center_lng: centerLng, map_zoom: REGION.zoom,
  hero_image_url: staticUrl(centerLng, centerLat, Math.max(REGION.zoom - 1, 4), 1280, 500),
  hero_image_card_url: staticUrl(centerLng, centerLat, REGION.zoom, 600, 400),
  hero_image_source: 'mapbox_static',
  status: 'draft',
}
let regionId
{
  const { data, error } = await sb.from('regions').upsert(row, { onConflict: 'slug' })
    .select('id, name, slug, state, status').single()
  if (error) { console.error('  upsert failed:', error.message); process.exit(1) }
  regionId = data.id
  console.log(`  ✓ row ${data.slug} id=${data.id} status=${data.status}`)
}
{
  const { error } = await sb.from('regions').update({ polygon: UNION, updated_at: new Date().toISOString() }).eq('slug', REGION.slug)
  if (error) { console.error('  polygon write failed:', error.message); process.exit(1) }
  const { data: after } = await sb.from('regions').select('polygon').eq('slug', REGION.slug).single()
  const ok = after?.polygon?.type === 'MultiPolygon'
  console.log(`  ${ok ? '✓' : '✗'} polygon stored (${after?.polygon?.coordinates?.length ?? '?'} polygon(s))`)
  if (!ok) { console.error('  polygon round-trip not MultiPolygon — STOPPING'); process.exit(1) }
}
console.log(`  re-backfill: firing spatial trigger on ${captured.length} NULL listing(s)`)
const CONCURRENCY = 8
for (let i = 0; i < captured.length; i += CONCURRENCY) {
  const chunk = captured.slice(i, i + CONCURRENCY)
  const errs = await Promise.all(chunk.map(t => sb.from('listings').update({ lat: t.lat }).eq('id', t.id).then(r => r.error)))
  errs.forEach((e, j) => { if (e) console.log(`    WARN ${chunk[j]?.id}: ${e.message}`) })
}
const total = await recount(regionId)
const goLive = total >= LIVE_FLOOR
const { error: stErr } = await sb.from('regions')
  .update({ listing_count: total, status: goLive ? 'live' : 'draft' }).eq('id', regionId)
if (stErr) { console.error('  status/count update failed:', stErr.message); process.exit(1) }
console.log(`  southern-forests: listing_count=${total} → status=${goLive ? 'LIVE' : 'draft'}`)

// ── 6. Read-back verification ─────────────────────────────────────────────────
console.log('\n── Final region row ──')
const { data: final } = await sb.from('regions')
  .select('id, name, slug, state, status, listing_count, center_lat, center_lng, map_zoom, polygon')
  .eq('slug', REGION.slug).single()
console.log(`  ${final.slug} ${final.name} (${final.state})  status=${final.status}  count=${final.listing_count}  centre=${final.center_lat},${final.center_lng} z${final.map_zoom}  polygon=${final.polygon?.type} (${final.polygon?.coordinates?.length} parts)  id=${final.id}`)
console.log('\n── APPLY complete. Verify /regions and /regions/southern-forests next. ──')
