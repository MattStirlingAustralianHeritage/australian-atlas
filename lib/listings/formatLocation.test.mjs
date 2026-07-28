// Unit tests for the place location line.
//
// Run with:  node --test lib/listings/formatLocation.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatPlaceLocation, suburbIsRedundant, expandState } from './formatLocation.js'

// ── the headline case ────────────────────────────────────────────────────────

test('region, suburb, full state', () => {
  assert.equal(
    formatPlaceLocation({ region: 'Brisbane', suburb: 'Banyo', state: 'QLD' }),
    'Brisbane, Banyo, Queensland',
  )
})

test('falls back to region + state when no suburb is known', () => {
  assert.equal(
    formatPlaceLocation({ region: 'Byron Bay', suburb: null, state: 'NSW' }),
    'Byron Bay, New South Wales',
  )
})

// ── redundancy elision ───────────────────────────────────────────────────────

test('drops a suburb identical to the region', () => {
  assert.equal(
    formatPlaceLocation({ region: 'Williamstown', suburb: 'Williamstown', state: 'SA' }),
    'Williamstown, South Australia',
  )
})

test('drops a suburb the region name already carries', () => {
  assert.equal(
    formatPlaceLocation({ region: 'Alice Springs & Red Centre', suburb: 'Alice Springs', state: 'NT' }),
    'Alice Springs & Red Centre, Northern Territory',
  )
})

test('keeps a genuinely distinct suburb inside a city region', () => {
  assert.equal(
    formatPlaceLocation({ region: 'Sydney', suburb: 'Eveleigh', state: 'NSW' }),
    'Sydney, Eveleigh, New South Wales',
  )
})

test('redundancy check ignores punctuation and case', () => {
  assert.equal(suburbIsRedundant('st. kilda', 'St Kilda'), true)
  assert.equal(suburbIsRedundant('Banyo', 'Brisbane'), false)
})

// ── shouty Places localities ─────────────────────────────────────────────────

test('title-cases an ALL CAPS suburb', () => {
  assert.equal(
    formatPlaceLocation({ region: 'Perth', suburb: 'FREMANTLE', state: 'WA' }),
    'Perth, Fremantle, Western Australia',
  )
})

test('leaves mixed-case suburbs alone', () => {
  assert.equal(
    formatPlaceLocation({ region: 'Fleurieu Peninsula', suburb: 'McLaren Vale', state: 'SA' }),
    'Fleurieu Peninsula, McLaren Vale, South Australia',
  )
})

// ── state handling ───────────────────────────────────────────────────────────

test('expands every state code', () => {
  assert.equal(expandState('act'), 'Australian Capital Territory')
  assert.equal(expandState('TAS'), 'Tasmania')
  assert.equal(expandState('VIC'), 'Victoria')
})

test('passes an unknown or already-full state through', () => {
  assert.equal(expandState('Queensland'), 'Queensland')
  assert.equal(expandState(null), '')
})

test('fullState:false keeps the abbreviation (grid cards)', () => {
  assert.equal(
    formatPlaceLocation({ region: 'Brisbane', suburb: 'Banyo', state: 'QLD', fullState: false }),
    'Brisbane, Banyo, QLD',
  )
})

// ── degenerate input ─────────────────────────────────────────────────────────

test('returns an empty string when nothing is known', () => {
  assert.equal(formatPlaceLocation({}), '')
  assert.equal(formatPlaceLocation(), '')
})

test('suburb alone still renders', () => {
  assert.equal(formatPlaceLocation({ suburb: 'Banyo', state: 'QLD' }), 'Banyo, Queensland')
})
