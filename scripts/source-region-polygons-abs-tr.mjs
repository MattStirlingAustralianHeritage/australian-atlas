#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// source-region-polygons-abs-tr.mjs
//
// Source MultiPolygon boundaries for the two composite tourism regions that
// OSM doesn't model (Hobart & Southern Tasmania, Darwin & Top End) by using
// ABS Tourism Regions (ASGS 2021 TR geography).
//
// Source 1 (primary): ABS Tourism Regions
//   - Hobart & Southern Tasmania → tr_code_2021 = '6R100' (Hobart and the South)
//   - Darwin & Top End           → aggregate of '7R010' (Darwin)
//                                                '7R100' (Litchfield Kakadu Arnhem)
//
// Tourism NT defines "Top End" as covering Darwin, Palmerston, Litchfield,
// Coomalie, Belyuen, Wagait, Tiwi Islands, and Kakadu/West Arnhem. The ABS
// TR pair above covers that same footprint as two adjacent TRs.
//
// Usage:
//   node scripts/source-region-polygons-abs-tr.mjs           # dry-run
//   node scripts/source-region-polygons-abs-tr.mjs --apply   # writes to DB
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'

const APPLY = process.argv.includes('--apply')

const envText = readFileSync('.env.local', 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const ABS_TR_URL = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/TR/MapServer/0/query'

const TARGETS = [
  {
    slug: 'hobart',
    label: 'Hobart & Southern Tasmania',
    tr_codes: ['6R100'], // Hobart and the South
    source_desc: "ABS Tourism Regions 2021, TR '6R100' (Hobart and the South)",
  },
  {
    slug: 'darwin-top-end',
    label: 'Darwin & Top End',
    tr_codes: ['7R010', '7R100'], // Darwin + Litchfield Kakadu Arnhem
    source_desc: "ABS Tourism Regions 2021, aggregate of TRs '7R010' (Darwin) + '7R100' (Litchfield Kakadu Arnhem)",
  },
]

async function fetchTrGeometry(trCode) {
  const url = new URL(ABS_TR_URL)
  url.searchParams.set('where', `tr_code_2021='${trCode}'`)
  url.searchParams.set('outFields', 'tr_code_2021,tr_name_2021,state_name_2021')
  url.searchParams.set('returnGeometry', 'true')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('f', 'geojson')
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`ABS fetch failed for ${trCode}: HTTP ${res.status}`)
  const data = await res.json()
  if (!data.features?.length) throw new Error(`ABS returned no features for ${trCode}`)
  const feat = data.features[0]
  return { props: feat.properties, geom: feat.geometry }
}

function toMultiPolygon(geom) {
  if (geom.type === 'MultiPolygon') return geom
  if (geom.type === 'Polygon') return { type: 'MultiPolygon', coordinates: [geom.coordinates] }
  throw new Error(`unsupported geometry type: ${geom.type}`)
}

function combineMultiPolygons(geoms) {
  // Combine multiple MultiPolygon/Polygon geometries by concatenating their
  // polygon coordinates into a single MultiPolygon. Point-in-polygon matches
  // if the point is in ANY component — exactly the semantics we want for
  // region containment, without requiring server-side ST_Union.
  const out = { type: 'MultiPolygon', coordinates: [] }
  for (const g of geoms) {
    const mp = toMultiPolygon(g)
    out.coordinates.push(...mp.coordinates)
  }
  return out
}

function hashGeometry(geom) {
  return createHash('sha256').update(JSON.stringify(geom)).digest('hex').slice(0, 16)
}

function bbox(mp) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const poly of mp.coordinates) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { minX, minY, maxX, maxY }
}

console.log(`ABS Tourism Regions polygon sourcing. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

const results = []

for (const t of TARGETS) {
  console.log(`── ${t.label} (slug='${t.slug}') ──`)
  console.log(`  TRs: ${t.tr_codes.join(', ')}`)

  const geoms = []
  for (const code of t.tr_codes) {
    const { props, geom } = await fetchTrGeometry(code)
    console.log(`  fetched ${code} (${props.tr_name_2021}, ${props.state_name_2021}): type=${geom.type}, rings=${countRings(geom)}`)
    geoms.push(geom)
  }

  const mp = combineMultiPolygons(geoms)
  const h = hashGeometry(mp)
  const bb = bbox(mp)
  console.log(`  combined: MultiPolygon, ${mp.coordinates.length} polygon(s), bbox [${bb.minX.toFixed(3)}, ${bb.minY.toFixed(3)}] → [${bb.maxX.toFixed(3)}, ${bb.maxY.toFixed(3)}]`)
  console.log(`  hash: ${h}`)
  console.log(`  source: ${t.source_desc}`)

  results.push({ ...t, polygon: mp, hash: h, bbox: bb })
}

if (APPLY) {
  console.log('\n── Writing to DB ──')
  for (const r of results) {
    const { error } = await sb.from('regions').update({ polygon: r.polygon }).eq('slug', r.slug)
    if (error) {
      console.log(`  ERROR writing ${r.slug}: ${error.message}`)
    } else {
      console.log(`  ✓ wrote ${r.slug} (hash=${r.hash})`)
    }
  }

  // Verify reads round-trip as MultiPolygon GeoJSON
  console.log('\n── Verification ──')
  for (const r of results) {
    const { data, error } = await sb.from('regions').select('slug, name, polygon').eq('slug', r.slug).single()
    if (error) {
      console.log(`  ERROR reading ${r.slug}: ${error.message}`)
    } else {
      const p = data.polygon
      const stored = p?.type === 'MultiPolygon' ? `MultiPolygon, ${p.coordinates.length} polygon(s)` : `type=${p?.type}`
      console.log(`  ✓ ${r.slug}: ${stored}`)
    }
  }
}

console.log('\n── SUMMARY ──')
for (const r of results) {
  console.log(`  ${r.slug}: hash=${r.hash}, source="${r.source_desc}"`)
}

function countRings(g) {
  if (g.type === 'Polygon') return g.coordinates.length
  if (g.type === 'MultiPolygon') return g.coordinates.reduce((n, p) => n + p.length, 0)
  return 0
}
