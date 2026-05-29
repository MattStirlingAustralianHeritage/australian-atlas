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
//   factCheck (substring grounding of verified_facts)
//      │
//      ├─►  failed → log → recompose (if budget) → else fact_check_failed
//      │
//      └─►  passed → verifyPitch (PROSE gate — derivation / inference /
//                       │            recombination / absence in headline,
//                       │            angle, editorial_framing)
//                       │
//                       ├─►  flags present → recompose with flags (if budget)
//                       │                     → else verification_failed
//                       └─►  no flags → computeConfidence → INSERT + UPDATE slot
//                                        (or return dry-run payload)
//
// Composition budget: MAX_COMPOSITIONS (2). An attempt finalizes ONLY if BOTH
// gates pass. A failure of either gate consumes one composition; if budget
// remains we recompose once with the failure fed back as a constraint. Bail
// tokens, insufficient-data, llm errors, and the supporting-listings cap are
// terminal immediately — re-rolling the same prompt won't fix them.
//
// The orchestrator NEVER inserts a row with fact_check_passed = false. The only
// path that reaches the INSERT is one where factCheck() returned passed:true
// AND verifyPitch() returned zero flags in this same call. Post-this-change,
// every row in `pitches` has therefore passed BOTH the fact-check and the prose
// verification gate — there is no other writer and no path that finalizes a
// pitch carrying a verification flag.
//
// Verification failures are NOT written to pitch_generation_failures: the
// pitch_failure_mode enum has no 'verification_failed' value (adding one needs
// a migration this build can't apply). The orchestrator returns a
// 'verification_failed' result carrying the flags; the caller (batch runner /
// CLI) records it to a JSONL log + the run summary.
//
// Slot assignment: production mode looks up an empty slot for
// (vertical, slot_type) and errors gracefully if none exists (Phase 2 of the
// build does not seed pitch_slots — slot seeding is a separate task). Dry-run
// mode skips the slot lookup entirely.
// ─────────────────────────────────────────────────────────────────────────────

import { factCheck } from './fact-check.mjs'
import { computeConfidence } from './confidence.mjs'
import { generatePitch } from './generate.mjs'
import { verifyPitch } from './verify.mjs'
import { sumUsage } from './usage.mjs'
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
  // Added to the pitch_failure_mode enum via migration 131 (2026-05-22).
  // Used when detectBailToken catches "x", "placeholder", "" or any other
  // member of BAIL_TOKENS in headline / angle / editorial_framing.
  BAIL_TOKEN_DETECTED: 'bail_token_detected',
})

/**
 * Composition budget. An attempt finalizes ONLY if BOTH gates (fact-check and
 * prose verification) pass. A failure of either gate consumes one composition;
 * if budget remains, we recompose once with the failure fed back as a
 * constraint. This is a hard cap of 2 compositions — there is no loop beyond
 * it. A verification-call ERROR (API throw) is terminal regardless of remaining
 * budget: recomposing the prompt cannot fix a transport/API failure, and an
 * unverified pitch must never be finalized (fail closed).
 */
