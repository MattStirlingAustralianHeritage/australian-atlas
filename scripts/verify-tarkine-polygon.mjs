#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// verify-tarkine-polygon.mjs
//
// Runs Part 3.6 verification queries on the Tarkine & West Coast polygon:
//   - ST_IsValid
//   - ST_Area in km² (sanity check: ~22,000–28,000 km²)
//   - Overlap test against Cradle Country and Hobart & Southern Tasmania
//   - Test points (Strahan, Cradle Mtn, Port Davey, Hobart CBD)
//
// Connects directly to Postgres via pg using SUPABASE_DB_PASSWORD because
// the verification queries (ST_IsValid, ST_Area, ST_Intersection) aren't
// exposed via PostgREST.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'fs'
import pg from 'pg'

const envText = readFileSync('.env.local', 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)

const PROJECT_REF = 'nyhkcmvhwbydsqsyvizs'
const password = env.SUPABASE_DB_PASSWORD
if (!password) { console.error('SUPABASE_DB_PASSWORD missing'); process.exit(1) }

// Try direct DB connection first; fall back to other pooler regions.
const tryConfigs = [
  { host: `db.${PROJECT_REF}.supabase.co`, port: 5432, user: 'postgres', database: 'postgres' },
  { host: `aws-0-us-west-1.pooler.supabase.com`, port: 6543, user: `postgres.${PROJECT_REF}`, database: 'postgres' },
  { host: `aws-0-us-east-1.pooler.supabase.com`, port: 6543, user: `postgres.${PROJECT_REF}`, database: 'postgres' },
  { host: `aws-0-ap-southeast-1.pooler.supabase.com`, port: 6543, user: `postgres.${PROJECT_REF}`, database: 'postgres' },
  { host: `aws-0-eu-central-1.pooler.supabase.com`, port: 6543, user: `postgres.${PROJECT_REF}`, database: 'postgres' },
]

let client = null
for (const cfg of tryConfigs) {
  try {
    const c = new pg.Client({ ...cfg, password, ssl: { rejectUnauthorized: false } })
    await c.connect()
    client = c
    console.log(`Connected via ${cfg.host}:${cfg.port}`)
    break
  } catch (e) {
    console.log(`  ✗ ${cfg.host}:${cfg.port} — ${e.message.split('\n')[0]}`)
  }
}
if (!client) { console.error('All connection attempts failed'); process.exit(1) }

await client.connect()

const SLUG = 'tarkine-west-coast'

async function q(sql, params = []) {
  const r = await client.query(sql, params)
  return r.rows
}

console.log('\n=== Part 3.6 Verification ===\n')

// 1. ST_IsValid
const validRow = await q(
  `select st_isvalid(polygon) as is_valid, st_isvalidreason(polygon) as reason
   from regions where slug = $1`,
  [SLUG]
)
console.log('1. ST_IsValid:', validRow[0].is_valid)
if (!validRow[0].is_valid) console.log('   Reason:', validRow[0].reason)

// 2. ST_Area in km²
const areaRow = await q(
  `select round((st_area(polygon::geography) / 1e6)::numeric, 1) as area_km2,
          st_npoints(polygon) as npoints,
          st_numgeometries(polygon) as nrings
   from regions where slug = $1`,
  [SLUG]
)
console.log(`2. ST_Area: ${areaRow[0].area_km2} km²  (expect 22,000–28,000)`)
console.log(`   Geometry: ${areaRow[0].nrings} polygons, ${areaRow[0].npoints} vertices`)

// 3. Overlap with Cradle Country and Hobart & Southern Tasmania
const overlapRows = await q(
  `with t as (select polygon as g from regions where slug = $1),
        others as (select name, polygon as g from regions where slug in ('cradle-country', 'hobart'))
   select others.name,
          round((st_area(others.g::geography) / 1e6)::numeric, 1) as other_area_km2,
          round((st_area(st_intersection(t.g, others.g)::geography) / 1e6)::numeric, 1) as overlap_km2,
          round((st_area(st_intersection(t.g, others.g)::geography) / st_area(others.g::geography) * 100)::numeric, 1) as overlap_pct_of_other
   from t, others`,
  [SLUG]
)
console.log('\n3. Overlap with adjacent regions:')
for (const r of overlapRows) {
  console.log(`   ${r.name}: other=${r.other_area_km2} km², overlap=${r.overlap_km2} km² (${r.overlap_pct_of_other}% of other)`)
}

// 4. Test points
const testPoints = [
  { name: 'Strahan',         lat: -42.155, lng: 145.328, expect: 'tarkine-west-coast' },
  { name: 'Cradle Mountain', lat: -41.679, lng: 145.940, expect: '!=tarkine-west-coast' },
  { name: 'Port Davey',      lat: -43.367, lng: 145.913, expect: 'tarkine-west-coast' },
  { name: 'Hobart CBD',      lat: -42.882, lng: 147.328, expect: '!=tarkine-west-coast' },
  { name: 'Stanley',         lat: -40.770, lng: 145.300, expect: 'tarkine-west-coast' },
  { name: 'Smithton',        lat: -40.850, lng: 145.130, expect: 'tarkine-west-coast' },
  { name: 'Queenstown',      lat: -42.079, lng: 145.555, expect: 'tarkine-west-coast' },
  { name: 'Zeehan',          lat: -41.886, lng: 145.338, expect: 'tarkine-west-coast' },
  { name: 'Tullah',          lat: -41.740, lng: 145.620, expect: 'tarkine-west-coast' },
  { name: 'Corinna',         lat: -41.660, lng: 145.100, expect: 'tarkine-west-coast' },
  { name: 'Melaleuca',       lat: -43.420, lng: 146.150, expect: 'tarkine-west-coast' },
  { name: 'Lake St Clair',   lat: -42.110, lng: 146.180, expect: '!=tarkine-west-coast' },
  { name: 'Bruny Is. (S)',   lat: -43.380, lng: 147.330, expect: '!=tarkine-west-coast' },
  { name: 'Sheffield',       lat: -41.378, lng: 146.328, expect: '!=tarkine-west-coast' },
]

console.log('\n4. Test points (smallest containing region):')
let pass = 0, fail = 0
for (const p of testPoints) {
  const rows = await q(
    `select name, slug from find_containing_region($1, $2)`,
    [p.lat, p.lng]
  )
  const result = rows[0]?.slug ?? '(none)'
  const ok = p.expect.startsWith('!=')
    ? result !== p.expect.slice(2)
    : result === p.expect
  console.log(`   ${ok ? '✓' : '✗'} ${p.name.padEnd(16)} (${p.lat}, ${p.lng})  →  ${result}  [expect: ${p.expect}]`)
  if (ok) pass++; else fail++
}
console.log(`\n  ${pass} pass, ${fail} fail`)

await client.end()
process.exit(fail === 0 ? 0 : 1)
