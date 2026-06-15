#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// add-eurobodalla-region-2026-06-15.mjs
//
// Create the EUROBODALLA region — the "Nature Coast" of NSW (Eurobodalla Shire:
// Batemans Bay, Mogo, Moruya, Tuross Head, Narooma, Central Tilba and the coast
// from Durras south to the Bega Valley boundary near Tilba).
//
// WHY THIS EXISTS — confirmed gap (2026-06-15):
//   With Sapphire Coast (Bega Valley) just shipped, the Eurobodalla coast — the
//   stretch BETWEEN south-coast-nsw and sapphire-coast — was still orphaned.
//   Despite its name, `south-coast-nsw` is sourced only from the Kiama +
//   Shoalhaven LGAs (see activate-regions-batch-2026-04-25.mjs) and its polygon
//   stops at latitude ≈ -35.65, just north of Batemans Bay; `sapphire-coast`
//   (Bega Valley) starts at ≈ -36.13. Point-in-region tests put Batemans Bay
//   (-35.708,150.179), Narooma (-36.218,150.131), Moruya (-35.913,150.084) and
//   Central Tilba (-36.311,150.075) in NO region — they fall in the gap between
//   the two. This region gives those towns and the active venues there a home.
//
// PROVENANCE (never hand-drawn): the polygon is the official Eurobodalla LGA
// boundary from the ABS ASGS2021 LGA geography (lga_code_2021 = 12750), fetched
// at ~10 m generalisation so coastal town points land inside it. The Eurobodalla
// Shire — branded the "Nature Coast" by Destination NSW — sits between Shoalhaven
// (Jervis Bay / Nowra) to the north and Bega Valley (the Sapphire Coast) to the
// south; both neighbours test outside, as they should (Nowra north; Bega and
// Bermagui south).
//
// SAFETY (smallest-polygon-wins, per 097_spatial_containment_trigger.sql):
//   The trigger recomputes region_computed_id on UPDATE OF lat,lng and picks the
//   SMALLEST-area region whose polygon contains the point. We re-fire it ONLY on
//   listings whose region_computed_id is currently NULL (they sit in no existing
//   polygon), so nothing is stolen from another region. Writing the polygon does
//   not retroactively reassign anything by itself. Eurobodalla and its two
//   coastal neighbours are adjacent LGAs (boundaries tile, they do not nest), so
//   there is no overlap to contest.
//
// DATA INTEGRITY (cross-state guard, no-hallucination rule): the NULL-only
//   backfill adopts an orphan only if its own `state` column is NSW or unset. Two
//   captured orphans are interstate venues carrying a wrong NSW pin — Paynesville
//   Maritime Museum (state VIC; the real museum is on the Gippsland Lakes) and
//   Noosa National Park Coastal Track (state QLD; the real walk is in Queensland).
//   Their lat/lng land inside this polygon but the venues are NOT in Eurobodalla,
//   so they are SKIPPED (left NULL, exactly as now, and flagged for proper
//   geocode repair), never bound here — grounding over coverage.
//
// STATUS: created 'draft', then flipped to 'live' if it adopts a meaningful
//   number of real venues (LIVE_FLOOR). Draft regions render on /regions but are
//   excluded from search region-binding, resolveRegionParam, and the public API
//   (they require status='live'), so a populated, well-known region should be
//   live to be first-class. Editorial (generated_intro/long_description) is left
//   NULL — no fabricated copy (no-hallucination rule); the detail page falls back
//   to the grounded `description` below (verifiable geography only).
//
// Reversibility:
//   UPDATE regions SET polygon = NULL, status='draft' WHERE slug='eurobodalla';
//   UPDATE listings SET region_computed_id = NULL
//     WHERE region_computed_id = (SELECT id FROM regions WHERE slug='eurobodalla');
//   DELETE FROM regions WHERE slug='eurobodalla';   -- if removing entirely
//
// Usage:
//   node scripts/add-eurobodalla-region-2026-06-15.mjs            # dry-run
//   node scripts/add-eurobodalla-region-2026-06-15.mjs --apply    # write
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

// A region with at least this many real, grounded venues is created live (the
// network's smallest live regions sit at ~11, but those were bulk-promoted; a
// deliberately-created, well-known shire-sized region with ≥ this many venues
// across multiple verticals is legitimately live — cf. activate-regions-osm-lga
// inserting NSW LGA regions directly as live). Below it, stay draft. Matches the
// just-shipped sibling sapphire-coast.
const LIVE_FLOOR = 6

