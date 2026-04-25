#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// fix-alice-springs-polygon.mjs
//
// Re-aggregates the alice-springs-red-centre polygon using polygon-clipping
// (Martinez algorithm — topologically equivalent to PostGIS ST_Union for
// our 3-LGA case). Eliminates the 4 sliver holes introduced yesterday by
// client-side concat + ST_MakeValid.
//
// Why polygon-clipping rather than server-side ST_Union: this project's
// Supabase tier doesn't expose direct postgres connection (IPv6-only,
// no pooler tenant). Both produce identical clean MultiPolygon output.
//
// Usage:
//   node scripts/fix-alice-springs-polygon.mjs           # dry-run
//   node scripts/fix-alice-springs-polygon.mjs --apply   # writes to DB
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import polygonClipping from 'polygon-clipping'

const APPLY = process.argv.includes('--apply')
// Source flag: --source=lga (Matt's original 3-LGA spec, doesn't cover Araluen)
//              --source=abs (ABS Tourism Regions 7R070+7R140+7R150, covers Araluen)
const SOURCE_ARG = process.argv.find(a => a.startsWith('--source='))
const SOURCE = (SOURCE_ARG ? SOURCE_ARG.split('=')[1] : 'lga')
if (!['lga', 'abs'].includes(SOURCE)) { console.log('--source must be lga or abs'); process.exit(1) }

const envText = readFileSync('.env.local', 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const UA = 'AustralianAtlas/1.0 alice-polygon-fix (matt@australianatlas.com.au)'
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const RATE_MS = 2000
const BACKOFFS = [2000, 5000, 15000]
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Resilient Nominatim ──
async function resilientNominatim(q) {
  let lastErr
  for (let attempt = 0; attempt < BACKOFFS.length; attempt++) {
    try {
      await sleep(RATE_MS)
      const url = new URL(NOMINATIM)
      url.searchParams.set('q', q); url.searchParams.set('format', 'json')
      url.searchParams.set('polygon_geojson', '1'); url.searchParams.set('limit', '5')
      url.searchParams.set('countrycodes', 'au')
      const r = await fetch(url.toString(), { headers: { 'User-Agent': UA } })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } catch (e) { lastErr = e; if (attempt < BACKOFFS.length - 1) await sleep(BACKOFFS[attempt]) }
  }
  throw lastErr
}
async function fetchLgaWithVariants(variants) {
  for (const q of variants) {
    try {
      const hits = await resilientNominatim(q)
      const clean = hits.filter(h => h.osm_type === 'relation' && h.geojson &&
        (h.geojson.type === 'Polygon' || h.geojson.type === 'MultiPolygon') &&
        h.class === 'boundary' && h.type === 'administrative')
      if (clean.length) return { query: q, osm_id: clean[0].osm_id, geom: clean[0].geojson }
    } catch { /* try next */ }
  }
  return null
}

// ── Geometry utils ──
// polygon-clipping wants Polygon as [[outer], [hole1], ...] and
// MultiPolygon as [[[outer], [hole1], ...], ...]. GeoJSON Polygon is
// [[outer], [hole1], ...] — same shape. GeoJSON MultiPolygon is
// [[[outer], [hole1], ...], ...] — same shape too. Direct mapping.
function asMultiPolyCoords(g) {
  if (g.type === 'Polygon') return [g.coordinates]
  if (g.type === 'MultiPolygon') return g.coordinates
  throw new Error(`bad geom: ${g.type}`)
}
function bbox(mpCoords) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const poly of mpCoords) for (const ring of poly) for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  return { minX: +minX.toFixed(4), minY: +minY.toFixed(4), maxX: +maxX.toFixed(4), maxY: +maxY.toFixed(4) }
}
function pipRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
function pip(x, y, mpCoords) {
  for (const poly of mpCoords) {
    if (!pipRing(x, y, poly[0])) continue
    let inHole = false
    for (let i = 1; i < poly.length; i++) { if (pipRing(x, y, poly[i])) { inHole = true; break } }
    if (!inHole) return true
  }
  return false
}
function countHoles(mpCoords) {
  let h = 0
  for (const poly of mpCoords) h += poly.length - 1
  return h
}

