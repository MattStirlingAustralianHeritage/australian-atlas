#!/usr/bin/env node
// ============================================================
// Seed the press_outreach directory from researched JSON files.
// ------------------------------------------------------------
// Usage:
//   node --env-file=.env.local scripts/seed-press-outreach.mjs [--dry-run] file1.json [file2.json ...]
//
// Each file is a JSON array of entries:
//   { kind?, outlet_name, journalist_name?, role_title?, beat?(array|string),
//     state?, website?, contact_email?, twitter?, region_slug?, source_url? }
//
// Behaviour:
//   * kind defaults to 'journalist' when a journalist_name is present, else 'desk'.
//   * beat is normalised to a lower-cased text[]; state upper-cased; email lower-cased.
//   * Region-links each row via region_slug → regions.id when given (name kept
//     denormalised); most press rows have no region and that's fine.
//   * Dedupes case-insensitively on (outlet_name, journalist_name, contact_email)
//     against the existing directory and within the payload — re-running is safe
//     and only adds. Emails are NEVER invented here: a row with no verified email
//     is inserted with contact_email null, and the Discover pipeline fills it later.
//   * email_source is stamped 'seed' when an email is present (provenance).
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

const KINDS = new Set(['desk', 'journalist'])
const VALID_EMAIL = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9.-]+\.[a-z]{2,24}$/i

function normBeat(raw) {
  const list = Array.isArray(raw) ? raw : (raw ? String(raw).split(/[;,]/) : [])
  const out = []
  for (const b of list) {
    const v = String(b).trim().toLowerCase()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

const keyOf = (outlet, journalist, email) =>
  `${(outlet || '').toLowerCase()}|${(journalist || '').toLowerCase()}|${(email || '').toLowerCase()}`

// ---- Load + merge input files ----
const raw = []
for (const f of files) {
  const parsed = JSON.parse(fs.readFileSync(f, 'utf8'))
  if (!Array.isArray(parsed)) { console.error(`${f} is not a JSON array — skipped`); continue }
  raw.push(...parsed)
  console.log(`Loaded ${parsed.length} from ${f}`)
}
console.log(`Total raw rows: ${raw.length}`)

// ---- Existing directory + region maps ----
const existing = await rest('press_outreach?select=outlet_name,journalist_name,contact_email&limit=10000')
const seen = new Set((existing || []).map((r) => keyOf(r.outlet_name, r.journalist_name, r.contact_email)))
console.log(`Existing directory rows: ${(existing || []).length}`)

const regions = await rest('regions?select=id,name,slug')
const bySlug = new Map((regions || []).map((r) => [r.slug, r]))

// ---- Build insert set ----
const toInsert = []
let skippedDup = 0
let skippedInvalid = 0
let droppedBadEmail = 0

for (const r of raw) {
  const outlet = (r.outlet_name || '').trim()
  if (!outlet) { skippedInvalid++; continue }
  const journalist = (r.journalist_name || '').trim() || null
  let email = (r.contact_email || '').trim().toLowerCase() || null
  // Guard: never seed a malformed / obviously fake address — leave null for Discover.
  if (email && !VALID_EMAIL.test(email)) { droppedBadEmail++; email = null }
  const key = keyOf(outlet, journalist, email)
  if (seen.has(key)) { skippedDup++; continue }
  seen.add(key)

  const region = (r.region_slug && bySlug.get(String(r.region_slug).trim())) || null
  const kind = KINDS.has(r.kind) ? r.kind : (journalist ? 'journalist' : 'desk')

  toInsert.push({
    kind,
    outlet_name: outlet,
    journalist_name: journalist,
    role_title: (r.role_title || '').trim() || null,
    beat: normBeat(r.beat),
    state: (r.state || '').trim().toUpperCase() || null,
    region_id: region?.id || null,
    region_name: region?.name || (r.region_name ? String(r.region_name).trim() : null),
    website: (r.website || '').trim() || null,
    contact_email: email,
    twitter: (r.twitter || '').trim() || null,
    email_source: email ? 'seed' : null,
    notes: r.source_url ? `source: ${String(r.source_url).slice(0, 300)}` : null,
    status: 'not_contacted',
  })
}

const withEmail = toInsert.filter((r) => r.contact_email).length
const desks = toInsert.filter((r) => r.kind === 'desk').length
const journalists = toInsert.filter((r) => r.kind === 'journalist').length

console.log('\n── Plan ──')
console.log(`  to insert:        ${toInsert.length}`)
console.log(`    journalists:    ${journalists}`)
console.log(`    desks:          ${desks}`)
console.log(`    with email:     ${withEmail}`)
console.log(`  skipped duplicate:${skippedDup}`)
console.log(`  skipped invalid:  ${skippedInvalid}`)
console.log(`  dropped bad email:${droppedBadEmail} (kept row, email nulled)`)

if (dryRun) {
  console.log('\n[dry-run] no writes performed.')
  process.exit(0)
}

if (toInsert.length === 0) {
  console.log('\nNothing new to insert.')
  process.exit(0)
}

// Insert in chunks (PostgREST handles arrays; keep payloads modest).
let inserted = 0
const CHUNK = 100
for (let i = 0; i < toInsert.length; i += CHUNK) {
  const chunk = toInsert.slice(i, i + CHUNK)
  await rest('press_outreach', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(chunk),
  })
  inserted += chunk.length
  console.log(`  inserted ${inserted}/${toInsert.length}`)
}

console.log(`\n✓ Seeded ${inserted} press contacts (${withEmail} with a verified email).`)
