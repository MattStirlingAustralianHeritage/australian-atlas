// Unit tests for state derivation helpers.
//
// Run with:  node --test lib/geo/stateDerivation.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractStateFromPlaceName,
  deriveStateFromCoords,
  stateFromPostcode,
  stateFromAddress,
} from './stateDerivation.js'

// ── extractStateFromPlaceName ────────────────────────────────────────────────

test('extracts SA from full Mapbox place_name', () => {
  assert.equal(extractStateFromPlaceName('Port Lincoln, South Australia 5606, Australia'), 'SA')
})

test('extracts ACT — must not return NSW', () => {
  assert.equal(extractStateFromPlaceName('Canberra, Australian Capital Territory 2600, Australia'), 'ACT')
})

test('extracts WA from "Victoria Park" — must not return VIC', () => {
  assert.equal(extractStateFromPlaceName('Victoria Park, Western Australia 6100, Australia'), 'WA')
})

test('extracts NSW from Albury place_name', () => {
  assert.equal(extractStateFromPlaceName('Albury, New South Wales 2640, Australia'), 'NSW')
})

test('extracts VIC from Melbourne place_name', () => {
  assert.equal(extractStateFromPlaceName('Melbourne, Victoria 3000, Australia'), 'VIC')
})

test('extracts QLD from Brisbane place_name', () => {
  assert.equal(extractStateFromPlaceName('Brisbane, Queensland 4000, Australia'), 'QLD')
})

test('extracts NT from Darwin place_name', () => {
  assert.equal(extractStateFromPlaceName('Darwin, Northern Territory 0800, Australia'), 'NT')
})

test('extracts TAS from Hobart place_name', () => {
  assert.equal(extractStateFromPlaceName('Hobart, Tasmania 7000, Australia'), 'TAS')
})

test('falls back to abbreviation match', () => {
  assert.equal(extractStateFromPlaceName('123 Main St, Adelaide SA 5000'), 'SA')
})

test('returns null for empty string', () => {
  assert.equal(extractStateFromPlaceName(''), null)
})

test('returns null for null', () => {
  assert.equal(extractStateFromPlaceName(null), null)
})

test('returns null for undefined', () => {
  assert.equal(extractStateFromPlaceName(undefined), null)
})

test('returns null for non-Australian place_name', () => {
  assert.equal(extractStateFromPlaceName('London, England, United Kingdom'), null)
})

// ── deriveStateFromCoords ────────────────────────────────────────────────────

test('Port Lincoln → SA', () => {
  assert.equal(deriveStateFromCoords(-34.7264, 135.8716), 'SA')
})

test('Canberra → ACT (must not return NSW)', () => {
  assert.equal(deriveStateFromCoords(-35.2809, 149.1300), 'ACT')
})

test('Melbourne → VIC', () => {
  assert.equal(deriveStateFromCoords(-37.8136, 144.9631), 'VIC')
})

test('Perth → WA', () => {
  assert.equal(deriveStateFromCoords(-31.9505, 115.8605), 'WA')
})

test('Sydney → NSW', () => {
  assert.equal(deriveStateFromCoords(-33.8688, 151.2093), 'NSW')
})

test('Brisbane → QLD', () => {
  assert.equal(deriveStateFromCoords(-27.4698, 153.0251), 'QLD')
})

test('Darwin → NT', () => {
  assert.equal(deriveStateFromCoords(-12.4634, 130.8456), 'NT')
})

test('Hobart → TAS', () => {
  assert.equal(deriveStateFromCoords(-42.8821, 147.3272), 'TAS')
})

test('Adelaide → SA', () => {
  assert.equal(deriveStateFromCoords(-34.9285, 138.6007), 'SA')
})

test('returns null for null coords', () => {
  assert.equal(deriveStateFromCoords(null, null), null)
})

test('returns null for NaN lat', () => {
  assert.equal(deriveStateFromCoords(NaN, 144), null)
})

test('returns null for non-number types', () => {
  assert.equal(deriveStateFromCoords('-33', '151'), null)
})

test('returns null for coords outside Australia', () => {
  assert.equal(deriveStateFromCoords(51.5074, -0.1278), null)
})

// ── stateFromPostcode ────────────────────────────────────────────────────────

test('3549 (Robinvale) → VIC — must not return NSW', () => {
  assert.equal(stateFromPostcode('3549'), 'VIC')
})

test('2546 (Narooma) → NSW', () => {
  assert.equal(stateFromPostcode('2546'), 'NSW')
})

test('accepts a numeric postcode', () => {
  assert.equal(stateFromPostcode(5606), 'SA')
})

test('2600 → ACT (not NSW)', () => {
  assert.equal(stateFromPostcode('2600'), 'ACT')
})

test('0800 (Darwin) → NT', () => {
  assert.equal(stateFromPostcode('0800'), 'NT')
})

test('returns null for a non-numeric postcode', () => {
  assert.equal(stateFromPostcode('abcd'), null)
})

test('returns null for an unallocated postcode', () => {
  assert.equal(stateFromPostcode('0000'), null)
})

// ── stateFromAddress ─────────────────────────────────────────────────────────

test('Robinvale VIC address → VIC (postcode beats a wrong token)', () => {
  assert.equal(stateFromAddress('243 Robinvale-Sea Lake Road, Robinvale VIC 3549'), 'VIC')
})

test('falls back to explicit state token when no postcode', () => {
  assert.equal(stateFromAddress('Main Street, Narooma NSW'), 'NSW')
})

test('returns null for an address with neither postcode nor state', () => {
  assert.equal(stateFromAddress('Main Street, Somewhere'), null)
})

test('returns null for empty / null address', () => {
  assert.equal(stateFromAddress(''), null)
  assert.equal(stateFromAddress(null), null)
})
