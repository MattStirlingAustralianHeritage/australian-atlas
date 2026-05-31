import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normaliseText,
  buildSourceStrings,
  extractNumbers,
  extractProperNouns,
  validateSourceBinding,
} from './source-binding.mjs'

const FACTS = {
  building_description: 'A 1923 red-brick warehouse on Gertrude Street, Fitzroy.',
  what_you_book: 'A long shared lunch, six courses, one sitting on Saturdays.',
  design_fitting_detail: 'Recycled messmate tables and a zinc bar.',
  where_it_sits: 'A few doors up from the Builders Arms, near the Atherton Gardens.',
  established_year: 1923,
  products_operators_named: ['Mons Pinot', 'Jasper coffee'],
  ownership_transition_note: '',
}

const GROUNDED = `A 1923 red-brick warehouse on Gertrude Street, Fitzroy.

A long shared lunch of six courses, one sitting on Saturdays.

Recycled messmate tables and a zinc bar.

A few doors up from the Builders Arms, near the Atherton Gardens.`

test('normaliseText collapses whitespace and lowercases', () => {
  assert.equal(normaliseText('  A   1923\nWarehouse '), 'a 1923 warehouse')
})

test('buildSourceStrings includes year string, products, and skips empty', () => {
  const srcs = buildSourceStrings(FACTS)
  assert.ok(srcs.includes('1923'), 'year stringified as its own source')
  assert.ok(srcs.includes('mons pinot'), 'each product is its own source')
  assert.ok(srcs.every(s => s.length > 0))
  // ownership_transition_note is empty → not present
  assert.ok(!srcs.includes(''))
})

test('extractNumbers finds 3+ digit runs, strips grouping, ignores small/word numbers', () => {
  assert.deepEqual(extractNumbers('a 1923 place, six courses'), ['1923'])
  assert.deepEqual(extractNumbers('seats 1,200 guests and 12 staff'), ['1200'])
  assert.deepEqual(extractNumbers('two rooms, 5 tables'), [])
})

test('extractProperNouns separates multi-word from single, and does NOT merge across punctuation', () => {
  // Regression: "Gertrude Street, Fitzroy." then a new sentence "A long…" must
  // not collapse into one run "Gertrude Street Fitzroy A".
  const { multi, single } = extractProperNouns('on Gertrude Street, Fitzroy. A long lunch near the Atherton Gardens in Carlton')
  assert.ok(multi.includes('Gertrude Street'), 'multi-word kept together')
  assert.ok(multi.includes('Atherton Gardens'), 'connector "the" allowed inside run')
  assert.ok(!multi.some(m => /Fitzroy A/.test(m)), 'no cross-sentence merge')
  assert.ok(!multi.some(m => /Saturdays|A long/.test(m)))
  assert.ok(single.includes('Carlton'), 'single proper noun after trigger "in"')
})

test('grounded prose passes — every number and multi-word noun traces to a fact', () => {
  const r = validateSourceBinding(GROUNDED, FACTS)
  assert.equal(r.passed, true, JSON.stringify(r.failed_claims))
})

test('invented year hard-fails', () => {
  const r = validateSourceBinding(GROUNDED.replace('1923 red-brick', '1887 red-brick'), FACTS)
  assert.equal(r.passed, false)
  assert.ok(r.failed_claims.some(c => c.type === 'number' && c.value === '1887'))
})

test('invented multi-word place hard-fails', () => {
  const r = validateSourceBinding(GROUNDED + '\n\nA short walk from Federation Square.', FACTS)
  assert.equal(r.passed, false)
  assert.ok(r.failed_claims.some(c => c.value === 'Federation Square'))
})

test('grounded named product passes', () => {
  const r = validateSourceBinding(GROUNDED + '\n\nMons Pinot by the glass.', FACTS)
  assert.equal(r.passed, true, JSON.stringify(r.failed_claims))
})

test('article + possessive variants ground leniently', () => {
  const facts = { building_description: 'Opposite the Builders Arms hotel.' }
  // "The Builders Arms" (leading article) and "Builders Arms's" (possessive)
  const r1 = validateSourceBinding('It faces The Builders Arms.', facts)
  assert.equal(r1.passed, true, JSON.stringify(r1.failed_claims))
})

test('empty text fails by construction', () => {
  assert.equal(validateSourceBinding('   ', FACTS).passed, false)
})

test('absent established_year means any year in prose fails', () => {
  const noYear = { ...FACTS, established_year: null }
  const r = validateSourceBinding('A 1923 warehouse on Gertrude Street.', noYear)
  // building_description still contains 1923, so it grounds via that field…
  assert.equal(r.passed, true)
  // …but a year that appears in NO field fails:
  const r2 = validateSourceBinding('Founded 1850 on Gertrude Street.', noYear)
  assert.equal(r2.passed, false)
  assert.ok(r2.failed_claims.some(c => c.value === '1850'))
})
