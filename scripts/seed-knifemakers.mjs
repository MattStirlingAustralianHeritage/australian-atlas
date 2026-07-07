#!/usr/bin/env node
/**
 * Seed Australian KNIFEMAKERS into the candidate review pipeline as Craft Atlas
 * candidates (discipline / sub_type 'knifemaker' — the new "Knifemaking" craft
 * discipline: bladesmiths, cutlers, and custom knifemakers who make knives by
 * hand — chef's, hunting/outdoor, custom/art, forged & Damascus). The category
 * is wired in the portal (migration 231 / VERTICAL_CATEGORIES.craft) and the
 * Craft vertical (migration 011 / public.category enum).
 *
 * WHY EDITORIAL (not OSM): unlike tea shops or wine bars, knifemakers have no
 * clean, well-populated OpenStreetMap tag — they are individual makers/studios,
 * mostly by-appointment or online, catalogued by the Australian Knifemakers
 * Guild, state guilds, forge schools, and editorial maker profiles rather than
 * map POIs. So this seed is fed by a curated JSON file
 * (scripts/data/knifemakers-editorial.json) produced by grounded web research.
 *
 * GROUNDING (no-hallucination rule, per CLAUDE.md Data Integrity): every maker
 * traces to a real page (source_url). website_url is only ever the maker's own
 * site as actually observed — cleanUrl() nulls non-http values and drops
 * directory / search / marketplace / editorial hosts so no discovery-page URL
 * is stored as a maker's website. Nothing is invented.
 *
 * Candidates are inserted status='pending', vertical='craft',
 * gate_results.category='knifemaker', sub_type='knifemaker' so /admin/candidates
 * pre-selects the Knifemaking discipline for the reviewer. Coordinates are left
 * null — the candidate approval flow geocodes on publish.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-knifemakers.mjs --dry-run
 *   node --env-file=.env.local scripts/seed-knifemakers.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// .env.local fallback (the --env-file flag covers the documented invocation)
try {
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i); if (!process.env[k]) process.env[k] = t.slice(i + 1).replace(/^["']|["']$/g, '')
  }
} catch { /* env-file flag may already have loaded it */ }

// NB: name this SB_URL, NOT `URL` — a module const named URL shadows the global
// URL constructor and breaks new URL(...) in cleanUrl(). (Learned the hard way.)
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SB_URL || !KEY) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(SB_URL, KEY, { auth: { persistSession: false } })
const DRY = process.argv.includes('--dry-run')

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_PATH = join(__dirname, 'data', 'knifemakers-editorial.json')

const STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', SA: 'South Australia',
  WA: 'Western Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}
const VALID_STATES = new Set(Object.keys(STATE_NAMES))

// Drop obvious non-maker-site hosts so a discovery/aggregator URL is never
// stored as a maker's website. Instagram/Facebook profiles are KEPT — for many
// makers they are the only web presence. Marketplaces (etsy/ebay/amazon) and
// editorial/search/directory hosts are dropped.
const BLOCK_HOSTS = [
  /(^|\.)google\./, /(^|\.)bing\./, /duckduckgo/, /(^|\.)wikipedia\.org$/,
  /australianknifemakersguild/, /knifemakersguild/, /bladeforums/, /reddit\.com$/,
  /youtube\.com$/, /youtu\.be$/, /pinterest\./, /ebay\./, /amazon\./, /etsy\.com$/,
  /gumtree\./, /truelocal\./, /yellowpages\./, /yelp\./, /tripadvisor\./,
  /broadsheet\./, /timeout\./, /concreteplayground\./, /theurbanlist\./,
  /gourmettraveller\./, /delicious\.com/, /goodfood\./, /knifecenter/, /knivesandtools/,
]
function cleanUrl(u) {
  if (!u || typeof u !== 'string') return null
  const s = u.trim()
  if (!/^https?:\/\//i.test(s)) return null
  let host
  try { host = new URL(s).hostname.replace(/^www\./, '').toLowerCase() } catch { return null }
  if (BLOCK_HOSTS.some(re => re.test(host))) return null
  return s.replace(/[\s)]+$/, '').replace(/\/+$/, '')
}
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return null } }

