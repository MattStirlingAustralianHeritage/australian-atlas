#!/usr/bin/env node
// ============================================================
// Seed the council_outreach directory from researched JSON files.
// ------------------------------------------------------------
// Usage:
//   node --env-file=.env.local scripts/seed-council-outreach.mjs [--dry-run] file1.json [file2.json ...]
//
// Each file is a JSON array of entries:
//   { council_name, state, website, region_slug, contact_email?, covers? }
//
// Behaviour:
//   * Region-links each row via region_slug → regions.id (name kept denormalised).
//   * Dedupes case-insensitively on (council_name, state) against the existing
//     directory and within the payload — re-running is safe and only adds.
//   * Light reachability probe per website (any HTTP response counts — many
//     council sites sit behind bot walls that 403 automated clients; that still
//     proves the domain is live). Failures are recorded in `notes`, the row is
//     still inserted, and the Discover pipeline will classify the site properly.
// ============================================================

import fs from 'node:fs'

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\\n/g, '').trim()
if (!URL_BASE || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local)')
  process.exit(1)
}

const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const files = args.filter((a) => a !== '--dry-run')
if (files.length === 0) {
  console.error('No input files given.')
  process.exit(1)
}

async function rest(path, opts = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) } })
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// Any HTTP response (even 403 from a WAF) proves the domain is live.
async function probe(website) {
  if (!website) return 'no_website'
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(website, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
    })
    clearTimeout(t)
    return `http_${res.status}`
  } catch {
    return 'unreachable'
  }
}

// ---- Load inputs ----
const entries = []
for (const f of files) {
  const parsed = JSON.parse(fs.readFileSync(f, 'utf8'))
  if (!Array.isArray(parsed)) throw new Error(`${f} is not a JSON array`)
  for (const e of parsed) entries.push({ ...e, _file: f })
}
console.log(`Loaded ${entries.length} entries from ${files.length} file(s)`)

// ---- Region lookup ----
const regions = await rest('regions?select=id,name,slug&limit=500')
const regionBySlug = new Map(regions.map((r) => [r.slug, r]))

// ---- Existing directory (dedup) ----
const existing = await rest('council_outreach?select=council_name,state&limit=5000')
const seen = new Set(existing.map((r) => `${(r.council_name || '').toLowerCase()}|${r.state || ''}`))
console.log(`Directory currently holds ${existing.length} councils`)

// ---- Build rows ----
const now = new Date().toISOString()
const toInsert = []
let duplicates = 0
let invalid = 0
let unmatchedRegion = 0
let unreachable = 0

for (const e of entries) {
  const name = (e.council_name || '').trim()
  if (!name) { invalid++; continue }
  const state = (e.state || '').trim().toUpperCase() || null
  const key = `${name.toLowerCase()}|${state || ''}`
  if (seen.has(key)) { duplicates++; continue }
  seen.add(key)

  const region = e.region_slug ? regionBySlug.get(String(e.region_slug).trim()) : null
  if (e.region_slug && !region) { unmatchedRegion++; console.warn(`  ! no region match for slug '${e.region_slug}' (${name})`) }

  const website = (e.website || '').trim() || null
  const reach = await probe(website)
  if (reach === 'unreachable') { unreachable++; console.warn(`  ! ${name}: ${website} did not respond`) }

  const email = (e.contact_email || '').trim().toLowerCase() || null
  toInsert.push({
    council_name: name,
    state,
    website,
    region_id: region?.id || null,
    region_name: region?.name || null,
    covers: (e.covers || '').trim() || null,
    contact_email: email,
    email_source: email ? 'import' : null,
    status: 'not_contacted',
    notes: reach === 'unreachable' ? 'Website did not respond during seeding — verify before relying on Discover.' : null,
    created_at: now,
    updated_at: now,
  })
  process.stdout.write(`  + ${name} (${state || '?'}) → ${region?.name || 'no region'} [${reach}]\n`)
}

console.log(`\nPlan: insert ${toInsert.length} · skip ${duplicates} duplicates · ${invalid} invalid · ${unmatchedRegion} unmatched region slugs · ${unreachable} unreachable sites`)

if (dryRun) {
  console.log('Dry run — nothing written.')
  process.exit(0)
}

// ---- Insert in chunks ----
let inserted = 0
for (let i = 0; i < toInsert.length; i += 100) {
  const chunk = toInsert.slice(i, i + 100)
  await rest('council_outreach', { method: 'POST', body: JSON.stringify(chunk), headers: { Prefer: 'return=minimal' } })
  inserted += chunk.length
}
console.log(`Inserted ${inserted} councils. Done.`)
