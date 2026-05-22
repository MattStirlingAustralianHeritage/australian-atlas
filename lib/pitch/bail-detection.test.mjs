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
import { detectBailToken, BAIL_TOKENS } from './pipeline.mjs'

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
