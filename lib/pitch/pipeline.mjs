// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 pipeline orchestrator.
//
//   candidate (from Phase 1)
//      │
//      ▼
//   fetch full listing record  ─►  no_slot_available? (production mode only)
//      │                            │
//      ▼                            │
//   generatePitch (LLM)             │
//      │                            │
//      ├─►  llm_error?              │
//      ├─►  insufficient_data?      │
//      │       │ log to             │
//      │       │ pitch_generation_  │
//      │       │ failures           │
//      │                            │
//      ▼                            │
//   factCheck                       │
//      │                            │
//      ├─►  passed → computeConfidence → INSERT pitch + UPDATE slot
//      │                                  (or return dry-run payload)
//      │
//      └─►  failed → log to pitch_generation_failures → RETRY ONCE
//                       │
//                       ▼
//                  factCheck again
//                       │
//                       ├─►  passed → finalize
//                       └─►  failed → log second failure, return
//                                     fact_check_failed (no further retry)
//
// One regeneration attempt only — per docs/pitch-system-design.md §Phase 2 →
// Fact-check pass. The spec describes one regeneration; if that also fails the
// candidate is logged and the caller moves on to the next Phase 1 candidate.
//
// The orchestrator NEVER inserts a row with fact_check_passed = false. The
// only path that sets fact_check_passed = true is the one where factCheck()
// returned { passed: true } in this same function call — there is no other
// caller of the INSERT and no other code that can flip that flag.
//
// Slot assignment: production mode looks up an empty slot for
// (vertical, slot_type) and errors gracefully if none exists (Phase 2 of the
// build does not seed pitch_slots — slot seeding is a separate task). Dry-run
// mode skips the slot lookup entirely.
// ─────────────────────────────────────────────────────────────────────────────

import { factCheck } from './fact-check.mjs'
import { computeConfidence } from './confidence.mjs'
import { generatePitch } from './generate.mjs'
import { PHASE_2_PROMPT_VERSION } from './prompt.mjs'

/**
 * Columns from `listings` that Phase 2 surfaces to the LLM and to the
 * fact-check pass. Whitelisted to keep computational fields (search_vector,
 * embedding), sync metadata, and admin flags out of the prompt. Every
 * verified_fact field cited by the model must be in this set.
 */
export const LISTING_PITCH_FIELDS = Object.freeze([
  // Identity & taxonomy
  'id', 'name', 'slug', 'vertical', 'sub_type', 'sub_types',
  // Descriptive
  'description',
  // Contact / location
  'website', 'phone',
  'address', 'street_address', 'suburb', 'postcode', 'region', 'state',
  'lat', 'lng',
  // Editorial signals
  'founded_year', 'awards', 'heritage_significance',
  'is_owner_operator', 'independence_confirmed', 'single_location',
  // Practical
  'hours', 'best_season',
  // Visit semantics
  'visit_type', 'visitable', 'night_friendly', 'trail_suitable',
  // Curation flags
  'editors_pick', 'is_featured',
  // Provenance
  'data_source', 'status', 'created_at',
])

/**
 * @typedef {Object} Candidate
 * @property {string} listingId             - UUID of the anchor listing.
 * @property {('general'|'new_producer')} slotType
 * @property {string} [vertical]            - Overrides the listing's vertical
 *                                            (rarely needed; defaults to
 *                                            listing.vertical).
 * @property {number} [candidateScore]      - The Phase 1 score that surfaced
 *                                            this candidate; recorded for
 *                                            audit on the pitch row.
 *
 * @typedef {Object} PipelineOpts
 * @property {Object} supabase              - Supabase service-role client.
 * @property {Object} [anthropicClient]
 * @property {boolean} [dryRun=false]       - If true, no DB writes anywhere
 *                                            (no slot lookup, no pitches
 *                                            insert, no failures log).
 */

const FAILURE_MODES = Object.freeze({
  FACT_CHECK_FAILED: 'fact_check_failed',
  INSUFFICIENT_DATA: 'insufficient_data_returned',
  LLM_ERROR: 'llm_error',
})

