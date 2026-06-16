// Unit tests for the candidate duplicate guardrail.
//
// Run with:  node --test lib/candidates/duplicateCheck.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  findDuplicate,
  normaliseName,
  normaliseUrlKey,
  trigramSimilarity,
} from './duplicateCheck.mjs'

// Fake Supabase: a thenable query builder that resolves to preset rows, as if
// the table filters (.neq('status','deleted') / .in('status', [...])) had
// already been applied. Mirrors the @supabase/supabase-js builder shape.
function fakeSupabase({ listings = [], candidates = [], failListings = false, failCandidates = false } = {}) {
  return {
    from(table) {
      const fail = table === 'listings' ? failListings : failCandidates
      const rows = table === 'listings' ? listings : candidates
      const result = fail ? { data: null, error: { message: 'boom' } } : { data: rows, error: null }
      const builder = {
        select: () => builder,
        neq: () => builder,
        in: () => builder,
        limit: () => builder,
        order: () => builder,
        range: () => builder, // single page: returns all preset rows (< 1000)
        then: (resolve) => Promise.resolve(result).then(resolve),
      }
      return builder
    },
  }
}

// ─── Pure helpers ────────────────────────────────────────────

test('normaliseName: case, quotes, ampersand, whitespace', () => {
  assert.equal(normaliseName('  The  Mill  '), 'the mill')
  assert.equal(normaliseName("Pip's & Co"), 'pips and co')
  assert.equal(normaliseName('Café Niçoise'), 'café niçoise') // diacritics preserved (matches detector)
})

test('normaliseUrlKey: strips protocol, www, trailing slash; lowercases', () => {
  assert.equal(normaliseUrlKey('https://www.Ripple.com.au/'), 'ripple.com.au')
  assert.equal(normaliseUrlKey('ripple.com.au'), 'ripple.com.au')
  assert.equal(normaliseUrlKey('http://ripple.com.au/shop/'), 'ripple.com.au/shop')
  assert.equal(normaliseUrlKey('not a url'), null)
  assert.equal(normaliseUrlKey(''), null)
  assert.equal(normaliseUrlKey(null), null)
})

test('trigramSimilarity: identical = 1, unrelated low', () => {
  assert.equal(trigramSimilarity('Ripple Brewing', 'Ripple Brewing'), 1)
  assert.ok(trigramSimilarity('Ripple Brewing', 'Ripple Brewing Co') > 0.7)
  assert.ok(trigramSimilarity('Ripple Brewing', 'Zephyr Distillery') < 0.3)
})

// ─── findDuplicate: listings ─────────────────────────────────

test('exact name match against a listing blocks', async () => {
  const sb = fakeSupabase({
    listings: [{ id: 'L1', name: 'Ripple Brewing', slug: 'ripple-brewing', vertical: 'sba', website: null, state: 'VIC', lat: null, lng: null, status: 'active' }],
  })
  const { duplicate } = await findDuplicate({ name: 'ripple brewing', vertical: 'sba' }, sb)
  assert.ok(duplicate)
  assert.equal(duplicate.kind, 'listing')
  assert.equal(duplicate.matchType, 'exact_name')
  assert.equal(duplicate.id, 'L1')
  assert.match(duplicate.message, /Already listed/)
})

test('shared website (with www / trailing-slash variance) blocks even when names differ', async () => {
  const sb = fakeSupabase({
    listings: [{ id: 'L2', name: 'Ripple Brewing Co', slug: 'ripple', vertical: 'sba', website: 'https://www.ripple.com.au/', state: 'VIC', lat: null, lng: null, status: 'active' }],
  })
  const { duplicate } = await findDuplicate({ name: 'Totally Different Name', website_url: 'ripple.com.au', vertical: 'sba' }, sb)
  assert.ok(duplicate)
  assert.equal(duplicate.matchType, 'url')
})

