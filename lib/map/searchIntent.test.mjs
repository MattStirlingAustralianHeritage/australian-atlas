import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createQueryEngine, STOPWORDS, VERTICAL_INTENT } from './searchIntent.mjs'

// A realistic slice of lib/subTypeLabels.js — enough vocabulary for the
// verticals these regressions live in. Kept inline because node --test can't
// import the app's ESM-in-.js modules; the shapes match the real file.
const LABELS = {
  sba: { winery: 'Winery', brewery: 'Brewery', distillery: 'Distillery', cidery: 'Cidery' },
  rest: { boutique_hotel: 'Boutique Hotel', guesthouse: 'Guesthouse', glamping: 'Glamping', cabin: 'Cabin' },
  table: { restaurant: 'Restaurant', cafe: 'Café', bakery: 'Bakery' },
  craft: { jewellery_metalwork: 'Jewellery & Metalwork', ceramics_clay: 'Ceramics & Clay', glass: 'Glass' },
  found: { market: 'Market', antiques: 'Antiques', vintage: 'Vintage' },
  collection: { museum: 'Museum', gallery: 'Gallery' },
}

const QE = createQueryEngine(LABELS)

// The cast of the two reported incidents, haystacks as buildHaystack would
// produce them (name + vertical/category words + region + state).
const mk = (name, vertical, sub_type, region, state, lat, lng) => ({
  id: `${vertical}:${name}`, name, vertical, sub_type, region, state, lat, lng,
  _hay: [name, vertical, String(sub_type).replace(/_/g, ' '), region, state].join(' ').toLowerCase(),
})

const LISTINGS = [
  mk('Castlemaine Vintage Bazaar', 'found', 'market', 'Castlemaine', 'VIC', -37.06, 144.21),
  mk('Castlemaine Art Museum', 'collection', 'museum', 'Castlemaine', 'VIC', -37.06, 144.22),
  mk('The Empyre Boutique Hotel', 'rest', 'boutique_hotel', 'Castlemaine', 'VIC', -37.06, 144.21),
  mk('Mornington Sea Glass', 'craft', 'jewellery_metalwork', 'Mornington', 'VIC', -38.21, 145.03),
  mk('Tar Barrel Brewery & Distillery', 'sba', 'brewery', 'Mornington', 'VIC', -38.22, 145.04),
  mk('Mornington Peninsula Brewery', 'sba', 'brewery', 'Mornington', 'VIC', -38.23, 145.04),
  mk('Jetty Road Brewery', 'sba', 'brewery', 'Dromana', 'VIC', -38.33, 144.96),
]

const REGION_NAMES = new Set(['castlemaine', 'mornington', 'dromana'])
const vocab = QE.buildVocab(LISTINGS)

// Mapbox-shaped geocoder features for the towns.
const TOWN = (text) => ({ text, place_type: ['place'], center: [144, -37], place_name: `${text}, Victoria, Australia` })

// ── The Castlemaine incident ────────────────────────────────────────
// "accomodation in Castlemaine" (typo as typed) jumped to Castlemaine
// Vintage Bazaar — a MARKET — and cleared the filter.

test('accommodation query never offers off-vertical venues as jumps', () => {
  const matches = QE.rankVenueMatches(LISTINGS, 'accomodation in Castlemaine', vocab)
  for (const { listing } of matches) {
    assert.equal(listing.vertical, 'rest', `${listing.name} is not accommodation`)
  }
  assert.ok(!matches.some(m => m.listing.name === 'Castlemaine Vintage Bazaar'))
})

test('accommodation in Castlemaine → keep the filter, fly to the town', () => {
  const venueMatches = QE.rankVenueMatches(LISTINGS, 'accomodation in Castlemaine', vocab)
  const action = QE.decideEnterAction({
    rawQuery: 'accomodation in Castlemaine', vocab, venueMatches,
    placeResults: [TOWN('Castlemaine')], regionNames: REGION_NAMES,
  })
  assert.equal(action.type, 'filter-place')
  assert.equal(action.leftover, 'castlemaine')
  assert.equal(action.feature.text, 'Castlemaine')
})

test('the parse understands the typo, the vertical, and the town', () => {
  const parsed = QE.parsePinQuery('accomodation in castlemaine', vocab)
  assert.ok(parsed.reqVerticals.has('rest'))
  assert.deepEqual(parsed.placeTokens, ['castlemaine'])
  assert.ok(parsed.hasIntent)
})

// ── The Mornington incident ─────────────────────────────────────────
// "beer in mornington" jumped to Mornington Sea Glass — jewellery.

