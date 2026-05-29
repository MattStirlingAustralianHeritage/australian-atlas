#!/usr/bin/env node

/**
 * scripts/pitch-generate.mjs
 *
 * Phase 2 of the pitch system per docs/pitch-system-design.md — takes one or
 * more listing IDs (or slugs), runs the full Phase 2 pipeline against each,
 * and either writes successful pitches to the queue (production) or prints
 * the structured pitch + fact-check trace + confidence breakdown to stdout
 * (dry-run).
 *
 * GATE 1 USAGE (required: --dry-run, ≤ 5 listings, run with the editor at
 * the keyboard):
 *
 *   node scripts/pitch-generate.mjs \
 *     --dry-run \
 *     --listing-slug=turkey-flat-vineyards \
 *     --listing-slug=bream-creek-vineyard \
 *     --listing-slug=...
 *
 * PRODUCTION (writes to the pitches table; requires pitch_slots to be
 * seeded):
 *
 *   node scripts/pitch-generate.mjs \
 *     --listing-id=<uuid> \
 *     --slot-type=general
 *
 * The script never seeds pitch_slots. If no available slot exists for the
 * (vertical, slot_type), the pipeline returns 'no_slot_available' and the
 * candidate is skipped — slot seeding is a separate cleanup task.
 *
 * Env loading uses the hand-rolled loadEnv() pattern that the rest of the
 * project's scripts use (see scripts/generate-editorial-brief.mjs). Node's
 * built-in --env-file parser failed on this project's .env.local during the
 * Phase 2 build; the hand-rolled parser is permissive enough to work around
 * whatever line shape was tripping the built-in. Running with --env-file is
 * NOT required.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { runPipeline } from '../lib/pitch/pipeline.mjs'
import { sumUsage, estimateCost, formatUsage } from '../lib/pitch/usage.mjs'

// ── Env loading ─────────────────────────────────────────────────────────────
//
// Uses the inline-regex parsing body that the project's _check_*.mjs scripts
// use (strips wrapping double or single quotes from values). Not the
// generate-editorial-brief.mjs loadEnv() body — that variant does NOT strip
// quotes and silently fails when .env.local has quoted values, which is the
// current shape of this project's .env.local. The codebase has two competing
// env-loading patterns; this is the one that works. Cleanup tracked separately.

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      process.env[m[1]] = v
    }
  } catch {}
}
loadEnv()

// ── CLI arg parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const listingIds = []
const listingSlugs = []
let slotType = 'general'
let dryRun = false

for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    printUsage()
    process.exit(0)
  } else if (arg === '--dry-run') {
    dryRun = true
  } else if (arg.startsWith('--listing-id=')) {
    listingIds.push(arg.slice('--listing-id='.length))
  } else if (arg.startsWith('--listing-slug=')) {
    listingSlugs.push(arg.slice('--listing-slug='.length))
  } else if (arg.startsWith('--slot-type=')) {
    slotType = arg.slice('--slot-type='.length)
  } else {
    console.error(`Unknown argument: ${arg}`)
    printUsage()
    process.exit(1)
  }
}

if (listingIds.length === 0 && listingSlugs.length === 0) {
  console.error('At least one --listing-id or --listing-slug is required.\n')
  printUsage()
  process.exit(1)
}

if (slotType !== 'general' && slotType !== 'new_producer') {
  console.error(`Invalid --slot-type "${slotType}". Must be 'general' or 'new_producer'.`)
  process.exit(1)
}

// Soft warning when running without --dry-run. The script will still proceed —
// the user asked for an explicit flag, not a confirmation prompt — but a banner
// makes accidental production runs visible.
if (!dryRun) {
  console.error('━'.repeat(72))
  console.error('  PRODUCTION MODE — pitches will be written to the database.')
  console.error('  Use --dry-run for Gate 1 calibration and review passes.')
  console.error('━'.repeat(72))
  console.error('')
}

// ── Supabase client ─────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  process.exit(1)
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
})

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Resolve slugs to IDs first so the candidate list is uniform.
  const resolvedIds = [...listingIds]
  for (const slug of listingSlugs) {
    const { data, error } = await supabase
      .from('listings')
      .select('id, slug')
      .eq('slug', slug)
      .maybeSingle()
    if (error) {
      console.error(`Failed to resolve slug "${slug}": ${error.message}`)
      process.exit(1)
    }
    if (!data) {
      console.error(`No listing found for slug "${slug}".`)
      process.exit(1)
    }
    resolvedIds.push(data.id)
  }

  const t0 = Date.now()
  const summary = {
    total: resolvedIds.length,
    dry_run: dryRun,
    slot_type: slotType,
    outcomes: [],
  }
  const usages = []

  let i = 0
  for (const listingId of resolvedIds) {
    i++
    console.log(`\n${'═'.repeat(72)}`)
    console.log(`  Candidate ${i}/${resolvedIds.length} — listing_id=${listingId}`)
    console.log(`${'═'.repeat(72)}`)

    const candidate = { listingId, slotType, candidateScore: null }
    let result
    try {
      result = await runPipeline(candidate, { supabase, dryRun })
    } catch (err) {
      console.error(`\n  ✗ Pipeline threw: ${err?.stack || err?.message || String(err)}\n`)
      summary.outcomes.push({ listing_id: listingId, kind: 'pipeline_error', error: err?.message })
      continue
    }

    summary.outcomes.push({ listing_id: listingId, kind: result.kind })
    printResult(result, listingId)
    if (result.usage) {
      usages.push(result.usage)
      console.log(`\n    ${formatUsage('tokens', result.usage)}`)
    }
  }

  const totalUsage = sumUsage(usages)
  console.log(`\n${'━'.repeat(72)}`)
  console.log('  Run summary')
  console.log(`${'━'.repeat(72)}`)
  console.log(`  Total candidates:  ${summary.total}`)
  console.log(`  Mode:              ${dryRun ? 'DRY-RUN (no DB writes)' : 'PRODUCTION'}`)
  console.log(`  Slot type:         ${slotType}`)
  console.log(`  Elapsed:           ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`  Outcomes:`)
  const counts = {}
  for (const o of summary.outcomes) counts[o.kind] = (counts[o.kind] || 0) + 1
  for (const [kind, n] of Object.entries(counts).sort()) {
    console.log(`    ${kind.padEnd(28)} ${n}`)
  }
  console.log(`  Tokens:            in=${totalUsage.input_tokens} out=${totalUsage.output_tokens} ` +
    `cache_w=${totalUsage.cache_creation_input_tokens} cache_r=${totalUsage.cache_read_input_tokens}`)
  console.log(`  Est. cost:         $${estimateCost(totalUsage).toFixed(4)} (Sonnet 4.6 rates)`)
  console.log('')
}

// ── Result rendering ────────────────────────────────────────────────────────

function printResult(result, listingId) {
  switch (result.kind) {
    case 'dry_run':
      printDryRun(result)
      break
    case 'wrote_pitch':
      console.log(`\n  ✓ Pitch written.`)
      console.log(`    pitch_id:        ${result.pitch_id}`)
      console.log(`    slot_id:         ${result.slot_id}`)
      console.log(`    confidence:      ${result.confidence.score}/90`)
      console.log(`    fact_check:      passed`)
      console.log(`    verification:    passed (0 flags) — prose gate cleared`)
      break
    case 'insufficient_data':
      console.log(`\n  ⊘ INSUFFICIENT DATA — model declined to ground a pitch.`)
      console.log(`    Reason:          ${result.reason}`)
      console.log(`    Attempts:        ${result.attempts}`)
      console.log(`    Logged:          ${result.logged ? 'yes (pitch_generation_failures)' : 'no (dry-run)'}`)
      break
    case 'fact_check_failed':
      console.log(`\n  ✗ FACT-CHECK FAILED — pitch not written.`)
      console.log(`    Reason:          ${result.reason}`)
      console.log(`    Attempts:        ${result.attempts}`)
      if (Array.isArray(result.failed_claims) && result.failed_claims.length) {
        console.log(`    Failed claims (final attempt):`)
        for (const c of result.failed_claims) {
          console.log(`      ✗ "${truncate(c.fact?.claim ?? c.claim, 80)}"`)
          console.log(`          field=${c.fact?.field ?? c.field}  reason=${c.reason}`)
          console.log(`          source_value=${truncate(JSON.stringify(c.source_value), 80)}`)
        }
      }
      console.log(`    Logged:          ${result.logged ? 'yes (pitch_generation_failures)' : 'no (dry-run)'}`)
      break
    case 'verification_failed':
      console.log(`\n  ✗ PROSE VERIFICATION FAILED — pitch not written.`)
      console.log(`    Reason:          ${result.reason}`)
      console.log(`    Attempts:        ${result.attempts}`)
      console.log(`    Verify error:    ${result.verify_error ? 'YES — verification call threw; failed closed' : 'no'}`)
      if (Array.isArray(result.flags) && result.flags.length) {
        console.log(`    Flagged claims (final attempt):`)
        for (const f of result.flags) {
          console.log(`      ⚑ "${truncate(f.claim, 80)}"`)
          console.log(`          ${f.reason}`)
        }
      }
      console.log(`    Logged:          no (enum has no 'verification_failed'; surfaced to caller)`)
      break
    case 'llm_error':
      console.log(`\n  ✗ LLM ERROR — Anthropic call failed.`)
      console.log(`    Error:           ${result.error}`)
      console.log(`    Attempts:        ${result.attempts}`)
      console.log(`    Logged:          ${result.logged ? 'yes' : 'no (dry-run)'}`)
      break
    case 'no_slot_available':
      console.log(`\n  ⚠ NO SLOT AVAILABLE — no empty (vertical=${result.vertical}, slot_type=${result.slot_type}) slot exists.`)
      console.log(`    ${result.note}`)
      break
    case 'listing_not_found':
      console.log(`\n  ✗ LISTING NOT FOUND — id=${result.listing_id}`)
      break
    default:
      console.log(`\n  ? Unknown result kind: ${result.kind}`)
      console.log(JSON.stringify(result, null, 2))
  }
}

function printDryRun(result) {
  const p = result.pitch_data
  console.log(`\n  ✓ Dry-run produced a fact-checked pitch.`)
  console.log(`    Generated by:    ${result.generated_by}`)
  console.log(`    Prompt version:  ${result.prompt_version}`)
  console.log(`    Generated at:    ${result.generated_at}`)
  console.log(`\n    HEADLINE`)
  console.log(`    ────────`)
  console.log(`    ${p.headline}`)
  console.log(`\n    ANGLE`)
  console.log(`    ─────`)
  console.log(indent(p.angle, '    '))
  console.log(`\n    ANCHOR LISTING`)
  console.log(`    ──────────────`)
  console.log(`    ${p.anchor_listing.name} (${p.anchor_listing.vertical} — ${p.anchor_listing.region})`)
  console.log(`    slug: ${p.anchor_listing.slug}`)
  console.log(`    id:   ${p.anchor_listing.id}`)
  if (p.supporting_listings?.length > 0) {
    console.log(`\n    SUPPORTING LISTINGS`)
    console.log(`    ───────────────────`)
    for (const s of p.supporting_listings) {
      console.log(`    • ${s.name} (${s.vertical}) — ${s.contribution}`)
    }
  }
  console.log(`\n    VERIFIED FACTS (${p.verified_facts.length})`)
  console.log(`    ${'─'.repeat(16 + String(p.verified_facts.length).length)}`)
  for (const f of p.verified_facts) {
    console.log(`    ✓ "${f.claim}"`)
    console.log(`        → field: ${f.field}`)
    console.log(`        → value: ${truncate(JSON.stringify(f.value), 100)}`)
  }
  console.log(`\n    EDITORIAL FRAMING`)
  console.log(`    ─────────────────`)
  console.log(indent(p.editorial_framing, '    '))
  if (p.research_needed?.length > 0) {
    console.log(`\n    RESEARCH NEEDED (${p.research_needed.length})`)
    console.log(`    ${'─'.repeat(17 + String(p.research_needed.length).length)}`)
    for (const r of p.research_needed) {
      console.log(`    • ${r}`)
    }
  }
  console.log(`\n    FACT-CHECK`)
  console.log(`    ──────────`)
  console.log(`    passed: ${result.fact_check?.passed ? 'YES — all ' + p.verified_facts.length + ' claims trace to the source record' : 'NO'}`)
  console.log(`\n    PROSE VERIFICATION`)
  console.log(`    ──────────────────`)
  console.log(`    passed: ${result.verification?.passed ? 'YES — no derivation / inference / recombination / absent claims in the prose' : 'NO'}`)
  if (result.verification && !result.verification.passed) {
    for (const f of (result.verification.flags || [])) {
      console.log(`      ⚑ "${truncate(f.claim, 80)}"`)
      console.log(`          ${f.reason}`)
    }
  }
  console.log(`\n    CONFIDENCE`)
  console.log(`    ──────────`)
  console.log(`    score: ${result.confidence.score}/90  (single-anchor max is 75)`)
  for (const [signal, value] of Object.entries(result.confidence.breakdown)) {
    const marker = value > 0 ? '✓' : '·'
    console.log(`    ${marker} ${signal.padEnd(28)} +${value}`)
  }
}

function indent(text, prefix) {
  return String(text || '').split('\n').map(l => prefix + l).join('\n')
}

function truncate(s, n) {
  if (s == null) return '<null>'
  const str = String(s)
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}

function printUsage() {
  console.log(`Usage:
  node scripts/pitch-generate.mjs [options]

The script loads env vars from ./.env.local automatically (no --env-file
flag required). NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
ANTHROPIC_API_KEY must be set there.

Options:
  --listing-id=<uuid>        Listing UUID to generate a pitch for (repeatable).
  --listing-slug=<slug>      Listing slug to resolve to a UUID (repeatable).
  --slot-type=<type>         general (default) | new_producer.
  --dry-run                  Skip all DB writes. Print pitch + fact-check
                             trace + confidence breakdown to stdout. REQUIRED
                             for Gate 1 calibration and any review pass.
  -h, --help                 Show this help.

Gate 1 example (the editor names five listings, runs dry-run, traces every
claim back to source data):
  node scripts/pitch-generate.mjs \\
    --dry-run \\
    --slot-type=general \\
    --listing-slug=turkey-flat-vineyards \\
    --listing-slug=bream-creek-vineyard \\
    --listing-slug=patricia-vineyards \\
    --listing-slug=cobaw-ridge \\
    --listing-slug=kilikanoon-wines

Production:
  - Slots must be seeded in pitch_slots first (separate cleanup task).
  - Without --dry-run, pitches are inserted with fact_check_passed = true and
    the matching pitch_slots row is updated with current_pitch_id.
  - LLM errors, insufficient_data responses, and fact-check failures are
    logged to pitch_generation_failures.
`)
}

main().catch(err => {
  console.error('Fatal:', err?.stack || err?.message || String(err))
  process.exit(1)
})
