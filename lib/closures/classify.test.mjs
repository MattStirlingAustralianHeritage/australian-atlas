import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyClosure,
  nameSimilarity,
  scanSiteTextForClosure,
  NAME_MATCH_THRESHOLD,
} from './classify.js'

test('nameSimilarity: identical and near-identical names match', () => {
  assert.ok(nameSimilarity('Ebb & Flow', 'Ebb and Flow Cafe') >= NAME_MATCH_THRESHOLD)
  assert.ok(nameSimilarity('Hartshorn Distillery', 'Hartshorn Distillery') >= NAME_MATCH_THRESHOLD)
})

test('nameSimilarity: a rebrand/different identity does not match', () => {
  assert.ok(nameSimilarity('Corner Store Espresso', 'The Velvet Fox Wine Bar') < NAME_MATCH_THRESHOLD)
  assert.ok(nameSimilarity('', 'Anything At All') < NAME_MATCH_THRESHOLD)
})

test('Places CLOSED_PERMANENTLY with a name mismatch is downgraded, never a confident closure', () => {
  const v = classifyClosure({
    placesStatus: 'CLOSED_PERMANENTLY',
    placesName: 'The Velvet Fox Wine Bar',
    listingName: 'Corner Store Espresso',
    websiteProbe: { classification: 'ok' },
    siteText: null,
  })
  assert.equal(v.signal, 'possibly_closed')
  assert.equal(v.confidence, 'low')
})

test('Places CLOSED_PERMANENTLY, name matched, site alive → medium (human decides)', () => {
  const v = classifyClosure({
    placesStatus: 'CLOSED_PERMANENTLY',
    placesName: 'Corner Store Espresso',
    listingName: 'Corner Store Espresso',
    websiteProbe: { classification: 'ok' },
    siteText: null,
  })
  assert.equal(v.signal, 'closed_permanently')
  assert.equal(v.confidence, 'medium')
})

test('Places CLOSED_PERMANENTLY corroborated by a hard-dead website → high', () => {
  const v = classifyClosure({
    placesStatus: 'CLOSED_PERMANENTLY',
    placesName: 'Corner Store Espresso',
    listingName: 'Corner Store Espresso',
    websiteProbe: { classification: 'dead_dns' },
    siteText: null,
  })
  assert.equal(v.signal, 'closed_permanently')
  assert.equal(v.confidence, 'high')
})

test('a TLS error is NOT a dead site and produces no signal on its own', () => {
  const v = classifyClosure({
    placesStatus: null,
    placesName: null,
    listingName: 'Corner Store Espresso',
    websiteProbe: { classification: 'tls_issue' },
    siteText: null,
  })
  assert.equal(v, null)
})

test('a timeout is transient and produces no signal on its own', () => {
  const v = classifyClosure({
    placesStatus: null,
    placesName: null,
    listingName: 'Corner Store Espresso',
    websiteProbe: { classification: 'dead_timeout' },
    siteText: null,
  })
  assert.equal(v, null)
})

test('hard-dead website alone is only a low-confidence possibly_closed', () => {
  const v = classifyClosure({
    placesStatus: null,
    placesName: null,
    listingName: 'Corner Store Espresso',
    websiteProbe: { classification: 'dead_refused' },
    siteText: null,
  })
  assert.equal(v.signal, 'possibly_closed')
  assert.equal(v.confidence, 'low')
})

test('HTTP 404/410 counts as hard-dead', () => {
  const v = classifyClosure({
    placesStatus: null,
    placesName: null,
    listingName: 'Corner Store Espresso',
    websiteProbe: { classification: 'http_gone' },
    siteText: null,
  })
  assert.equal(v.signal, 'possibly_closed')
})

test('hard-dead website is overridden by Places OPERATIONAL', () => {
  const v = classifyClosure({
    placesStatus: 'OPERATIONAL',
    placesName: 'Corner Store Espresso',
    listingName: 'Corner Store Espresso',
    websiteProbe: { classification: 'dead_refused' },
    siteText: null,
  })
  assert.equal(v, null)
})

