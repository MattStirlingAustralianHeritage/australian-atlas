#!/usr/bin/env node
/**
 * Seed five new Atlas categories from OpenStreetMap Overpass into the candidate
 * review pipeline. GROUNDING (no-hallucination rule, per CLAUDE.md Data
 * Integrity): every venue is a real, crowd-verified OSM POI — real name,
 * coordinates, address and (where present) `website` tag. NOTHING is invented;
 * website_url is only ever the OSM `website`/`contact:website` tag, never
 * generated. Mirrors scripts/seed-wine-bars.mjs.
 *
 * Categories (‑‑category=<key>, default = all):
 *   ice_creamery  (table)  amenity/shop=ice_cream, cuisine~ice_cream|gelato
 *   cheesemonger  (table)  shop=cheese (+ deli named for cheese/fromage)
 *   historic_pub  (table)  amenity=pub carrying a heritage/historic tag
 *   surf_school   (way)    sport=surfing schools / name-signalled surf schools
 *   oyster_farm   (table)  name-signalled oyster farms / sheds / bars / tours
 *
 * Candidates are inserted status='pending' with gate_results.category=<key> and
 * sub_type=<key> so /admin/candidates pre-selects the right subcategory. Coords
 * come from OSM; the approval flow re-geocodes on publish. source='coverage_gap'
 * (the allowed listing_candidates_source_check value for a curated coverage
 * seed); real OSM provenance is recorded in source_detail + notes.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-new-categories-osm.mjs --dry-run
 *   node --env-file=.env.local scripts/seed-new-categories-osm.mjs --category=ice_creamery
 *   node --env-file=.env.local scripts/seed-new-categories-osm.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

try {
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i); if (!process.env[k]) process.env[k] = t.slice(i + 1).replace(/^["']|["']$/g, '')
  }
} catch { /* --env-file may already have loaded it */ }

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SB_URL || !KEY) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(SB_URL, KEY, { auth: { persistSession: false } })
const DRY = process.argv.includes('--dry-run')
const CAT_ARG = (process.argv.find(a => a.startsWith('--category=')) || '').split('=')[1] || null

// ── OSM Overpass ──────────────────────────────────────────────────────────────
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const AU_BBOX = [-44.0, 112.0, -10.0, 154.0]
const STATE_BBOX = {
  NSW: [-37.5, 141.0, -28.2, 153.6], VIC: [-39.2, 140.9, -34.0, 150.0],
  QLD: [-29.2, 138.0, -10.7, 153.5], SA: [-38.1, 129.0, -26.0, 141.0],
  WA: [-35.2, 112.9, -13.7, 129.0], TAS: [-43.7, 143.8, -39.6, 148.4],
  ACT: [-35.9, 148.7, -35.1, 149.4], NT: [-26.0, 129.0, -10.9, 138.0],
}
const STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', SA: 'South Australia',
  WA: 'Western Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}

async function overpass(ql) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length]
    try {
      const controller = new AbortController()
      const to = setTimeout(() => controller.abort(), 95000)
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AustralianAtlas/1.0 (category-coverage-seed; +https://www.australianatlas.com.au)' },
        body: 'data=' + encodeURIComponent(ql), signal: controller.signal,
      })
      clearTimeout(to)
      if (res.status === 429 || res.status === 504) { console.log(`  [osm] ${endpoint} ${res.status} — backoff`); await new Promise(r => setTimeout(r, 2500 * (attempt + 1))); continue }
      if (!res.ok) { console.log(`  [osm] ${endpoint} HTTP ${res.status}`); continue }
      const data = await res.json()
      if (data.remark && /timed out|out of memory|please reduce/i.test(data.remark)) { console.log(`  [osm] remark: ${data.remark} — retry lighter`); await new Promise(r => setTimeout(r, 1500)); continue }
      return { elements: data.elements || [] }
    } catch (e) { console.log(`  [osm] ${endpoint} ${e.name === 'AbortError' ? 'timeout' : e.message}`); await new Promise(r => setTimeout(r, 1500)) }
  }
  return { elements: [], failed: true }
}

