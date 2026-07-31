import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isItineraryIntent } from './itineraryIntent.js'

test('trip-planning queries are itinerary intent', () => {
  for (const q of [
    'day trip from melbourne',
    'plan a weekend in the barossa',
    '3 days in tasmania',
    'two nights in the grampians',
    'road trip along the great ocean road',
    'itinerary for daylesford',
    'overnight in mudgee',
    'build me a wine trail',
    'day tour of the yarra valley',
  ]) {
    assert.equal(isItineraryIntent(q), true, `expected itinerary: "${q}"`)
  }
})

test('venue searches are NOT itinerary intent (the substring hijack)', () => {
  for (const q of [
    'brewery tours in the yarra valley',   // venues that run tours
    'breweries with tours',
    'walking trail near hobart',           // Field category vocabulary
    'rail trail cafe',
    'great ocean road route lookouts',
    'tourist information centre',
    'detour coffee',
    'monday to friday opening hours',
  ]) {
    assert.equal(isItineraryIntent(q), false, `expected NOT itinerary: "${q}"`)
  }
})

test('short and empty queries never match', () => {
  assert.equal(isItineraryIntent(''), false)
  assert.equal(isItineraryIntent('tour'), false)
  assert.equal(isItineraryIntent(null), false)
})
