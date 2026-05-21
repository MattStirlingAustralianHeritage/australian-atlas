// Smoke tests for the Phase 2 system prompt + tool schema.
//
// These are not behavioural tests — the prompt and schema are static data —
// but they catch silent edits to the spec-quoted rules and shape regressions
// in the tool schemas. If a CRITICAL RULE is reworded or a required field is
// removed, these tests fail loudly.
//
// Run with:  node --test lib/pitch/prompt.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PHASE_2_PROMPT_VERSION,
  PHASE_2_SYSTEM_PROMPT,
  SUBMIT_PITCH_TOOL,
  REPORT_INSUFFICIENT_DATA_TOOL,
  PHASE_2_TOOLS,
  PHASE_2_TOOL_CHOICE,
} from './prompt.mjs'

test('PHASE_2_PROMPT_VERSION is a non-empty string', () => {
  assert.equal(typeof PHASE_2_PROMPT_VERSION, 'string')
  assert.ok(PHASE_2_PROMPT_VERSION.length > 0)
})

test('system prompt opens with the spec\'s framing sentence', () => {
  assert.ok(
    PHASE_2_SYSTEM_PROMPT.startsWith(
      'You are generating an editorial article brief for the Atlas Network'
    )
  )
})

test('system prompt contains every CRITICAL RULE verbatim from the spec', () => {
  // These fragments are unique substrings from the spec's CRITICAL RULES.
  // If any is missing the prompt has drifted from the authoritative version
  // in docs/pitch-system-design.md.
  const requiredFragments = [
    'You will be given the exact database record(s) for one or more listings',
    'If a field is empty or null, you MUST NOT invent content for it',
    'You may suggest an editorial ANGLE or FRAMING',
    'Do NOT invent operator names, founding dates, backstories, philosophies, awards',
    'Do NOT use phrases like "likely", "probably"',
    'Editorial framing is creative. Facts are not.',
    'If the data is too thin to support a grounded pitch',
  ]
  for (const fragment of requiredFragments) {
    assert.ok(
      PHASE_2_SYSTEM_PROMPT.includes(fragment),
      `system prompt is missing required spec fragment: "${fragment.slice(0, 60)}…"`
    )
  }
})

test('system prompt does NOT contain softening language', () => {
  // Belt-and-braces: if someone reworded the prompt to be friendlier, these
  // typical softening phrases should not appear.
  const forbidden = ['as much as possible', 'try to', 'when you can', 'we recommend']
  for (const phrase of forbidden) {
    assert.equal(
      PHASE_2_SYSTEM_PROMPT.toLowerCase().includes(phrase),
      false,
      `system prompt should not contain "${phrase}"`
    )
  }
})

test('submit_pitch tool exposes the spec\'s required output fields', () => {
  assert.equal(SUBMIT_PITCH_TOOL.name, 'submit_pitch')
  assert.equal(SUBMIT_PITCH_TOOL.strict, true)
  assert.equal(SUBMIT_PITCH_TOOL.input_schema.type, 'object')
  assert.equal(SUBMIT_PITCH_TOOL.input_schema.additionalProperties, false)

  const required = SUBMIT_PITCH_TOOL.input_schema.required
  for (const field of [
    'headline',
    'angle',
    'anchor_listing',
    'supporting_listings',
    'verified_facts',
    'editorial_framing',
    'research_needed',
  ]) {
    assert.ok(required.includes(field), `submit_pitch is missing required field: ${field}`)
  }

  // verified_facts is the load-bearing array — must have minItems 1 and each
  // item must require {claim, field, value}.
  const vf = SUBMIT_PITCH_TOOL.input_schema.properties.verified_facts
  assert.equal(vf.minItems, 1)
  for (const key of ['claim', 'field', 'value']) {
    assert.ok(vf.items.required.includes(key), `verified_facts item is missing required key: ${key}`)
  }

  // editorial_framing must have a minLength so a stub doesn't slip past the
  // confidence "framing distinguishable" signal.
  const framing = SUBMIT_PITCH_TOOL.input_schema.properties.editorial_framing
  assert.ok(framing.minLength >= 40, 'editorial_framing should require ≥ 40 chars')

  // supporting_listings must cap at 4 (5 listings total including anchor, per spec).
  const supporting = SUBMIT_PITCH_TOOL.input_schema.properties.supporting_listings
  assert.equal(supporting.maxItems, 4)
})

test('report_insufficient_data tool present and well-formed', () => {
  assert.equal(REPORT_INSUFFICIENT_DATA_TOOL.name, 'report_insufficient_data')
  assert.equal(REPORT_INSUFFICIENT_DATA_TOOL.strict, true)
  assert.ok(REPORT_INSUFFICIENT_DATA_TOOL.input_schema.required.includes('reason'))
})

test('PHASE_2_TOOLS exports both tools in stable order', () => {
  assert.equal(PHASE_2_TOOLS.length, 2)
  assert.equal(PHASE_2_TOOLS[0].name, 'submit_pitch')
  assert.equal(PHASE_2_TOOLS[1].name, 'report_insufficient_data')
})

test('PHASE_2_TOOL_CHOICE forces a tool call without prescribing which', () => {
  // type: "any" → model must call SOME tool, but can pick between submit_pitch
  // and report_insufficient_data based on whether it has enough to ground a pitch.
  assert.equal(PHASE_2_TOOL_CHOICE.type, 'any')
  assert.equal(PHASE_2_TOOL_CHOICE.disable_parallel_tool_use, true)
})