// Under-merge bias: strip ONLY a single trailing generic type-noun + legal
// suffixes. Keep identity words like "forge"/"blades" so distinct makers don't
// collapse. A stray within-batch dup is cheap (reviewer skips it); losing a real
// maker is not. (Same lesson as the wine-bar seed.)
const normName = s => (s || '')
  .toLowerCase()
  .replace(/['’`.]/g, '')
  .replace(/\b(pty|ltd|co|company|inc|the)\b/g, '')
  .replace(/\b(knives|knife|cutlery|knifeworks)\b\s*$/,'')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

// Canonicalise a maker display name so the same maker written differently by
// two research agents collapses to one key. Decode &amp;, pick the maker-brand
// segment out of a "Person / Business" string, and drop a trailing "(...)".
function cleanName(raw) {
  let s = (raw || '').replace(/&amp;/g, '&').trim()
  if (s.includes(' / ')) {
    const parts = s.split(' / ').map(x => x.trim()).filter(Boolean)
    const brandRe = /knife|knives|forge|blade|edge|metal|steel|cutler|works|anvil|ironwork/i
    s = parts.find(p => brandRe.test(p)) || parts[parts.length - 1] || s
  }
  s = s.replace(/\s*\([^)]*\)\s*$/, '').trim()
  return s
}

function toCandidate(m) {
  const name = cleanName(m.name)
  if (!name) return null
  const state = VALID_STATES.has((m.state || '').toUpperCase()) ? m.state.toUpperCase() : null
  const town = (m.town || '').trim() || null
  const website_url = cleanUrl(m.website)
  const offers = Array.isArray(m.offers) ? m.offers.filter(Boolean) : []
  const specialty = (m.specialty || '').trim()

  let confidence = 0.6
  if (website_url) confidence += 0.15
  if (state) confidence += 0.05
  if (town) confidence += 0.05
  if (offers.includes('classes') || offers.includes('gallery') || offers.includes('by_appointment')) confidence += 0.05
  confidence = Math.min(0.9, +confidence.toFixed(2))

  const srcHost = hostOf(m.source_url) || 'editorial source'
  const noteParts = [
    specialty ? `Specialty: ${specialty}.` : null,
    offers.length ? `Offers: ${offers.join(', ')}.` : null,
    (m.note || '').trim() || null,
    `Source: ${m.source_url || 'n/a'}`,
  ].filter(Boolean)

  return {
    name,
    region: town || (state ? STATE_NAMES[state] : null),
    state,
    website_url,
    vertical: 'craft',
    confidence,
    source: 'web_search',
    source_detail: `Editorial curation — ${srcHost} (Australian knifemaker)`,
    notes: noteParts.join(' '),
    status: 'pending',
    lat: null, lng: null,
    phone: null,
    address: null,
    gate_results: { category: 'knifemaker' },
    sub_type: 'knifemaker',
  }
}

// Merge within-batch duplicates (same maker found by >1 research agent): keep
// the most complete record — prefer one WITH a website, then more fields.
function mergeDupes(cands) {
  const byKey = new Map()
  for (const c of cands) {
    const k = normName(c.name)
    if (!k) continue
    const prev = byKey.get(k)
    if (!prev) { byKey.set(k, c); continue }
    const score = x => (x.website_url ? 4 : 0) + (x.state ? 2 : 0) + (x.region ? 1 : 0) + (x.confidence || 0)
    const winner = score(c) > score(prev) ? c : prev
    const loser = winner === c ? prev : c
    // backfill missing fields on the winner from the loser
    winner.website_url ||= loser.website_url
    winner.state ||= loser.state
    winner.region ||= loser.region
    byKey.set(k, winner)
  }
  return [...byKey.values()]
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
  // Try full payload; if prod schema is narrower (no sub_type), retry without it.
  let { error } = await sb.from('listing_candidates').insert(c).select('id')
  if (error && /schema cache|column/.test(error.message)) {
    const { sub_type, ...base } = c
    ;({ error } = await sb.from('listing_candidates').insert({ ...base, gate_results: { category: 'knifemaker' } }).select('id'))
  }
  return error
}

async function main() {
  console.log(`\n🔪 Knifemaker seed — mode: ${DRY ? 'DRY-RUN' : 'APPLY'}\n`)
  let raw
  try { raw = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) }
  catch (e) { console.error(`Cannot read ${DATA_PATH}: ${e.message}`); process.exit(1) }
  if (!Array.isArray(raw)) { console.error('Data file is not a JSON array'); process.exit(1) }
  console.log(`${raw.length} raw makers in data file`)

  const cands = raw.map(toCandidate).filter(Boolean)
  const merged = mergeDupes(cands)
  console.log(`${merged.length} after within-batch merge-by-name (${cands.length - merged.length} collapsed)`)

  const known = await existingNames()
  const fresh = merged.filter(c => !known.has(normName(c.name)))
  console.log(`${fresh.length} fresh (not already a listing/candidate); ${merged.length - fresh.length} skipped as existing\n`)

  const withSite = fresh.filter(c => c.website_url).length
  console.log(`${withSite}/${fresh.length} have a grounded website_url; ${fresh.length - withSite} null\n`)

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
    const error = await insertOne(c)
    if (error) {
      if (error.code === '23505') { skip++; console.log(`  ⊘ ${c.name} (unique-constraint dupe)`) }
      else { err++; console.error(`  ✗ ${c.name}: ${error.message}`) }
    } else { ins++; console.log(`  ✓ ${c.name} — ${c.region || c.state || '?'}`) }
  }
  console.log(`\nDone: ${ins} inserted, ${skip} dupes, ${err} errors.`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
