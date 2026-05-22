// Unit tests for the Phase 2 bail-token detector.
//
// detectBailToken is the orchestrator-side safety net against bail tokens the
// model has been observed to emit when the prompt over-constrains:
//   - v2: Morris bailed to "x" for headline/angle/framing
//   - v3: Perth Pottery bailed to "placeholder" for headline/angle
//
// The v4 prompt explicitly forbids these tokens, but the detector exists as
// belt-and-braces against future bail variants. Both surfaces (prompt + code)
// are intentional redundancy.
//
// Run with:  node --test lib/pitch/bail-detection.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectBailToken, BAIL_TOKENS, runPipeline } from './pipeline.mjs'

// ── Helper ──────────────────────────────────────────────────────────────────

function realPitch() {
  return {
    headline: 'Morris of Rutherglen Finishes Single Malt in Tokay Casks',
    angle: 'A long real angle paragraph that describes the editorial argument and grounds every concrete claim in verified_facts.',
    editorial_framing: 'A long real framing paragraph with creative guidance for the writer that goes well past forty characters.',
  }
}

// ── Defensive null/undefined input ──────────────────────────────────────────

test('returns null when pitch is null', () => {
  assert.equal(detectBailToken(null), null)
})

test('returns null when pitch is undefined', () => {
  assert.equal(detectBailToken(undefined), null)
})

// ── Clean pitch ─────────────────────────────────────────────────────────────

test('returns null for a fully-populated real pitch', () => {
  assert.equal(detectBailToken(realPitch()), null)
})

// ── Per-field bail detection ────────────────────────────────────────────────

test('catches bail token in headline', () => {
  const result = detectBailToken({ ...realPitch(), headline: 'x' })
  assert.equal(result.field, 'headline')
  assert.equal(result.value, 'x')
  assert.equal(result.reason, 'bail_token_match')
})

test('catches bail token in angle', () => {
  const result = detectBailToken({ ...realPitch(), angle: 'placeholder' })
  assert.equal(result.field, 'angle')
  assert.equal(result.value, 'placeholder')
  assert.equal(result.reason, 'bail_token_match')
})

test('catches bail token in editorial_framing', () => {
  const result = detectBailToken({ ...realPitch(), editorial_framing: '' })
  assert.equal(result.field, 'editorial_framing')
  assert.equal(result.value, '')
  assert.equal(result.reason, 'bail_token_match')
})

// ── Null and undefined field values ─────────────────────────────────────────

test('catches null headline as null_or_undefined', () => {
  const result = detectBailToken({ ...realPitch(), headline: null })
  assert.equal(result.field, 'headline')
  assert.equal(result.value, null)
  assert.equal(result.reason, 'null_or_undefined')
})

test('catches undefined angle as null_or_undefined', () => {
  const pitch = realPitch()
  delete pitch.angle
  const result = detectBailToken(pitch)
  assert.equal(result.field, 'angle')
  assert.equal(result.reason, 'null_or_undefined')
})

test('catches null editorial_framing as null_or_undefined', () => {
  const result = detectBailToken({ ...realPitch(), editorial_framing: null })
  assert.equal(result.field, 'editorial_framing')
  assert.equal(result.reason, 'null_or_undefined')
})

// ── Case + whitespace normalisation ────────────────────────────────────────

test('catches uppercase bail token', () => {
  const result = detectBailToken({ ...realPitch(), headline: 'PLACEHOLDER' })
  assert.equal(result.field, 'headline')
  assert.equal(result.reason, 'bail_token_match')
})

test('catches mixed-case bail token', () => {
  const result = detectBailToken({ ...realPitch(), headline: 'PlaceHolder' })
  assert.equal(result.reason, 'bail_token_match')
})

test('catches whitespace-padded bail token', () => {
  const result = detectBailToken({ ...realPitch(), headline: '  placeholder  ' })
  assert.equal(result.reason, 'bail_token_match')
  // Note: the returned `value` is the original un-normalised string, so
  // callers can see what the model actually emitted (whitespace included).
  assert.equal(result.value, '  placeholder  ')
})

test('catches case + whitespace variants combined', () => {
  const result = detectBailToken({ ...realPitch(), headline: '  PLACEHOLDER  ' })
  assert.equal(result.reason, 'bail_token_match')
})

test('catches all-whitespace string as empty-string bail token', () => {
  // String('   ').trim().toLowerCase() === '' which is in BAIL_TOKENS.
  const result = detectBailToken({ ...realPitch(), headline: '   ' })
  assert.equal(result.reason, 'bail_token_match')
})

// ── Field-priority order ───────────────────────────────────────────────────

