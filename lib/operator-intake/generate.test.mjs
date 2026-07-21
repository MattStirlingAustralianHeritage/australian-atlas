import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildUserMessage,
  generateDescription,
  renderStoryAnswers,
  HAIKU_MODEL,
} from './generate.mjs'

// Same fixtures the source-binding suite proves are mutually grounded: every
// number and multi-word proper noun in GROUNDED traces to a field in FACTS.
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

// A scripted LLM that records every call and replays queued responses (clamping
// on the last one, so a single-element script answers every retry identically).
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

test('buildUserMessage labels facts, omits empties, and suppresses the venue name', () => {
  const msg = buildUserMessage({ facts: FACTS, listing: { name: 'Mister Bianco' } })
  assert.match(msg, /The building: A 1923 red-brick warehouse/)
  assert.match(msg, /What you book: A long shared lunch/)
  assert.match(msg, /Design & fittings: Recycled messmate/)
  assert.match(msg, /Established: 1923/)
  assert.match(msg, /Named products \/ makers: Mons Pinot; Jasper coffee/)
  // ownership_transition_note is empty → its label must not appear
  assert.ok(!/Ownership \/ change note:/.test(msg))
  // name suppression line, quoting the name but forbidding its use
  assert.match(msg, /"Mister Bianco"/)
  assert.match(msg, /Do not state the name in the description/)
})

test('passes on the first try when the draft is grounded and clean', async () => {
  const llm = scriptedLLM([GROUNDED])
  const r = await generateDescription({ facts: FACTS, listing: { name: 'X' }, llm })
  assert.equal(r.ok, true, JSON.stringify({ banned: r.banned, binding: r.binding }))
  assert.equal(r.attempts.length, 1)
  assert.equal(llm.calls.length, 1)
  assert.equal(r.model, 'test-model')
  assert.equal(r.banned.passed, true)
  assert.equal(r.binding.passed, true)
})

test('strips quotes that wrap the whole draft', async () => {
  const llm = scriptedLLM([`"${GROUNDED}"`])
  const r = await generateDescription({ facts: FACTS, llm })
  assert.ok(!r.text.startsWith('"'), 'leading quote stripped')
  assert.ok(!r.text.endsWith('"'), 'trailing quote stripped')
  assert.equal(r.ok, true)
})

test('model falls back to HAIKU_MODEL when the caller omits it', async () => {
  const llm = async () => ({ text: GROUNDED })
  const r = await generateDescription({ facts: FACTS, llm })
  assert.equal(r.model, HAIKU_MODEL)
})

test('a banned phrase triggers one corrective retry that recovers', async () => {
  const llm = scriptedLLM([GROUNDED + '\n\nA nestled corner.', GROUNDED])
  const r = await generateDescription({ facts: FACTS, llm, maxRetries: 1 })
  assert.equal(r.ok, true)
  assert.equal(r.attempts.length, 2)
  assert.equal(r.attempts[0].ok, false)
  assert.ok(r.attempts[0].banned.violations.includes('nestled'))
  // The corrective second call must be a 3-turn exchange whose final user turn
  // names the offending phrase so the retry edits that specific problem.
  const second = llm.calls[1].messages
  assert.equal(second.length, 3)
  assert.equal(second[0].role, 'user')
  assert.equal(second[1].role, 'assistant')
  assert.equal(second[2].role, 'user')
  assert.match(second[2].content, /nestled/)
})

test('an ungrounded number triggers a corrective retry naming the bad claim', async () => {
  const llm = scriptedLLM([GROUNDED + '\n\nFounded 1850.', GROUNDED])
  const r = await generateDescription({ facts: FACTS, llm, maxRetries: 1 })
  assert.equal(r.ok, true)
  assert.equal(r.attempts.length, 2)
  assert.ok(r.attempts[0].binding.failed_claims.some(c => c.value === '1850'))
  assert.match(llm.calls[1].messages[2].content, /1850/)
})

test('a persistent banned phrase stays not-ok but still returns the cleaned text', async () => {
  const llm = scriptedLLM([GROUNDED + '\n\nTruly iconic.'])
  const r = await generateDescription({ facts: FACTS, llm, maxRetries: 1 })
  assert.equal(r.ok, false)
  assert.equal(r.attempts.length, 2) // initial + one retry, both fail
  assert.ok(r.banned.violations.includes('iconic'))
  assert.ok(r.text.length > 0, 'failing draft is still returned for the admin gate to see')
})

test('maxRetries=0 makes exactly one attempt', async () => {
  const llm = scriptedLLM([GROUNDED + '\n\nTruly iconic.'])
  const r = await generateDescription({ facts: FACTS, llm, maxRetries: 0 })
  assert.equal(r.ok, false)
  assert.equal(r.attempts.length, 1)
  assert.equal(llm.calls.length, 1)
})

// ── Guided-interview answers in the prompt (Your Story rolled into intake) ───

test('buildUserMessage renders answered interview questions as labelled Q/A', () => {
  const msg = buildUserMessage({
    facts: {
      building_description: 'A weatherboard shopfront.',
      story_answers: { 1: 'Started as a market stall in 2003.', 6: '' },
    },
  })
  assert.match(msg, /Interview answers in the operator’s own words/)
  assert.match(msg, /Q: How did this place come to be\? \(the origin story\)\nA: Started as a market stall in 2003\./)
  assert.ok(!msg.includes('What does "independent" mean to you?'), 'blank answers omit their question')
})

test('buildUserMessage omits the interview block when nothing is answered', () => {
  const msg = buildUserMessage({ facts: { building_description: 'A weatherboard shopfront.', story_answers: {} } })
  assert.ok(!msg.includes('Interview answers'))
})

test('renderStoryAnswers returns null for empty or malformed input', () => {
  assert.equal(renderStoryAnswers(null), null)
  assert.equal(renderStoryAnswers({}), null)
  assert.equal(renderStoryAnswers(['a']), null)
})
