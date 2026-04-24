#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// activate-regions-osm-lga.mjs
//
// Batch-activate wine regions (Hunter Valley, Orange, Mudgee) by:
//   1. INSERTing new rows (or UPDATEing existing drafts) with status='live'
//   2. Sourcing OSM LGA polygons via Nominatim
//   3. Aggregating LGA polygons into MultiPolygon via concatenation
//   4. UPDATEing the regions.polygon column
//   5. Client-side geometry validity check + PIP sanity check vs. sample listings
//   6. Emitting a VERIFY.sql snippet for post-run ST_IsValid confirmation
//
// Usage:
//   node scripts/activate-regions-osm-lga.mjs           # dry-run, fetches polygons only
//   node scripts/activate-regions-osm-lga.mjs --apply   # writes to DB
//
// Per docs/audits/2026-04-25-hunter-orange-polygon-scoping.md and the Mudgee
// extension approved in the 2026-04-25 activation task.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

const APPLY = process.argv.includes('--apply')

const envText = readFileSync('.env.local', 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const UA = 'AustralianAtlas/1.0 region-activation (matt@australianatlas.com.au)'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const SLEEP_MS = 2000
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Config ──────────────────────────────────────────────────────────────────
const REGIONS = [
  {
    slug: 'hunter-valley',
    name: 'Hunter Valley',
    state: 'NSW',
    action: 'update',  // existing draft exists; we flip status to 'live' and set polygon
    lgas: [
      { q: 'Cessnock City Council, New South Wales' },
      { q: 'Singleton Council, New South Wales' },
    ],
    source_desc: 'OSM LGA aggregate: Cessnock City Council + Singleton Council',
  },
  {
    slug: 'orange',
    name: 'Orange',
    state: 'NSW',
    action: 'insert',  // no 'orange' slug exists; 'orange-central-west' draft is a different editorial concept
    lgas: [
      { q: 'Orange City Council, New South Wales' },
      { q: 'Cabonne Council, New South Wales' },
      { q: 'Blayney Shire Council, New South Wales' },
    ],
    source_desc: 'OSM LGA aggregate: Orange City Council + Cabonne Council + Blayney Shire Council',
  },
  {
    slug: 'mudgee',
    name: 'Mudgee',
    state: 'NSW',
    action: 'insert',  // no 'mudgee' slug exists
    lgas: [
      { q: 'Mid-Western Regional Council, New South Wales' },
    ],
    source_desc: 'OSM LGA: Mid-Western Regional Council',
  },
]

// ── Nominatim fetch with strict filter ──────────────────────────────────────
async function fetchLga({ q }) {
  await sleep(SLEEP_MS)
  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'json')
  url.searchParams.set('polygon_geojson', '1')
  url.searchParams.set('limit', '5')
  url.searchParams.set('countrycodes', 'au')
  const r = await fetch(url.toString(), { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`Nominatim HTTP ${r.status} for "${q}"`)
  const hits = await r.json()
  const clean = hits.filter(h =>
    h.osm_type === 'relation' &&
    h.geojson &&
    (h.geojson.type === 'Polygon' || h.geojson.type === 'MultiPolygon') &&
    h.class === 'boundary' && h.type === 'administrative'
  )
  if (!clean.length) throw new Error(`No clean admin-boundary match for "${q}"`)
  return clean[0]
}

// ── Geometry utils ──────────────────────────────────────────────────────────
function toMP(g) {
  if (g.type === 'MultiPolygon') return g
  if (g.type === 'Polygon') return { type: 'MultiPolygon', coordinates: [g.coordinates] }
  throw new Error(`bad geom: ${g.type}`)
}
function combineMP(geoms) {
  const out = { type: 'MultiPolygon', coordinates: [] }
  for (const g of geoms) out.coordinates.push(...toMP(g).coordinates)
  return out
}
function hashGeom(g) { return createHash('sha256').update(JSON.stringify(g)).digest('hex').slice(0, 16) }
function bbox(mp) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const poly of mp.coordinates) for (const ring of poly) for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  return { minX: +minX.toFixed(4), minY: +minY.toFixed(4), maxX: +maxX.toFixed(4), maxY: +maxY.toFixed(4) }
}

// ── Client-side geometry validity ──
// Best-effort checks that typically match ST_IsValid failures for OSM admin
// polygons: ring closure, minimum ring length, non-degenerate segments.
// Not a substitute for ST_IsValid — see VERIFY.sql emitted alongside this run.
function clientValidate(mp) {
  const issues = []
  if (mp.type !== 'MultiPolygon') { issues.push(`top type is ${mp.type}, not MultiPolygon`); return issues }
  mp.coordinates.forEach((poly, pi) => {
    poly.forEach((ring, ri) => {
      if (ring.length < 4) issues.push(`poly[${pi}].ring[${ri}] has ${ring.length} points (<4)`)
      const [x0, y0] = ring[0]
      const [xL, yL] = ring[ring.length - 1]
      if (x0 !== xL || y0 !== yL) issues.push(`poly[${pi}].ring[${ri}] not closed (${x0},${y0}) vs (${xL},${yL})`)
      for (let i = 0; i < ring.length - 1; i++) {
        if (ring[i][0] === ring[i + 1][0] && ring[i][1] === ring[i + 1][1]) {
          issues.push(`poly[${pi}].ring[${ri}] duplicate point at index ${i}`)
          break
        }
      }
    })
  })
  return issues
}

