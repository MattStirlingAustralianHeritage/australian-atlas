#!/usr/bin/env node
// ============================================================
// Scan open review candidates (pending / reviewing) for ones that already
// duplicate something on the network — a published listing or another open
// candidate. This is the backward-looking complement to the creation
// guardrail (lib/candidates/duplicateCheck.mjs): the guardrail stops NEW
// duplicates; this surfaces any that slipped in before it existed.
//
// Read-only by default (prints a report).
//   node scripts/scan-duplicate-candidates.mjs
//
// --apply conservatively rejects ONLY the unambiguous cases — an open
// candidate that exact-name- or URL-matches a published LISTING — by setting
// status='rejected' (reversible) with an audit note. Fuzzy / coordinate /
// candidate-vs-candidate matches are reported but never auto-actioned.
//   node scripts/scan-duplicate-candidates.mjs --apply
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { findDuplicateIn, verticalLabel } from '../lib/candidates/duplicateCheck.mjs'

const APPLY = process.argv.includes('--apply')

const envText = readFileSync('.env.local', 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const PAGE = 1000

async function fetchAll(table, columns, filter) {
  let rows = []
  let offset = 0
  while (true) {
    let q = sb.from(table).select(columns).order('name').range(offset, offset + PAGE - 1)
    q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    rows = rows.concat(data)
    offset += data.length
    if (data.length < PAGE) break
  }
  return rows
}

async function main() {
  console.log(APPLY ? '=== SCAN (APPLY) ===' : '=== SCAN (read-only) ===\n')

  const listings = await fetchAll(
    'listings',
    'id, name, slug, vertical, website, state, lat, lng, status',
    q => q.neq('status', 'deleted'),
  )
  const candidates = await fetchAll(
    'listing_candidates',
    'id, name, vertical, website_url, state, lat, lng, status, source, created_at',
    q => q.in('status', ['pending', 'reviewing']),
  )
  console.log(`Loaded ${listings.length} live listings and ${candidates.length} open candidates.\n`)

  const flagged = []
  for (const c of candidates) {
    const { duplicate } = findDuplicateIn(
      { name: c.name, website_url: c.website_url, vertical: c.vertical, state: c.state, lat: c.lat, lng: c.lng },
      { listings, candidates },
      { excludeCandidateId: c.id },
    )
    if (duplicate) flagged.push({ candidate: c, duplicate })
  }

  // Report, grouped by what they collided with.
  const byKindType = {}
  for (const f of flagged) {
    const key = `${f.duplicate.kind}/${f.duplicate.matchType}`
    byKindType[key] = (byKindType[key] || 0) + 1
  }

  console.log(`${flagged.length} of ${candidates.length} open candidates look like duplicates:\n`)
  for (const [key, n] of Object.entries(byKindType).sort()) {
    console.log(`  ${String(n).padStart(4)}  ${key}`)
  }
  console.log('')

  for (const { candidate: c, duplicate: d } of flagged) {
    const conf = d.matchType === 'exact_name' || d.matchType === 'url' ? 'HIGH' : 'maybe'
    console.log(`[${conf}] "${c.name}" (${verticalLabel(c.vertical)}${c.state ? `, ${c.state}` : ''}, cand ${c.id.slice(0, 8)})`)
    console.log(`        ↳ ${d.message}${d.kind === 'listing' && d.slug ? `  [${d.vertical}/${d.slug}]` : ''}`)
  }

  // Conservative auto-clean: only exact-name / URL matches against a LISTING.
  const autoClearable = flagged.filter(f =>
    f.duplicate.kind === 'listing' && (f.duplicate.matchType === 'exact_name' || f.duplicate.matchType === 'url'))

  console.log(`\n${autoClearable.length} are unambiguous listing duplicates (exact name / URL) — safe to auto-reject.`)

  if (!APPLY) {
    console.log('\nRead-only. Re-run with --apply to reject the unambiguous listing duplicates.')
    return
  }

  let rejected = 0
  for (const { candidate: c, duplicate: d } of autoClearable) {
    const note = `[Auto-rejected ${new Date().toISOString().split('T')[0]}: duplicate of listing ${d.vertical}/${d.slug || d.id} — ${d.matchType}]`
    const { error } = await sb
      .from('listing_candidates')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), notes: note })
      .eq('id', c.id)
      .in('status', ['pending', 'reviewing']) // never touch one already actioned mid-run
    if (error) console.error(`  ✗ ${c.name}: ${error.message}`)
    else rejected++
  }
  console.log(`\nRejected ${rejected} duplicate candidate(s).`)
}

main().catch(err => { console.error(err); process.exit(1) })