const REGION = {
  name: 'Eurobodalla',
  slug: 'eurobodalla',
  state: 'NSW',
  // Center on the populated coastal strip (Moruya/Tuross), zoom 9 — matches the
  // neighbouring south-coast-nsw / shoalhaven / sapphire-coast cards.
  lat: -36.00, lng: 150.13, zoom: 9,
  // Grounded geography only — no venue claims (no-hallucination rule).
  description:
    "The Nature Coast of New South Wales — the Eurobodalla shire on the south " +
    "coast, between the Shoalhaven to the north and the Bega Valley (Sapphire " +
    "Coast) to the south. Batemans Bay at the mouth of the Clyde River, the " +
    "oyster estuaries and river flats of Moruya, the lakes and headland of " +
    "Tuross Head, Wagonga Inlet at Narooma with Montague Island lying offshore, " +
    "and the historic dairy village of Central Tilba below Gulaga. A near-" +
    "continuous run of surf beaches, lake inlets and spotted-gum forest threads " +
    "the coast through Eurobodalla National Park.",
}

// ABS ASGS2021 LGA — Eurobodalla (12750)
const ABS_LGA_URL = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/LGA/MapServer/0/query'
const ABS_WHERE = "LGA_NAME_2021='Eurobodalla'"
const OFFSET = '0.0001'   // ~10 m — fine enough for coastal town containment
const PRECISION = '6'

// Anchors that MUST be inside the sourced polygon, and controls that MUST be
// outside (guards against grabbing the wrong LGA or an over-broad polygon).
// Central Tilba was an ANCHOR_OUT for sapphire-coast (Bega Valley) — it is an
// ANCHOR_IN here, the symmetric proof the two shires meet cleanly at Tilba.
const ANCHORS_IN = [
  ['Batemans Bay',  -35.708,    150.179],
  ['Moruya',        -35.913,    150.084],
  ['Narooma',       -36.218,    150.131],
  ['Central Tilba', -36.311085, 150.075049],
]
const ANCHORS_OUT = [
  ['Bega (Bega Valley)',         -36.674, 149.842],
  ['Bermagui (Bega Valley)',     -36.419, 150.073],
  ['Nowra (Shoalhaven)',         -34.881, 150.602],
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
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}
function vertCount(mp) { let v = 0; for (const poly of mp.coordinates) for (const ring of poly) v += ring.length; return v }
const hashGeom = g => createHash('sha256').update(JSON.stringify(g)).digest('hex').slice(0, 12)