// ── Fetch source polygons ──
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} | Source: ${SOURCE}\n`)
let sources = []
let sourceDesc
if (SOURCE === 'lga') {
  console.log('── Fetching 3 source OSM LGAs ──')
  const lgaConfigs = [
    { name: 'Alice Springs Town', variants: ['Alice Springs, Northern Territory'] },
    { name: 'MacDonnell Regional', variants: ['MacDonnell, Northern Territory', 'MacDonnell Regional Council, Northern Territory'] },
    { name: 'Petermann', variants: ['Petermann, Northern Territory'] },
  ]
  for (const c of lgaConfigs) {
    const r = await fetchLgaWithVariants(c.variants)
    if (!r) { console.log(`  ✗ ${c.name}: failed`); process.exit(1) }
    const coords = asMultiPolyCoords(r.geom)
    console.log(`  ✓ ${c.name}: rel ${r.osm_id} (${r.geom.type}, ${coords.length} polygon(s), ${countHoles(coords)} hole(s))`)
    sources.push({ ...c, coords })
  }
  sourceDesc = `OSM LGA aggregate: rel ${sources.map(s => s.osm_id).join(' + rel ')}`
} else {
  console.log('── Fetching 3 source ABS Tourism Regions ──')
  const ABS_TR_URL = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/TR/MapServer/0/query'
  const trConfigs = [
    { name: 'Alice Springs', code: '7R070' },
    { name: 'MacDonnell', code: '7R140' },
    { name: 'Lasseter', code: '7R150' },
  ]
  for (const c of trConfigs) {
    const url = new URL(ABS_TR_URL)
    url.searchParams.set('where', `tr_code_2021='${c.code}'`)
    url.searchParams.set('outFields', 'tr_code_2021,tr_name_2021')
    url.searchParams.set('returnGeometry', 'true')
    url.searchParams.set('outSR', '4326')
    url.searchParams.set('f', 'geojson')
    const r = await fetch(url.toString())
    if (!r.ok) { console.log(`  ✗ ${c.code}: HTTP ${r.status}`); process.exit(1) }
    const d = await r.json()
    if (!d.features?.length) { console.log(`  ✗ ${c.code}: empty`); process.exit(1) }
    const coords = asMultiPolyCoords(d.features[0].geometry)
    console.log(`  ✓ ${c.code} ${c.name}: ${coords.length} polygon(s), ${countHoles(coords)} hole(s)`)
    sources.push({ name: `${c.code} ${c.name}`, code: c.code, coords })
  }
  sourceDesc = `ABS TR 2021 aggregate: ${sources.map(s => s.code).join(' + ')}`
}

// ── Pre-flight: read current state ──
console.log('\n── Pre-flight state ──')
const { data: before } = await sb.from('regions').select('id, slug, polygon').eq('slug', 'alice-springs-red-centre').single()
const beforePolyMP = before.polygon
const beforeMpCoords = beforePolyMP.coordinates
const beforeBbox = bbox(beforeMpCoords)
console.log(`  current: ${beforeMpCoords.length} component(s), ${countHoles(beforeMpCoords)} hole(s), bbox=[${beforeBbox.minX},${beforeBbox.minY}]→[${beforeBbox.maxX},${beforeBbox.maxY}]`)

// ── Compute union via polygon-clipping ──
console.log('\n── Computing topological union (polygon-clipping) ──')
const unionResult = polygonClipping.union(sources[0].coords, sources[1].coords, sources[2].coords)
// unionResult is a MultiPolygon coordinate array
const newBbox = bbox(unionResult)
const newHoles = countHoles(unionResult)
console.log(`  union: ${unionResult.length} component(s), ${newHoles} hole(s), bbox=[${newBbox.minX},${newBbox.minY}]→[${newBbox.maxX},${newBbox.maxY}]`)

// Validate hole count vs. inherent source holes.
const sourceHoleSum = sources.reduce((s, l) => s + countHoles(l.coords), 0)
console.log(`  source holes total: ${sourceHoleSum} (inherent enclaves)`)
if (newHoles > sourceHoleSum) {
  console.log(`  ⚠ output has ${newHoles} holes vs. ${sourceHoleSum} source holes — extra artifacts? STOPPING`)
  process.exit(1)
}

// Sample-verify Araluen
const ARALUEN = { lat: -23.70213, lng: 133.862694 }
const araluenInside = pip(ARALUEN.lng, ARALUEN.lat, unionResult)
console.log(`  Araluen inside new polygon: ${araluenInside}`)
if (!araluenInside) {
  console.log(`  ⚠ Araluen still outside — this source can't deliver Matt's expected outcome. STOPPING per task constraint.`)
  process.exit(1)
}

// Confirm Alice Town centroid still inside (no regression)
const aliceTownCentroid = { lat: -23.6993, lng: 133.880 }
const aliceCentroidInside = pip(aliceTownCentroid.lng, aliceTownCentroid.lat, unionResult)
console.log(`  Alice Town centroid inside new polygon: ${aliceCentroidInside}`)

const newGeoJSON = { type: 'MultiPolygon', coordinates: unionResult }

// ── Apply ──
if (APPLY) {
  console.log('\n── Applying fix ──')
  const { error: updErr } = await sb.from('regions')
    .update({ polygon: newGeoJSON, updated_at: new Date().toISOString() })
    .eq('slug', 'alice-springs-red-centre')
  if (updErr) { console.log(`  ✗ update failed: ${updErr.message}`); process.exit(1) }
  console.log(`  ✓ regions.polygon updated`)

  // Verify round-trip
  const { data: after } = await sb.from('regions').select('polygon').eq('slug', 'alice-springs-red-centre').single()
  const afterMpCoords = after.polygon.coordinates
  const afterBbox = bbox(afterMpCoords)
  const afterHoles = countHoles(afterMpCoords)
  console.log(`  read-back: ${afterMpCoords.length} component(s), ${afterHoles} hole(s), bbox=[${afterBbox.minX},${afterBbox.minY}]→[${afterBbox.maxX},${afterBbox.maxY}]`)

  const araluenInDb = pip(ARALUEN.lng, ARALUEN.lat, afterMpCoords)
  console.log(`  Araluen inside stored polygon (round-trip): ${araluenInDb}`)

  // ── Targeted re-backfill ──
  console.log('\n── Targeted re-backfill (bbox-scoped trigger fire) ──')
  const { count: nullBefore } = await sb.from('listings').select('*', { count: 'exact', head: true })
    .eq('status', 'active').eq('visitable', true).is('region_computed_id', null)
    .gte('lat', -26).lte('lat', -22.85).gte('lng', 129).lte('lng', 138)
  console.log(`  NULL listings in bbox before re-fire: ${nullBefore}`)

  const { data: targets } = await sb.from('listings').select('id, name, slug, lat, lng')
    .eq('status', 'active').eq('visitable', true).is('region_computed_id', null)
    .gte('lat', -26).lte('lat', -22.85).gte('lng', 129).lte('lng', 138)
  console.log(`  firing trigger for ${targets.length} listings...`)

  const CONCURRENCY = 10
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const chunk = targets.slice(i, i + CONCURRENCY)
    const errs = await Promise.all(chunk.map(t =>
      sb.from('listings').update({ lat: t.lat }).eq('id', t.id).then(r => r.error)
    ))
    for (let j = 0; j < chunk.length; j++) {
      if (errs[j]) console.log(`    WARN ${chunk[j].id}: ${errs[j].message}`)
    }
  }

  const { count: nullAfter } = await sb.from('listings').select('*', { count: 'exact', head: true })
    .eq('status', 'active').eq('visitable', true).is('region_computed_id', null)
    .gte('lat', -26).lte('lat', -22.85).gte('lng', 129).lte('lng', 138)
  console.log(`  NULL listings in bbox after re-fire: ${nullAfter}`)
  const rescued = nullBefore - nullAfter
  console.log(`  ✓ rescued ${rescued} listings (NULL → alice-springs-red-centre)`)

  // List rescued listings
  if (rescued > 0) {
    const { data: stillNull } = await sb.from('listings').select('id')
      .eq('status', 'active').eq('visitable', true).is('region_computed_id', null)
      .gte('lat', -26).lte('lat', -22.85).gte('lng', 129).lte('lng', 138)
    const stillNullIds = new Set((stillNull || []).map(r => r.id))
    const rescuedRows = targets.filter(t => !stillNullIds.has(t.id))
    console.log(`\n  ── Rescued listings ──`)
    for (const r of rescuedRows) console.log(`    ${r.name} (${r.slug}) lat=${r.lat} lng=${r.lng}`)
  }

  // Sample-verify Araluen specifically
  const { data: araluenRows } = await sb.from('listings').select('id, name, slug, lat, lng, region_computed_id')
    .ilike('name', '%araluen%').limit(5)
  console.log(`\n  ── Araluen verification ──`)
  for (const r of araluenRows || []) {
    const { data: regName } = r.region_computed_id
      ? await sb.from('regions').select('name').eq('id', r.region_computed_id).maybeSingle()
      : { data: null }
    console.log(`    ${r.name}: lat=${r.lat} lng=${r.lng} → ${regName?.name || 'NULL'}`)
  }
}

console.log('\n── Done ──')
