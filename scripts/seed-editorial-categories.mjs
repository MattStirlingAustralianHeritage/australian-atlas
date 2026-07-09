#!/usr/bin/env node
/**
 * Seed the new EDITORIAL categories into the candidate review pipeline from
 * grounded, human/agent-researched JSON files under scripts/data/. Every source
 * file was produced by grounded web research: each entry traces to a real page
 * (source_url) and `website` is only ever the operator's own site as observed
 * (nulled otherwise). This script adds a mechanical grounding safety net —
 * cleanUrl() nulls non-http values and drops directory / search / marketplace /
 * aggregator hosts so no discovery-page URL is stored as an operator's website.
 * NOTHING is invented (CLAUDE.md Data Integrity). Mirrors scripts/seed-knifemakers.mjs.
 *
 * Categories (‑‑category=<key>, default = all):
 *   aboriginal_art_centre (collection)  aboriginal-art-centres-editorial.json
 *   artist_studio         (collection)  artist-studios-editorial.json
 *   off_grid_cabin        (rest)        off-grid-cabins-editorial.json
 *   houseboat             (rest)        houseboats-editorial.json
 *   fossicking            (field)       fossicking-editorial.json
 *   milliner              (craft)       milliners-editorial.json
 *
 * Candidates are inserted status='pending', vertical=<config>, source='web_search',
 * gate_results.category=<key>, sub_type=<key> so /admin/candidates pre-selects the
 * right subcategory. Coordinates are left null — the approval flow geocodes on publish.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-editorial-categories.mjs --dry-run
 *   node --env-file=.env.local scripts/seed-editorial-categories.mjs --category=fossicking
 *   node --env-file=.env.local scripts/seed-editorial-categories.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

try {
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i); if (!process.env[k]) process.env[k] = t.slice(i + 1).replace(/^["']|["']$/g, '')
  }
} catch { /* --env-file may already have loaded it */ }

// NB: SB_URL, not `URL` — a const named URL shadows the global URL constructor.
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SB_URL || !KEY) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(SB_URL, KEY, { auth: { persistSession: false } })
const DRY = process.argv.includes('--dry-run')
const CAT_ARG = (process.argv.find(a => a.startsWith('--category=')) || '').split('=')[1] || null

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', SA: 'South Australia',
  WA: 'Western Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}
const VALID_STATES = new Set(Object.keys(STATE_NAMES))

// Per-category config: which file, which vertical, and a human label.
const CONFIGS = {
  aboriginal_art_centre: { vertical: 'collection', file: 'aboriginal-art-centres-editorial.json', label: 'Aboriginal art centre', emoji: '🎨' },
  artist_studio:         { vertical: 'collection', file: 'artist-studios-editorial.json',         label: 'artist studio',        emoji: '🖌️' },
  off_grid_cabin:        { vertical: 'rest',       file: 'off-grid-cabins-editorial.json',        label: 'off-grid cabin',       emoji: '🌲' },
  houseboat:             { vertical: 'rest',       file: 'houseboats-editorial.json',             label: 'houseboat hire',       emoji: '🚤' },
  fossicking:            { vertical: 'field',      file: 'fossicking-editorial.json',             label: 'fossicking / gemfield',emoji: '💎' },
  milliner:              { vertical: 'craft',      file: 'milliners-editorial.json',              label: 'milliner / hatmaker',  emoji: '🎩' },
  oyster_farm:           { vertical: 'table',      file: 'oyster-farms-editorial.json',           label: 'oyster farm / shed',   emoji: '🦪' },
  surf_school:           { vertical: 'way',        file: 'surf-schools-editorial.json',           label: 'surf school',          emoji: '🏄' },
}

