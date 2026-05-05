#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// source-tarkine-west-coast-polygon.mjs
//
// Sources the Tarkine & West Coast (TAS) polygon by aggregating three
// OSM relations:
//   1. West Coast Council (LGA) — covers Strahan, Queenstown, Zeehan,
//      Rosebery, Tullah, Waratah, the central Tarkine
//   2. Circular Head Council (LGA) — covers Stanley, Smithton, Marrawah,
//      Arthur River, the NW coast and Tarkine north
//   3. Southwest National Park / TWWHA — covers Port Davey, Bathurst
//      Harbour, Melaleuca, Western Arthurs, South Coast Track corridor
//
// Aggregation approach: concatenate the polygon arrays into a single
// MultiPolygon. Point-in-any-component equals point-in-region, matching
// the existing pattern from source-region-polygons.mjs for aggregate
// regions like "Newcastle" and "Northern Rivers".
//
// Usage:
//   node scripts/source-tarkine-west-coast-polygon.mjs           # dry-run
//   node scripts/source-tarkine-west-coast-polygon.mjs --apply   # writes
//
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// Rate limits Nominatim to 1 request per 2 seconds.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const APPLY = process.argv.includes('--apply')

const envText = readFileSync('.env.local', 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const UA = 'AustralianAtlas/1.0 polygon-sourcing (matt@australianatlas.com.au)'
const SLEEP_MS = 2000
const sleep = ms => new Promise(r => setTimeout(r, ms))

const REGION_SLUG = 'tarkine-west-coast'

const COMPONENT_QUERIES = [
  { label: 'West Coast Council', q: 'West Coast Council, Tasmania, Australia' },
  { label: 'Circular Head Council', q: 'Circular Head Council, Tasmania, Australia' },
  { label: 'Southwest National Park', q: 'Southwest National Park, Tasmania, Australia' },
]

async function nominatim(q) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'json')
  url.searchParams.set('polygon_geojson', '1')
  url.searchParams.set('limit', '5')
  url.searchParams.set('countrycodes', 'au')
  const res = await fetch(url.toString(), { headers: { 'User-Agent': UA } })
  return res.ok ? await res.json() : []
}

function isUsable(hit) {
  if (!hit.geojson) return false
  if (hit.geojson.type !== 'Polygon' && hit.geojson.type !== 'MultiPolygon') return false
  if (hit.osm_type !== 'relation') return false
  return true
}

function toMultiPolygonCoords(g) {
  if (g.type === 'MultiPolygon') return g.coordinates
  if (g.type === 'Polygon') return [g.coordinates]
  throw new Error(`unsupported geometry type: ${g.type}`)
}

const components = []

for (const c of COMPONENT_QUERIES) {
  await sleep(SLEEP_MS)
  console.log(`Fetching: ${c.label}…`)
  const hits = await nominatim(c.q)
  const usable = hits.filter(isUsable)
  if (!usable.length) {
    console.error(`  ✗ NO MATCH for "${c.q}". Hits: ${hits.length}, usable: 0`)
    if (hits.length > 0) {
      console.error(`    First hit: ${hits[0].display_name} (osm_type=${hits[0].osm_type}, type=${hits[0].type})`)
    }
    process.exit(1)
  }
  const hit = usable[0]
  const coords = toMultiPolygonCoords(hit.geojson)
  console.log(`  ✓ Matched "${hit.display_name}"`)
  console.log(`    osm_type=${hit.osm_type} osm_id=${hit.osm_id} class=${hit.class} type=${hit.type}`)
  console.log(`    polygons=${coords.length}, total vertices=${coords.flat(2).length}`)
  components.push({ label: c.label, hit, coords })
}

const aggregated = {
  type: 'MultiPolygon',
  coordinates: components.flatMap(c => c.coords),
}

// Compute bbox iteratively to avoid call-stack overflow on hundreds of
// thousands of vertices (Math.min(...arr) blows up past ~100k args).
let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
let vertexCount = 0
for (const polygon of aggregated.coordinates) {
  for (const ring of polygon) {
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      vertexCount++
    }
  }
}
console.log(`\nAggregated polygon:`)
console.log(`  total polygons: ${aggregated.coordinates.length}`)
console.log(`  total vertices: ${vertexCount}`)
console.log(`  bbox: lat [${minLat.toFixed(3)}, ${maxLat.toFixed(3)}], lng [${minLng.toFixed(3)}, ${maxLng.toFixed(3)}]`)

if (!APPLY) {
  console.log('\nDry-run only. Pass --apply to write to DB.')
  process.exit(0)
}

// Update via Supabase JS — the polygon column is GEOMETRY, but PostgREST
// accepts GeoJSON when the column has a SRID. The PostGIS hook converts
// it on insert.
const { data: regionRow, error: fetchErr } = await sb
  .from('regions')
  .select('id, name, slug, polygon')
  .eq('slug', REGION_SLUG)
  .single()

if (fetchErr || !regionRow) {
  console.error(`ERR fetching region "${REGION_SLUG}":`, fetchErr?.message ?? 'not found')
  process.exit(1)
}

if (regionRow.polygon !== null) {
  console.error(`Region "${REGION_SLUG}" already has a polygon. Refusing to overwrite without explicit --force.`)
  if (!process.argv.includes('--force')) process.exit(1)
}

console.log(`\nWriting polygon to region ${regionRow.id} (${regionRow.name})…`)

const { error: updErr } = await sb
  .from('regions')
  .update({ polygon: aggregated })
  .eq('id', regionRow.id)

if (updErr) {
  console.error('ERR updating polygon:', updErr.message)
  process.exit(1)
}

console.log('✓ Polygon written.')