/**
 * Run the full Phase 2 pipeline against a single candidate.
 *
 * @param {Candidate} candidate
 * @param {PipelineOpts} opts
 * @returns {Promise<Object>}  Result object — `kind` discriminates outcome
 *                             (see inline returns for shapes).
 */
export async function runPipeline(candidate, opts) {
  if (!candidate || typeof candidate !== 'object') throw new Error('runPipeline: candidate is required')
  if (!candidate.listingId) throw new Error('runPipeline: candidate.listingId is required')
  if (!candidate.slotType) throw new Error('runPipeline: candidate.slotType is required')
  if (candidate.slotType !== 'general' && candidate.slotType !== 'new_producer') {
    throw new Error(`runPipeline: invalid slotType "${candidate.slotType}"`)
  }
  if (!opts?.supabase) throw new Error('runPipeline: opts.supabase is required')

  const { supabase, anthropicClient } = opts
  const dryRun = opts.dryRun ?? false

  // ── Load the anchor listing ──────────────────────────────────────────────
  const listing = await fetchListing(supabase, candidate.listingId)
  if (!listing) {
    return { kind: 'listing_not_found', listing_id: candidate.listingId }
  }
  const vertical = candidate.vertical || listing.vertical

  // ── Slot lookup (production mode only — cheap fail before the LLM call) ──
  let slot = null
  if (!dryRun) {
    slot = await findAvailableSlot(supabase, vertical, candidate.slotType)
    if (!slot) {
      return {
        kind: 'no_slot_available',
        vertical,
        slot_type: candidate.slotType,
        note:
          'Phase 2 of the build does not seed pitch_slots. Run the slot-seeding ' +
          'migration before attempting a production pitch generation.',
      }
    }
  }

  // ── Attempt 1: generate + fact-check ─────────────────────────────────────
  const attempt1 = await generateAndCheck(listing, candidate.slotType, anthropicClient)

  if (attempt1.kind === 'llm_error') {
    if (!dryRun) {
      await logFailure(supabase, {
        listingId: listing.id,
        slotId: slot?.id ?? null,
        failureMode: FAILURE_MODES.LLM_ERROR,
        rawOutput: attempt1.error,
        failedClaims: null,
      })
    }
    return { kind: 'llm_error', error: attempt1.error, attempts: 1, logged: !dryRun }
  }

  if (attempt1.kind === 'insufficient_data') {
    if (!dryRun) {
      await logFailure(supabase, {
        listingId: listing.id,
        slotId: slot?.id ?? null,
        failureMode: FAILURE_MODES.INSUFFICIENT_DATA,
        rawOutput: attempt1.reason,
        failedClaims: null,
      })
    }
    return { kind: 'insufficient_data', reason: attempt1.reason, attempts: 1, logged: !dryRun }
  }

  // Defensive cap check — no log (failure_mode enum has no matching value),
  // no retry (the LLM won't fix a structural decision by regenerating).
  if (attempt1.kind === 'too_many_supporting_listings') {
    return {
      kind: 'too_many_supporting_listings',
      count: attempt1.count,
      attempts: 1,
      note:
        `LLM returned ${attempt1.count} supporting_listings; cap is ${MAX_SUPPORTING_LISTINGS}. ` +
        'Phase 2 is single-anchor — supporting_listings should be empty. No retry.',
    }
  }

  // attempt1.kind === 'pitch'
  if (attempt1.fact_check.passed) {
    return finalize({
      supabase, dryRun, slot, listing, candidate, attempt: attempt1,
    })
  }

  // ── Attempt 1 failed fact-check — log it, retry once ─────────────────────
  if (!dryRun) {
    await logFailure(supabase, {
      listingId: listing.id,
      slotId: slot?.id ?? null,
      failureMode: FAILURE_MODES.FACT_CHECK_FAILED,
      rawOutput: safeStringify(attempt1.llm.data),
      failedClaims: attempt1.fact_check.failed_claims,
    })
  }

  const attempt2 = await generateAndCheck(listing, candidate.slotType, anthropicClient)

  if (attempt2.kind === 'llm_error') {
    if (!dryRun) {
      await logFailure(supabase, {
        listingId: listing.id,
        slotId: slot?.id ?? null,
        failureMode: FAILURE_MODES.LLM_ERROR,
        rawOutput: attempt2.error,
        failedClaims: null,
      })
    }
    return {
      kind: 'fact_check_failed',
      reason: 'first_attempt_failed_fact_check_then_second_attempt_llm_error',
      attempts: [attempt1, attempt2],
      logged: !dryRun,
    }
  }

  if (attempt2.kind === 'insufficient_data') {
    if (!dryRun) {
      await logFailure(supabase, {
        listingId: listing.id,
        slotId: slot?.id ?? null,
        failureMode: FAILURE_MODES.INSUFFICIENT_DATA,
        rawOutput: attempt2.reason,
        failedClaims: null,
      })
    }
    return {
      kind: 'fact_check_failed',
      reason: 'first_attempt_failed_fact_check_then_second_attempt_insufficient_data',
      attempts: [attempt1, attempt2],
      logged: !dryRun,
    }
  }

  // Same defensive cap check as attempt 1 — no log, no further retry.
  if (attempt2.kind === 'too_many_supporting_listings') {
    return {
      kind: 'too_many_supporting_listings',
      count: attempt2.count,
      attempts: 2,
      note:
        `LLM returned ${attempt2.count} supporting_listings on attempt 2; cap is ${MAX_SUPPORTING_LISTINGS}. ` +
        'Phase 2 is single-anchor — supporting_listings should be empty.',
    }
  }

  if (attempt2.fact_check.passed) {
    return finalize({
      supabase, dryRun, slot, listing, candidate, attempt: attempt2,
    })
  }

  // ── Both attempts failed fact-check — log and give up ────────────────────
  if (!dryRun) {
    await logFailure(supabase, {
      listingId: listing.id,
      slotId: slot?.id ?? null,
      failureMode: FAILURE_MODES.FACT_CHECK_FAILED,
      rawOutput: safeStringify(attempt2.llm.data),
      failedClaims: attempt2.fact_check.failed_claims,
    })
  }
  return {
    kind: 'fact_check_failed',
    reason: 'both_attempts_failed_fact_check',
    attempts: [attempt1, attempt2],
    logged: !dryRun,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchListing(supabase, listingId) {
  const cols = LISTING_PITCH_FIELDS.join(', ')
  const { data, error } = await supabase
    .from('listings')
    .select(cols)
    .eq('id', listingId)
    .maybeSingle()
  if (error) throw new Error(`fetchListing: ${error.message}`)
  return data
}

async function findAvailableSlot(supabase, vertical, slotType) {
  const { data, error } = await supabase
    .from('pitch_slots')
    .select('id, vertical, slot_index, slot_type, current_pitch_id, status')
    .eq('vertical', vertical)
    .eq('slot_type', slotType)
    .is('current_pitch_id', null)
    .order('slot_index', { ascending: true })
    .limit(1)
  if (error) throw new Error(`findAvailableSlot: ${error.message}`)
  return data?.[0] ?? null
}

/**
 * Spec cap on supporting listings: a pitch may include the anchor plus up to
 * four supporting listings (five total). Enforced here in code rather than via
 * the tool schema because Anthropic's tool input_schema rejects `maxItems` on
 * array types — see the comment on supporting_listings in prompt.mjs.
 *
 * In Phase 2 (single-anchor mode) this should always be 0; a non-zero list
 * means the LLM ignored its user-turn instruction. Beyond 4 is a hard reject
 * regardless of phase.
 */
const MAX_SUPPORTING_LISTINGS = 4

async function generateAndCheck(listing, slotType, client) {
  let llmResult
  try {
    llmResult = await generatePitch(listing, { slotType, client })
  } catch (err) {
    return { kind: 'llm_error', error: err?.message ?? String(err) }
  }
  if (llmResult.kind === 'insufficient_data') {
    return { kind: 'insufficient_data', reason: llmResult.reason, llm: llmResult }
  }
  // llmResult.kind === 'pitch'

  // Defensive cap check. Phase 2 is single-anchor so the LLM is instructed to
  // return an empty supporting_listings array; anything > 4 is a structural
  // failure the LLM cannot recover from by regenerating, so we reject without
  // retry. Tracked as a future-proofing guard against multi-listing extension.
  const supportingCount = llmResult.data?.supporting_listings?.length ?? 0
  if (supportingCount > MAX_SUPPORTING_LISTINGS) {
    return {
      kind: 'too_many_supporting_listings',
      count: supportingCount,
      llm: llmResult,
    }
  }

  const fact_check_result = factCheck(llmResult.data.verified_facts, listing)
  return { kind: 'pitch', llm: llmResult, fact_check: fact_check_result }
}

async function logFailure(supabase, { listingId, slotId, failureMode, rawOutput, failedClaims }) {
  const { error } = await supabase.from('pitch_generation_failures').insert({
    candidate_listing_id: listingId,
    slot_id: slotId,
    failure_mode: failureMode,
    prompt_version: PHASE_2_PROMPT_VERSION,
    raw_llm_output: typeof rawOutput === 'string' ? rawOutput : safeStringify(rawOutput),
    failed_claims: failedClaims ?? null,
  })
  // Non-fatal — log to stderr but don't throw, the surrounding result already
  // carries the failure outcome.
  if (error) console.error(`logFailure: ${error.message}`)
}

async function finalize({ supabase, dryRun, slot, listing, candidate, attempt }) {
  const confidence = computeConfidence(attempt.llm.data, listing, [])

  // Dry-run: return the full pipeline output without touching the DB.
  if (dryRun) {
    return {
      kind: 'dry_run',
      pitch_data: attempt.llm.data,
      fact_check: attempt.fact_check, // { passed: true }
      confidence,
      generated_by: attempt.llm.generated_by,
      generated_at: attempt.llm.generated_at,
      prompt_version: attempt.llm.prompt_version,
    }
  }

  // Production: insert pitch row + update slot pointer. fact_check_passed is
  // set to true on this code path and ONLY on this code path — there is no
  // other writer.
  const insertRow = {
    slot_id: slot.id,
    vertical: slot.vertical,
    slot_type: slot.slot_type,
    status: 'active',
    anchor_listing_id: listing.id,
    supporting_listing_ids: [],
    headline: attempt.llm.data.headline,
    angle: attempt.llm.data.angle,
    verified_facts: attempt.llm.data.verified_facts,
    editorial_framing: attempt.llm.data.editorial_framing,
    research_needed: attempt.llm.data.research_needed ?? [],
    confidence_score: confidence.score,
    candidate_score: candidate.candidateScore ?? null,
    prompt_version: attempt.llm.prompt_version,
    generated_at: attempt.llm.generated_at,
    generated_by: attempt.llm.generated_by,
    fact_check_passed: true, // ← single source of truth, only set here
  }
  const { data: pitchRow, error: insErr } = await supabase
    .from('pitches')
    .insert(insertRow)
    .select('id')
    .single()
  if (insErr) throw new Error(`pitches.insert: ${insErr.message}`)

  const { error: slotErr } = await supabase
    .from('pitch_slots')
    .update({
      current_pitch_id: pitchRow.id,
      last_filled_at: new Date().toISOString(),
    })
    .eq('id', slot.id)
  if (slotErr) {
    // Non-fatal — the pitch row exists and points back at the slot via slot_id.
    // The current_pitch_id pointer is a denormalised lookup cache; the source
    // of truth is pitches.slot_id.
    console.error(`pitch_slots.update: ${slotErr.message}`)
  }

  return {
    kind: 'wrote_pitch',
    pitch_id: pitchRow.id,
    slot_id: slot.id,
    confidence,
    fact_check: attempt.fact_check,
  }
}

function safeStringify(v) {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