const stateFromCoords = (tags, lat, lng) => {
  const t = (tags['addr:state'] || '').toUpperCase().replace(/\s+/g, '')
  if (STATE_BBOX[t]) return t
  for (const [c, b] of Object.entries(STATE_BBOX)) { const [s, w, n, e] = b; if (lat >= s && lat <= n && lng >= w && lng <= e) return c }
  return null
}
const regionOf = (tags, st) => tags['addr:city'] || tags['addr:town'] || tags['addr:suburb'] || tags['addr:municipality'] || tags['addr:village'] || (st ? STATE_NAMES[st] : null) || null
const addressOf = tags => {
  const p = [[tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '), tags['addr:suburb'] || tags['addr:city'] || tags['addr:town'], tags['addr:state'], tags['addr:postcode']].filter(Boolean)
  return p.length ? p.join(', ') : null
}
const normName = s => (s || '').toLowerCase().replace(/['’`]/g, '').replace(/\b(the|pty|ltd|co|company|inc)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const websiteOf = tags => tags.website || tags['contact:website'] || tags.url || null

// ── Per-category configuration ───────────────────────────────────────────────
// stmts(box)  → array of Overpass statements
// accept(tags,name) → boolean (final grounding/curation filter)
// bonus(tags,name)  → optional confidence bump [0..0.2]
const CONFIGS = {
  ice_creamery: {
    vertical: 'table', emoji: '🍦', label: 'ice creamery / gelateria',
    chains: [/baskin.?robbins/i, /cold rock/i, /gelatissimo/i, /new zealand natural/i, /ben *& *jerry/i, /cold stone/i, /wendy'?s/i, /royal copenhagen/i, /san churro/i, /^donut king/i],
    stmts: box => [
      `nwr["amenity"="ice_cream"]["brand"!~"."](${box});`,
      `nwr["shop"="ice_cream"]["brand"!~"."](${box});`,
      `nwr["cuisine"~"ice_cream|gelato",i]["brand"!~"."](${box});`,
    ],
    accept: (tags, name) => {
      // Dedicated ice-cream/gelato POI type is an automatic yes.
      if (tags.amenity === 'ice_cream' || tags.shop === 'ice_cream') return true
      // Otherwise (a cuisine-tag match on some other venue) require an explicit
      // gelato/ice-cream identity in the NAME, so cafés, takeaways, general
      // stores and bistros that merely list ice cream are not swept in.
      return /gelat|ice ?cream|creamery|soft serve|scoop shop|sorbet(?:eria)?/i.test(name)
    },
    bonus: (tags, name) => (/gelat|artisan|churn|hand ?made|scoop/i.test(`${name} ${tags.cuisine || ''} ${tags.description || ''}`) ? 0.1 : 0),
  },

  cheesemonger: {
    vertical: 'table', emoji: '🧀', label: 'cheesemonger / fromagerie',
    chains: [/coles/i, /woolworths/i, /aldi/i, /costco/i],
    stmts: box => [
      `nwr["shop"="cheese"]["brand"!~"."](${box});`,
      `nwr["shop"="deli"]["name"~"cheese|fromage|fromagerie",i]["brand"!~"."](${box});`,
    ],
    accept: (tags, name) => {
      if (tags.shop === 'cheese') return true
      return tags.shop === 'deli' && /cheese|fromage/i.test(name)
    },
    bonus: (tags, name) => (/fromagerie|cheese room|affineur|cheese cellar|curd/i.test(`${name} ${tags.description || ''}`) ? 0.08 : 0),
  },

  historic_pub: {
    vertical: 'table', emoji: '🍺', label: 'historic pub',
    chains: [/\balh\b/i, /australian leisure/i],
    // Curation signal = a heritage / historic OSM tag on an amenity=pub. This
    // deliberately narrows the (huge, noisy) universe of AU pubs to the
    // genuinely heritage-listed ones — the category intent.
    stmts: box => [
      `nwr["amenity"="pub"]["heritage"](${box});`,
      `nwr["amenity"="pub"]["heritage:operator"](${box});`,
      `nwr["amenity"="pub"]["historic"](${box});`,
    ],
    accept: (tags) => tags.amenity === 'pub' && (tags.heritage != null || tags['heritage:operator'] != null || tags.historic != null),
    bonus: (tags) => {
      let b = 0
      if (tags.heritage || tags['heritage:operator']) b += 0.12
      if (/\b(18|19)\d{2}\b/.test(tags.start_date || tags['building:year'] || '')) b += 0.05
      return Math.min(0.17, b)
    },
  },

  surf_school: {
    vertical: 'way', emoji: '🏄', label: 'surf school',
    chains: [],
    // Tag-anchored (sport=surfing / shop=surf) so Overpass never has to scan
    // every named POI — a bare name~ regex over all AU POIs gets rate-limited.
    stmts: box => [
      `nwr["sport"="surfing"](${box});`,
      `nwr["shop"="surf"]["name"~"school|lesson|academy|coaching|learn|surf co",i](${box});`,
      `nwr["leisure"="sports_centre"]["sport"="surfing"](${box});`,
    ],
    accept: (tags, name) => {
      const surfSignal = /surf/i.test(name) || tags.sport === 'surfing' || /surf/i.test(tags.sport || '')
      const schoolSignal = /school|lesson|academy|coaching|learn to surf|surf camp|surf guide/i.test(`${name} ${tags.leisure || ''} ${tags.description || ''}`) || tags.leisure === 'school'
      return surfSignal && schoolSignal
    },
    bonus: (tags, name) => (/surf school|learn to surf|academy/i.test(name) ? 0.1 : 0),
  },

  oyster_farm: {
    vertical: 'table', emoji: '🦪', label: 'oyster farm / shed',
    chains: [],
    // OSM coverage is thin & inconsistent for aquaculture, so this is
    // name-signalled: real POIs whose name references oysters as a
    // farm/shed/bar/lease/tour. Curated further by accept().
    stmts: box => [
      `nwr["name"~"oyster",i](${box});`,
      `nwr["cuisine"~"oyster",i](${box});`,
    ],
    accept: (tags, name) => {
      if (!/oyster/i.test(name)) return false
      // keep farm/shed/bar/lease/shack/co/wharf/tour signals; drop pure
      // seafood-restaurant false positives lacking any oyster-venue signal
      return /oyster (farm|shed|bar|shack|lease|co|coast|wharf|tour|shucker|shucking|barn|house)|oysters?\b/i.test(name)
    },
    bonus: (tags, name) => (/farm|shed|lease|tour|shucking/i.test(name) ? 0.1 : 0),
  },
}

function buildQL(cfg, bbox) {
  return `[out:json][timeout:90];(${cfg.stmts(bbox.join(',')).join('')});out tags center 700;`
}

function toCandidate(cfg, key, el) {
  const tags = el.tags || {}
  const name = (tags.name || '').trim()
  if (!name) return null
  if (cfg.chains.some(re => re.test(name))) return null
  if (!cfg.accept(tags, name)) return null
  const lat = el.lat ?? el.center?.lat ?? null
  const lng = el.lon ?? el.center?.lon ?? null
  const st = (lat != null && lng != null) ? stateFromCoords(tags, lat, lng) : null
  const website = websiteOf(tags)
  let confidence = 0.58
  if (website) confidence += 0.13
  if (addressOf(tags)) confidence += 0.05
  if (st) confidence += 0.04
  confidence += (cfg.bonus ? cfg.bonus(tags, name) : 0)
  confidence = Math.min(0.95, +confidence.toFixed(2))
  return {
    name,
    region: regionOf(tags, st),
    state: st,
    website_url: website,
    vertical: cfg.vertical,
    confidence,
    source: 'coverage_gap',
    source_detail: `OpenStreetMap Overpass — ${cfg.label} coverage seed`,
    notes: [`OSM ${el.type}/${el.id}`, website ? null : 'no website tag', tags.opening_hours ? 'has hours' : null].filter(Boolean).join('. '),
    status: 'pending',
    lat, lng,
    phone: tags.phone || tags['contact:phone'] || null,
    address: addressOf(tags),
    gate_results: { category: key },
    sub_type: key,
  }
}

async function discover(cfg, key) {
  console.log(`\n${cfg.emoji} ${key}: querying OSM Overpass…`)
  let { elements, failed } = await overpass(buildQL(cfg, AU_BBOX))
  if (failed || elements.length === 0) {
    console.log('  AU-wide query failed/empty — per-state fallback')
    elements = []
    for (const [code, bbox] of Object.entries(STATE_BBOX)) {
      const r = await overpass(buildQL(cfg, bbox))
      console.log(`  ${code}: ${r.elements.length}`)
      elements.push(...r.elements)
      await new Promise(r => setTimeout(r, 800))
    }
  }
  const out = [], seen = new Set()
  for (const el of elements) {
    const c = toCandidate(cfg, key, el)
    if (!c) continue
    const k = normName(c.name)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(c)
  }
  console.log(`  ${elements.length} raw → ${out.length} accepted (deduped)`)
  return out
}

async function existingNames() {
  const names = new Set()
  for (const tbl of ['listings', 'listing_candidates']) {
    let from = 0
    for (;;) {
      const { data, error } = await sb.from(tbl).select('name').order('name').range(from, from + 999)
      if (error) { console.error(`  dedup load ${tbl} failed: ${error.message}`); break }
      if (!data?.length) break
      data.forEach(r => r.name && names.add(normName(r.name)))
      if (data.length < 1000) break
      from += 1000
    }
  }
  return names
}

async function insertOne(c) {
  let { error } = await sb.from('listing_candidates').insert(c).select('id')
  if (error && /schema cache|column/.test(error.message)) {
    const { sub_type, ...base } = c
    ;({ error } = await sb.from('listing_candidates').insert({ ...base, gate_results: c.gate_results }).select('id'))
  }
  return error
}

async function main() {
  const keys = CAT_ARG ? [CAT_ARG] : Object.keys(CONFIGS)
  if (CAT_ARG && !CONFIGS[CAT_ARG]) { console.error(`Unknown --category=${CAT_ARG}. Valid: ${Object.keys(CONFIGS).join(', ')}`); process.exit(1) }
  console.log(`\n🌏 New-category OSM seed — mode: ${DRY ? 'DRY-RUN' : 'APPLY'} — categories: ${keys.join(', ')}`)

  // Load the existing-name set ONCE up front. Then process each category
  // independently: discover → dedup → insert. Inserting per-category means a
  // rate-limited / slow Overpass category cannot block the ones that already
  // succeeded — each category's candidates persist as soon as it is done.
  const known = await existingNames()
  let tIns = 0, tSkip = 0, tErr = 0
  for (const key of keys) {
    let found = []
    try { found = await discover(CONFIGS[key], key) }
    catch (e) { console.error(`  ⚠ ${key} discover failed: ${e.message} — skipping`); continue }
    const fresh = found.filter(c => !known.has(normName(c.name)))
    fresh.forEach(c => known.add(normName(c.name))) // guard cross-category dups within this run
    const withSite = fresh.filter(c => c.website_url).length
    console.log(`── ${CONFIGS[key].emoji} ${key} — ${fresh.length} fresh (${withSite} w/ website); ${found.length - fresh.length} already known ──`)

    if (DRY || fresh.length === 0) { if (DRY) console.log('   (dry-run: no writes)'); continue }
    let ins = 0, skip = 0, err = 0
    for (const c of fresh) {
      const error = await insertOne(c)
      if (error) { if (error.code === '23505') skip++; else { err++; console.error(`   ✗ ${c.name}: ${error.message}`) } }
      else ins++
    }
    console.log(`   ↳ inserted ${ins}, dupes ${skip}, errors ${err}`)
    tIns += ins; tSkip += skip; tErr += err
  }
  if (DRY) { console.log('\n── DRY-RUN: no writes. Re-run without --dry-run to insert. ──'); return }
  console.log(`\nDone: ${tIns} inserted, ${tSkip} dupes, ${tErr} errors.`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
