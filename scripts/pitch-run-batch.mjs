#!/usr/bin/env node

/**
 * scripts/pitch-run-batch.mjs
 *
 * Phase 2 batch runner. Wires Phase 1 scoring → Phase 2 generation across the
 * network in one bounded pass.
 *
 * For each (vertical, slot_type) that has empty pitch_slots, it:
 *   1. Scores candidates by running the Phase 1 scorer
 *      (scripts/pitch-candidates.mjs) AS A SUBPROCESS. The scorer is the single
 *      source of truth for the tuned weights + disqualifiers + data floors; it
 *      already emits ranked candidates as JSON on stdout, and running it out of
 *      process sidesteps its top-level CLI side-effects (argv parse, env read,
 *      process.exit) that make it unsafe to `import`.
 *   2. Takes the top (K + margin) candidates, where K = the number of empty
 *      slots for that pair and margin (~30%, min 1) is headroom to absorb
 *      candidates the two-gate pipeline rejects.
 *   3. Runs each candidate through the full Phase 2 pipeline (generate →
 *      fact-check → prose verification gate → write), stopping the pair as soon
 *      as K slots are filled or the candidate list is exhausted.
 *
 * Bounded by construction: one scorer subprocess per pair + at most (K + margin)
 * pipeline runs per pair, under a global --max-runs ceiling. No cron, no
 * unbounded loops, no recursion.
 *
 * Source of truth: the scorer reads the master `listings` table only. This
 * runner NEVER touches the discovery tables.
 *
 * Note on `portal`: pitch_slots seeds a `portal` vertical, but the scorer does
 * not recognise it (the master/aggregator vertical has no first-class listing
 * pool of its own). Portal pairs are skipped and reported as unserved.
 *
 * Verification failures have no home in pitch_generation_failures (the
 * pitch_failure_mode enum has no 'verification_failed' value, and this build
 * cannot run DDL). They are written to the JSONL run log and surfaced in the
 * summary instead.
 *
 * Usage:
 *   node scripts/pitch-run-batch.mjs --dry-run            # no DB writes
 *   node scripts/pitch-run-batch.mjs                      # PRODUCTION (writes)
 *   node scripts/pitch-run-batch.mjs --vertical=craft     # restrict to one vertical
 *   node scripts/pitch-run-batch.mjs --margin=0.5         # wider reject headroom
 *   node scripts/pitch-run-batch.mjs --max-runs=20        # tighter global ceiling
 *
 * Env is loaded from ./.env.local (the same permissive parser the other Phase 2
 * scripts use). NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
 * ANTHROPIC_API_KEY must be set there.
 */

import { readFileSync, appendFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { runPipeline } from '../lib/pitch/pipeline.mjs'
import { sumUsage, estimateCost, formatUsage } from '../lib/pitch/usage.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCORER_PATH = resolve(__dirname, 'pitch-candidates.mjs')

// ── Env loading (matches scripts/pitch-generate.mjs) ─────────────────────────

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

// ── Config ───────────────────────────────────────────────────────────────────

// Verticals the Phase 1 scorer recognises (its VALID_VERTICALS). `portal` is
// intentionally absent — see the header note.
const SCORER_VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']
const SLOT_TYPES = ['general', 'new_producer']

// ── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
let dryRun = false
let onlyVertical = null
let margin = 0.3
let maxRuns = 45 // ~30% over the 30 seeded slots; a hard ceiling, not a target.

for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    printUsage()
    process.exit(0)
  } else if (arg === '--dry-run') {
    dryRun = true
  } else if (arg.startsWith('--vertical=')) {
    onlyVertical = arg.slice('--vertical='.length)
  } else if (arg.startsWith('--margin=')) {
    margin = parseFloat(arg.slice('--margin='.length))
  } else if (arg.startsWith('--max-runs=')) {
    maxRuns = parseInt(arg.slice('--max-runs='.length), 10)
  } else {
    console.error(`Unknown argument: ${arg}`)
    printUsage()
    process.exit(1)
  }
}

