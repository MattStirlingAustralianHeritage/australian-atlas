// Unit tests for the Phase 2 fact-check pass.
//
// Run with:  node --test lib/pitch/fact-check.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { factCheck } from './fact-check.mjs'

// ── Input validation ─────────────────────────────────────────────────────────

test('fails when verified_facts is not an array', () => {
  const r = factCheck(null, { name: 'X' })
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'verified_facts_not_array')
})

test('fails when verified_facts is empty', () => {
  const r = factCheck([], { name: 'X' })
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'no_verified_facts')
})

test('fails when source listing is missing', () => {
  const r = factCheck([{ claim: 'x', field: 'name', value: 'X' }], null)
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'no_source_listing')
})

test('fails when source listing is an array (not a record)', () => {
  const r = factCheck([{ claim: 'x', field: 'name', value: 'X' }], [])
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'no_source_listing')
})

test('fails when a fact is missing field name', () => {
  const r = factCheck([{ claim: 'x', value: 'X' }], { name: 'X' })
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'missing_field_name')
})

test('fails when a fact value is null/undefined/empty', () => {
  const listing = { name: 'X' }
  for (const value of [null, undefined, '', '   ']) {
    const r = factCheck([{ claim: 'x', field: 'name', value }], listing)
    assert.equal(r.passed, false, `value=${JSON.stringify(value)}`)
    assert.equal(r.failed_claims[0].reason, 'missing_value', `value=${JSON.stringify(value)}`)
  }
})

test('rejects prototype-chain lookups (e.g. __proto__)', () => {
  const r = factCheck([{ claim: 'x', field: '__proto__', value: 'something' }], { name: 'X' })
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'field_not_on_listing')
})

// ── String fields (substring match) ──────────────────────────────────────────

test('passes when value is a substring of a string field', () => {
  const listing = { description: 'Founded in 1985 by the Smith family in the Barossa Valley.' }
  const facts = [{ claim: 'Smith family founded it', field: 'description', value: 'Smith family' }]
  const r = factCheck(facts, listing)
  assert.equal(r.passed, true)
})

test('substring match is case-insensitive', () => {
  const listing = { description: 'Founded by the SMITH family.' }
  const facts = [{ claim: 'Smith family', field: 'description', value: 'smith family' }]
  assert.equal(factCheck(facts, listing).passed, true)
})

test('substring match normalises internal whitespace', () => {
  const listing = { description: 'Founded\nby\tthe   Smith\n\nfamily.' }
  const facts = [{ claim: 'Smith family', field: 'description', value: 'by the Smith family' }]
  assert.equal(factCheck(facts, listing).passed, true)
})

test('fails when value is NOT a substring of the string field', () => {
  const listing = { description: 'A winery in the Barossa Valley.' }
  const facts = [{ claim: 'Jane Smith founded it', field: 'description', value: 'Jane Smith' }]
  const r = factCheck(facts, listing)
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'value_not_in_source')
})

test('fails when source string field is empty', () => {
  const facts = [{ claim: 'x', field: 'description', value: 'something' }]
  const r = factCheck(facts, { description: '' })
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'source_field_empty_string')
})

test('fails when source string field is null', () => {
  const facts = [{ claim: 'x', field: 'description', value: 'something' }]
  const r = factCheck(facts, { description: null })
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'source_field_null')
})

test('fails when cited field does not exist on the listing', () => {
  const facts = [{ claim: 'x', field: 'imaginary_column', value: 'X' }]
  const r = factCheck(facts, { name: 'X' })
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'field_not_on_listing')
})

// ── Numeric fields (exact match) ─────────────────────────────────────────────

test('passes on numeric exact match (number value)', () => {
  const facts = [{ claim: 'Founded in 1985', field: 'founded_year', value: 1985 }]
  assert.equal(factCheck(facts, { founded_year: 1985 }).passed, true)
})

test('passes on numeric exact match (stringified number from LLM)', () => {
  const facts = [{ claim: 'Founded in 1985', field: 'founded_year', value: '1985' }]
  assert.equal(factCheck(facts, { founded_year: 1985 }).passed, true)
})

test('fails on numeric mismatch', () => {
  const facts = [{ claim: 'Founded in 1985', field: 'founded_year', value: 1985 }]
  const r = factCheck(facts, { founded_year: 1987 })
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'numeric_mismatch')
})

test('fails when fact value cannot be parsed as number for a numeric field', () => {
  const facts = [{ claim: 'Founded in 1985', field: 'founded_year', value: 'eighty-five' }]
  const r = factCheck(facts, { founded_year: 1985 })
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'value_not_numeric')
})

// ── Boolean fields (exact match) ─────────────────────────────────────────────