test('returns the FIRST bailed field in order (headline > angle > framing)', () => {
  const pitch = { headline: 'x', angle: 'placeholder', editorial_framing: '' }
  const result = detectBailToken(pitch)
  assert.equal(result.field, 'headline')
})

test('returns angle when headline is real and angle bails', () => {
  const pitch = { headline: 'Real', angle: 'x', editorial_framing: '' }
  const result = detectBailToken(pitch)
  assert.equal(result.field, 'angle')
})

// ── Every BAIL_TOKENS member triggers detection ────────────────────────────
// Parametrised: each token in the set is tested once via the headline field.

for (const token of BAIL_TOKENS) {
  test(`BAIL_TOKENS member ${JSON.stringify(token)} triggers detection`, () => {
    const result = detectBailToken({ ...realPitch(), headline: token })
    assert.notEqual(result, null, `expected bail detection for token ${JSON.stringify(token)}`)
    assert.equal(result.field, 'headline')
    assert.equal(result.reason, 'bail_token_match')
  })
}

// ── Minimum membership ─────────────────────────────────────────────────────

test('BAIL_TOKENS contains the two empirically-observed bail variants', () => {
  // 'x' was emitted by Morris under prompt v2 (2026-05-22).
  // 'placeholder' was emitted by Perth Pottery under prompt v3 (2026-05-22).
  // Both are documented in their respective dry-run comparison reports;
  // the set must retain them as a historical lower bound. New tokens may
  // be added over time as new bail patterns surface — there is intentionally
  // no negative-lock-in test pinning the exact contents.
  assert.ok(
    BAIL_TOKENS.has('x'),
    '"x" must remain in BAIL_TOKENS — observed in Morris v2 dry-run (2026-05-22), see dry-run-v2-comparison-report.md'
  )
  assert.ok(
    BAIL_TOKENS.has('placeholder'),
    '"placeholder" must remain in BAIL_TOKENS — observed in Perth Pottery v3 dry-run (2026-05-22), see dry-run-v3-comparison-report.md'
  )
})

test('BAIL_TOKENS is a Set (not an array, not a plain object)', () => {
  // The detector uses .has() — if someone refactors BAIL_TOKENS to an array,
  // detection becomes O(n) per field and the case-insensitive normalisation
  // gets tangled. Keep it as a Set.
  assert.ok(BAIL_TOKENS instanceof Set)
})

// ── DB logging integration ─────────────────────────────────────────────────
//
// Migration 131 (2026-05-22) extended the pitch_failure_mode enum to include
// 'bail_token_detected'. The pipeline now logs bail detections to
// pitch_generation_failures so the audit trail captures them alongside
// fact_check_failed and insufficient_data_returned. This test exercises the
// production-mode (dryRun=false) bail-token branch end-to-end with mocked
// Anthropic + Supabase clients, and asserts the captured insert payload.

/**
 * Minimal Supabase mock. Handles three table interactions:
 *   - listings: returns the provided listing record on the
 *     .select(...).eq(...).maybeSingle() chain
 *   - pitch_slots: returns the provided slot row on the longer
 *     .select(...).eq(...).eq(...).is(...).order(...).limit(...) chain
 *   - pitch_generation_failures: captures the inserted row via the
 *     captureInsert callback
 *
 * Mirrors the actual Supabase JS query-builder shape closely enough to
 * exercise pipeline.mjs without restructure. If pipeline.mjs grows new
 * supabase calls this mock needs to grow with it.
 */
function makeMockSupabase({ listing, slot, captureInsert }) {
  return {
    from(table) {
      if (table === 'listings') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: listing, error: null }),
        }
        return chain
      }
      if (table === 'pitch_slots') {
        // Slot lookup awaits the whole chain (no terminal method like
        // .maybeSingle); the builder must be thenable.
        const result = { data: slot ? [slot] : [], error: null }
        const chain = {
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          order: () => chain,
          limit: () => chain,
          then: (resolve) => resolve(result),
        }
        return chain
      }
      if (table === 'pitch_generation_failures') {
        return {
          insert: async (row) => {
            captureInsert(row)
            return { error: null }
          },
        }
      }
      throw new Error(`mockSupabase: unexpected table "${table}"`)
    },
  }
}

/**
 * Minimal Anthropic mock. Returns a structured pitch where one field carries
 * a bail token. Mirrors the SDK's streaming API closely enough that
 * generate.mjs's `client.messages.stream(...).finalMessage()` returns a
 * Message-shaped object containing a tool_use block for submit_pitch.
 */
