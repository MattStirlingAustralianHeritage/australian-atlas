// Parser + user-turn tests for the prose verification gate.
//
// No network. The load-bearing assertion is that the gate decision is derived
// from the flags array, not the model's self-reported `passed` — so a model
// that contradicts itself (lists flags but says passed:true) is still failed.
//
// Run with:  node --test lib/pitch/verify.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  verifyPitch,
  VERIFY_MODEL,
  VERIFY_PROMPT_VERSION,
  SUBMIT_VERIFICATION_TOOL,
  buildVerifyUserMessage,
  parseVerifyResponse,
} from './verify.mjs'

// ── Exports / configuration ────────────────────────────────────────────────

test('verification runs on Sonnet 4.6', () => {
  assert.equal(VERIFY_MODEL, 'claude-sonnet-4-6')
})

test('SUBMIT_VERIFICATION_TOOL is strict with passed + flags required', () => {
  assert.equal(SUBMIT_VERIFICATION_TOOL.strict, true)
  assert.deepEqual(SUBMIT_VERIFICATION_TOOL.input_schema.required, ['passed', 'flags'])
  const flagItem = SUBMIT_VERIFICATION_TOOL.input_schema.properties.flags.items
  assert.deepEqual(flagItem.required, ['claim', 'reason'])
})

// ── Input validation (no network) ──────────────────────────────────────────

test('rejects missing pitch', async () => {
  await assert.rejects(() => verifyPitch(null, { id: 'x' }), /pitch is required/)
})

test('rejects missing listing', async () => {
  await assert.rejects(() => verifyPitch({ headline: 'h' }, null), /listing is required/)
})

// ── User-turn rendering ─────────────────────────────────────────────────────

test('buildVerifyUserMessage includes prose and source sections', () => {
  const msg = buildVerifyUserMessage(
    {
      headline: 'Hands in the Clay on Beaufort Street',
      angle: 'A studio teaching hand-building.',
      editorial_framing: 'Open on the wheel.',
      verified_facts: [{ claim: 'on Beaufort Street', field: 'description', value: 'Beaufort Street studio' }],
    },
    { id: 'x', name: 'Clay Studio', description: 'Beaufort Street studio' }
  )
  assert.ok(msg.includes('PROSE TO VERIFY'))
  assert.ok(msg.includes('Hands in the Clay on Beaufort Street'))
  assert.ok(msg.includes('VENUE DATABASE RECORD'))
  assert.ok(msg.includes('FACTS THE WRITER DECLARED'))
  assert.ok(msg.includes('submit_verification'))
})

test('buildVerifyUserMessage handles no declared facts', () => {
  const msg = buildVerifyUserMessage(
    { headline: 'h', angle: 'a', editorial_framing: 'e', verified_facts: [] },
    { id: 'x', name: 'X' }
  )
  assert.ok(msg.includes('(none declared)'))
})

// ── Response parser (mocked Anthropic responses) ────────────────────────────

function mockResponse(input) {
  return {
    id: 'msg_verify_0001',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'tool_use', id: 'toolu_v', name: 'submit_verification', input }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 800, output_tokens: 40 },
  }
}

test('parseVerifyResponse passes when flags is empty', () => {
  const r = parseVerifyResponse(mockResponse({ passed: true, flags: [] }))
  assert.equal(r.passed, true)
  assert.equal(r.flags.length, 0)
  assert.equal(r.verify_prompt_version, VERIFY_PROMPT_VERSION)
  assert.equal(r.usage.input_tokens, 800)
})

test('parseVerifyResponse fails when flags are present', () => {
  const r = parseVerifyResponse(
    mockResponse({
      passed: false,
      flags: [{ claim: 'over fifteen years', reason: 'arithmetic: derived from founded_year 2009' }],
    })
  )
  assert.equal(r.passed, false)
  assert.equal(r.flags.length, 1)
  assert.equal(r.flags[0].claim, 'over fifteen years')
})

test('parseVerifyResponse OVERRULES a model that flags a claim but claims passed:true', () => {
  // Load-bearing: the gate trusts the flags array, not the model's `passed`.
  const r = parseVerifyResponse(
    mockResponse({
      passed: true, // model contradicts itself
      flags: [{ claim: '166 years', reason: 'arithmetic' }],
    })
  )
  assert.equal(r.passed, false, 'flags present must force passed=false regardless of self-report')
})

test('parseVerifyResponse throws when model called the wrong tool', () => {
  const bad = {
    id: 'msg_x',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'tool_use', id: 'toolu_x', name: 'rogue', input: {} }],
    stop_reason: 'tool_use',
  }
  assert.throws(() => parseVerifyResponse(bad), /did not call submit_verification/)
})

test('parseVerifyResponse throws when model called no tool', () => {
  const bad = {
    id: 'msg_x',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text: 'naked text' }],
    stop_reason: 'end_turn',
  }
  assert.throws(() => parseVerifyResponse(bad), /did not call submit_verification/)
})
