// Unit tests for the Phase 2 confidence-scoring function.
//
// Run with:  node --test lib/pitch/confidence.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeConfidence,
  WEIGHTS,
  MAX_SCORE,
  CROSS_REF_RADIUS_KM,
} from './confidence.mjs'

// ── Helpers ──────────────────────────────────────────────────────────────────

// Minimal "every signal earns the bonus" anchor, plus a pitch shape that
// satisfies the binary signals. Individual tests strip back fields to assert
// each signal in isolation.
function fullPitch() {
  return {
    verified_facts: [{ claim: 'X', field: 'name', value: 'X' }],
    editorial_framing:
      'There is an editorial argument here that runs distinctly separately from the verified-facts list.',
    supporting_listing_ids: [],
  }
}

function fullAnchor() {
  return {
    id: 'anchor-id',
    name: 'Anchor venue',
    description: 'A '.repeat(120), // 240 chars
    founded_year: 1985,
    independence_confirmed: true,
    lat: -34.5,
    lng: 138.9,
  }
}

// ── Invariants ───────────────────────────────────────────────────────────────

test('MAX_SCORE is 90 — operator_name signal is skipped', () => {
  // Sum of all signal weights = 90 = 10+10+10+5+5+10+40 (no operator_name)
  assert.equal(MAX_SCORE, 90)
})

test('WEIGHTS does not include operator_name', () => {
  assert.equal(WEIGHTS.operator_name_populated, undefined)
  assert.equal(Object.keys(WEIGHTS).includes('operator_name_populated'), false)
})

// ── Argument validation ─────────────────────────────────────────────────────

test('throws when pitch is missing', () => {
  assert.throws(() => computeConfidence(null, fullAnchor()), /pitch is required/)
})

test('throws when anchorListing is missing', () => {
  assert.throws(() => computeConfidence(fullPitch(), null), /anchorListing is required/)
})

// ── Facts traced (+40) ──────────────────────────────────────────────────────

test('awards +40 for facts_traced when verified_facts is non-empty', () => {
  const r = computeConfidence(fullPitch(), fullAnchor())
  assert.equal(r.breakdown.facts_traced, 40)
})

test('awards 0 for facts_traced when verified_facts is empty (defensive)', () => {
  const pitch = { ...fullPitch(), verified_facts: [] }
  const r = computeConfidence(pitch, fullAnchor())
  assert.equal(r.breakdown.facts_traced, 0)
})

// ── Founding date (+10) ─────────────────────────────────────────────────────

test('awards +10 for populated founding date', () => {
  const r = computeConfidence(fullPitch(), { ...fullAnchor(), founded_year: 1985 })
  assert.equal(r.breakdown.founding_date_populated, 10)
})

test('awards 0 when founded_year is null', () => {
  const r = computeConfidence(fullPitch(), { ...fullAnchor(), founded_year: null })
  assert.equal(r.breakdown.founding_date_populated, 0)
})

test('awards 0 when founded_year is 0', () => {
  const r = computeConfidence(fullPitch(), { ...fullAnchor(), founded_year: 0 })
  assert.equal(r.breakdown.founding_date_populated, 0)
})

test('awards 0 when founded_year is a string (must be integer)', () => {
  const r = computeConfidence(fullPitch(), { ...fullAnchor(), founded_year: '1985' })
  assert.equal(r.breakdown.founding_date_populated, 0)
})

// ── Substantive description (>200 chars) (+10) ─────────────────────────────

test('awards +10 for description > 200 chars', () => {
  const r = computeConfidence(fullPitch(), { ...fullAnchor(), description: 'A '.repeat(120) })
  assert.equal(r.breakdown.substantive_description, 10)
})

test('awards 0 for description exactly 200 chars (must be strictly greater)', () => {
  const r = computeConfidence(fullPitch(), { ...fullAnchor(), description: 'a'.repeat(200) })
  assert.equal(r.breakdown.substantive_description, 0)
})

test('awards 0 for null description', () => {
  const r = computeConfidence(fullPitch(), { ...fullAnchor(), description: null })
  assert.equal(r.breakdown.substantive_description, 0)
})

// ── Independence flag (+5) ──────────────────────────────────────────────────

test('awards +5 only for explicit independence_confirmed === true', () => {
  const r = computeConfidence(fullPitch(), { ...fullAnchor(), independence_confirmed: true })
  assert.equal(r.breakdown.independence_confirmed, 5)
})

test('awards 0 for independence_confirmed null (no signal)', () => {
  const r = computeConfidence(fullPitch(), { ...fullAnchor(), independence_confirmed: null })
  assert.equal(r.breakdown.independence_confirmed, 0)
})

test('awards 0 for independence_confirmed false', () => {
  const r = computeConfidence(fullPitch(), { ...fullAnchor(), independence_confirmed: false })
  assert.equal(r.breakdown.independence_confirmed, 0)
})

// ── Multi-listing all grounded (+10) ────────────────────────────────────────

test('single-anchor pitches earn 0 for multi-listing signal', () => {
  const r = computeConfidence(fullPitch(), fullAnchor(), [])
  assert.equal(r.breakdown.multi_listing_all_grounded, 0)
})

test('awards +10 when all cited supporting listings have records', () => {
  const pitch = { ...fullPitch(), supporting_listing_ids: ['s1', 's2'] }
  const supporting = [
    { id: 's1', lat: -34.5, lng: 138.9 },
    { id: 's2', lat: -34.5, lng: 138.9 },
  ]
  const r = computeConfidence(pitch, fullAnchor(), supporting)
  assert.equal(r.breakdown.multi_listing_all_grounded, 10)
})

