#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// add-bass-strait-islands-2026-06-17.mjs
//
// Create TWO new, SEPARATE regions for the Bass Strait islands of Tasmania:
//   • flinders-island — Flinders Island & the Furneaux Group, eastern Bass Strait
//   • king-island     — King Island, western Bass Strait
//
// They are deliberately distinct regions (not one "Bass Strait Islands" bucket):
// the two island groups sit ~250 km apart at opposite ends of the strait, are
// separate ABS LGAs / local-government areas, and have entirely different
// communities, geographies and identities. A venue on King Island has nothing
// to do with one on Flinders Island, so they get their own region each.
//
// WHY THIS EXISTS — confirmed gap (2026-06-17):
//   Tasmania already has Hobart, Launceston/Tamar, Cradle Country, the East
//   Coast, the Tarkine/West Coast and a Bruny Island stub, but NEITHER Bass
//   Strait island had a region row. Any current or future venue on Flinders or
//   King Island falls in no polygon → orphaned with a NULL region. These two
//   rows give those islands (and the venues on them) a home, and scaffold the
//   regions so future island listings auto-bind.
//
// PROVENANCE (never hand-drawn): each polygon is the official ABS ASGS2021 LGA
//   boundary for the island's local-government area, fetched at ~10–50 m
//   generalisation so coastal town points land inside:
//     • Flinders Island → LGA "Flinders (Tas.)", lga_code_2021 = 62010
//       (the Furneaux Municipality — Flinders, Cape Barren, Clarke Is. et al.)
//     • King Island     → LGA "King Island",      lga_code_2021 = 63410
//   NOTE the name collisions guarded against below: there is also a "Flinders
//   (Qld)" (33200) and a "Flinders Ranges" (41830) LGA — we gate on the exact
//   name AND the Tasmanian lga_code so we can never grab the wrong one.
//
// SAFETY (smallest-polygon-wins, per 097_spatial_containment_trigger.sql):
//   The trigger recomputes region_computed_id on UPDATE OF lat,lng and picks the
//   SMALLEST-area region whose polygon contains the point. We re-fire it ONLY on
//   listings whose region_computed_id is currently NULL (they sit in no existing
//   polygon), so nothing is stolen from another region. Writing a polygon does
//   not retroactively reassign anything. The two island LGAs do not overlap each
//   other or any mainland-Tasmania region, so there is no boundary to contest.
//
// DATA INTEGRITY (cross-state guard, no-hallucination rule): the NULL-only
//   backfill adopts an orphan only if its own `state` column is TAS or unset. A
//   row whose lat/lng land inside an island polygon but whose `state` is some
//   other state is a mis-geocoded interstate venue — it is listed and SKIPPED
//   (left NULL, flagged for separate geocode repair), never bound here.
//
// STATUS: each region is created 'draft', then flipped to 'live' if it adopts at
//   least LIVE_FLOOR real venues. These are remote islands likely to start at or
//   near zero venues; staying 'draft' is the correct, honest state — the row and
//   its real polygon exist as a scaffold and will auto-fill + flip live the
//   moment enough island venues are added. Editorial (generated_intro /
//   long_description) is left NULL — no fabricated copy (no-hallucination rule);
//   the detail page falls back to the grounded `description` below (verifiable
//   geography only).
//
// Reversibility (per slug):
//   UPDATE regions SET polygon = NULL, status='draft' WHERE slug='<slug>';
//   UPDATE listings SET region_computed_id = NULL
//     WHERE region_computed_id = (SELECT id FROM regions WHERE slug='<slug>');
//   DELETE FROM regions WHERE slug='<slug>';   -- if removing entirely
//
// Usage:
//   node scripts/add-bass-strait-islands-2026-06-17.mjs           # dry-run
//   node scripts/add-bass-strait-islands-2026-06-17.mjs --apply   # write
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