// PIP
function pipRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
function pip(x, y, mp) {
  for (const poly of mp.coordinates) {
    if (!pipRing(x, y, poly[0])) continue
    let inHole = false
    for (let i = 1; i < poly.length; i++) { if (pipRing(x, y, poly[i])) { inHole = true; break } }
    if (!inHole) return true
  }
  return false
}

// ── Build candidates ────────────────────────────────────────────────────────
console.log(`Region activation batch. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

const built = []
for (const r of REGIONS) {
  console.log(`── ${r.name} (slug='${r.slug}', state='${r.state}', action='${r.action}') ──`)
  const hits = []
  for (const lga of r.lgas) {
    console.log(`  fetching "${lga.q}"`)
    const h = await fetchLga(lga)
    console.log(`    → rel ${h.osm_id} ${h.class}=${h.type} ${h.geojson.type}`)
    hits.push(h)
  }
  const mp = combineMP(hits.map(h => h.geojson))
  const h = hashGeom(mp)
  const b = bbox(mp)
  const issues = clientValidate(mp)
  console.log(`  combined: ${mp.coordinates.length} polygon(s), bbox=[${b.minX},${b.minY}]→[${b.maxX},${b.maxY}]`)
  console.log(`  hash=${h}`)
  console.log(`  client-validity: ${issues.length === 0 ? 'OK' : 'ISSUES — ' + issues.join('; ')}`)
  if (issues.length > 0) throw new Error(`Geometry validity failure for ${r.slug}`)
  built.push({ ...r, mp, hash: h, bbox: b, osm_ids: hits.map(h => h.osm_id) })
}

// ── Apply (or dry-run exit) ─────────────────────────────────────────────────
if (!APPLY) {
  console.log('\nDry-run complete. Re-run with --apply to write.')
  process.exit(0)
}

console.log('\n── Writing to DB ──')
for (const r of built) {
  if (r.action === 'update') {
    const { error } = await sb.from('regions')
      .update({ status: 'live', polygon: r.mp, updated_at: new Date().toISOString() })
      .eq('slug', r.slug)
    if (error) { console.log(`  ERROR updating ${r.slug}: ${error.message}`); process.exit(1) }
    console.log(`  ✓ UPDATED ${r.slug} → status=live, polygon set (hash=${r.hash})`)
  } else {
    const { error } = await sb.from('regions')
      .insert({
        name: r.name,
        slug: r.slug,
        state: r.state,
        status: 'live',
        polygon: r.mp,
        min_listing_threshold: 15,
      })
    if (error) { console.log(`  ERROR inserting ${r.slug}: ${error.message}`); process.exit(1) }
    console.log(`  ✓ INSERTED ${r.slug} (hash=${r.hash})`)
  }
}

// ── Read back for verification ──────────────────────────────────────────────
console.log('\n── Read-back verification ──')
for (const r of built) {
  const { data, error } = await sb.from('regions').select('id, slug, name, status, polygon').eq('slug', r.slug).single()
  if (error) { console.log(`  ERROR reading ${r.slug}: ${error.message}`); continue }
  const stored = data.polygon
  const storedHash = hashGeom(stored)
  const polyMatch = storedHash === r.hash
  console.log(`  ${r.slug}: id=${data.id.slice(0, 8)}… status=${data.status} polygons=${stored.coordinates.length} round-trip=${polyMatch ? 'OK' : 'MISMATCH'}`)
  r.region_id = data.id
}

// ── PIP sanity vs. sample listings ──────────────────────────────────────────
console.log('\n── PIP sanity vs. 10 sample listings per region ──')
const PIP_TARGETS = {
  'hunter-valley': { region_text: 'Pokolbin' },
  'orange':        { region_text: 'Orange' },
  'mudgee':        { region_text: 'Mudgee' },
}
for (const r of built) {
  const { region_text } = PIP_TARGETS[r.slug]
  const { data: rows } = await sb.from('listings')
    .select('slug, name, lat, lng')
    .eq('status', 'active').eq('vertical', 'sba').eq('region', region_text)
    .not('lat', 'is', null).not('lng', 'is', null)
    .order('slug').limit(10)
  let hits = 0
  for (const row of rows || []) if (pip(row.lng, row.lat, r.mp)) hits++
  console.log(`  ${r.slug}: ${hits}/${rows?.length || 0} sample listings inside polygon`)
}

// ── Emit VERIFY.sql ─────────────────────────────────────────────────────────
const verifySql = [
  '-- Run in Supabase SQL editor to confirm ST_IsValid on the three new polygons.',
  '-- Expected: all three rows return is_valid=true and polygon_type=ST_MultiPolygon.',
  '',
  "SELECT slug, status, ST_IsValid(polygon) AS is_valid,",
  "       ST_IsValidReason(polygon) AS invalidity_reason,",
  "       GeometryType(polygon) AS polygon_type,",
  "       ST_NumGeometries(polygon) AS component_polygons,",
  "       ST_Area(polygon::geography) / 1e6 AS area_km2",
  "FROM regions",
  "WHERE slug IN ('hunter-valley', 'orange', 'mudgee')",
  "ORDER BY slug;",
].join('\n') + '\n'
writeFileSync('tmp-verify-region-activation.sql', verifySql)
console.log('\nVERIFY.sql written to tmp-verify-region-activation.sql — paste into Supabase SQL editor to confirm ST_IsValid.')

console.log('\n── SUMMARY ──')
for (const r of built) {
  console.log(`  ${r.slug}: hash=${r.hash} bbox=[${r.bbox.minX},${r.bbox.minY}]→[${r.bbox.maxX},${r.bbox.maxY}] osm_ids=${r.osm_ids.join(',')}`)
}
