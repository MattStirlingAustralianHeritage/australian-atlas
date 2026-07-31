import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyProbeFailure,
  classifyProbeStatus,
  placesEscalationReason,
  htmlToVisibleText,
} from './probe.js'
import { melbourneMonthKey, melbourneMonthStart } from './monthWindow.js'

test('classifyProbeFailure: the real code lives on err.cause.code', () => {
  assert.equal(classifyProbeFailure({ cause: { code: 'ENOTFOUND' } }), 'dead_dns')
  assert.equal(classifyProbeFailure({ cause: { code: 'ECONNREFUSED' } }), 'dead_refused')
  assert.equal(classifyProbeFailure({ code: 'ECONNREFUSED' }), 'dead_refused')
})

test('classifyProbeFailure: TLS problems are tls_issue, never dead', () => {
  assert.equal(classifyProbeFailure({ cause: { code: 'CERT_HAS_EXPIRED' } }), 'tls_issue')
  assert.equal(classifyProbeFailure({ cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } }), 'tls_issue')
  assert.equal(classifyProbeFailure({ cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' } }), 'tls_issue')
  assert.equal(classifyProbeFailure({ cause: { code: 'EPROTO' } }), 'tls_issue')
})

test('classifyProbeFailure: transient wobbles are fetch_error, not dead', () => {
  assert.equal(classifyProbeFailure({ cause: { code: 'EAI_AGAIN' } }), 'fetch_error')
  assert.equal(classifyProbeFailure({ cause: { code: 'ECONNRESET' } }), 'fetch_error')
  assert.equal(classifyProbeFailure(new Error('mystery')), 'fetch_error')
})

test('classifyProbeFailure: aborts and connect timeouts are dead_timeout (transient downstream)', () => {
  assert.equal(classifyProbeFailure({ name: 'AbortError' }), 'dead_timeout')
  assert.equal(classifyProbeFailure({ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }), 'dead_timeout')
})

test('classifyProbeStatus: 2xx/3xx ok, 404/410 gone, others http_error', () => {
  assert.equal(classifyProbeStatus(200), 'ok')
  assert.equal(classifyProbeStatus(308), 'ok')
  assert.equal(classifyProbeStatus(404), 'http_gone')
  assert.equal(classifyProbeStatus(410), 'http_gone')
  assert.equal(classifyProbeStatus(403), 'http_error')
  assert.equal(classifyProbeStatus(503), 'http_error')
})

test('placesEscalationReason: healthy site with no signals stays free', () => {
  assert.equal(placesEscalationReason({
    website: 'https://example.com.au',
    probeClassification: 'ok',
    siteScan: { permanent: [], temporary: [] },
    communityReports: 0,
    closureStatus: null,
  }), null)
})

test('placesEscalationReason: escalates for no-website, dead site, closure phrases, community reports, temp recheck', () => {
  assert.equal(placesEscalationReason({ website: null }), 'no_website')
  assert.equal(placesEscalationReason({ website: 'x', probeClassification: 'dead_dns' }), 'website_dead')
  assert.equal(placesEscalationReason({ website: 'x', probeClassification: 'ok', siteScan: { permanent: ['…closed…'], temporary: [] } }), 'site_says_closed')
  assert.equal(placesEscalationReason({ website: 'x', probeClassification: 'ok', siteScan: { permanent: [], temporary: ['…renovations…'] } }), 'site_says_paused')
  assert.equal(placesEscalationReason({ website: 'x', probeClassification: 'ok', communityReports: 2 }), 'community_reports')
  assert.equal(placesEscalationReason({ website: 'x', probeClassification: 'ok', closureStatus: 'temporarily_closed' }), 'recheck_temporary_closure')
})

test('placesEscalationReason: TLS issues and timeouts alone do NOT spend budget', () => {
  assert.equal(placesEscalationReason({ website: 'x', probeClassification: 'tls_issue' }), null)
  assert.equal(placesEscalationReason({ website: 'x', probeClassification: 'dead_timeout' }), null)
  assert.equal(placesEscalationReason({ website: 'x', probeClassification: 'http_error' }), null)
})

test('htmlToVisibleText strips scripts, styles, tags and entities', () => {
  const html = `<html><head><style>.a{color:red}</style><script>var closed=true</script></head>
    <body><h1>Caf&eacute;</h1><p>We are <b>permanently&nbsp;closed</b> &amp; grateful.</p></body></html>`
  const text = htmlToVisibleText(html)
  assert.ok(text.includes('permanently closed'))
  assert.ok(text.includes('& grateful'))
  assert.ok(!text.includes('var closed'))
  assert.ok(!text.includes('color:red'))
})

test('melbourneMonthStart: AEST month boundary (July 2026)', () => {
  const mid = new Date('2026-07-15T00:00:00Z')
  assert.equal(melbourneMonthKey(mid), '2026-07')
  // 1 July 2026 00:00 AEST (+10) = 30 June 14:00 UTC
  assert.equal(melbourneMonthStart(mid).toISOString(), '2026-06-30T14:00:00.000Z')
})

test('melbourneMonthStart: AEDT month boundary (January 2026)', () => {
  const mid = new Date('2026-01-15T00:00:00Z')
  assert.equal(melbourneMonthKey(mid), '2026-01')
  // 1 Jan 2026 00:00 AEDT (+11) = 31 Dec 13:00 UTC
  assert.equal(melbourneMonthStart(mid).toISOString(), '2025-12-31T13:00:00.000Z')
})

test('melbourneMonthStart: late-UTC instant that is already next month in Melbourne', () => {
  // 30 June 2026 15:30 UTC = 1 July 2026 01:30 AEST → the July window has begun
  const edge = new Date('2026-06-30T15:30:00Z')
  assert.equal(melbourneMonthKey(edge), '2026-07')
  assert.equal(melbourneMonthStart(edge).toISOString(), '2026-06-30T14:00:00.000Z')
})