test('beer query only offers breweries, never a jeweller with the town in its name', () => {
  const matches = QE.rankVenueMatches(LISTINGS, 'beer in mornington', vocab)
  assert.ok(matches.length > 0, 'the Mornington breweries should surface')
  for (const { listing } of matches) {
    assert.equal(listing.sub_type, 'brewery', `${listing.name} is not a brewery`)
  }
})

test('beer in mornington → keep the filter, fly to the town (no geocoder needed)', () => {
  const venueMatches = QE.rankVenueMatches(LISTINGS, 'beer in mornington', vocab)
  const action = QE.decideEnterAction({
    rawQuery: 'beer in mornington', vocab, venueMatches,
    placeResults: [], regionNames: REGION_NAMES,
  })
  assert.equal(action.type, 'filter-place')
  assert.equal(action.leftover, 'mornington')
  assert.equal(action.feature, null)
})

test('the filter itself passes only breweries for a beer query', () => {
  const parsed = QE.parsePinQuery('beer in mornington', vocab)
  const pass = LISTINGS.filter(l => QE.matchesIntent(l, parsed) && QE.matchesPinQuery(l, parsed.matchTokens))
  assert.deepEqual(pass.map(l => l.name).sort(), ['Mornington Peninsula Brewery', 'Tar Barrel Brewery & Distillery'])
})

// ── What must NOT regress ───────────────────────────────────────────

test('a query that literally names a venue still jumps straight to it', () => {
  const venueMatches = QE.rankVenueMatches(LISTINGS, 'tar barrel brewery', vocab)
  assert.equal(venueMatches[0].listing.name, 'Tar Barrel Brewery & Distillery')
  assert.equal(venueMatches[0].tier, 0)
  const action = QE.decideEnterAction({
    rawQuery: 'tar barrel brewery', vocab, venueMatches,
    placeResults: [], regionNames: REGION_NAMES,
  })
  assert.equal(action.type, 'venue')
  assert.equal(action.listing.name, 'Tar Barrel Brewery & Distillery')
})

test('a bare town name goes to the town, not a venue that contains it', () => {
  const venueMatches = QE.rankVenueMatches(LISTINGS, 'castlemaine', vocab)
  assert.ok(venueMatches.length > 0, 'name matches still listed in the dropdown')
  const action = QE.decideEnterAction({
    rawQuery: 'castlemaine', vocab, venueMatches,
    placeResults: [TOWN('Castlemaine')], regionNames: REGION_NAMES,
  })
  assert.equal(action.type, 'place')
  assert.equal(action.feature.text, 'Castlemaine')
})

test('a bare venue-name query still jumps to the venue', () => {
  const venueMatches = QE.rankVenueMatches(LISTINGS, 'mornington sea glass', vocab)
  const action = QE.decideEnterAction({
    rawQuery: 'mornington sea glass', vocab, venueMatches,
    placeResults: [TOWN('Mornington')], regionNames: REGION_NAMES,
  })
  assert.equal(action.type, 'venue')
  assert.equal(action.listing.name, 'Mornington Sea Glass')
})

test('intent with no place and no name match just keeps filtering', () => {
  const action = QE.decideEnterAction({
    rawQuery: 'breweries', vocab, venueMatches: QE.rankVenueMatches(LISTINGS, 'breweries', vocab),
    placeResults: [], regionNames: REGION_NAMES,
  })
  assert.ok(action.type === 'filter' || action.type === 'venue')
  if (action.type === 'venue') assert.equal(action.listing.sub_type, 'brewery')
})

test('viewport ranking is preserved: on-screen venues lead', () => {
  const viewport = {
    bounds: { west: 144.9, east: 145.2, south: -38.4, north: -38.1 }, // Mornington
    center: { lng: 145.0, lat: -38.2 },
  }
  const matches = QE.rankVenueMatches(LISTINGS, 'brewery', vocab, viewport)
  assert.ok(matches.length >= 2)
  assert.notEqual(matches[0].listing.region, 'Dromana', 'Dromana is off-screen and must not lead')
})

// ── Guardrails on shared vocabulary ─────────────────────────────────

test('"at" is a stopword so "beer at mornington" parses like "beer in mornington"', () => {
  assert.ok(STOPWORDS.has('at'))
  const parsed = QE.parsePinQuery('beer at mornington', vocab)
  assert.deepEqual(parsed.placeTokens, ['mornington'])
})

test('vertical intent covers the accommodation misspelling family', () => {
  for (const w of ['accommodation', 'accomodation', 'stay', 'sleep']) {
    assert.equal(VERTICAL_INTENT[w], 'rest', `${w} should name the rest vertical`)
  }
})