if (!Number.isFinite(margin) || margin < 0 || margin > 2) {
  console.error(`Invalid --margin "${margin}". Must be 0–2.`)
  process.exit(1)
}
if (!Number.isInteger(maxRuns) || maxRuns < 1 || maxRuns > 200) {
  console.error(`Invalid --max-runs "${maxRuns}". Must be 1–200.`)
  process.exit(1)
}
if (onlyVertical && !SCORER_VERTICALS.includes(onlyVertical)) {
  console.error(`Invalid --vertical "${onlyVertical}". Must be one of: ${SCORER_VERTICALS.join(', ')}`)
  process.exit(1)
}

// ── Clients ──────────────────────────────────────────────────────────────────

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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
const anthropicClient = new Anthropic({ apiKey: ANTHROPIC_KEY })

// JSONL run log — one line per pipeline run (no raw Anthropic payloads).
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-')
const LOG_PATH = resolve(__dirname, `../pitch-run-${RUN_ID}.jsonl`)

// ── Slot availability ────────────────────────────────────────────────────────

async function loadEmptySlotCounts() {
  const { data, error } = await supabase
    .from('pitch_slots')
    .select('vertical, slot_type, current_pitch_id')
    .is('current_pitch_id', null)
  if (error) throw new Error(`pitch_slots load failed: ${error.message}`)
  const counts = {} // `${vertical}/${slot_type}` → K
  for (const s of data) {
    const k = `${s.vertical}/${s.slot_type}`
    counts[k] = (counts[k] || 0) + 1
  }
  return counts
}

// ── Scorer subprocess ──────────────────────────────────────────────────────

