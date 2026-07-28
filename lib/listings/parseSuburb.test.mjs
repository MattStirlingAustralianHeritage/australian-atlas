// Unit tests for suburb derivation from a street address.
//
// Run with:  node --test lib/listings/parseSuburb.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSuburbFromAddress } from './parseSuburb.js'

const suburb = (addr, state) => parseSuburbFromAddress(addr, state)?.suburb ?? null

// ── state-anchored (the common, high-confidence shape) ───────────────────────

test('Places-formatted address', () => {
  assert.equal(suburb('Unit 13/10 Depot St, Banyo QLD 4014, Australia'), 'Banyo')
})

test('state without postcode', () => {
  assert.equal(suburb('824 Fosterton Rd, Dungog NSW'), 'Dungog')
})

test('two-word locality', () => {
  assert.equal(suburb('61 Larapinta Dr, Alice Springs NT 0870'), 'Alice Springs')
})

test('locality repeated in the street line', () => {
  assert.equal(suburb('2715 Caves Road Yallingup, Yallingup WA 6282'), 'Yallingup')
})

test('locality sits one segment before a bare state+postcode', () => {
  assert.equal(suburb('245 Wilson St, Eveleigh, NSW 2015'), 'Eveleigh')
})

test('duplicate state tail resolves to the real locality', () => {
  assert.equal(suburb('12 Smith St, Marrickville, NSW, 2203, NSW'), 'Marrickville')
})

// ── tail-segment fallback ────────────────────────────────────────────────────

test('no state token — trailing locality segment', () => {
  assert.equal(suburb('199 Lighthouse Road, Byron Bay'), 'Byron Bay')
})

test('single-segment street address yields nothing', () => {
  assert.equal(suburb('Lot 3 Nildottie Road'), null)
  assert.equal(suburb('12 Tiers Road'), null)
})

// ── rejections ───────────────────────────────────────────────────────────────

test('never returns a street as a suburb', () => {
  assert.equal(suburb('Lot 3, Nildottie Road'), null)
  assert.equal(suburb('Building 2, Wilson Street'), null)
})

test('rejects unit / shop / level detail lines', () => {
  assert.equal(suburb('Wilson Street, Shop 4'), null)
  assert.equal(suburb('Main Road, Level 2'), null)
})

test('rejects a cross-state address', () => {
  assert.equal(suburb('40 Stoddart St, Shieldfield NSW 2000', 'VIC'), null)
})

test('accepts when the parsed state matches the listing state', () => {
  assert.equal(suburb('Unit 13/10 Depot St, Banyo QLD 4014', 'QLD'), 'Banyo')
})

test('empty and junk input', () => {
  assert.equal(suburb(''), null)
  assert.equal(suburb(null), null)
  assert.equal(suburb('Australia'), null)
  assert.equal(suburb('   ,  , '), null)
})

test('numeric segments are not localities', () => {
  assert.equal(suburb('PO Box 42, 2015'), null)
})

// ── regressions found auditing the live corpus ───────────────────────────────

test('strips a trailing FULL state name', () => {
  assert.equal(suburb('Constitution Avenue, Parkes Australian Capital Territory 2600'), 'Parkes')
})

test('a leading "Victoria" is a suburb, not the state', () => {
  assert.equal(suburb('Modus Victoria Park — 5/660 Albany Highway, Victoria Park WA'), 'Victoria Park')
})

test('rejects a street line that trails a locality', () => {
  assert.equal(suburb('1755 Channel Highway Margate Tasmania'), null)
  assert.equal(suburb('Level 1, 1151 Creek Road  Westfield Carindale'), null)
})

test('rejects a premises name', () => {
  assert.equal(suburb("Elizabeth's Bookshop Warehouse, 23 Queen Victoria St, Fremantle WA"), 'Fremantle')
  assert.equal(suburb("Elizabeth's Bookshop Warehouse"), null)
})

test('reserves are not suburbs', () => {
  assert.equal(suburb('Jim Jim Falls Carpark, Jim Jim Road, Kakadu National Park'), null)
  assert.equal(suburb('Repeater Station Road, Springbrook National Park'), null)
  assert.equal(suburb('Murchison River Gorge, Kalbarri National Park WA 6536'), null)
})

test('does not reject genuine suburbs containing everyday nouns', () => {
  assert.equal(suburb('72 Heal Street, New Farm QLD'), 'New Farm')
  assert.equal(suburb('1 Wattle Rd, Forest Grove WA 6286'), 'Forest Grove')
  assert.equal(suburb('5 Cavill Ave, Surfers Paradise QLD 4217'), 'Surfers Paradise')
})

// ── normalisation ────────────────────────────────────────────────────────────

test('title-cases a shouty locality', () => {
  assert.equal(suburb('10 Depot St, BANYO QLD 4014'), 'Banyo')
})

test('apostrophes do not start a new word', () => {
  assert.equal(suburb("14 Main St, o'connor ACT 2602"), "O'Connor")
})

test('reports confidence', () => {
  assert.equal(parseSuburbFromAddress('10 Depot St, Banyo QLD 4014').confidence, 'state_anchored')
  assert.equal(parseSuburbFromAddress('199 Lighthouse Road, Byron Bay').confidence, 'tail_segment')
})
