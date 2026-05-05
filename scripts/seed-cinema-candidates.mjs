#!/usr/bin/env node
/**
 * Seed Culture Atlas cinema and drive-in candidates into listing_candidates.
 *
 * Pipeline:
 *   1. Load + validate scripts/data/cinema-candidates.json
 *   2. Chain filter against commercial_groups (cinema-scoped rows only)
 *      — non-negotiable: Dendy Newtown must be rejected, otherwise abort
 *   3. Dedup against existing collection-vertical listings (by name + host)
 *   4. Dedup against existing collection-vertical candidates (by name)
 *   5. URL liveness HEAD check, 5s timeout, 1 req/sec
 *   6. Insert (or report, with --dry-run)
 *
 * Usage:
 *   node scripts/seed-cinema-candidates.mjs --dry-run
 *   node scripts/seed-cinema-candidates.mjs
 *
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

config({ path: '.env.local' })

const __dirname = dirname(fileURLToPath(import.meta.url))

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DRY_RUN = process.argv.includes('--dry-run')
const DATA_PATH = join(__dirname, 'data', 'cinema-candidates.json')
const SOURCE_DETAIL = 'culture_atlas_cinema_seed_2026_05'
const SMOKE_TEST_NAME = 'Dendy Newtown'

const REQUIRED_FIELDS = ['name', 'website_url', 'region', 'state', 'suburb', 'category', 'description', 'confidence', 'notes']
const VALID_CATEGORIES = new Set(['cinema', 'drive_in'])

// ─── Helpers ────────────────────────────────────────────────────

/** Parse a URL and return its hostname, lowercased and with leading "www." stripped. */
function parseHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.startsWith('www.') ? host.slice(4) : host
  } catch {
    return null
  }
}

/** Sleep N ms. */
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** Lower-trim a string for case-insensitive equality. */
const lt = (s) => (s || '').toLowerCase().trim()

// ─── Stage 1: Load + validate ───────────────────────────────────

function loadAndValidate() {
  let raw
  try {
    raw = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
  } catch (err) {
    console.error(`Failed to read/parse ${DATA_PATH}: ${err.message}`)
    process.exit(1)
  }

  if (!Array.isArray(raw)) {
    console.error('Data file must be a JSON array')
    process.exit(1)
  }

  const errors = []
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    for (const f of REQUIRED_FIELDS) {
      if (!(f in c) || c[f] === null || c[f] === '') {
        errors.push(`Row ${i} ("${c.name || '(no name)'}"): missing or empty field "${f}"`)
      }
    }
    if (c.category && !VALID_CATEGORIES.has(c.category)) {
      errors.push(`Row ${i} ("${c.name || '(no name)'}"): invalid category "${c.category}" (must be cinema or drive_in)`)
    }
    if (typeof c.confidence !== 'number' || c.confidence < 0 || c.confidence > 1) {
      errors.push(`Row ${i} ("${c.name || '(no name)'}"): invalid confidence ${c.confidence}`)
    }
  }

  if (errors.length) {
    console.error('\nValidation failed:')
    errors.forEach(e => console.error(`  ${e}`))
    process.exit(1)
  }

  return raw
}

// ─── Stage 2: Chain filter ──────────────────────────────────────

async function loadCinemaScopedGroups() {
  const { data, error } = await sb
    .from('commercial_groups')
    .select('group_name, brands, domains, vertical_scope, category')
    .or('category.eq.cinema,and(category.eq.hotel_accommodation,vertical_scope.cs.{collection})')

  if (error) {
    console.error(`Failed to load commercial_groups: ${error.message}`)
    process.exit(1)
  }
  return data || []
}

function chainCheck(candidate, groups) {
  const candName = lt(candidate.name)
  const candHost = parseHost(candidate.website_url)

  for (const g of groups) {
    if (lt(g.group_name) === candName) {
      return { matched: g.group_name, reason: `name == group_name "${g.group_name}"` }
    }
    if (Array.isArray(g.brands)) {
      for (const b of g.brands) {
        if (lt(b) === candName) return { matched: g.group_name, reason: `name == brand "${b}"` }
      }
    }
    if (candHost && Array.isArray(g.domains)) {
      for (const d of g.domains) {
        const norm = (d || '').toLowerCase().trim().replace(/^www\./, '')
        if (norm && norm === candHost) {
          return { matched: g.group_name, reason: `host "${candHost}" == domain "${d}"` }
        }
      }
    }
  }
  return null
}

// ─── Stage 3: Existing-listing dedup ────────────────────────────

async function loadCollectionListings() {
  // Paginate to be safe (PostgREST default cap is 1000).
  const all = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('listings')
      .select('name, website')
      .eq('vertical', 'collection')
      .range(from, from + pageSize - 1)
    if (error) {
      console.error(`Failed to load listings: ${error.message}`)
      process.exit(1)
    }
    all.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return all
}