function scoreCandidates(vertical, slotType, limit) {
  const res = spawnSync('node', [SCORER_PATH, vertical, slotType, String(limit)], {
    env: process.env,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (res.status !== 0) {
    const msg = (res.stderr || '').trim() || `exit code ${res.status}`
    throw new Error(`scorer failed for ${vertical}/${slotType}: ${msg}`)
  }
  let parsed
  try {
    parsed = JSON.parse(res.stdout)
  } catch (err) {
    throw new Error(`scorer for ${vertical}/${slotType} produced unparseable stdout: ${err.message}`)
  }
  return Array.isArray(parsed.candidates) ? parsed.candidates : []
}

// ── Logging ──────────────────────────────────────────────────────────────────

function logRun(record) {
  try {
    appendFileSync(LOG_PATH, JSON.stringify(record) + '\n')
  } catch (err) {
    console.error(`  (could not append to run log: ${err.message})`)
  }
}

// Compact, serialisable view of a pipeline result for the JSONL log. Drops the
// nested raw Anthropic Message; keeps the decision-relevant fields.
function compactResult(result) {
  const base = { kind: result.kind, usage: result.usage ?? null }
  switch (result.kind) {
    case 'wrote_pitch':
      return { ...base, pitch_id: result.pitch_id, slot_id: result.slot_id, confidence: result.confidence?.score }
    case 'dry_run':
      return { ...base, headline: result.pitch_data?.headline, confidence: result.confidence?.score }
    case 'fact_check_failed':
      return { ...base, reason: result.reason, attempts: result.attempts, failed_claims: result.failed_claims }
    case 'verification_failed':
      return { ...base, reason: result.reason, attempts: result.attempts, verify_error: result.verify_error, flags: result.flags }
    case 'insufficient_data':
      return { ...base, reason: result.reason, attempts: result.attempts }
    case 'llm_error':
      return { ...base, error: result.error, attempts: result.attempts }
    case 'bail_token_detected':
      return { ...base, bail: result.bail, attempts: result.attempts }
    case 'too_many_supporting_listings':
      return { ...base, count: result.count, attempts: result.attempts }
    case 'no_slot_available':
      return { ...base, vertical: result.vertical, slot_type: result.slot_type }
    case 'listing_not_found':
      return { ...base, listing_id: result.listing_id }
    default:
      return base
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now()

  if (!dryRun) {
    console.error('━'.repeat(72))
    console.error('  PRODUCTION MODE — pitches will be written to the database and')
    console.error('  empty pitch_slots will be filled. Use --dry-run to rehearse.')
    console.error('━'.repeat(72))
    console.error('')
  }

  const emptyCounts = await loadEmptySlotCounts()
  console.log(`Run ${RUN_ID}`)
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no DB writes)' : 'PRODUCTION'}  margin=${margin}  max-runs=${maxRuns}`)
  console.log(`Run log: ${LOG_PATH}`)
  console.log('')

  const verticals = onlyVertical ? [onlyVertical] : SCORER_VERTICALS

  // Per-vertical fill tally + global accounting.
  const fills = {}              // `${vertical}/${slot_type}` → count of pitches written/produced
  const outcomeCounts = {}      // kind → n
  const usages = []
  const gateRejections = []     // { vertical, slot_type, listing_id, kind, reason, flags?, failed_claims? }
  const usedListingIds = new Set()
  let totalRuns = 0
  let stoppedAtCap = false

  outer:
  for (const vertical of verticals) {
    for (const slotType of SLOT_TYPES) {
      const key = `${vertical}/${slotType}`
      const K = emptyCounts[key] || 0
      if (K === 0) continue

      const N = K + Math.max(1, Math.ceil(K * margin))
      console.log(`${'─'.repeat(72)}`)
      console.log(`${key}  (empty slots K=${K}, fetching top ${N})`)

      let candidates
      try {
        candidates = scoreCandidates(vertical, slotType, N)
      } catch (err) {
        console.log(`  ✗ ${err.message}`)
        continue
      }
      if (candidates.length === 0) {
        console.log(`  (no candidates passed the scorer's floor + disqualifiers)`)
        continue
      }

      let filled = 0
      for (const c of candidates) {
        if (filled >= K) break
        if (totalRuns >= maxRuns) { stoppedAtCap = true; break outer }

        const listingId = c.listing?.id
        if (!listingId) continue
        if (usedListingIds.has(listingId)) continue
        usedListingIds.add(listingId)

        totalRuns++
        const candidate = { listingId, slotType, vertical, candidateScore: c.score }
        let result
        try {
          result = await runPipeline(candidate, { supabase, anthropicClient, dryRun })
        } catch (err) {
          console.log(`  ✗ ${c.listing.name} — pipeline threw: ${err?.message ?? String(err)}`)
          outcomeCounts.pipeline_error = (outcomeCounts.pipeline_error || 0) + 1
          logRun({ ts: new Date().toISOString(), vertical, slot_type: slotType, listing_id: listingId, candidate_score: c.score, kind: 'pipeline_error', error: err?.message ?? String(err) })
          continue
        }

        outcomeCounts[result.kind] = (outcomeCounts[result.kind] || 0) + 1
        if (result.usage) usages.push(result.usage)
        logRun({ ts: new Date().toISOString(), vertical, slot_type: slotType, listing_id: listingId, candidate_score: c.score, ...compactResult(result) })

        if (result.kind === 'wrote_pitch' || result.kind === 'dry_run') {
          filled++
          fills[key] = (fills[key] || 0) + 1
          const conf = result.confidence?.score
          console.log(`  ✓ ${c.listing.name} → ${result.kind === 'wrote_pitch' ? 'pitch ' + result.pitch_id : 'dry-run pitch'} (score=${c.score}, confidence=${conf})`)
        } else if (result.kind === 'fact_check_failed' || result.kind === 'verification_failed') {
          gateRejections.push({
            vertical, slot_type: slotType, listing_id: listingId, name: c.listing.name,
            kind: result.kind, reason: result.reason,
            flags: result.flags, failed_claims: result.failed_claims, verify_error: result.verify_error,
          })
          const detail = result.kind === 'verification_failed'
            ? `${(result.flags || []).length} flag(s)${result.verify_error ? ', verify-call errored' : ''}`
            : `${(result.failed_claims || []).length} ungrounded fact(s)`
          console.log(`  ⚑ ${c.listing.name} → ${result.kind} (${detail}) — slot left open for next candidate`)
        } else {
          console.log(`  · ${c.listing.name} → ${result.kind}`)
        }
      }

      if (filled < K) {
        console.log(`  ⚠ ${key}: filled ${filled}/${K} (ran out of candidates with margin)`)
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalUsage = sumUsage(usages)
  const totalCost = estimateCost(totalUsage)
  const written = outcomeCounts.wrote_pitch || 0
  const dryProduced = outcomeCounts.dry_run || 0
  const produced = written + dryProduced

  console.log(`\n${'━'.repeat(72)}`)
  console.log('  BATCH RUN SUMMARY')
  console.log(`${'━'.repeat(72)}`)
  console.log(`  Mode:              ${dryRun ? 'DRY-RUN (no DB writes)' : 'PRODUCTION'}`)
  console.log(`  Elapsed:           ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log(`  Pipeline runs:     ${totalRuns}${stoppedAtCap ? ` (STOPPED at --max-runs=${maxRuns})` : ''}`)
  console.log(`  Pitches ${dryRun ? 'produced' : 'written '}:   ${produced}`)

  console.log(`\n  Slots filled per vertical/slot_type:`)
  let anyFill = false
  for (const vertical of verticals) {
    for (const slotType of SLOT_TYPES) {
      const key = `${vertical}/${slotType}`
      const K = emptyCounts[key] || 0
      if (K === 0) continue
      anyFill = true
      console.log(`    ${key.padEnd(26)} ${fills[key] || 0}/${K}`)
    }
  }
  if (!anyFill) console.log('    (none — no empty slots for the selected verticals)')

  // Portal (and any other) slots the scorer cannot serve.
  const unservable = Object.keys(emptyCounts).filter(k => !SCORER_VERTICALS.includes(k.split('/')[0]))
  if (unservable.length && !onlyVertical) {
    console.log(`\n  Unserved slots (scorer has no candidate pool):`)
    for (const k of unservable.sort()) console.log(`    ${k.padEnd(26)} ${emptyCounts[k]} empty — left open`)
  }

  console.log(`\n  Outcomes:`)
  for (const [kind, n] of Object.entries(outcomeCounts).sort()) {
    console.log(`    ${kind.padEnd(30)} ${n}`)
  }

  if (gateRejections.length) {
    console.log(`\n  Gate rejections (${gateRejections.length}) — pitch NOT written, reason logged:`)
    for (const r of gateRejections) {
      console.log(`    ✗ [${r.vertical}/${r.slot_type}] ${r.name} — ${r.kind} (${r.reason})`)
      if (r.kind === 'verification_failed') {
        for (const f of (r.flags || [])) console.log(`        ⚑ "${truncate(f.claim, 70)}" — ${f.reason}`)
        if (r.verify_error) console.log(`        (verification call threw — failed closed)`)
      } else {
        for (const c of (r.failed_claims || [])) console.log(`        ✗ "${truncate(c.fact?.claim ?? c.claim, 70)}" (field=${c.fact?.field ?? c.field})`)
      }
    }
  }

  console.log(`\n  Token usage (all compose + verify calls, all attempts):`)
  console.log(`    input=${totalUsage.input_tokens}  output=${totalUsage.output_tokens}  ` +
    `cache_write=${totalUsage.cache_creation_input_tokens}  cache_read=${totalUsage.cache_read_input_tokens}`)
  console.log(`    Total est. cost:   $${totalCost.toFixed(4)} (Sonnet 4.6: $3/M in, $15/M out)`)
  if (produced > 0) {
    console.log(`    Cost per pitch:    $${(totalCost / produced).toFixed(4)}  (${produced} produced)`)
  }
  console.log(`\n  Run log written to: ${LOG_PATH}`)
  console.log('')
}

function truncate(s, n) {
  if (s == null) return '<null>'
  const str = String(s)
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}

function printUsage() {
  console.log(`Usage:
  node scripts/pitch-run-batch.mjs [options]

Scores candidates (Phase 1) and generates pitches (Phase 2) for every empty
pitch_slot, bounded by a per-pair margin and a global --max-runs ceiling.

Options:
  --dry-run            Skip all DB writes (still calls the LLM to compose +
                       verify, so it still costs tokens; nothing is persisted).
  --vertical=<v>       Restrict to one vertical (${SCORER_VERTICALS.join(' | ')}).
  --margin=<float>     Reject-headroom fraction over K empty slots (default 0.3).
  --max-runs=<int>     Global ceiling on pipeline runs (default 45).
  -h, --help           Show this help.

Env is read from ./.env.local automatically.`)
}

main().catch(err => {
  console.error('Fatal:', err?.stack || err?.message || String(err))
  process.exit(1)
})
