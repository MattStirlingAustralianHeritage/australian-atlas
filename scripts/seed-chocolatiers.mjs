#!/usr/bin/env node
/**
 * Seed independent Australian chocolatiers into the candidate review pipeline
 * as Table Atlas candidates (sub_type 'chocolatier' — bean-to-bar makers,
 * single-origin slabs, truffles, pralines; the category added in 9cfed60 +
 * migration 174).
 *
 * GROUNDING (no-hallucination rule, per CLAUDE.md Data Integrity): every venue
 * comes from OpenStreetMap Overpass — real, crowd-verified POIs with real names,
 * coordinates, addresses and (where present) `website` tags. NOTHING is invented;
 * in particular website_url is only ever the OSM `website` tag, never generated.
 * This mirrors lib/prospector/osm-overpass.js (the network's quota-free discovery
 * source) but targets chocolate-specific tags the broad `table` selector misses.
 *
 * Independence: the network is independent-only. We bias to independents two ways
 * — Overpass `["brand"!~"."]` drops brand-tagged chain outlets, and a name
 * blocklist catches the franchises OSM tags inconsistently (Lindt, Max Brenner,
 * San Churro, Koko Black…). Haigh's is intentionally allowed (family-owned SA
 * institution, not a franchise).
 *
 * Candidates are inserted status='pending' with gate_results.category='chocolatier'
 * so /admin/candidates pre-selects the Chocolatier subcategory for the reviewer.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-chocolatiers.mjs --dry-run
 *   node --env-file=.env.local scripts/seed-chocolatiers.mjs
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
// Chocolate-specific OSM tags. shop=chocolate is the precise chocolatier tag;
// craft=confectionery/chocolate catches makers. Broad by design — the human
// review queue (and the chocolate-name hint below) is the precision filter.
const SELECTORS = ['shop=chocolate', 'craft=confectionery', 'craft=chocolate', 'shop=confectionery']

// Chains/franchises to drop by name (OSM brand tag is inconsistent). Conservative,
// word-boundaried. Haigh's deliberately NOT here (independent family company).
const CHAIN_PATTERNS = [
  /\blindt\b/i, /\bmax brenner\b/i, /\bsan churro\b/i, /\bchocolateria\b/i,
  /\bkoko black\b/i, /\bcadbury\b/i, /\bguylian\b/i, /\bferrero\b/i, /\bgodiva\b/i,
  /\bnestl[eé]\b/i, /\bdarrell lea\b/i, /\bcacao\s*samba\b/i, /\bgelatissimo\b/i,
  /\btheobroma\b/i, /\bchocolatte\b/i,
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AustralianAtlas/1.0 (chocolatier-seed; +https://www.australianatlas.com.au)' },
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
  // brand!~"." biases to independents (chain outlets carry brand=); no website
  // filter here — chocolatiers are a small set and we keep website-less real POIs
  // too (website_url left null, never invented).
  const stmts = SELECTORS.map(s => { const [k, v] = s.split('='); return `nwr["${k}"="${v}"]["brand"!~"."](${box});` }).join('')
  return `[out:json][timeout:90];(${stmts});out tags center 400;`
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
const CHOC_HINT = /chocolat|cacao|cocoa|truffle|praline|ganache|bean.?to.?bar|couverture/i
const normName = s => s.toLowerCase().replace(/['’`]/g, '').replace(/\b(the|pty|ltd|co|company|inc)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

function toCandidate(el) {
  const tags = el.tags || {}
  const name = (tags.name || '').trim()
  if (!name || isChain(name)) return null
  const lat = el.lat ?? el.center?.lat ?? null
  const lng = el.lon ?? el.center?.lon ?? null
  const website = tags.website || tags['contact:website'] || tags.url || null
  const matched = SELECTORS.find(s => { const [k, v] = s.split('='); return tags[k] === v }) || 'osm'
  const st = (lat != null && lng != null) ? stateFromCoords(tags, lat, lng) : null
  // The confectionery tags are broad (candy/fudge/lolly stores) — keep those only
  // when the name/tags actually signal chocolate, so the queue stays chocolate-true.
  // shop=chocolate / craft=chocolate are definitional and kept unconditionally.
  const hintsChoc = CHOC_HINT.test(name) || CHOC_HINT.test(tags.cuisine || '') || CHOC_HINT.test(tags.description || '') || (tags['shop'] === 'chocolate') || (tags['craft'] === 'chocolate')
  if ((matched === 'shop=confectionery' || matched === 'craft=confectionery') && !hintsChoc) return null
  let confidence = 0.6
  if (matched === 'shop=chocolate' || matched === 'craft=chocolate') confidence += 0.12
  if (website) confidence += 0.13
  if (hintsChoc) confidence += 0.1
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
    source_detail: `OpenStreetMap Overpass — ${matched} (chocolatier coverage seed)`,
    notes: [`OSM ${el.type}/${el.id}`, `tag ${matched}`, website ? null : 'no website tag', tags.opening_hours ? 'has hours' : null].filter(Boolean).join('. '),
    status: 'pending',
    lat, lng,
    phone: tags.phone || tags['contact:phone'] || null,
    address: addressOf(tags),
    gate_results: { category: 'chocolatier' },
    sub_type: 'chocolatier',
  }
}

async function discover() {
  console.log('Querying OSM Overpass for chocolate POIs across Australia…')
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
  console.log(`\n🍫 Chocolatier seed — mode: ${DRY ? 'DRY-RUN' : 'APPLY'}\n`)
  const found = await discover()
  console.log(`\n${found.length} independent chocolate candidates after chain-filter + dedup-by-name`)

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
        const retry = await sb.from('listing_candidates').insert({ ...base, gate_results: { category: 'chocolatier' } }).select('id')
        if (retry.error) { err++; console.error(`  ✗ ${c.name}: ${retry.error.message}`) } else { ins++; console.log(`  ✓ ${c.name}`) }
      } else { err++; console.error(`  ✗ ${c.name}: ${error.message}`) }
    } else { ins++; console.log(`  ✓ ${c.name} — ${c.region || c.state || '?'}`) }
  }
  console.log(`\nDone: ${ins} inserted, ${skip} dupes, ${err} errors.`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