const MAX_COMPOSITIONS = 2

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

  // ── Composition loop ─────────────────────────────────────────────────────
  // Up to MAX_COMPOSITIONS attempts. Each attempt runs generate → fact-check →
  // (if fact-check passes) prose verification. An attempt finalizes ONLY when
  // BOTH gates pass. A gate failure consumes one composition; if budget remains
  // we recompose once with the failure fed back as a constraint. Terminal
  // outcomes (llm_error, insufficient_data, supporting-listings cap, bail
  // token, verification-call error) return immediately — recomposition cannot
  // fix them. Token usage accumulates across every model call (compose +
  // verify, all attempts) and rides out on every return.
  const usages = []
  let feedback = null

  for (let attemptNo = 1; attemptNo <= MAX_COMPOSITIONS; attemptNo++) {
    const attempt = await generateAndCheck(listing, candidate.slotType, anthropicClient, feedback)
    if (attempt.llm?.usage) usages.push(attempt.llm.usage)
    if (attempt.verification?.usage) usages.push(attempt.verification.usage)
    const usage = sumUsage(usages)

    // ── Terminal non-pitch outcomes (no retry) ──────────────────────────────
    if (attempt.kind === 'llm_error') {
      if (!dryRun) {
        await logFailure(supabase, {
          listingId: listing.id,
          slotId: slot?.id ?? null,
          failureMode: FAILURE_MODES.LLM_ERROR,
          rawOutput: attempt.error,
          failedClaims: null,
        })
      }
      return { kind: 'llm_error', error: attempt.error, attempts: attemptNo, logged: !dryRun, usage }
    }

    if (attempt.kind === 'insufficient_data') {
      if (!dryRun) {
        await logFailure(supabase, {
          listingId: listing.id,
          slotId: slot?.id ?? null,
          failureMode: FAILURE_MODES.INSUFFICIENT_DATA,
          rawOutput: attempt.reason,
          failedClaims: null,
        })
      }
      return { kind: 'insufficient_data', reason: attempt.reason, attempts: attemptNo, logged: !dryRun, usage }
    }

    // Defensive cap check — no log (failure_mode enum has no matching value),
    // no retry (the LLM won't fix a structural decision by regenerating).
    if (attempt.kind === 'too_many_supporting_listings') {
      return {
        kind: 'too_many_supporting_listings',
        count: attempt.count,
        attempts: attemptNo,
        usage,
        note:
          `LLM returned ${attempt.count} supporting_listings; cap is ${MAX_SUPPORTING_LISTINGS}. ` +
          'Phase 2 is single-anchor — supporting_listings should be empty. No retry.',
      }
    }

    // Bail-token detected — logs to pitch_generation_failures with
    // failure_mode = 'bail_token_detected'. No retry — regenerating doesn't fix
    // a model decision to bail; the prompt change is the real fix. The prompt
    // forbids these tokens explicitly; this check + log is the programmatic
    // safety net + audit trail for any new bail variants that slip past it.
    if (attempt.kind === 'bail_token_detected') {
      if (!dryRun) {
        await logFailure(supabase, {
          listingId: listing.id,
          slotId: slot?.id ?? null,
          failureMode: FAILURE_MODES.BAIL_TOKEN_DETECTED,
          rawOutput: safeStringify(attempt.llm.data),
          failedClaims: attempt.bail,
        })
      }
      return {
        kind: 'bail_token_detected',
        bail: attempt.bail,
        attempts: attemptNo,
        logged: !dryRun,
        usage,
        note:
          `LLM emitted a bail token in ${attempt.bail.field} ` +
          `(value=${JSON.stringify(attempt.bail.value)}, reason=${attempt.bail.reason}). ` +
          'No retry; bail tokens indicate the prompt over-constrained the model and ' +
          'regeneration without a prompt change is unlikely to help. The prompt forbids ' +
          'these tokens explicitly — this check is the programmatic safety net.',
      }
    }

    // ── attempt.kind === 'pitch' ─────────────────────────────────────────────
    // Gate 1: fact-check (substring grounding of the declared verified_facts).
    if (!attempt.fact_check.passed) {
      if (!dryRun) {
        await logFailure(supabase, {
          listingId: listing.id,
          slotId: slot?.id ?? null,
          failureMode: FAILURE_MODES.FACT_CHECK_FAILED,
          rawOutput: safeStringify(attempt.llm.data),
          failedClaims: attempt.fact_check.failed_claims,
        })
      }
      if (attemptNo < MAX_COMPOSITIONS) {
        feedback = { failedClaims: attempt.fact_check.failed_claims }
        continue
      }
      return {
        kind: 'fact_check_failed',
        reason: 'failed_fact_check_after_max_compositions',
        failed_claims: attempt.fact_check.failed_claims,
        attempts: attemptNo,
        logged: !dryRun,
        usage,
      }
    }

    // Gate 2: prose verification (derivation / inference / recombination /
    // absence in the headline, angle, editorial_framing). The decision is the
    // gate's, derived from flags.length — a model that self-reports passed:true
    // while listing flags has already been overruled inside verify.mjs.
    if (!attempt.verification.passed) {
      const verifyErrored = attempt.verification.error === true
      // A verification-CALL error is terminal: recomposing cannot fix an API
      // failure, and we must never finalize an unverified pitch. Flag-based
      // failures retry once (if budget) with the flags fed back as constraints.
      if (!verifyErrored && attemptNo < MAX_COMPOSITIONS) {
        feedback = { verifyFlags: attempt.verification.flags }
        continue
      }
      return {
        kind: 'verification_failed',
        reason: verifyErrored ? 'verification_call_errored' : 'verification_failed_after_max_compositions',
        flags: attempt.verification.flags,
        verify_error: verifyErrored,
        attempts: attemptNo,
        // Not written to pitch_generation_failures — the enum has no
        // 'verification_failed' value (needs a migration this build can't run).
        // The caller records this to a JSONL log + the run summary.
        logged: false,
        usage,
      }
    }

    // ── Both gates passed — the only path that reaches the INSERT ────────────
    return finalize({ supabase, dryRun, slot, listing, candidate, attempt, usage })
  }

  // Unreachable: every iteration either returns or `continue`s, and the final
  // iteration cannot `continue` (the budget guards are `attemptNo < MAX`). This
  // throw documents the invariant and surfaces any future logic regression
  // rather than silently returning undefined from a safety-critical pipeline.
  throw new Error('runPipeline: composition loop exited without returning')
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

