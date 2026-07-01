#!/usr/bin/env node
/**
 * Seed independent Australian tea shops (tea merchants & tea houses) into the
 * candidate review pipeline as Table Atlas candidates (sub_type 'tea_shop' —
 * loose-leaf blenders and merchants, teaware retailers, and sit-down tea rooms;
 * a broad category distinct from cafe). The category is wired in the portal
 * (migration 195 / VERTICAL_CATEGORIES.table) and the Table vertical (migration 011).
 *
 * GROUNDING (no-hallucination rule, per CLAUDE.md Data Integrity): every venue
 * comes from OpenStreetMap Overpass — real, crowd-verified POIs with real names,
 * coordinates, addresses and (where present) `website` tags. NOTHING is invented;
 * in particular website_url is only ever the OSM `website` tag, never generated.
 * Mirrors scripts/seed-confectioners.mjs, but targets the tea tags.
 *
 * TAG CHOICE: shop=tea is OSM's canonical "tea shop / tea merchant" tag; craft=tea
 * catches blenders/makers. We deliberately do NOT query amenity=cafe (would pull
 * generic cafes) or shop=bubble_tea (bubble-tea chains are a different thing). A
 * dedicated tea house tagged only amenity=cafe won't be caught here — that's an
 * acceptable precision/recall trade for a grounded seed; the review queue can add
 * more. The TEA_HINT below is a soft confidence signal, not a hard filter.
 *
 * Independence: the network is independent-only. We bias to independents two ways
 * — Overpass `["brand"!~"."]` drops brand-tagged chain outlets, and a name
 * blocklist catches franchises/brands OSM tags inconsistently (T2, Chatime, Gong
 * Cha, Sharetea…) plus wholesale/grocery tea brands (Dilmah, Twinings, Madura…).
 *
 * Candidates are inserted status='pending' with gate_results.category='tea_shop'
 * so /admin/candidates pre-selects the Tea Shop subcategory for the reviewer.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-tea-shops.mjs --dry-run
 *   node --env-file=.env.local scripts/seed-tea-shops.mjs
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
// Tea OSM tags. shop=tea is the canonical tea-merchant / tea-shop tag; craft=tea
// catches blenders/makers. Bubble-tea (shop=bubble_tea) and generic cafes
// (amenity=cafe) are deliberately EXCLUDED.
const SELECTORS = ['shop=tea', 'craft=tea']

// Chains/brands to drop by name (OSM brand tag is inconsistent). Conservative,
// word-boundaried. Independent tea houses/merchants deliberately NOT here.
const CHAIN_PATTERNS = [
  /\bt2\b/i, /t2\s*tea/i, /\bchatime\b/i, /\bgong ?cha\b/i, /\bsharetea\b/i, /\bcoco\b/i,
  /\beasyway\b/i, /\bbubble ?cup\b/i, /\bhappy ?lemon\b/i, /\bmachi ?machi\b/i,
  /\butopia\b/i, /\bteavana\b/i, /\btwinings?\b/i, /\bdilmah\b/i, /\bmadura\b/i,
  /\bnerada\b/i, /\btetley\b/i, /\bbushells\b/i, /\blipton\b/i, /\bkmart\b/i,
  /\bcoles\b/i, /\bwoolworths\b/i, /\bhoyts\b/i,
  // bubble-tea / drink franchises tagged shop=tea in OSM (not independent tea merchants)
  /\bgotcha\b/i, /come ?buy/i, /\bpalgong\b/i, /\blupici?a\b/i, /\bqpop\b/i,
  /\byomie\b/i, /kung ?fu tea/i, /world par-?tea/i, /\bxing fu\b/i, /\bteaspoon\b/i,
  // non-tea POIs mistagged shop=tea
  /\byogurt\b/i, /\bhealthy cup\b/i,
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AustralianAtlas/1.0 (tea-shop-seed; +https://www.australianatlas.com.au)' },
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
  // filter here — we keep website-less real POIs too (website_url left null,
  // never invented).
  const stmts = SELECTORS.map(s => { const [k, v] = s.split('='); return `nwr["${k}"="${v}"]["brand"!~"."](${box});` }).join('')
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
// Positive signal that a POI is genuinely a tea specialist (soft, confidence-only).
const TEA_HINT = /\btea\b|teahouse|tea house|tea ?room|chai|matcha|oolong|pu.?erh|tisane|infusion|herbal|chado|leaf|blend|brew/i
// A name that reads as bubble/boba (a different category) — drop if no other tea signal.
const BUBBLE_ONLY = /bubble tea|boba|pearl milk|milk tea/i
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
  const haystack = `${name} ${tags.cuisine || ''} ${tags.description || ''} ${tags['shop'] || ''} ${tags['craft'] || ''}`
  const hintsTea = TEA_HINT.test(haystack)
  // Drop bubble-tea / boba shops (a distinct category) unless there's a broader
  // tea-merchant signal (e.g. "Loose Leaf & Boba Bar" is kept).
  if (BUBBLE_ONLY.test(haystack) && !/\bshop\b|merchant|loose|leaf|house|room/i.test(haystack)) return null
  let confidence = 0.6
  if (matched === 'craft=tea') confidence += 0.1
  if (website) confidence += 0.13
  if (hintsTea) confidence += 0.12
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
    source_detail: `OpenStreetMap Overpass — ${matched} (tea shop coverage seed)`,
    notes: [`OSM ${el.type}/${el.id}`, `tag ${matched}`, website ? null : 'no website tag', tags.opening_hours ? 'has hours' : null].filter(Boolean).join('. '),
    status: 'pending',
    lat, lng,
    phone: tags.phone || tags['contact:phone'] || null,
    address: addressOf(tags),
    gate_results: { category: 'tea_shop' },
    sub_type: 'tea_shop',
  }
}

async function discover() {
  console.log('Querying OSM Overpass for tea shops (shop=tea / craft=tea) across Australia…')
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
  console.log(`\n🍵 Tea shop seed — mode: ${DRY ? 'DRY-RUN' : 'APPLY'}\n`)
  const found = await discover()
  console.log(`\n${found.length} independent tea-shop candidates after chain-filter + bubble-only drop + dedup-by-name`)

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
        const retry = await sb.from('listing_candidates').insert({ ...base, gate_results: { category: 'tea_shop' } }).select('id')
        if (retry.error) { err++; console.error(`  ✗ ${c.name}: ${retry.error.message}`) } else { ins++; console.log(`  ✓ ${c.name}`) }
      } else { err++; console.error(`  ✗ ${c.name}: ${error.message}`) }
    } else { ins++; console.log(`  ✓ ${c.name} — ${c.region || c.state || '?'}`) }
  }
  console.log(`\nDone: ${ins} inserted, ${skip} dupes, ${err} errors.`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