test('shared BARE domain with an unrelated name is NOT a URL duplicate', async () => {
  // Many parks/council venues share one root domain (parks.vic.gov.au).
  const sb = fakeSupabase({
    listings: [{ id: 'L', name: 'Loch Ard Gorge', slug: 'loch-ard', vertical: 'collection', website: 'https://parks.vic.gov.au', state: 'VIC', lat: null, lng: null, status: 'active' }],
  })
  const { duplicate } = await findDuplicate({ name: 'Grampians Peaks Trail', website_url: 'https://www.parks.vic.gov.au/', vertical: 'way' }, sb)
  assert.equal(duplicate, null)
})

test('shared (.gov.au) BARE domain WITH an agreeing name still blocks (real re-add)', async () => {
  const sb = fakeSupabase({
    listings: [{ id: 'L', name: 'Royal Australian Mint', slug: 'mint', vertical: 'collection', website: 'https://www.ramint.gov.au', state: 'ACT', lat: null, lng: null, status: 'active' }],
  })
  const { duplicate } = await findDuplicate({ name: 'Royal Australian Mint', website_url: 'ramint.gov.au', vertical: 'way' }, sb)
  assert.ok(duplicate)
  assert.equal(duplicate.matchType, 'url')
})

test('dedicated bare commercial domain matches name-independently (one domain = one business)', async () => {
  const sb = fakeSupabase({
    listings: [{ id: 'L', name: 'Core Cider', slug: 'core-cider', vertical: 'sba', website: 'https://corecider.com.au', state: 'WA', lat: null, lng: null, status: 'active' }],
  })
  const { duplicate } = await findDuplicate({ name: 'A Quite Different Name', website_url: 'corecider.com.au', vertical: 'way' }, sb)
  assert.ok(duplicate)
  assert.equal(duplicate.matchType, 'url')
})

test('shared domain WITH A PATH blocks regardless of name (distinct page per venue)', async () => {
  const sb = fakeSupabase({
    listings: [{ id: 'L', name: 'Some Park Page', slug: 'p', vertical: 'field', website: 'https://parks.vic.gov.au/things-to-do/grampians-peaks-trail', state: 'VIC', lat: null, lng: null, status: 'active' }],
  })
  const { duplicate } = await findDuplicate({ name: 'Totally Unrelated Name', website_url: 'https://www.parks.vic.gov.au/things-to-do/grampians-peaks-trail/', vertical: 'way' }, sb)
  assert.ok(duplicate)
  assert.equal(duplicate.matchType, 'url')
})

test('URL match outranks an exact-name match on a different row', async () => {
  const sb = fakeSupabase({
    listings: [
      { id: 'NAME', name: 'Ripple Brewing', slug: 'a', vertical: 'sba', website: null, state: 'VIC', lat: null, lng: null, status: 'active' },
      { id: 'URL', name: 'Something Else', slug: 'b', vertical: 'sba', website: 'https://ripple.com.au', state: 'VIC', lat: null, lng: null, status: 'active' },
    ],
  })
  const { duplicate } = await findDuplicate({ name: 'Ripple Brewing', website_url: 'https://ripple.com.au', vertical: 'sba' }, sb)
  assert.equal(duplicate.matchType, 'url')
  assert.equal(duplicate.id, 'URL')
})

test('fuzzy name match within the same state blocks (typo re-add)', async () => {
  const sb = fakeSupabase({
    listings: [{ id: 'L3', name: 'Sea Acres Distillery', slug: 'sea-acres', vertical: 'sba', website: null, state: 'VIC', lat: null, lng: null, status: 'active' }],
  })
  const { duplicate } = await findDuplicate({ name: 'Sea Acres Distilery', state: 'VIC', vertical: 'sba' }, sb)
  assert.ok(duplicate)
  assert.equal(duplicate.matchType, 'fuzzy_name')
  assert.ok(duplicate.similarity >= 0.85)
})

test('fuzzy name match in a DIFFERENT state is suppressed (namesake)', async () => {
  const sb = fakeSupabase({
    listings: [{ id: 'L4', name: 'Sea Acres Distillery', slug: 'sea-acres', vertical: 'sba', website: null, state: 'NSW', lat: null, lng: null, status: 'active' }],
  })
  const { duplicate } = await findDuplicate({ name: 'Sea Acres Distilery', state: 'VIC', vertical: 'sba' }, sb)
  assert.equal(duplicate, null)
})