// Drop non-operator hosts so a discovery/aggregator URL is never stored as an
// operator's website. Instagram/Facebook are KEPT (sometimes the only presence).
const BLOCK_HOSTS = [
  /(^|\.)google\./, /(^|\.)bing\./, /duckduckgo/, /(^|\.)wikipedia\.org$/, /wikimedia/,
  /tripadvisor\./, /yelp\./, /yellowpages\./, /truelocal\./, /gumtree\./, /roadtrippers\./,
  /ebay\./, /amazon\./, /etsy\.com$/, /booking\.com$/, /airbnb\./, /expedia\./, /stayz\./,
  /visitnsw\./, /visitvictoria\./, /visitqueensland\./, /southaustralia\.com$/, /westernaustralia\.com$/,
  /australia\.com$/, /margaretriver\.com$/, /experienceperthhills\./, /openhousehobart\./,
  /desart\.com/, /ankaaa\./, /iaca\.com/, /agsa\.sa\.gov/, /artistrunalliance/, /ariremix/,
  /art-almanac/, /artguide/, /tasmanianartsguide/, /salafestival/, /visitfremantle/,
  /facebook\.com\/.*\/(posts|events)/, /\.gov\.au$/, /canungratimes/, /newcastleherald/,
  /timeout\./, /broadsheet\./, /theurbanlist/, /concreteplayground/,
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
const normName = s => (s || '')
  .toLowerCase().replace(/['’`.]/g, '')
  .replace(/&amp;/g, '').replace(/\b(pty|ltd|co|company|inc|the)\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim()
const cleanName = raw => (raw || '').replace(/&amp;/g, '&').replace(/\s*\([^)]*\)\s*$/, '').trim()

function toCandidate(cfg, key, m) {
  const name = cleanName(m.name)
  if (!name) return null
  const state = VALID_STATES.has((m.state || '').toUpperCase()) ? m.state.toUpperCase() : null
  const town = (m.town || '').trim() || null
  const website_url = cleanUrl(m.website)
  const offers = Array.isArray(m.offers) ? m.offers.filter(Boolean) : []

  let confidence = 0.62
  if (website_url) confidence += 0.15
  if (state) confidence += 0.05
  if (town) confidence += 0.05
  if (offers.length) confidence += 0.03
  confidence = Math.min(0.9, +confidence.toFixed(2))

  const srcHost = hostOf(m.source_url) || 'editorial source'
  const notes = [
    (m.note || '').trim() || null,
    offers.length ? `Offers: ${offers.join(', ')}.` : null,
    `Source: ${m.source_url || 'n/a'}`,
  ].filter(Boolean).join(' ')

  return {
    name,
    region: town || (state ? STATE_NAMES[state] : null),
    state,
    website_url,
    vertical: cfg.vertical,
    confidence,
    source: 'web_search',
    source_detail: `Editorial curation — ${srcHost} (${cfg.label})`,
    notes,
    status: 'pending',
    lat: null, lng: null,
    phone: null,
    address: null,
    gate_results: { category: key },
    sub_type: key,
  }
}

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
  let { error } = await sb.from('listing_candidates').insert(c).select('id')
  if (error && /schema cache|column/.test(error.message)) {
    const { sub_type, ...base } = c
    ;({ error } = await sb.from('listing_candidates').insert({ ...base, gate_results: c.gate_results }).select('id'))
  }
  return error
}

function loadCategory(key) {
  const cfg = CONFIGS[key]
  let raw
  try { raw = JSON.parse(readFileSync(join(__dirname, 'data', cfg.file), 'utf-8')) }
  catch (e) { console.error(`  ⚠ cannot read ${cfg.file}: ${e.message}`); return [] }
  if (!Array.isArray(raw)) { console.error(`  ⚠ ${cfg.file} is not a JSON array`); return [] }
  return mergeDupes(raw.map(m => toCandidate(cfg, key, m)).filter(Boolean))
}

async function main() {
  const keys = CAT_ARG ? [CAT_ARG] : Object.keys(CONFIGS)
  if (CAT_ARG && !CONFIGS[CAT_ARG]) { console.error(`Unknown --category=${CAT_ARG}. Valid: ${Object.keys(CONFIGS).join(', ')}`); process.exit(1) }
  console.log(`\n📚 Editorial category seed — mode: ${DRY ? 'DRY-RUN' : 'APPLY'} — ${keys.join(', ')}\n`)

  const byCat = {}
  for (const key of keys) { byCat[key] = loadCategory(key) }
  const all = keys.flatMap(k => byCat[k])
  console.log(`${all.length} candidates across ${keys.length} categor${keys.length === 1 ? 'y' : 'ies'} (post within-file merge)`)

  const known = await existingNames()
  let totalFresh = 0
  const freshByCat = {}
  for (const key of keys) {
    freshByCat[key] = byCat[key].filter(c => !known.has(normName(c.name)))
    totalFresh += freshByCat[key].length
    const withSite = freshByCat[key].filter(c => c.website_url).length
    console.log(`\n── ${CONFIGS[key].emoji} ${key} (${CONFIGS[key].vertical}) — ${freshByCat[key].length} fresh / ${byCat[key].length} (${withSite} w/ website; ${byCat[key].length - freshByCat[key].length} already known) ──`)
    const byState = {}
    for (const c of freshByCat[key]) { (byState[c.state || '??'] ||= []).push(c) }
    for (const st of Object.keys(byState).sort()) console.log(`   ${st}: ${byState[st].length}`)
  }
  console.log(`\nTOTAL fresh to insert: ${totalFresh}`)

  if (DRY) { console.log('\n── DRY-RUN: no writes. Re-run without --dry-run to insert. ──'); return }

  console.log('\nInserting…')
  let ins = 0, skip = 0, err = 0
  for (const key of keys) {
    for (const c of freshByCat[key]) {
      const error = await insertOne(c)
      if (error) {
        if (error.code === '23505') { skip++ }
        else { err++; console.error(`  ✗ ${c.name}: ${error.message}`) }
      } else { ins++ }
    }
    console.log(`  ${CONFIGS[key].emoji} ${key}: done`)
  }
  console.log(`\nDone: ${ins} inserted, ${skip} dupes, ${err} errors.`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
