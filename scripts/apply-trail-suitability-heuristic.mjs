#!/usr/bin/env node

/**
 * Deterministic trail-suitability pass — the cheap, reviewable complement to
 * scripts/enrich-trail-suitability.mjs (which uses an LLM per listing).
 *
 * Problem: ~47% of active listings have trail_suitable = NULL (never classified).
 * The trail recommender (lib/trails/recommend.js) and the AI itinerary builder
 * treat NULL as "allowed", so genuine-but-unsuitable places — direct-sale farm
 * gates (e.g. "Australia's Manuka"), studio makers that are appointment/limited
 * access, online/mobile vendors with no fixed premises — surface as trail and
 * itinerary stops.
 *
 * These places are *visitable* (you can go there) but are not spontaneous
 * walk-in destinations, so the correct lever is trail_suitable=false, NOT
 * visitable=false. This pass sets trail_suitable=false for a tightly-scoped set
 * of sub_types / presence_types whose classified peers already lean strongly
 * "not trail suitable", and for the food-producer class the product owner
 * flagged directly (farm_gate). It is conservative by design:
 *
 *   - only fills rows where trail_suitable IS NULL (never overwrites an existing
 *     LLM/manual classification, true or false);
 *   - only ever sets FALSE (never flips a null to true — an unflagged null stays
 *     allowed, so we cannot wrongly EXCLUDE a good stop we were unsure about);
 *   - never touches accommodation (rest) — a hotel is legitimately not a daytime
 *     stop but is still needed as an overnight anchor in a multi-day plan.
 *
 * Usage:
 *   node scripts/apply-trail-suitability-heuristic.mjs --dry-run
 *   node scripts/apply-trail-suitability-heuristic.mjs
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Load .env.local (values are never printed).
try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
  }
} catch { /* env may already be present */ }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing Supabase env'); process.exit(1) }

const DRY_RUN = process.argv.includes('--dry-run')
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// Studio makers — make-on-site craft studios, typically appointment / limited
// public access. Their already-classified peers are 64–90% trail_suitable=false.
// visit_type -> 'workshop'.
const MAKER_SUBTYPES = [
  'ceramics_clay', 'jewellery_metalwork', 'wood_furniture', 'textile_fibre',
  'printmaking', 'stationery', 'knifemaker', 'leather', 'leatherwork',
]

// Direct-sale food/produce from the producer — a reason to detour for the
// dedicated, not a spontaneous stop. farm_gate is the owner-named exemplar.
// visit_type -> 'retail'.
const PRODUCER_SUBTYPES = ['farm_gate']

// No fixed, walk-in premises at all — cannot anchor a trail stop.
// visit_type -> 'workshop'.
const NO_PREMISES_PRESENCE = ['online', 'mobile']

async function applyUpdate(label, patch, filterFn) {
  let q = sb.from('listings').update(patch)
    .eq('status', 'active')
    .is('trail_suitable', null)
    .neq('vertical', 'rest') // never touch accommodation
  q = filterFn(q)
  q = q.select('id')
  if (DRY_RUN) {
    // Count what WOULD change without writing.
    let c = sb.from('listings').select('*', { count: 'exact', head: true })
      .eq('status', 'active').is('trail_suitable', null).neq('vertical', 'rest')
    c = filterFn(c)
    const { count, error } = await c
    console.log(`  [dry-run] ${label}: would update ${error ? 'ERR ' + error.message : count}`)
    return count || 0
  }
  const { data, error } = await q
  if (error) { console.log(`  ${label}: ERROR ${error.message}`); return 0 }
  console.log(`  ${label}: updated ${data.length}`)
  return data.length
}

async function main() {
  console.log(`\n=== Deterministic trail-suitability pass (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`)

  let total = 0
  total += await applyUpdate('studio makers (craft)',
    { trail_suitable: false, visit_type: 'workshop' },
    q => q.in('sub_type', MAKER_SUBTYPES))

  total += await applyUpdate('direct-sale producers (farm_gate)',
    { trail_suitable: false, visit_type: 'retail' },
    q => q.in('sub_type', PRODUCER_SUBTYPES))

  total += await applyUpdate('no fixed premises (online/mobile)',
    { trail_suitable: false, visit_type: 'workshop' },
    q => q.in('presence_type', NO_PREMISES_PRESENCE))

  console.log(`\n  Total ${DRY_RUN ? 'would change' : 'changed'}: ${total}\n`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
