// Smoke + parser tests for the Phase 2 LLM wrapper.
//
// These tests do NOT hit the Anthropic API. They cover input validation, the
// user-turn rendering, and the response parser using a mocked Anthropic
// response object — wiring errors (wrong tool name, missing tool_use, etc.)
// surface here rather than at calibration time.
//
// Run with:  node --test lib/pitch/generate.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generatePitch,
  PHASE_2_MODEL,
  buildUserMessage,
  renderListingRecord,
  parseResponse,
  LLM_REQUEST_DEFAULTS,
} from './generate.mjs'
import { PHASE_2_PROMPT_VERSION } from './prompt.mjs'

// ── Exports / configuration ────────────────────────────────────────────────

test('exports generatePitch and PHASE_2_MODEL', () => {
  assert.equal(typeof generatePitch, 'function')
  assert.equal(PHASE_2_MODEL, 'claude-opus-4-7')
})

test('LLM_REQUEST_DEFAULTS pins the request shape', () => {
  // Positive assertions: the defaults we want to keep stable.
  assert.equal(LLM_REQUEST_DEFAULTS.model, 'claude-opus-4-7')
  assert.equal(LLM_REQUEST_DEFAULTS.output_config.effort, 'high')
  assert.ok(LLM_REQUEST_DEFAULTS.max_tokens >= 8000)
})

test('LLM_REQUEST_DEFAULTS must NOT include `thinking`', () => {
  // Negative lock-in. Adaptive thinking is incompatible with forced
  // tool_choice — Anthropic 400s with:
  //   "Thinking may not be enabled when tool_choice forces tool use."
  // (Verified via smoke test, request_id req_011CbFAq9HFgGjkt13nEZksG,
  //  7 May 2026.)
  // The claude-api skill recommends adaptive thinking by default for
  // complex tasks — but Phase 2 uses forced tool_choice, which makes
  // adaptive thinking impossible. The anti-hallucination guarantee lives
  // in fact-check, not in deliberation depth. Re-adding a `thinking`
  // field here will break every real LLM call.
  assert.equal(
    LLM_REQUEST_DEFAULTS.thinking,
    undefined,
    'LLM_REQUEST_DEFAULTS.thinking must be absent — Opus 4.7 adaptive thinking is incompatible with forced tool_choice (which Phase 2 requires for the structured-output guarantee). Re-adding it will break every real LLM call. Quality is preserved via output_config.effort = "high".'
  )
})

test('LLM_REQUEST_DEFAULTS is frozen', () => {
  // Defence against silent mutation at runtime.
  assert.equal(Object.isFrozen(LLM_REQUEST_DEFAULTS), true)
})

// ── Input validation (no network) ──────────────────────────────────────────

test('rejects missing anchor listing', async () => {
  await assert.rejects(() => generatePitch(null), /anchorListing is required/)
})

test('rejects anchor listing that is an array', async () => {
  await assert.rejects(() => generatePitch([{ id: 'x' }]), /anchorListing is required/)
})

test('rejects anchor listing without id', async () => {
  await assert.rejects(() => generatePitch({ name: 'X' }), /must have a string `id`/)
})

test('rejects invalid slot type', async () => {
  await assert.rejects(
    () => generatePitch({ id: 'x' }, { slotType: 'portal' }),
    /invalid slotType/
  )
})

// ── User-turn rendering ────────────────────────────────────────────────────

test('buildUserMessage tags general slot correctly', () => {
  const msg = buildUserMessage({ id: 'x', name: 'X' }, 'general')
  assert.ok(msg.includes('GENERAL SLOT'))
  assert.ok(!msg.includes('NEW-PRODUCER SLOT'))
})

test('buildUserMessage tags new-producer slot correctly', () => {
  const msg = buildUserMessage({ id: 'x', name: 'X' }, 'new_producer')
  assert.ok(msg.includes('NEW-PRODUCER SLOT'))
  assert.ok(msg.includes('uplift, not over-curation'))
})

test('buildUserMessage includes single-anchor + no-context instructions', () => {
  const msg = buildUserMessage({ id: 'x', name: 'X' }, 'general')
  assert.ok(msg.includes('SINGLE-ANCHOR MODE'))
  assert.ok(msg.includes('NO OTHER CONTEXT'))
  assert.ok(msg.includes('supporting_listings'))
})