function existingListingMatch(candidate, listings, listingHosts) {
  const candName = lt(candidate.name)
  const candHost = parseHost(candidate.website_url)

  for (const l of listings) {
    if (lt(l.name) === candName) {
      return { matchedName: l.name, reason: 'name match' }
    }
  }
  if (candHost) {
    const hit = listingHosts.get(candHost)
    if (hit) return { matchedName: hit, reason: `host "${candHost}" match` }
  }
  return null
}

// ─── Stage 4: Existing-candidate dedup ──────────────────────────

async function loadCollectionCandidates(loweredNames) {
  if (loweredNames.length === 0) return []
  const { data, error } = await sb
    .from('listing_candidates')
    .select('name, status')
    .eq('vertical', 'collection')
  if (error) {
    console.error(`Failed to load listing_candidates: ${error.message}`)
    process.exit(1)
  }
  const set = new Set(loweredNames)
  return (data || []).filter(c => set.has(lt(c.name)))
}

// ─── Stage 5: URL liveness ──────────────────────────────────────

async function checkUrl(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'AustralianAtlas/1.0 (cinema-seed-liveness)' },
      redirect: 'follow',
      signal: controller.signal,
    })
    // Some servers don't implement HEAD properly — fall back to GET on 405.
    if (res.status === 405) {
      res = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'AustralianAtlas/1.0 (cinema-seed-liveness)' },
        redirect: 'follow',
        signal: controller.signal,
      })
    }
    clearTimeout(timer)
    if (res.status >= 200 && res.status < 400) return { ok: true, status: res.status }
    return { ok: false, status: res.status, reason: `HTTP ${res.status}` }
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') return { ok: false, reason: 'timeout' }
    return { ok: false, reason: err.message || 'fetch error' }
  }
}

// ─── Stage 6: Insert ────────────────────────────────────────────