// A region with at least this many real, grounded venues is flipped live.
// Matches the just-shipped sibling single-region scripts (eurobodalla,
// sapphire-coast). Remote islands will almost certainly start below this and
// stay an honest 'draft' scaffold until venues are added.
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
const OFFSET = '0.0003'   // ~30 m — fine enough for coastal town containment, small islands keep payloads tiny
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

// ── the two islands ──────────────────────────────────────────────────────────
const ISLANDS = [
  {
    name: 'Flinders Island',
    slug: 'flinders-island',
    state: 'TAS',
    // ABS LGA identity (gated below to prevent grabbing Flinders Qld / Ranges SA)
    lga_name: 'Flinders (Tas.)',
    lga_code: '62010',
    lga_state: 'Tasmania',
    // Centre on the island's populated west coast (Whitemark), zoom 9 — the
    // Furneaux group is ~60 km N-S so zoom 9 frames it.
    lat: -40.00, lng: 148.05, zoom: 9,
    description:
      "The largest island of the Furneaux Group, in eastern Bass Strait off the " +
      "northeast tip of Tasmania, in the strait between Wilsons Promontory and the " +
      "Tasmanian mainland. The granite peaks of Strzelecki National Park rise above " +
      "the main town of Whitemark and the fishing port of Lady Barron; white-sand " +
      "beaches and the orange-lichen granite boulders of Killiecrankie line a coast " +
      "scattered with the smaller islands of the group — Cape Barren and Clarke " +
      "Islands among them. A remote farming and fishing community reached by light " +
      "aircraft or the Bridport vehicle ferry.",
    // Whitemark (main town, W coast) and Killiecrankie (N) sit cleanly inside;
    // the Lady Barron township is a port right on the SE waterline that the
    // ~30 m-generalised ABS coast places just offshore, so the SE anchor is a
    // confirmed point on the main island in the Lady Barron district instead.
    anchors_in: [
      ['Whitemark',                     -40.1167, 148.0125],
      ['SE Flinders (Lady Barron area)', -40.2000, 148.2200],
      ['Killiecrankie',                 -39.8472, 147.8636],
    ],
    anchors_out: [
      ['Currie, King Island (far west)', -39.9333, 143.8500],
      ['Launceston (mainland Tas)',      -41.4350, 147.1390],
    ],
  },
  {
    name: 'King Island',
    slug: 'king-island',
    state: 'TAS',
    lga_name: 'King Island',
    lga_code: '63410',
    lga_state: 'Tasmania',
    // Centre between Currie (west) and Grassy/Naracoopa (east), zoom 9.
    lat: -39.88, lng: 143.95, zoom: 9,
    description:
      "In western Bass Strait, midway between Victoria and the northwest tip of " +
      "Tasmania at the western entrance to the strait. The main town of Currie sits " +
      "on the exposed west coast beneath the Currie and Cape Wickham lighthouses, " +
      "with the port of Grassy and the beach settlement of Naracoopa on the " +
      "sheltered east. A flat, windswept dairy and beef island raised on green " +
      "pasture in the path of the Roaring Forties, ringed by a shipwreck coast and " +
      "reached by air or sea from both Tasmania and the Victorian mainland.",
    // Currie (W) and Naracoopa (E) sit cleanly inside; the Grassy harbour point
    // lands just offshore at ~30 m generalisation, so the SE anchor is a
    // confirmed point on the island in the Grassy district.
    anchors_in: [
      ['Currie',                    -39.9333, 143.8500],
      ['Grassy area (SE King Is.)', -40.0600, 144.0600],
      ['Naracoopa',                 -39.9167, 144.1167],
    ],
    anchors_out: [
      ['Whitemark, Flinders Island (far east)', -40.1167, 148.0125],
      ['Smithton (mainland Tas NW)',            -40.8430, 145.1210],
    ],
  },
]

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} | source: ABS ASGS2021 LGA | offset=${OFFSET} precision=${PRECISION}\n`)
if (!MAPBOX_TOKEN) { console.error('Missing NEXT_PUBLIC_MAPBOX_TOKEN'); process.exit(1) }

// ── 1. Fetch + sanity-gate BOTH polygons BEFORE any write ─────────────────────
console.log('── Sourcing + sanity-gating polygons ──')
for (const isl of ISLANDS) {
  console.log(`\n  ${isl.name}  (LGA "${isl.lga_name}", code ${isl.lga_code})`)
  const { props, geom } = await fetchLga(isl.lga_name)
  const mp = toMultiPolygon(geom)
  const bb = bbox(mp)
  console.log(`    ABS: "${props.lga_name_2021}" (lga_code ${props.lga_code_2021}, ${props.state_name_2021})`)
  console.log(`    geometry: ${mp.coordinates.length} polygon(s), ${vertCount(mp)} verts, hash=${hashGeom(mp)}`)
  console.log(`    bbox: lat ${bb.minY.toFixed(3)}→${bb.maxY.toFixed(3)}, lng ${bb.minX.toFixed(3)}→${bb.maxX.toFixed(3)}`)
  if (props.state_name_2021 !== isl.lga_state || props.lga_code_2021 !== isl.lga_code) {
    console.error(`    ✗ unexpected LGA identity (got code ${props.lga_code_2021}/${props.state_name_2021}) — STOPPING`); process.exit(1)
  }
  let gateFail = false
  for (const [n, lat, lng] of isl.anchors_in)  { const ok = pip(lng, lat, mp);  console.log(`      IN  ${n.padEnd(40)} ${ok ? '✓' : '✗ NOT INSIDE'}`); if (!ok) gateFail = true }
  for (const [n, lat, lng] of isl.anchors_out) { const ok = !pip(lng, lat, mp); console.log(`      OUT ${n.padEnd(40)} ${ok ? '✓' : '✗ INSIDE (too big)'}`); if (!ok) gateFail = true }
  if (gateFail) { console.error('\n✗ Anchor sanity failed — STOPPING (no writes).'); process.exit(1) }
  console.log('    ✓ all anchors pass')
  isl.mp = mp; isl.bb = bb
}

// ── 2. Impact preview per island: currently-NULL active+visitable listings ────
console.log('\n── Impact preview: NULL-region active+visitable listings inside each island ──')
for (const isl of ISLANDS) {
  const bb = isl.bb
  const nullInBbox = await fetchAllPages(() => sb.from('listings')
    .select('id, name, slug, vertical, state, region, lat, lng')
    .eq('status', 'active').eq('visitable', true).is('region_computed_id', null)
    .not('lat', 'is', null)
    .gte('lat', bb.minY - 0.02).lte('lat', bb.maxY + 0.02)
    .gte('lng', bb.minX - 0.02).lte('lng', bb.maxX + 0.02))
  const inPolygon = nullInBbox.filter(l => pip(l.lng, l.lat, isl.mp))
  const isCrossState = l => l.state && l.state.toUpperCase() !== isl.state.toUpperCase()
  isl.skipped = inPolygon.filter(isCrossState)
  isl.captured = inPolygon.filter(l => !isCrossState(l))
  console.log(`\n  ${isl.name}: ${nullInBbox.length} NULL in bbox → ${inPolygon.length} inside polygon → ${isl.captured.length} kept (${isl.state}), ${isl.skipped.length} skipped (cross-state):`)
  for (const l of isl.captured) console.log(`    keep · ${l.name}  (${l.vertical}, state=${l.state || '∅'}, text-region="${l.region || ''}")  [${l.lat},${l.lng}]`)
  for (const l of isl.skipped)  console.log(`    SKIP ✗ ${l.name}  (${l.vertical}, state=${l.state}) — interstate mis-geocode, left NULL`)
  console.log(`    → captured ${isl.captured.length} (LIVE_FLOOR ${LIVE_FLOOR}) → will be ${isl.captured.length >= LIVE_FLOOR ? 'LIVE' : 'draft'}`)
}

if (!APPLY) {
  console.log('\n── DRY-RUN complete (no writes). Re-run with --apply to commit. ──')
  process.exit(0)
}

// ── 3. APPLY each island: upsert row → write polygon → backfill → recount ─────
async function recount(regionId) {
  const { count } = await sb.from('listings_with_region')
    .select('id', { count: 'exact', head: true }).eq('status', 'active').eq('region_id', regionId)
  return count || 0
}

for (const isl of ISLANDS) {
  console.log(`\n════ APPLY ${isl.name} (${isl.slug}) ════`)

  // 3a. Upsert the region row (draft for now)
  const row = {
    name: isl.name, slug: isl.slug, state: isl.state, description: isl.description,
    center_lat: isl.lat, center_lng: isl.lng, map_zoom: isl.zoom,
    hero_image_url: staticUrl(isl.lng, isl.lat, Math.max(isl.zoom - 1, 4), 1280, 500),
    hero_image_card_url: staticUrl(isl.lng, isl.lat, isl.zoom, 600, 400),
    hero_image_source: 'mapbox_static',
    status: 'draft',
  }
  {
    const { data, error } = await sb.from('regions').upsert(row, { onConflict: 'slug' })
      .select('id, name, slug, state, status').single()
    if (error) { console.error('  upsert failed:', error.message); process.exit(1) }
    isl.id = data.id
    console.log(`  ✓ row ${data.slug} id=${data.id} status=${data.status}`)
  }

  // 3b. Write the polygon (GeoJSON → PostGIS geometry via PostgREST)
  {
    const { error } = await sb.from('regions').update({ polygon: isl.mp, updated_at: new Date().toISOString() }).eq('slug', isl.slug)
    if (error) { console.error('  polygon write failed:', error.message); process.exit(1) }
    const { data: after } = await sb.from('regions').select('polygon').eq('slug', isl.slug).single()
    const ok = after?.polygon?.type === 'MultiPolygon'
    console.log(`  ${ok ? '✓' : '✗'} polygon stored (${after?.polygon?.coordinates?.length ?? '?'} polygon(s))`)
    if (!ok) { console.error('  polygon round-trip not MultiPolygon — STOPPING'); process.exit(1) }
  }

  // 3c. NULL-only re-backfill — re-fire the spatial trigger on exactly the NULL
  //     listings inside the new polygon (smallest-wins lands each correctly).
  console.log(`  re-backfill: firing spatial trigger on ${isl.captured.length} NULL listing(s)`)
  const CONCURRENCY = 8
  for (let i = 0; i < isl.captured.length; i += CONCURRENCY) {
    const chunk = isl.captured.slice(i, i + CONCURRENCY)
    const errs = await Promise.all(chunk.map(t => sb.from('listings').update({ lat: t.lat }).eq('id', t.id).then(r => r.error)))
    errs.forEach((e, j) => { if (e) console.log(`    WARN ${chunk[j]?.id}: ${e.message}`) })
  }

  // 3d. Recount by region_id (mirrors lib/sync/updateRegionCounts.js) + status flip
  const total = await recount(isl.id)
  const goLive = total >= LIVE_FLOOR
  const { error: stErr } = await sb.from('regions')
    .update({ listing_count: total, status: goLive ? 'live' : 'draft' }).eq('id', isl.id)
  if (stErr) { console.error('  status/count update failed:', stErr.message); process.exit(1) }
  console.log(`  ${isl.slug}: listing_count=${total} → status=${goLive ? 'LIVE' : 'draft'}`)
}

// ── 4. Read-back verification ─────────────────────────────────────────────────
console.log('\n── Final region rows ──')
const { data: final } = await sb.from('regions')
  .select('id, name, slug, state, status, listing_count, center_lat, center_lng, map_zoom, polygon')
  .in('slug', ISLANDS.map(i => i.slug)).order('slug')
for (const r of final || []) {
  console.log(`  ${r.slug.padEnd(16)} ${r.name} (${r.state})  status=${r.status}  count=${r.listing_count}  polygon=${r.polygon?.type || 'NULL'}  id=${r.id}`)
}
console.log('\n── APPLY complete. Verify /regions, /regions/flinders-island and /regions/king-island next. ──')