function makeMockAnthropicWithBail(bailField, bailValue) {
  const pitch = {
    headline: 'Real headline text that traces to verified_facts',
    angle: 'Real angle paragraph with enough substance to read as editorial argument.',
    anchor_listing: {
      id: 'listing-uuid-test',
      name: 'Test Listing',
      vertical: 'sba',
      region: 'Test Region',
      slug: 'test-listing',
    },
    supporting_listings: [],
    verified_facts: [
      { claim: 'The venue name is Test Listing', field: 'name', value: 'Test Listing' },
    ],
    editorial_framing:
      'Real framing paragraph with enough length to clear the forty-character floor used by confidence scoring.',
    research_needed: [],
  }
  pitch[bailField] = bailValue

  return {
    messages: {
      stream() {
        return {
          async finalMessage() {
            return {
              id: 'msg_test_bail_logging',
              model: 'claude-opus-4-7',
              content: [
                { type: 'tool_use', id: 'toolu_test', name: 'submit_pitch', input: pitch },
              ],
              stop_reason: 'tool_use',
            }
          },
        }
      },
    },
  }
}

test('bail-token detection logs a pitch_generation_failures row with failure_mode = bail_token_detected (production mode)', async () => {
  // The listing record needs only the columns the pipeline reads. Other
  // LISTING_PITCH_FIELDS can be omitted — the orchestrator doesn't require
  // them when the bail branch fires before fact-check.
  const listing = {
    id: 'listing-uuid-test',
    name: 'Test Listing',
    slug: 'test-listing',
    vertical: 'sba',
    region: 'Test Region',
    description: 'a'.repeat(250),
    founded_year: 2020,
    is_owner_operator: true,
    independence_confirmed: true,
  }
  const slot = {
    id: 'slot-uuid-test',
    vertical: 'sba',
    slot_index: 1,
    slot_type: 'general',
    current_pitch_id: null,
    status: 'active',
  }

  let capturedRow = null
  const supabase = makeMockSupabase({
    listing,
    slot,
    captureInsert: (row) => { capturedRow = row },
  })
  const anthropicClient = makeMockAnthropicWithBail('headline', 'x')

  const result = await runPipeline(
    { listingId: 'listing-uuid-test', slotType: 'general' },
    { supabase, anthropicClient, dryRun: false }
  )

  // Pipeline-level outcome.
  assert.equal(result.kind, 'bail_token_detected')
  assert.equal(result.bail.field, 'headline')
  assert.equal(result.bail.value, 'x')
  assert.equal(result.bail.reason, 'bail_token_match')
  assert.equal(result.logged, true)
  assert.equal(result.attempts, 1)

  // DB-write side-effect.
  assert.notEqual(capturedRow, null, 'pitch_generation_failures.insert was not called')
  assert.equal(
    capturedRow.failure_mode,
    'bail_token_detected',
    'failure_mode must be the new enum value added by migration 131'
  )
  assert.equal(capturedRow.candidate_listing_id, 'listing-uuid-test')
  assert.equal(capturedRow.slot_id, 'slot-uuid-test')
  // failed_claims carries the structured bail details { field, value, reason }.
  // (The DB column is named failed_claims for backward compatibility with the
  // earlier failure modes; semantically it's "details" for the bail case.)
  assert.deepEqual(capturedRow.failed_claims, {
    field: 'headline',
    value: 'x',
    reason: 'bail_token_match',
  })
  // prompt_version is recorded for audit; assert it's a phase2 string but
  // don't pin the exact version (so this test survives prompt revisions).
  assert.match(capturedRow.prompt_version, /^phase2-v/)
})

test('bail-token detection in dry-run mode does NOT log to pitch_generation_failures', async () => {
  // Same shape as the production test, but dryRun=true. The insert callback
  // should never fire; the result still reports the bail with logged=false.
  const listing = {
    id: 'listing-uuid-test',
    name: 'Test Listing',
    slug: 'test-listing',
    vertical: 'sba',
    region: 'Test Region',
    description: 'a'.repeat(250),
    founded_year: 2020,
    is_owner_operator: true,
    independence_confirmed: true,
  }
  let capturedRow = null
  const supabase = makeMockSupabase({
    listing,
    slot: null, // dry-run skips slot lookup; mock would not be touched here
    captureInsert: (row) => { capturedRow = row },
  })
  const anthropicClient = makeMockAnthropicWithBail('angle', 'placeholder')

  const result = await runPipeline(
    { listingId: 'listing-uuid-test', slotType: 'general' },
    { supabase, anthropicClient, dryRun: true }
  )

  assert.equal(result.kind, 'bail_token_detected')
  assert.equal(result.bail.field, 'angle')
  assert.equal(result.bail.value, 'placeholder')
  assert.equal(result.logged, false)
  assert.equal(capturedRow, null, 'dry-run mode must not insert into pitch_generation_failures')
})
