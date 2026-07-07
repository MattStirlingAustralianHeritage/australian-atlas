#!/usr/bin/env node
/**
 * Seed independent Australian wine bars into the candidate review pipeline as
 * Table Atlas candidates (sub_type 'wine_bar' — wine bars pouring by the glass:
 * natural / low-intervention specialists, cellar bars, enotecas, and wine rooms
 * with small plates). The category is wired in the portal (migration 226 /
 * VERTICAL_CATEGORIES.table) and the Table vertical (migration 012).
 *
 * GROUNDING (no-hallucination rule, per CLAUDE.md Data Integrity): every venue
 * comes from OpenStreetMap Overpass — real, crowd-verified POIs with real names,
 * coordinates, addresses and (where present) `website` tags. NOTHING is invented;
 * in particular website_url is only ever the OSM `website` tag, never generated.
 * Mirrors scripts/seed-tea-shops.mjs, but targets wine-bar tags.
 *
 * TAG CHOICE: wine bars are OSM `amenity=bar`. Generic bars/pubs are noisy, so the
 * Overpass query itself is narrowed to a strong wine signal — `bar=wine`, or
 * `cuisine=wine_bar`, or a name containing "wine"/"enoteca"/"vino". We deliberately
 * do NOT query amenity=pub (generic pubs) or shop=wine/shop=alcohol (bottle shops).
 *
 * DISTINCT FROM SBA: winery cellar doors, vineyards and estates are Small Batch
 * Atlas (sub_type 'winery'/'cellar_door'), NOT Table wine bars. WINE_NEG drops any
 * name that reads as a cellar door / winery / vineyard / bottle shop / liquor store
 * so the two networks stay clean.
 *
 * Independence: Overpass `["brand"!~"."]` drops brand-tagged chain outlets, plus a
 * conservative name blocklist for bottle-shop / liquor franchises OSM tags catch
 * inconsistently (Dan Murphy's, BWS, Vintage Cellars…).
 *
 * Candidates are inserted status='pending' with gate_results.category='wine_bar'
 * so /admin/candidates pre-selects the Wine Bar subcategory for the reviewer.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-wine-bars.mjs --dry-run
 *   node --env-file=.env.local scripts/seed-wine-bars.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// .env.local fallback (the --env-file flag covers the documented invocation)
try {
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i); if (!process.env[k]) process.env[k] = t.slice(i + 1).replace(/^["']|["']$/g, '')
  }
} catch { /* env-file flag may already have loaded it */ }

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(URL, KEY, { auth: { persistSession: false } })
const DRY = process.argv.includes('--dry-run')

// ── OSM Overpass ──────────────────────────────────────────────────────────────
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const AU_BBOX = [-44.0, 112.0, -10.0, 154.0]
// State bboxes (south, west, north, east) — used only as a per-state fallback if
// the single AU-wide query times out on a public mirror.
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

// Bottle-shop / liquor franchises to drop by name (belt-and-suspenders — the
// amenity=bar query mostly excludes retail, but OSM tagging is inconsistent).
const CHAIN_PATTERNS = [
  /dan murphy/i, /\bbws\b/i, /liquorland/i, /vintage cellars/i, /first choice liquor/i,
  /cellarbrations/i, /thirsty camel/i, /\bibcos?\b/i, /liquor ?land/i, /\bcoles\b/i,
  /\bwoolworths\b/i, /\baldi\b/i,
]
const isChain = n => CHAIN_PATTERNS.some(re => re.test(n))