test('buildUserMessage instructs the model to call submit_pitch or report_insufficient_data', () => {
  const msg = buildUserMessage({ id: 'x', name: 'X' }, 'general')
  assert.ok(msg.includes('submit_pitch'))
  assert.ok(msg.includes('report_insufficient_data'))
})

test('renderListingRecord produces deterministic, sorted output', () => {
  const a = renderListingRecord({ name: 'X', founded_year: 1985, description: 'desc' })
  const b = renderListingRecord({ founded_year: 1985, name: 'X', description: 'desc' })
  assert.equal(a, b)
  // Lines sorted alphabetically by key:
  const lines = a.split('\n')
  assert.ok(lines[0].startsWith('description:'))
  assert.ok(lines[1].startsWith('founded_year:'))
  assert.ok(lines[2].startsWith('name:'))
})

test('renderListingRecord surfaces null fields as <null>', () => {
  const out = renderListingRecord({ name: 'X', operator_name: null })
  assert.ok(out.includes('operator_name: <null>'))
})

test('renderListingRecord serialises arrays as JSON', () => {
  const out = renderListingRecord({ awards: ['Gold', 'Silver'] })
  assert.ok(out.includes('awards: ["Gold","Silver"]'))
})

// ── Response parser (mocked Anthropic responses) ──────────────────────────

test('parseResponse extracts a submit_pitch tool input', () => {
  const mockResponse = {
    id: 'msg_01234567abcdef',
    model: 'claude-opus-4-7',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_1',
        name: 'submit_pitch',
        input: {
          headline: 'Test',
          angle: 'Angle',
          anchor_listing: { id: 'a', name: 'A', vertical: 'v', region: 'r', slug: 's' },
          supporting_listings: [],
          verified_facts: [{ claim: 'X', field: 'name', value: 'A' }],
          editorial_framing: 'Framing text that is long enough to be substantive.',
          research_needed: [],
        },
      },
    ],
    stop_reason: 'tool_use',
  }
  const r = parseResponse(mockResponse)
  assert.equal(r.kind, 'pitch')
  assert.equal(r.data.headline, 'Test')
  assert.equal(r.prompt_version, PHASE_2_PROMPT_VERSION)
  assert.ok(r.generated_by.startsWith('claude-opus-4-7'))
  assert.ok(r.generated_at) // ISO timestamp
})

test('parseResponse handles report_insufficient_data with reason', () => {
  const mockResponse = {
    id: 'msg_01234567abcdef',
    model: 'claude-opus-4-7',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_2',
        name: 'report_insufficient_data',
        input: { reason: 'Description is 50 chars; no founding date; no awards.' },
      },
    ],
    stop_reason: 'tool_use',
  }
  const r = parseResponse(mockResponse)
  assert.equal(r.kind, 'insufficient_data')
  assert.equal(r.reason, 'Description is 50 chars; no founding date; no awards.')
  assert.equal(r.prompt_version, PHASE_2_PROMPT_VERSION)
})

test('parseResponse throws when model called no tool (forced tool_choice failed)', () => {
  const mockResponse = {
    id: 'msg_x',
    model: 'claude-opus-4-7',
    content: [{ type: 'text', text: 'naked text not in a tool' }],
    stop_reason: 'end_turn',
  }
  assert.throws(() => parseResponse(mockResponse), /did not call any tool/)
})

test('parseResponse throws on unexpected tool name (drift detection)', () => {
  const mockResponse = {
    id: 'msg_x',
    model: 'claude-opus-4-7',
    content: [{ type: 'tool_use', id: 'toolu_x', name: 'rogue_tool', input: {} }],
    stop_reason: 'tool_use',
  }
  assert.throws(() => parseResponse(mockResponse), /unexpected tool "rogue_tool"/)
})

test('parseResponse handles insufficient_data with missing reason gracefully', () => {
  const mockResponse = {
    id: 'msg_x',
    model: 'claude-opus-4-7',
    content: [
      { type: 'tool_use', id: 'toolu_x', name: 'report_insufficient_data', input: {} },
    ],
    stop_reason: 'tool_use',
  }
  const r = parseResponse(mockResponse)
  assert.equal(r.kind, 'insufficient_data')
  assert.equal(r.reason, '<no reason given>')
})