test('awards 0 when supporting records count does not match cited IDs', () => {
  const pitch = { ...fullPitch(), supporting_listing_ids: ['s1', 's2'] }
  const supporting = [{ id: 's1', lat: -34.5, lng: 138.9 }] // only one
  const r = computeConfidence(pitch, fullAnchor(), supporting)
  assert.equal(r.breakdown.multi_listing_all_grounded, 0)
})

// ── Cross-references geographically coherent (+5) ──────────────────────────

test('single-anchor pitches earn 0 for geographic coherence', () => {
  const r = computeConfidence(fullPitch(), fullAnchor(), [])
  assert.equal(r.breakdown.cross_references_coherent, 0)
})

test('awards +5 when all supporting listings are within 50km of anchor', () => {
  // Anchor near Tanunda (-34.51, 138.96). All supports near it.
  const pitch = { ...fullPitch(), supporting_listing_ids: ['s1'] }
  const anchor = { ...fullAnchor(), lat: -34.51, lng: 138.96 }
  const supporting = [{ id: 's1', lat: -34.6, lng: 138.7 }] // ~25km
  const r = computeConfidence(pitch, anchor, supporting)
  assert.equal(r.breakdown.cross_references_coherent, 5)
})

test('awards 0 when any supporting listing is beyond 50km', () => {
  const pitch = { ...fullPitch(), supporting_listing_ids: ['s1', 's2'] }
  const anchor = { ...fullAnchor(), lat: -34.51, lng: 138.96 }
  const supporting = [
    { id: 's1', lat: -34.6, lng: 138.7 },   // ~25km — OK
    { id: 's2', lat: -33.9, lng: 151.2 },   // Sydney — way too far
  ]
  const r = computeConfidence(pitch, anchor, supporting)
  assert.equal(r.breakdown.cross_references_coherent, 0)
})

test('awards 0 when anchor lat/lng is missing', () => {
  const pitch = { ...fullPitch(), supporting_listing_ids: ['s1'] }
  const anchor = { ...fullAnchor(), lat: null, lng: null }
  const supporting = [{ id: 's1', lat: -34.6, lng: 138.7 }]
  const r = computeConfidence(pitch, anchor, supporting)
  assert.equal(r.breakdown.cross_references_coherent, 0)
})

// ── Editorial framing distinguishable (+10, binary) ─────────────────────────

test('awards +10 when framing is populated and substantive', () => {
  const r = computeConfidence(fullPitch(), fullAnchor())
  assert.equal(r.breakdown.framing_distinguishable, 10)
})

test('awards 0 when editorial_framing is empty', () => {
  const pitch = { ...fullPitch(), editorial_framing: '' }
  const r = computeConfidence(pitch, fullAnchor())
  assert.equal(r.breakdown.framing_distinguishable, 0)
})

test('awards 0 when editorial_framing is too short (stub, not a frame)', () => {
  const pitch = { ...fullPitch(), editorial_framing: 'too short' } // < 40 chars
  const r = computeConfidence(pitch, fullAnchor())
  assert.equal(r.breakdown.framing_distinguishable, 0)
})

test('awards 0 when verified_facts is empty (no facts to be distinguishable from)', () => {
  const pitch = { ...fullPitch(), verified_facts: [] }
  const r = computeConfidence(pitch, fullAnchor())
  assert.equal(r.breakdown.framing_distinguishable, 0)
})

// ── Score aggregation ───────────────────────────────────────────────────────

test('single-anchor maximum score is 75 (per spec: skips both multi-listing signals + operator_name)', () => {
  // Floor + ceiling: a perfect single-anchor pitch can't earn the +10 multi-listing
  // grounded signal or the +5 cross-reference coherence signal. Plus operator_name
  // is skipped. So max = 40 + 10 + 10 + 5 + 10 = 75.
  const r = computeConfidence(fullPitch(), fullAnchor(), [])
  assert.equal(r.score, 75)
  assert.equal(r.max_score, 90) // theoretical max with multi-listing signals
})

test('multi-listing maximum score is 90 (full max excluding operator_name)', () => {
  const pitch = { ...fullPitch(), supporting_listing_ids: ['s1'] }
  const anchor = { ...fullAnchor(), lat: -34.51, lng: 138.96 }
  const supporting = [{ id: 's1', lat: -34.6, lng: 138.7 }] // within 50km
  const r = computeConfidence(pitch, anchor, supporting)
  assert.equal(r.score, 90)
})

test('low-confidence threshold check: passes the 70-point bar at maximum single-anchor', () => {
  const r = computeConfidence(fullPitch(), fullAnchor(), [])
  assert.ok(r.score >= 70, `single-anchor max should clear the 70 threshold, got ${r.score}`)
})

test('breakdown shape is stable (all signals listed even when zero)', () => {
  const r = computeConfidence(fullPitch(), { ...fullAnchor(), founded_year: null })
  assert.equal(typeof r.breakdown, 'object')
  for (const key of [
    'facts_traced',
    'founding_date_populated',
    'substantive_description',
    'multi_listing_all_grounded',
    'independence_confirmed',
    'cross_references_coherent',
    'framing_distinguishable',
  ]) {
    assert.ok(key in r.breakdown, `breakdown should always include ${key}`)
  }
})

test('CROSS_REF_RADIUS_KM exported as 50 (spec value)', () => {
  assert.equal(CROSS_REF_RADIUS_KM, 50)
})

test('worst-case score: empty verified_facts, sparse anchor → very low but still ≥ 0', () => {
  const pitch = { verified_facts: [], editorial_framing: '', supporting_listing_ids: [] }
  const anchor = { id: 'x', name: 'X', description: null, founded_year: null, independence_confirmed: null }
  const r = computeConfidence(pitch, anchor, [])
  assert.equal(r.score, 0)
})