test('coordinate proximity (<150m) blocks; far away does not', async () => {
  const near = fakeSupabase({
    listings: [{ id: 'L5', name: 'A Cafe', slug: 'a', vertical: 'table', website: null, state: 'VIC', lat: -37.8000, lng: 144.9600, status: 'active' }],
  })
  const close = await findDuplicate({ name: 'Unrelated Eatery', vertical: 'table', lat: -37.8002, lng: 144.9601 }, near)
  assert.ok(close.duplicate)
  assert.equal(close.duplicate.matchType, 'coordinate_proximity')

  const far = fakeSupabase({
    listings: [{ id: 'L6', name: 'A Cafe', slug: 'a', vertical: 'table', website: null, state: 'VIC', lat: -37.9000, lng: 144.9600, status: 'active' }],
  })
  const result = await findDuplicate({ name: 'Unrelated Eatery', vertical: 'table', lat: -37.8002, lng: 144.9601 }, far)
  assert.equal(result.duplicate, null)
})

test('no match → duplicate is null', async () => {
  const sb = fakeSupabase({
    listings: [{ id: 'L7', name: 'Zephyr Distillery', slug: 'z', vertical: 'sba', website: 'https://zephyr.com.au', state: 'TAS', lat: null, lng: null, status: 'active' }],
  })
  const { duplicate } = await findDuplicate({ name: 'Ripple Brewing', website_url: 'ripple.com.au', state: 'VIC', vertical: 'sba' }, sb)
  assert.equal(duplicate, null)
})

// ─── findDuplicate: open candidates ──────────────────────────

test('open candidate duplicate is caught when no listing matches', async () => {
  const sb = fakeSupabase({
    listings: [],
    candidates: [{ id: 'C1', name: 'Ripple Brewing', vertical: 'sba', website_url: 'https://ripple.com.au', state: 'VIC', lat: null, lng: null, status: 'pending' }],
  })
  const { duplicate } = await findDuplicate({ name: 'Ripple Brewing', vertical: 'sba' }, sb)
  assert.ok(duplicate)
  assert.equal(duplicate.kind, 'candidate')
  assert.match(duplicate.message, /review queue/)
})

test('excludeCandidateId skips the row itself (re-scan)', async () => {
  const sb = fakeSupabase({
    listings: [],
    candidates: [{ id: 'SELF', name: 'Ripple Brewing', vertical: 'sba', website_url: null, state: 'VIC', lat: null, lng: null, status: 'pending' }],
  })
  const { duplicate } = await findDuplicate({ name: 'Ripple Brewing', vertical: 'sba' }, sb, { excludeCandidateId: 'SELF' })
  assert.equal(duplicate, null)
})

test('checkCandidates:false skips the candidate scan', async () => {
  const sb = fakeSupabase({
    listings: [],
    candidates: [{ id: 'C2', name: 'Ripple Brewing', vertical: 'sba', website_url: null, state: 'VIC', lat: null, lng: null, status: 'pending' }],
  })
  const { duplicate } = await findDuplicate({ name: 'Ripple Brewing', vertical: 'sba' }, sb, { checkCandidates: false })
  assert.equal(duplicate, null)
})

// ─── Resilience ──────────────────────────────────────────────

test('fails open: a listings read error does not block (returns null)', async () => {
  const sb = fakeSupabase({ failListings: true, candidates: [] })
  const { duplicate } = await findDuplicate({ name: 'Ripple Brewing', vertical: 'sba' }, sb)
  assert.equal(duplicate, null)
})

test('empty / missing name → no duplicate, no throw', async () => {
  const sb = fakeSupabase({ listings: [{ id: 'L', name: 'X', vertical: 'sba', website: null, state: null, lat: null, lng: null, status: 'active' }] })
  assert.deepEqual((await findDuplicate({ name: '   ' }, sb)).duplicate, null)
  assert.deepEqual((await findDuplicate({}, sb)).duplicate, null)
})