async function overpass(ql) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length]
    try {
      const controller = new AbortController()
      const to = setTimeout(() => controller.abort(), 95000)
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AustralianAtlas/1.0 (wine-bar-seed; +https://www.australianatlas.com.au)' },
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

function buildQL(bbox) {
  const box = bbox.join(',')
  // Three wine-bar signals, all biased to independents via brand!~".":
  //   1. amenity=bar + bar=wine     (explicit wine bar)
  //   2. cuisine=wine_bar           (tagged on bar or restaurant)
  //   3. amenity=bar + name~wine    (name-signalled: "…Wine Bar", "Enoteca…", "Vino…")
  const stmts = [
    `nwr["amenity"="bar"]["bar"="wine"]["brand"!~"."](${box});`,
    `nwr["cuisine"="wine_bar"]["brand"!~"."](${box});`,
    `nwr["amenity"="bar"]["name"~"wine|enoteca|vino",i]["brand"!~"."](${box});`,
  ].join('')
  return `[out:json][timeout:90];(${stmts});out tags center 600;`
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

// Positive: a genuine wine-bar signal in the name (soft confidence).
const WINE_HINT = /\bwine bar\b|winebar|enoteca|vinoteca|\bwine room\b|by the glass/i
// Name that reads as an SBA cellar door / winery / retail bottle shop — drop so
// the wine_bar category stays distinct from Small Batch Atlas wineries.
const WINE_NEG = /cellar door|\bwinery\b|\bwineries\b|vineyard|\bestate\b|bottle ?shop|bottle-?o|\bliquor\b|\bwine store\b|wine merchant|wine warehouse|\bcellars?\b(?! bar)/i
const normName = s => s.toLowerCase().replace(/['’`]/g, '').replace(/\b(the|pty|ltd|co|company|inc)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

function toCandidate(el) {
  const tags = el.tags || {}
  const name = (tags.name || '').trim()
  if (!name || isChain(name)) return null
  const amenity = tags.amenity || ''
  const cuisineWine = /wine_bar/i.test(tags.cuisine || '')
  // Only bars (or a wine_bar-cuisine restaurant); never generic pubs.
  if (amenity !== 'bar' && !cuisineWine) return null
  if (amenity === 'pub') return null
  const nameWine = /\bwine\b|enoteca|vino/i.test(name)
  const isWineTag = tags.bar === 'wine' || cuisineWine
  if (!isWineTag && !nameWine) return null
  // Drop cellar doors / wineries / bottle shops (SBA or retail, not a wine bar).
  if (WINE_NEG.test(`${name} ${tags.description || ''}`)) return null

  const lat = el.lat ?? el.center?.lat ?? null
  const lng = el.lon ?? el.center?.lon ?? null
  const website = tags.website || tags['contact:website'] || tags.url || null
  const matched = tags.bar === 'wine' ? 'amenity=bar + bar=wine'
    : cuisineWine ? 'cuisine=wine_bar'
    : 'amenity=bar (name:wine)'
  const st = (lat != null && lng != null) ? stateFromCoords(tags, lat, lng) : null
  const haystack = `${name} ${tags.cuisine || ''} ${tags.description || ''}`
  let confidence = 0.6
  if (isWineTag) confidence += 0.15
  if (website) confidence += 0.13
  if (WINE_HINT.test(haystack)) confidence += 0.1
  if (addressOf(tags)) confidence += 0.05
  confidence = Math.min(0.95, +confidence.toFixed(2))
  return {
    name,
    region: regionOf(tags, st),
    state: st,
    website_url: website,
    vertical: 'table',
    confidence,
    // 'coverage_gap' = the allowed source value for a curated coverage seed
    // (listing_candidates_source_check). Real OSM provenance kept in source_detail.
    source: 'coverage_gap',
    source_detail: `OpenStreetMap Overpass — ${matched} (wine bar coverage seed)`,
    notes: [`OSM ${el.type}/${el.id}`, `tag ${matched}`, website ? null : 'no website tag', tags.opening_hours ? 'has hours' : null].filter(Boolean).join('. '),
    status: 'pending',
    lat, lng,
    phone: tags.phone || tags['contact:phone'] || null,
    address: addressOf(tags),
    gate_results: { category: 'wine_bar' },
    sub_type: 'wine_bar',
  }
}

async function discover() {
  console.log('Querying OSM Overpass for wine bars (bar=wine / cuisine=wine_bar / name~wine) across Australia…')
  let { elements, failed } = await overpass(buildQL(AU_BBOX))
  if (failed || elements.length === 0) {
    console.log('  AU-wide query failed/empty — falling back to per-state sweep')
    elements = []
    for (const [code, bbox] of Object.entries(STATE_BBOX)) {
      const r = await overpass(buildQL(bbox))
      console.log(`  ${code}: ${r.elements.length} elements`)
      elements.push(...r.elements)
      await new Promise(r => setTimeout(r, 800))
    }
  }
  console.log(`  ${elements.length} raw OSM elements`)
  const out = []
  const seen = new Set()
  for (const el of elements) {
    const c = toCandidate(el)
    if (!c) continue
    const k = normName(c.name)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(c)
  }
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

async function main() {
  console.log(`\n🍷 Wine bar seed — mode: ${DRY ? 'DRY-RUN' : 'APPLY'}\n`)
  const found = await discover()
  console.log(`\n${found.length} independent wine-bar candidates after chain-filter + cellar-door/winery drop + dedup-by-name`)

  const known = await existingNames()
  const fresh = found.filter(c => !known.has(normName(c.name)))
  const dupes = found.length - fresh.length
  console.log(`${fresh.length} fresh (not already a listing/candidate); ${dupes} skipped as existing\n`)

  // group by state for a readable preview
  const byState = {}
  for (const c of fresh) { (byState[c.state || '??'] ||= []).push(c) }
  for (const st of Object.keys(byState).sort()) {
    console.log(`── ${st} (${byState[st].length}) ──`)
    for (const c of byState[st]) console.log(`   ${c.confidence}  ${c.name}  [${c.region || '?'}]  ${c.website_url || '(no website)'}`)
  }

  if (DRY) { console.log('\n── DRY-RUN: no writes. Re-run without --dry-run to insert. ──'); return }

  console.log('\nInserting…')
  let ins = 0, skip = 0, err = 0
  for (const c of fresh) {
    const { error } = await sb.from('listing_candidates').insert(c).select('id')
    if (error) {
      if (error.code === '23505') { skip++; console.log(`  ⊘ ${c.name} (unique-constraint dupe)`) }
      else if (/schema cache|column/.test(error.message)) {
        // retry without the newest optional columns if prod schema is narrower
        const { sub_type, gate_results, ...base } = c
        const retry = await sb.from('listing_candidates').insert({ ...base, gate_results: { category: 'wine_bar' } }).select('id')
        if (retry.error) { err++; console.error(`  ✗ ${c.name}: ${retry.error.message}`) } else { ins++; console.log(`  ✓ ${c.name}`) }
      } else { err++; console.error(`  ✗ ${c.name}: ${error.message}`) }
    } else { ins++; console.log(`  ✓ ${c.name} — ${c.region || c.state || '?'}`) }
  }
  console.log(`\nDone: ${ins} inserted, ${skip} dupes, ${err} errors.`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