/**
 * Programmatic safety net against bail tokens the model has been observed to
 * emit when the prompt over-constrains. Detected "x" (Morris under v2) and
 * "placeholder" (Perth Pottery under v3). This is belt-and-braces; the prompt
 * forbids these explicitly, but the check catches future bail variants
 * without prompt churn.
 *
 * The set is meant to grow as new patterns surface. No negative-lock-in test
 * pins the exact contents — only the two empirically-observed entries ("x"
 * and "placeholder") are required to remain.
 */
export const BAIL_TOKENS = new Set([
  'x', 'placeholder', '', 'tbd', 'todo', 'n/a', 'na', 'none',
  '[redacted]', '[placeholder]', 'lorem ipsum', '...',
])

/**
 * Check whether a generated pitch's headline / angle / editorial_framing is a
 * bail token. Returns null if the pitch looks real; otherwise returns the
 * first offending field with its value and reason.
 *
 * Fields are checked in order: headline → angle → editorial_framing. The first
 * bail wins (callers don't need to know about subsequent bails — the pitch is
 * already failed).
 *
 * @param {Object|null|undefined} pitch
 * @returns {{field: string, value: *, reason: 'bail_token_match'|'null_or_undefined'}|null}
 */
export function detectBailToken(pitch) {
  if (!pitch) return null
  const fields = ['headline', 'angle', 'editorial_framing']
  for (const field of fields) {
    const value = pitch[field]
    if (value === undefined || value === null) {
      return { field, value, reason: 'null_or_undefined' }
    }
    const normalised = String(value).trim().toLowerCase()
    if (BAIL_TOKENS.has(normalised)) {
      return { field, value, reason: 'bail_token_match' }
    }
  }
  return null
}

async function generateAndCheck(listing, slotType, client, feedback) {
  let llmResult
  try {
    llmResult = await generatePitch(listing, { slotType, client, feedback })
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

  // Bail-token check. Catches "x", "placeholder", "" and similar tokens in
  // headline / angle / editorial_framing — the model's observed escape hatches
  // when over-constrained. A bail is a hard reject: no retry, no fact-check
  // (the pitch can't make it to the queue regardless). The prompt forbids
  // these explicitly; this is a programmatic safety net for new bail variants
  // that slip past the prompt.
  const bail = detectBailToken(llmResult.data)
  if (bail) {
    return {
      kind: 'bail_token_detected',
      bail,
      llm: llmResult,
    }
  }

  // Gate 1: substring grounding of the self-declared verified_facts[].
  const fact_check_result = factCheck(llmResult.data.verified_facts, listing)

  // Gate 2: prose verification — runs ONLY when fact-check passed. A pitch that
  // failed fact-check is already dead, so spending a verification call on it is
  // waste. If the verification CALL itself throws (transport/API error), we
  // FAIL CLOSED: synthesize a flagged, error-marked result so the pipeline
  // treats it as a terminal verification failure (no write, no retry) rather
  // than ever finalizing a pitch whose prose was never verified.
  let verification = null
  if (fact_check_result.passed) {
    try {
      verification = await verifyPitch(llmResult.data, listing, { client })
    } catch (err) {
      verification = {
        passed: false,
        flags: [{ claim: '<verification call errored>', reason: err?.message ?? String(err) }],
        error: true,
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }
    }
  }

  return { kind: 'pitch', llm: llmResult, fact_check: fact_check_result, verification }
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

async function finalize({ supabase, dryRun, slot, listing, candidate, attempt, usage }) {
  const confidence = computeConfidence(attempt.llm.data, listing, [])

  // Dry-run: return the full pipeline output without touching the DB.
  if (dryRun) {
    return {
      kind: 'dry_run',
      pitch_data: attempt.llm.data,
      fact_check: attempt.fact_check, // { passed: true }
      verification: { passed: attempt.verification.passed, flags: attempt.verification.flags }, // flags is []
      confidence,
      generated_by: attempt.llm.generated_by,
      generated_at: attempt.llm.generated_at,
      prompt_version: attempt.llm.prompt_version,
      usage,
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
    verification: { passed: attempt.verification.passed, flags: attempt.verification.flags }, // flags is []
    usage,
  }
}

function safeStringify(v) {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
