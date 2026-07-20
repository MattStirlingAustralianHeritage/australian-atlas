import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRewriteMessage, generateRewrite } from './rewrite.mjs'

// Same mutually-grounded fixtures as generate.test.mjs.
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

// Published copy carrying a claim that is NOT in the facts — an admin approved
// it previously, so a revision that keeps it must still pass the gate.
const PUBLISHED_WITH_EXTRA = `A 1923 red-brick warehouse on Gertrude Street, Fitzroy, once the Fitzroy Cable Tram engine house.

A long shared lunch of six courses.`

function scriptedLLM(responses) {
  const calls = []
  let i = 0
  const fn = async ({ system, messages }) => {
    calls.push({ system, messages })
    const r = responses[Math.min(i, responses.length - 1)]
    i++
    return typeof r === 'string' ? { text: r, model: 'test-model' } : r
  }
  fn.calls = calls
  return fn
}

test('buildRewriteMessage leads with the change request and carries both copies', () => {
  const msg = buildRewriteMessage({
    facts: FACTS,
    listing: { name: 'Mister Bianco' },
    currentText: 'Old published text.',
    draftText: 'Pending draft text.',
    requestNote: 'Please mention the Saturday sitting.',
    adminGuidance: 'Tighten the middle.',
  })
  assert.match(msg, /CHANGE REQUEST:/)
  assert.match(msg, /From the operator: Please mention the Saturday sitting\./)
  assert.match(msg, /From the editor: Tighten the middle\./)
  assert.match(msg, /CURRENT DESCRIPTION \(the text being revised\):\nPending draft text\./)
  assert.match(msg, /PREVIOUSLY PUBLISHED DESCRIPTION[\s\S]*Old published text\./)
  assert.match(msg, /The building: A 1923 red-brick warehouse/)
  assert.match(msg, /"Mister Bianco"/)
})

test('passes when the revision is grounded in the facts', async () => {
  const llm = scriptedLLM([GROUNDED])
  const r = await generateRewrite({
    facts: FACTS,
    listing: { name: 'X' },
    draftText: GROUNDED,
    requestNote: 'Shorter please.',
    llm,
  })
  assert.equal(r.ok, true, JSON.stringify({ banned: r.banned, binding: r.binding }))
  assert.equal(llm.calls.length, 1)
})

test('previously published copy grounds claims the facts do not carry', async () => {
  // The revision keeps "Fitzroy Cable Tram" — absent from FACTS, present in
  // the published copy. Without extraSources this is a hard binding failure.
  const revision = `${GROUNDED}

Once the Fitzroy Cable Tram engine house.`
  const llm = scriptedLLM([revision])
  const r = await generateRewrite({
    facts: FACTS,
    currentText: PUBLISHED_WITH_EXTRA,
    draftText: GROUNDED,
    requestNote: 'Bring back the tram history.',
    llm,
  })
  assert.equal(r.ok, true, JSON.stringify(r.binding))
})

test('the unapproved draft being revised does NOT ground its own inventions', async () => {
  // "Collingwood Technical School" appears only in the flagged draft under
  // revision — keeping it must fail binding (draftText is not a source).
  const flaggedDraft = `${GROUNDED}

Housed in the old Collingwood Technical School.`
  const llm = scriptedLLM([flaggedDraft])
  const r = await generateRewrite({
    facts: FACTS,
    currentText: '',
    draftText: flaggedDraft,
    requestNote: 'Fix the flags.',
    llm,
  })
  assert.equal(r.ok, false)
  assert.ok(r.binding.failed_claims.some(c => c.value.includes('Collingwood')))
})

test('retries with a correction naming the failure, then succeeds', async () => {
  const bad = `${GROUNDED}

A hidden gem since 1887.`
  const llm = scriptedLLM([bad, GROUNDED])
  const r = await generateRewrite({ facts: FACTS, draftText: GROUNDED, requestNote: 'x', llm })
  assert.equal(r.ok, true)
  assert.equal(r.attempts.length, 2)
  const correction = llm.calls[1].messages[2].content
  assert.match(correction, /hidden gem/)
  assert.match(correction, /1887/)
})

test('returns failing (never a template) when every attempt fails', async () => {
  const bad = 'A world-class venue established 1600.'
  const llm = scriptedLLM([bad])
  const r = await generateRewrite({ facts: FACTS, requestNote: 'x', llm, maxRetries: 1 })
  assert.equal(r.ok, false)
  assert.equal(r.attempts.length, 2)
  assert.equal(r.text, bad)
})