async function insertCandidate(candidate) {
  const row = {
    name: candidate.name,
    website_url: candidate.website_url,
    region: candidate.region,
    state: candidate.state,
    vertical: 'collection',
    confidence: candidate.confidence,
    source: 'web_search',
    source_detail: SOURCE_DETAIL,
    description: candidate.description,
    notes: candidate.notes,
    status: 'pending',
    pipeline_stage: 'discover',
    gate_results: { category: candidate.category },
  }
  const { error } = await sb.from('listing_candidates').insert(row)
  if (error) {
    if (error.code === '23505') return { outcome: 'already_exists' }
    return { outcome: 'error', error: error.message }
  }
  return { outcome: 'inserted' }
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log(`\nCulture Atlas — Cinema candidate seeder${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log('─'.repeat(60))

  // 1. Load + validate
  const candidates = loadAndValidate()
  console.log(`Loaded ${candidates.length} candidates`)
  const byCat = candidates.reduce((m, c) => (m[c.category] = (m[c.category] || 0) + 1, m), {})
  const byState = candidates.reduce((m, c) => (m[c.state] = (m[c.state] || 0) + 1, m), {})
  console.log(`  by category: ${Object.entries(byCat).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  console.log(`  by state:    ${Object.entries(byState).sort().map(([k, v]) => `${k}=${v}`).join(', ')}`)

  // 2. Chain filter
  console.log('\n[1/5] Chain filter (commercial_groups):')
  const groups = await loadCinemaScopedGroups()
  console.log(`  Loaded ${groups.length} cinema-scoped groups: ${groups.map(g => g.group_name).join(', ')}`)

  const chainRejected = []
  const surviving1 = []
  let normalisationFired = 0
  for (const c of candidates) {
    const rawHost = (() => {
      try { return new URL(c.website_url).hostname.toLowerCase() } catch { return '' }
    })()
    if (rawHost.startsWith('www.')) normalisationFired++
    const host = parseHost(c.website_url)
    const hit = chainCheck(c, groups)
    if (hit) {
      console.log(`  [CHAIN-REJECT] ${c.name} (${c.website_url} → host=${host || '(unparseable)'}) matched ${hit.matched}: ${hit.reason}`)
      chainRejected.push({ name: c.name, matched: hit.matched })
    } else {
      surviving1.push(c)
    }
  }
  console.log(`  → kept ${surviving1.length}, rejected ${chainRejected.length}`)
  console.log(`  www-stripping fired on ${normalisationFired} candidate URL(s)`)

  // SMOKE TEST — Dendy Newtown must have been chain-rejected.
  const smokePass = chainRejected.some(r => r.name === SMOKE_TEST_NAME)
  if (!smokePass) {
    console.error(`\nFATAL: smoke test failed — "${SMOKE_TEST_NAME}" was NOT chain-rejected.`)
    console.error('The chain filter is broken. No candidates will be inserted.')
    process.exit(2)
  }
  console.log(`  smoke test: PASS (${SMOKE_TEST_NAME} chain-rejected)`)

  // 3. Existing-listing dedup
  console.log('\n[2/5] Existing-listing dedup (collection vertical):')
  const listings = await loadCollectionListings()
  console.log(`  Loaded ${listings.length} existing collection listings`)
  const listingHosts = new Map()
  for (const l of listings) {
    const h = parseHost(l.website)
    if (h) listingHosts.set(h, l.name)
  }
  const dupListing = []
  const surviving2 = []
  for (const c of surviving1) {
    const m = existingListingMatch(c, listings, listingHosts)
    if (m) {
      console.log(`  [DUPLICATE-LISTING] ${c.name} matches existing listing ${m.matchedName} (${m.reason})`)
      dupListing.push({ name: c.name, matched: m.matchedName })
    } else {
      surviving2.push(c)
    }
  }
  console.log(`  → kept ${surviving2.length}, rejected ${dupListing.length}`)

  // 4. Existing-candidate dedup
  console.log('\n[3/5] Existing-candidate dedup (collection vertical):')
  const lowered = surviving2.map(c => lt(c.name))
  const existingCands = await loadCollectionCandidates(lowered)
  const existingByName = new Map()
  for (const e of existingCands) existingByName.set(lt(e.name), e.status)
  const dupPending = [], dupRejected = [], dupConverted = []
  const surviving3 = []
  for (const c of surviving2) {
    const status = existingByName.get(lt(c.name))
    if (status === 'pending' || status === 'reviewing') {
      console.log(`  [DUPLICATE-CANDIDATE-PENDING] ${c.name} already in queue`)
      dupPending.push(c.name)
    } else if (status === 'rejected') {
      console.log(`  [DUPLICATE-CANDIDATE-REJECTED] ${c.name} previously rejected — skipping`)
      dupRejected.push(c.name)
    } else if (status === 'converted') {
      console.log(`  [DUPLICATE-CANDIDATE-CONVERTED] ${c.name} already approved as listing — skipping`)
      dupConverted.push(c.name)
    } else {
      surviving3.push(c)
    }
  }
  console.log(`  → kept ${surviving3.length}, rejected ${dupPending.length + dupRejected.length + dupConverted.length} (pending=${dupPending.length}, rejected=${dupRejected.length}, converted=${dupConverted.length})`)

  // 5. URL liveness
  console.log(`\n[4/5] URL liveness (HEAD, 5s timeout, 1 req/sec) — ${surviving3.length} URLs:`)
  const dead = []
  const surviving4 = []
  for (let i = 0; i < surviving3.length; i++) {
    const c = surviving3[i]
    const result = await checkUrl(c.website_url)
    if (result.ok) {
      surviving4.push(c)
      process.stdout.write(`\r  Checked ${i + 1}/${surviving3.length} — ${c.name} ${result.status}                              `)
    } else {
      console.log(`\n  [DEAD-URL] ${c.name} ${c.website_url} → ${result.reason}`)
      dead.push({ name: c.name, url: c.website_url, reason: result.reason })
    }
    if (i < surviving3.length - 1) await sleep(1000)
  }
  console.log(`\n  → kept ${surviving4.length}, rejected ${dead.length}`)

  // 6. Insert (or report)
  console.log(`\n[5/5] ${DRY_RUN ? 'Insert plan (dry run)' : 'Inserting'}: ${surviving4.length} candidates`)
  let inserted = 0, alreadyExists = 0, errors = 0
  if (DRY_RUN) {
    for (const c of surviving4) {
      console.log(`  [WOULD-INSERT] ${c.name} (${c.category}) ${c.suburb}, ${c.state} — ${c.website_url}`)
    }
  } else {
    for (const c of surviving4) {
      const r = await insertCandidate(c)
      if (r.outcome === 'inserted') {
        inserted++
        console.log(`  [INSERTED] ${c.name}`)
      } else if (r.outcome === 'already_exists') {
        alreadyExists++
        console.log(`  [ALREADY-EXISTS] ${c.name}`)
      } else {
        errors++
        console.log(`  [ERROR] ${c.name}: ${r.error}`)
      }
    }
  }

  // Summary
  console.log('\n=== Cinema seed summary ===')
  console.log(`Loaded:              ${candidates.length} candidates`)
  console.log(`Chain-rejected:      ${chainRejected.length}`)
  console.log(`Duplicate listing:   ${dupListing.length}`)
  console.log(`Duplicate pending:   ${dupPending.length}`)
  console.log(`Duplicate rejected:  ${dupRejected.length}`)
  console.log(`Duplicate converted: ${dupConverted.length}`)
  console.log(`Dead URL:            ${dead.length}`)
  if (DRY_RUN) {
    console.log(`Would insert:        ${surviving4.length}`)
  } else {
    console.log(`Already exists:      ${alreadyExists} (23505 hits)`)
    console.log(`Inserted:            ${inserted}`)
    if (errors) console.log(`Errors:              ${errors}`)
  }
  console.log(`\nSmoke test (${SMOKE_TEST_NAME} chain reject): ${smokePass ? 'PASS' : 'FAIL'}`)
}

main().catch(err => {
  console.error('\nFatal error:', err)
  process.exit(1)
})
