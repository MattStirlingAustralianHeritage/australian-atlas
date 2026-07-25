#!/usr/bin/env node
/**
 * Metro ring audit — is Atlas coverage really CBD-clustered?
 *
 * Buckets every active listing by great-circle distance from the nearest major
 * city centre, so we can see whether the middle and outer suburbs are genuinely
 * thin or just feel that way. Read-only.
 *
 *   node --env-file=.env.local scripts/audit-metro-ring-density.mjs
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch: (url, o = {}) => fetch(url, { ...o, cache: 'no-store' }) },
})

// Metro centres (GPO / recognised city centre).
const CITIES = [
  { name: 'Sydney',          state: 'NSW', lat: -33.8688, lng: 151.2093, metroRadius: 55 },
  { name: 'Melbourne',       state: 'VIC', lat: -37.8136, lng: 144.9631, metroRadius: 55 },
  { name: 'Brisbane',        state: 'QLD', lat: -27.4698, lng: 153.0251, metroRadius: 45 },
  { name: 'Perth',           state: 'WA',  lat: -31.9523, lng: 115.8613, metroRadius: 45 },
  { name: 'Adelaide',        state: 'SA',  lat: -34.9285, lng: 138.6007, metroRadius: 40 },
  { name: 'Hobart',          state: 'TAS', lat: -42.8821, lng: 147.3272, metroRadius: 25 },
  { name: 'Canberra',        state: 'ACT', lat: -35.2809, lng: 149.1300, metroRadius: 25 },
  { name: 'Darwin',          state: 'NT',  lat: -12.4634, lng: 130.8456, metroRadius: 25 },
  { name: 'Newcastle',       state: 'NSW', lat: -32.9283, lng: 151.7817, metroRadius: 30 },
  { name: 'Wollongong',      state: 'NSW', lat: -34.4278, lng: 150.8931, metroRadius: 25 },
  { name: 'Geelong',         state: 'VIC', lat: -38.1499, lng: 144.3617, metroRadius: 25 },
  { name: 'Gold Coast',      state: 'QLD', lat: -27.9678, lng: 153.4143, metroRadius: 30 },
  { name: 'Sunshine Coast',  state: 'QLD', lat: -26.6580, lng: 153.0920, metroRadius: 30 },
  { name: 'Cairns',          state: 'QLD', lat: -16.9186, lng: 145.7781, metroRadius: 25 },
  { name: 'Townsville',      state: 'QLD', lat: -19.2590, lng: 146.8169, metroRadius: 25 },
]

// Ring bands in km. "inner" is the CBD + inner ring the user says is saturated.
const RINGS = [
  { label: '0–5km (CBD/inner)', min: 0,  max: 5 },
  { label: '5–15km (middle)',   min: 5,  max: 15 },
  { label: '15–30km (outer)',   min: 15, max: 30 },
  { label: '30–55km (fringe)',  min: 30, max: 55 },
]

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// ── Pull every active listing with coords ──────────────────────────
console.log('Fetching active listings with coordinates…')
let all = []
let from = 0
const PAGE = 1000
while (true) {
  const { data, error } = await sb.from('listings')
    .select('id, name, vertical, lat, lng, state, region')
    .eq('status', 'active')
    .not('lat', 'is', null)
    .range(from, from + PAGE - 1)
  if (error) { console.error('Query failed:', error.message); process.exit(1) }
  if (!data?.length) break
  all = all.concat(data)
  if (data.length < PAGE) break
  from += PAGE
}
console.log(`  ${all.length} active listings with coords.\n`)

// ── Assign each listing to nearest city + ring ─────────────────────
const grid = {}   // city → ring label → count
const vertGrid = {} // city → ring → vertical → count
for (const c of CITIES) { grid[c.name] = {}; vertGrid[c.name] = {}; for (const r of RINGS) { grid[c.name][r.label] = 0; vertGrid[c.name][r.label] = {} } }
let nonMetro = 0

for (const l of all) {
  let best = null, bestD = Infinity
  for (const c of CITIES) {
    const d = haversineKm(l.lat, l.lng, c.lat, c.lng)
    if (d < bestD) { bestD = d; best = c }
  }
  if (!best || bestD > best.metroRadius) { nonMetro++; continue }
  const ring = RINGS.find(r => bestD >= r.min && bestD < r.max)
  if (!ring) { nonMetro++; continue }
  grid[best.name][ring.label]++
  vertGrid[best.name][ring.label][l.vertical] = (vertGrid[best.name][ring.label][l.vertical] || 0) + 1
}

// ── Report ─────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n)
const lpad = (s, n) => String(s).padStart(n)

console.log('=== ATLAS LISTINGS BY METRO RING ===\n')
console.log(pad('City', 17) + RINGS.map(r => lpad(r.label.split(' ')[0], 12)).join('') + lpad('metro total', 14))
console.log('-'.repeat(17 + 12 * RINGS.length + 14))

let ringTotals = {}
for (const r of RINGS) ringTotals[r.label] = 0

for (const c of CITIES) {
  const row = RINGS.map(r => { ringTotals[r.label] += grid[c.name][r.label]; return lpad(grid[c.name][r.label], 12) }).join('')
  const total = RINGS.reduce((a, r) => a + grid[c.name][r.label], 0)
  console.log(pad(c.name, 17) + row + lpad(total, 14))
}
console.log('-'.repeat(17 + 12 * RINGS.length + 14))
console.log(pad('ALL METRO', 17) + RINGS.map(r => lpad(ringTotals[r.label], 12)).join('') +
  lpad(Object.values(ringTotals).reduce((a, b) => a + b, 0), 14))
console.log(`\nNon-metro / regional listings: ${nonMetro}`)

// Density: listings per 100 km² of ring area, to normalise for ring size.
console.log('\n=== DENSITY (listings per 100 km² of ring area, all metros pooled) ===\n')
const nCities = CITIES.length
for (const r of RINGS) {
  const areaOneCity = Math.PI * (r.max ** 2 - r.min ** 2)
  const area = areaOneCity * nCities
  const density = (ringTotals[r.label] / area) * 100
  const bar = '█'.repeat(Math.max(1, Math.round(density * 4)))
  console.log(`${pad(r.label, 22)} ${lpad(density.toFixed(2), 7)}  ${bar}`)
}

// Per-city inner-vs-outer skew — where's the biggest opportunity?
console.log('\n=== SKEW: share of each metro\'s listings inside 5km ===\n')
const skews = []
for (const c of CITIES) {
  const total = RINGS.reduce((a, r) => a + grid[c.name][r.label], 0)
  if (total < 20) continue
  const inner = grid[c.name]['0–5km (CBD/inner)']
  const mid = grid[c.name]['5–15km (middle)']
  const outer = grid[c.name]['15–30km (outer)'] + grid[c.name]['30–55km (fringe)']
  skews.push({ city: c.name, total, inner, mid, outer, innerPct: (inner / total) * 100 })
}
skews.sort((a, b) => b.innerPct - a.innerPct)
console.log(pad('City', 17) + lpad('total', 8) + lpad('inner', 8) + lpad('mid', 8) + lpad('outer', 8) + lpad('inner %', 10))
for (const s of skews) {
  console.log(pad(s.city, 17) + lpad(s.total, 8) + lpad(s.inner, 8) + lpad(s.mid, 8) + lpad(s.outer, 8) + lpad(s.innerPct.toFixed(1) + '%', 10))
}

// Which verticals are most CBD-bound? (pooled across metros)
console.log('\n=== VERTICAL SKEW (pooled metros: inner vs middle+outer) ===\n')
const vTotals = {}
for (const c of CITIES) {
  for (const r of RINGS) {
    for (const [v, n] of Object.entries(vertGrid[c.name][r.label])) {
      vTotals[v] ||= { inner: 0, out: 0 }
      if (r.min < 5) vTotals[v].inner += n
      else vTotals[v].out += n
    }
  }
}
console.log(pad('Vertical', 14) + lpad('inner', 8) + lpad('mid+outer', 12) + lpad('inner %', 10))
for (const [v, t] of Object.entries(vTotals).sort((a, b) => (b[1].inner + b[1].out) - (a[1].inner + a[1].out))) {
  const tot = t.inner + t.out
  console.log(pad(v, 14) + lpad(t.inner, 8) + lpad(t.out, 12) + lpad(((t.inner / tot) * 100).toFixed(1) + '%', 10))
}