test('passes on boolean exact match (boolean value)', () => {
  const facts = [{ claim: 'Owner-operated', field: 'is_owner_operator', value: true }]
  assert.equal(factCheck(facts, { is_owner_operator: true }).passed, true)
})

test('passes on boolean exact match (stringified "true" from LLM)', () => {
  const facts = [{ claim: 'Owner-operated', field: 'is_owner_operator', value: 'true' }]
  assert.equal(factCheck(facts, { is_owner_operator: true }).passed, true)
})

test('fails on boolean mismatch', () => {
  const facts = [{ claim: 'Owner-operated', field: 'is_owner_operator', value: true }]
  const r = factCheck(facts, { is_owner_operator: false })
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'boolean_mismatch')
})

test('fails when fact value is not a boolean for a boolean field', () => {
  const facts = [{ claim: 'Owner-operated', field: 'is_owner_operator', value: 'yes' }]
  const r = factCheck(facts, { is_owner_operator: true })
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'value_not_boolean')
})

// ── Array fields (element substring match) ──────────────────────────────────

test('passes when value matches an element of an array field', () => {
  const listing = { awards: ['Decanter Gold 2023', 'James Halliday 5-star', 'Real Review 95+'] }
  const facts = [{ claim: 'Decanter Gold', field: 'awards', value: 'Decanter Gold' }]
  assert.equal(factCheck(facts, listing).passed, true)
})

test('array element match is case-insensitive', () => {
  const listing = { awards: ['Decanter Gold 2023'] }
  const facts = [{ claim: 'gold', field: 'awards', value: 'DECANTER GOLD' }]
  assert.equal(factCheck(facts, listing).passed, true)
})

test('fails when value does not match any array element', () => {
  const listing = { awards: ['Decanter Gold 2023'] }
  const facts = [{ claim: 'imagined', field: 'awards', value: 'James Beard Award' }]
  const r = factCheck(facts, listing)
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'value_not_in_source_array')
})

test('fails when source array is empty', () => {
  const facts = [{ claim: 'x', field: 'awards', value: 'something' }]
  const r = factCheck(facts, { awards: [] })
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'source_field_empty_array')
})

test('handles null/undefined elements in source array safely', () => {
  const listing = { awards: [null, undefined, 'Decanter Gold'] }
  const facts = [{ claim: 'gold', field: 'awards', value: 'Decanter Gold' }]
  assert.equal(factCheck(facts, listing).passed, true)
})

// ── Unsupported types ───────────────────────────────────────────────────────

test('fails on object-typed source field (no agreed match strategy)', () => {
  const facts = [{ claim: 'x', field: 'metadata', value: 'something' }]
  const r = factCheck(facts, { metadata: { nested: 'value' } })
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].reason, 'unsupported_source_type')
})

// ── Aggregate behaviour ─────────────────────────────────────────────────────

test('returns ALL failed claims, not just the first', () => {
  const listing = { description: 'A winery in the Barossa.', founded_year: 1985, is_owner_operator: true }
  const facts = [
    { claim: 'real', field: 'description', value: 'winery' },             // pass
    { claim: 'invented', field: 'description', value: 'James Beard' },    // fail
    { claim: 'wrong year', field: 'founded_year', value: 1900 },          // fail
    { claim: 'wrong flag', field: 'is_owner_operator', value: false },    // fail
  ]
  const r = factCheck(facts, listing)
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims.length, 3)
  const reasons = r.failed_claims.map(c => c.reason)
  assert.deepEqual(reasons.sort(), ['boolean_mismatch', 'numeric_mismatch', 'value_not_in_source'].sort())
})

test('passes only when every fact passes', () => {
  const listing = {
    name: 'Turkey Flat Vineyards',
    description: 'Founded in 1985 by the Schulz family in the Barossa Valley.',
    founded_year: 1985,
    is_owner_operator: true,
    awards: ['Halliday 5-star'],
  }
  const facts = [
    { claim: 'Name', field: 'name', value: 'Turkey Flat' },
    { claim: 'Founding family', field: 'description', value: 'Schulz family' },
    { claim: 'Year', field: 'founded_year', value: 1985 },
    { claim: 'Owner-operator', field: 'is_owner_operator', value: true },
    { claim: 'Halliday rating', field: 'awards', value: 'Halliday 5-star' },
  ]
  assert.equal(factCheck(facts, listing).passed, true)
})

test('attaches source_value to failed_claims for debugging', () => {
  const listing = { founded_year: 1987 }
  const facts = [{ claim: 'x', field: 'founded_year', value: 1985 }]
  const r = factCheck(facts, listing)
  assert.equal(r.passed, false)
  assert.equal(r.failed_claims[0].source_value, 1987)
})