test('own-site permanent closure statement is high confidence even without Places', () => {
  const text = 'After eleven wonderful years we have now closed our doors. Thank you Hobart.'
  const scan = scanSiteTextForClosure(text)
  assert.ok(scan.permanent.length >= 1)
  const v = classifyClosure({
    placesStatus: null,
    placesName: null,
    listingName: 'Ebb & Flow',
    websiteProbe: { classification: 'ok' },
    siteText: scan,
  })
  assert.equal(v.signal, 'closed_permanently')
  assert.equal(v.confidence, 'high')
})

test('temporary closure: site phrase + Places agree → high; Places alone → medium', () => {
  const scan = scanSiteTextForClosure('We are temporarily closed for renovations, reopening in October.')
  assert.ok(scan.temporary.length >= 1)

  const both = classifyClosure({
    placesStatus: 'CLOSED_TEMPORARILY',
    placesName: 'Pemberley Tours',
    listingName: 'Pemberley Tours',
    websiteProbe: { classification: 'ok' },
    siteText: scan,
  })
  assert.equal(both.signal, 'closed_temporarily')
  assert.equal(both.confidence, 'high')

  const placesOnly = classifyClosure({
    placesStatus: 'CLOSED_TEMPORARILY',
    placesName: 'Pemberley Tours',
    listingName: 'Pemberley Tours',
    websiteProbe: { classification: 'ok' },
    siteText: null,
  })
  assert.equal(placesOnly.signal, 'closed_temporarily')
  assert.equal(placesOnly.confidence, 'medium')
})

test('CLOSED_TEMPORARILY on a name mismatch is downgraded', () => {
  const v = classifyClosure({
    placesStatus: 'CLOSED_TEMPORARILY',
    placesName: 'Totally Different Venue',
    listingName: 'Pemberley Tours',
    websiteProbe: null,
    siteText: null,
  })
  assert.equal(v.signal, 'possibly_closed')
  assert.equal(v.confidence, 'low')
})

test('reopened: temp-closed listing now OPERATIONAL (name matched) → reopened signal', () => {
  const v = classifyClosure({
    placesStatus: 'OPERATIONAL',
    placesName: 'Pemberley Tours',
    listingName: 'Pemberley Tours',
    websiteProbe: { classification: 'ok' },
    siteText: { permanent: [], temporary: [] },
    currentClosureStatus: 'temporarily_closed',
  })
  assert.equal(v.signal, 'reopened')
  assert.equal(v.confidence, 'medium')
})

test('reopened is NOT raised on a name mismatch or when still marked closed on-site', () => {
  const mismatch = classifyClosure({
    placesStatus: 'OPERATIONAL',
    placesName: 'A Different Business',
    listingName: 'Pemberley Tours',
    websiteProbe: { classification: 'ok' },
    siteText: null,
    currentClosureStatus: 'temporarily_closed',
  })
  assert.equal(mismatch, null)

  const stillClosed = classifyClosure({
    placesStatus: 'OPERATIONAL',
    placesName: 'Pemberley Tours',
    listingName: 'Pemberley Tours',
    websiteProbe: { classification: 'ok' },
    siteText: scanSiteTextForClosure('We are temporarily closed for renovations.'),
    currentClosureStatus: 'temporarily_closed',
  })
  assert.equal(stillClosed.signal, 'closed_temporarily')
})

test('operational venue with healthy site produces no signal', () => {
  const v = classifyClosure({
    placesStatus: 'OPERATIONAL',
    placesName: 'Corner Store Espresso',
    listingName: 'Corner Store Espresso',
    websiteProbe: { classification: 'ok' },
    siteText: { permanent: [], temporary: [] },
  })
  assert.equal(v, null)
})

test('scanSiteTextForClosure returns evidence snippets', () => {
  const scan = scanSiteTextForClosure('Big news — the shop is permanently closed as of June.')
  assert.equal(scan.permanent.length, 1)
  assert.match(scan.permanent[0], /permanently closed/i)
})

test('generic marketing text does not trip closure phrases', () => {
  const scan = scanSiteTextForClosure(
    'We are open seven days. Closed public holidays. Our kitchen closes at 3pm. Book your winter escape now. Taking a break from the city? Visit us.'
  )
  assert.equal(scan.permanent.length, 0)
  assert.equal(scan.temporary.length, 0)
})