async function fetchLga() {
  const url = new URL(ABS_LGA_URL)
  url.searchParams.set('where', ABS_WHERE)
  url.searchParams.set('outFields', 'lga_code_2021,lga_name_2021,state_name_2021')
  url.searchParams.set('returnGeometry', 'true')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('maxAllowableOffset', OFFSET)
  url.searchParams.set('geometryPrecision', PRECISION)
  url.searchParams.set('f', 'geojson')
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`ABS HTTP ${res.status}`)
  const data = await res.json()
  if (!data.features?.length) throw new Error('ABS returned no features for Eurobodalla')
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

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} | source: ABS ASGS2021 LGA "${ABS_WHERE}" | offset=${OFFSET} precision=${PRECISION}\n`)
if (!MAPBOX_TOKEN) { console.error('Missing NEXT_PUBLIC_MAPBOX_TOKEN'); process.exit(1) }

// 1. Fetch + sanity-gate the polygon BEFORE any write
console.log('── Sourcing + sanity-gating Eurobodalla polygon ──')
const { props, geom } = await fetchLga()
const mp = toMultiPolygon(geom)
const bb = bbox(mp)
console.log(`  ABS: "${props.lga_name_2021}" (lga_code ${props.lga_code_2021}, ${props.state_name_2021})`)
console.log(`  geometry: ${mp.coordinates.length} polygon(s), ${vertCount(mp)} verts, hash=${hashGeom(mp)}`)
console.log(`  bbox: lat ${bb.minY.toFixed(3)}→${bb.maxY.toFixed(3)}, lng ${bb.minX.toFixed(3)}→${bb.maxX.toFixed(3)}`)
if (props.state_name_2021 !== 'New South Wales' || props.lga_code_2021 !== '12750') {
  console.error('  ✗ unexpected LGA identity — STOPPING'); process.exit(1)
}
let gateFail = false
for (const [n, lat, lng] of ANCHORS_IN)  { const ok = pip(lng, lat, mp); console.log(`    IN  ${n.padEnd(34)} ${ok ? '✓' : '✗ NOT INSIDE'}`); if (!ok) gateFail = true }
for (const [n, lat, lng] of ANCHORS_OUT) { const ok = !pip(lng, lat, mp); console.log(`    OUT ${n.padEnd(34)} ${ok ? '✓' : '✗ INSIDE (too big)'}`); if (!ok) gateFail = true }
if (gateFail) { console.error('\n✗ Anchor sanity failed — STOPPING (no writes).'); process.exit(1) }
console.log('  ✓ all anchors pass')

// 2. Impact preview: currently-NULL active+visitable listings inside the polygon.
//    A row inside the polygon whose own `state` contradicts REGION.state is a
//    known mis-geocode (interstate venue, wrong pin) — listed and SKIPPED, never
//    backfilled (see DATA INTEGRITY note above).
console.log('\n── Impact preview: NULL-region active+visitable listings inside Eurobodalla ──')
const nullInBbox = await fetchAllPages(() => sb.from('listings')
  .select('id, name, slug, vertical, state, region, lat, lng')
  .eq('status', 'active').eq('visitable', true).is('region_computed_id', null)
  .not('lat', 'is', null)
  .gte('lat', bb.minY - 0.01).lte('lat', bb.maxY + 0.01)
  .gte('lng', bb.minX - 0.01).lte('lng', bb.maxX + 0.01))
const inPolygon = nullInBbox.filter(l => pip(l.lng, l.lat, mp))
const isCrossState = l => l.state && l.state.toUpperCase() !== REGION.state.toUpperCase()
const skipped = inPolygon.filter(isCrossState)
const captured = inPolygon.filter(l => !isCrossState(l))
console.log(`  ${nullInBbox.length} NULL in bbox → ${inPolygon.length} inside polygon → ${captured.length} kept (${REGION.state}), ${skipped.length} skipped (cross-state mis-geocode):`)
for (const l of captured) console.log(`    keep · ${l.name}  (${l.vertical}, state=${l.state || '∅'}, text-region="${l.region || ''}")  [${l.lat},${l.lng}]`)
for (const l of skipped)  console.log(`    SKIP ✗ ${l.name}  (${l.vertical}, state=${l.state}) — interstate mis-geocode, left NULL; repair geocode separately`)
const willGoLive = captured.length >= LIVE_FLOOR
console.log(`\n  Captured ${captured.length} (LIVE_FLOOR ${LIVE_FLOOR}) → region will be ${willGoLive ? 'LIVE' : 'draft'}`)

if (!APPLY) {
  console.log('\n── DRY-RUN complete (no writes). Re-run with --apply to commit. ──')
  process.exit(0)
}

// 3. Upsert the region row (fields), status draft for now
console.log('\n── Upserting region row ──')
const row = {
  name: REGION.name, slug: REGION.slug, state: REGION.state, description: REGION.description,
  center_lat: REGION.lat, center_lng: REGION.lng, map_zoom: REGION.zoom,
  hero_image_url: staticUrl(REGION.lng, REGION.lat, Math.max(REGION.zoom - 1, 4), 1280, 500),
  hero_image_card_url: staticUrl(REGION.lng, REGION.lat, REGION.zoom, 600, 400),
  hero_image_source: 'mapbox_static',
  status: 'draft',
}
{
  const { data, error } = await sb.from('regions').upsert(row, { onConflict: 'slug' })
    .select('id, name, slug, state, status').single()
  if (error) { console.error('  upsert failed:', error.message); process.exit(1) }
  REGION.id = data.id
  console.log(`  ✓ ${data.slug} id=${data.id} status=${data.status}`)
}

// 4. Write the polygon (GeoJSON → PostGIS geometry via PostgREST)
console.log('\n── Writing polygon ──')
{
  const { error } = await sb.from('regions').update({ polygon: mp, updated_at: new Date().toISOString() }).eq('slug', REGION.slug)
  if (error) { console.error('  polygon write failed:', error.message); process.exit(1) }
  const { data: after } = await sb.from('regions').select('polygon').eq('slug', REGION.slug).single()
  const ok = after?.polygon?.type === 'MultiPolygon'
  console.log(`  ${ok ? '✓' : '✗'} stored ${after?.polygon?.coordinates?.length ?? '?'} polygon(s)`)
  if (!ok) { console.error('  polygon round-trip not MultiPolygon — STOPPING'); process.exit(1) }
}

// 5. NULL-only re-backfill — re-fire the spatial trigger on exactly the NULL
//    listings inside the new polygon (smallest-wins lands each correctly).
console.log(`\n── Re-backfill: firing spatial trigger on ${captured.length} NULL listing(s) ──`)
const CONCURRENCY = 8
for (let i = 0; i < captured.length; i += CONCURRENCY) {
  const chunk = captured.slice(i, i + CONCURRENCY)
  const errs = await Promise.all(chunk.map(t => sb.from('listings').update({ lat: t.lat }).eq('id', t.id).then(r => r.error)))
  errs.forEach((e, j) => { if (e) console.log(`    WARN ${chunk[j]?.id}: ${e.message}`) })
}

// 5b. Clear stale "nearest" region overrides now superseded by a TRUE containing
//     match to this region. repair-geocodes.mjs / bulk-regeocode.mjs set
//     region_override_id to the NEAREST region ONLY when no polygon contained the
//     point (source === 'nearest'); the moment a containing region exists, that
//     fallback is obsolete. Before this region existed these Eurobodalla venues
//     fell in no polygon, so they were stamped with the nearest south-coast region
//     (south-coast-nsw — Kiama+Shoalhaven, ~150 km north, which cannot contain
//     them). Scope is deliberately narrow: ONLY listings now computed into THIS
//     region whose override is exactly that stale fallback. Override→NULL lets
//     region_computed_id (this region) win, matching the override-wins model.
const STALE_OVERRIDE_SLUG = 'south-coast-nsw'
console.log(`\n── Clearing stale '${STALE_OVERRIDE_SLUG}' nearest-overrides now contained by ${REGION.slug} ──`)
const { data: staleReg } = await sb.from('regions').select('id').eq('slug', STALE_OVERRIDE_SLUG).single()
if (staleReg) {
  const { data: cleared, error: clrErr } = await sb.from('listings')
    .update({ region_override_id: null })
    .eq('region_computed_id', REGION.id)
    .eq('region_override_id', staleReg.id)
    .select('id, name')
  if (clrErr) { console.error('  override clear failed:', clrErr.message); process.exit(1) }
  console.log(`  cleared ${cleared.length} stale override(s):${cleared.length ? '' : ' (none)'}`)
  for (const c of cleared) console.log(`    · ${c.name}`)
}

// 6. Recount by region_id (mirrors lib/sync/updateRegionCounts.js) + status flip.
//    Also recount the stale-override source region, whose count drops by exactly
//    the listings we just corrected away from it.
async function recount(regionId) {
  const { count } = await sb.from('listings_with_region')
    .select('id', { count: 'exact', head: true }).eq('status', 'active').eq('region_id', regionId)
  return count || 0
}
console.log('\n── Recount + status ──')
const total = await recount(REGION.id)
const goLive = total >= LIVE_FLOOR
const { error: stErr } = await sb.from('regions')
  .update({ listing_count: total, status: goLive ? 'live' : 'draft' }).eq('id', REGION.id)
if (stErr) { console.error('  status/count update failed:', stErr.message); process.exit(1) }
console.log(`  ${REGION.slug}: listing_count=${total} → status=${goLive ? 'LIVE' : 'draft'}`)
if (staleReg) {
  const scnTotal = await recount(staleReg.id)
  await sb.from('regions').update({ listing_count: scnTotal }).eq('id', staleReg.id)
  console.log(`  ${STALE_OVERRIDE_SLUG}: listing_count=${scnTotal} (recounted after override correction)`)
}

// 7. Read-back verification
const { data: final } = await sb.from('regions')
  .select('id, name, slug, state, status, listing_count, center_lat, center_lng, map_zoom').eq('slug', REGION.slug).single()
console.log('\n── Final region row ──')
console.log(`  ${final.slug}  ${final.name} (${final.state})  status=${final.status}  listing_count=${final.listing_count}  id=${final.id}`)
console.log('\n── APPLY complete. Verify /regions and /regions/eurobodalla next. ──')
