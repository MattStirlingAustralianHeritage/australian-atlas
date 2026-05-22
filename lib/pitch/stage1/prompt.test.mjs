// Lock-in tests for the Phase 3 Stage 1 extraction prompt + tool schema.
//
// Same shape as lib/pitch/prompt.test.mjs (the Phase 2 prompt locks). These
// are not behavioural tests — they catch silent edits to the spec-quoted
// CRITICAL RULES and shape regressions in the tool schema.
//
// Run with:  node --test lib/pitch/stage1/prompt.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PHASE_3_STAGE_1_PROMPT_VERSION,
  PHASE_3_STAGE_1_SYSTEM_PROMPT,
  SUBMIT_EXTRACTION_TOOL,
  PHASE_3_STAGE_1_TOOLS,
  PHASE_3_STAGE_1_TOOL_CHOICE,
  STAGE_1_SIGNAL_TYPES,
  ATTRIBUTE_TYPES,
  ATTRIBUTE_CONFIDENCE_VALUES,
} from './prompt.mjs'

// ── Version ─────────────────────────────────────────────────────────────────

test('PHASE_3_STAGE_1_PROMPT_VERSION matches current revision', () => {
  // Bump on any wording change to the system prompt or tool schema. Pinned
  // exact so silent revisions fail loudly.
  assert.equal(PHASE_3_STAGE_1_PROMPT_VERSION, 'phase3-stage1-v2-2026-05-22')
})

// ── System prompt opens correctly ──────────────────────────────────────────

test('system prompt opens with the retrieval-not-generation framing', () => {
  assert.ok(
    PHASE_3_STAGE_1_SYSTEM_PROMPT.startsWith(
      'You are extracting structured research material from the first-party website'
    )
  )
})

// ── CRITICAL RULES locked in by substring ──────────────────────────────────

test('system prompt contains every Stage 1 CRITICAL RULE verbatim', () => {
  // Each fragment is a distinctive substring of a Stage 1 rule. If any is
  // missing, the prompt has drifted from the authoritative version in
  // docs/pitch-system-phase3-design.md §Stage 1 → Structured extraction prompt.
  const required = [
    'YOUR JOB IS RETRIEVAL, NOT GENERATION',
    'Every source_excerpt MUST be a verbatim substring',
    'Paraphrasing source_excerpts is forbidden',
    'Multi-step inference, aesthetic interpretation, and speculation are rejected',
    'Do not invent characters not named in the source',
    'A character must be presented as connected to the venue',
    'One quote per character maximum',
    'Each attribute is one atomic claim with one source_excerpt',
    'Empty arrays are valid output',
  ]
  for (const fragment of required) {
    assert.ok(
      PHASE_3_STAGE_1_SYSTEM_PROMPT.includes(fragment),
      `system prompt is missing required spec fragment: "${fragment.slice(0, 60)}…"`
    )
  }
})

test('system prompt forbids softening language', () => {
  // Mirrors the Phase 2 softening-check. If someone rewords the rules to be
  // friendlier, these classic softeners catch it. Note the trailing-space
  // discipline on "when you can " (per lib/pitch/prompt.test.mjs's
  // "When you cannot" carve-out — same applies here).
  const forbidden = ['as much as possible', 'try to', 'when you can ', 'we recommend']
  for (const phrase of forbidden) {
    assert.equal(
      PHASE_3_STAGE_1_SYSTEM_PROMPT.toLowerCase().includes(phrase),
      false,
      `system prompt should not contain "${phrase}"`
    )
  }
})

// ── Tool schema shape ─────────────────────────────────────────────────────

test('submit_extraction tool is well-formed', () => {
  assert.equal(SUBMIT_EXTRACTION_TOOL.name, 'submit_extraction')
  assert.equal(SUBMIT_EXTRACTION_TOOL.strict, true)
  assert.equal(SUBMIT_EXTRACTION_TOOL.input_schema.type, 'object')
  assert.equal(SUBMIT_EXTRACTION_TOOL.input_schema.additionalProperties, false)
  assert.deepEqual(
    SUBMIT_EXTRACTION_TOOL.input_schema.required.sort(),
    ['characters', 'venue_signals'].sort()
  )
})

test('characters items require name + role + source_url + source_excerpt + attributes', () => {
  const char = SUBMIT_EXTRACTION_TOOL.input_schema.properties.characters.items
  assert.equal(char.type, 'object')
  assert.equal(char.additionalProperties, false)
  for (const key of ['name', 'role', 'source_url', 'source_excerpt', 'attributes']) {
    assert.ok(
      char.required.includes(key),
      `characters[].${key} must be in required`
    )
  }
})

test('character.attributes items require type + text + excerpt + confidence', () => {
  const attr = SUBMIT_EXTRACTION_TOOL.input_schema
    .properties.characters.items.properties.attributes.items
  assert.equal(attr.type, 'object')
  assert.equal(attr.additionalProperties, false)
  for (const key of ['attribute_type', 'attribute_text', 'source_excerpt', 'confidence']) {
    assert.ok(attr.required.includes(key), `attributes[].${key} must be in required`)
  }
})

test('attribute_type enum matches DB CHECK constraint values', () => {
  // The DB constraint on pitch_character_attributes.attribute_type is:
  //   CHECK (attribute_type IN ('background', 'family_history', 'technique',
  //                              'achievement', 'quote', 'biographical',
  //                              'philosophy'))
  // Tool enum must be a subset of (ideally equal to) this list. If the LLM
  // returns a value outside the enum it'd 22P02 at insert time.
  const attr = SUBMIT_EXTRACTION_TOOL.input_schema
    .properties.characters.items.properties.attributes.items
  assert.deepEqual(attr.properties.attribute_type.enum.sort(), [...ATTRIBUTE_TYPES].sort())
  assert.deepEqual(
    [...ATTRIBUTE_TYPES].sort(),
    ['achievement', 'background', 'biographical', 'family_history', 'philosophy', 'quote', 'technique']
  )
})

test('confidence enum matches the pitch_attribute_confidence DB enum', () => {
  const attr = SUBMIT_EXTRACTION_TOOL.input_schema
    .properties.characters.items.properties.attributes.items
  assert.deepEqual(attr.properties.confidence.enum.sort(), ['explicit', 'implied'])
  assert.deepEqual([...ATTRIBUTE_CONFIDENCE_VALUES].sort(), ['explicit', 'implied'])
})

test('venue_signals items require signal_type + source_url + source_excerpt + signal_data', () => {
  const sig = SUBMIT_EXTRACTION_TOOL.input_schema.properties.venue_signals.items
  assert.equal(sig.type, 'object')
  assert.equal(sig.additionalProperties, false)
  for (const key of ['signal_type', 'source_url', 'source_excerpt', 'signal_data']) {
    assert.ok(sig.required.includes(key), `venue_signals[].${key} must be in required`)
  }
})

test('signal_type enum is Stage-1-restricted (no silence / listing_change / cluster)', () => {
  // Stage 1 produces only 9 of the 12 pitch_signal_type enum values.
  // silence is a Stage 6 output (computed from absences).
  // listing_change is Atlas-internal (Stage 4).
  // cluster is a cross-stage analytic signal, not a first-party one.
  const sig = SUBMIT_EXTRACTION_TOOL.input_schema.properties.venue_signals.items
  assert.deepEqual(sig.properties.signal_type.enum.sort(), [...STAGE_1_SIGNAL_TYPES].sort())
  for (const forbidden of ['silence', 'listing_change', 'cluster']) {
    assert.equal(
      sig.properties.signal_type.enum.includes(forbidden),
      false,
      `Stage 1 signal_type enum must not include ${forbidden} (other stages produce it)`
    )
  }
  assert.equal(sig.properties.signal_type.enum.length, 9)
})

test('signal_data is a JSON-encoded string (strict-mode workaround for open-shape objects)', () => {
  // Anthropic strict mode requires `additionalProperties: false` on every
  // nested object, which is incompatible with the open-shape requirement
  // for signal_data (the shape varies per signal_type). The schema declares
  // signal_data as type: 'string' carrying a JSON-encoded payload; the
  // orchestrator parses it back into an object before inserting into the
  // jsonb pitch_signals.signal_data column. Same workaround Phase 2 uses
  // for verified_facts.value (see lib/pitch/prompt.mjs).
  const sig = SUBMIT_EXTRACTION_TOOL.input_schema.properties.venue_signals.items
  assert.equal(sig.properties.signal_data.type, 'string')
})

// ── No strict-mode rejected features ───────────────────────────────────────

test('tool schema does NOT use maxItems / minItems / minLength / maxLength (strict-mode rejected)', () => {
  // Spec audit lessons from Phase 2 — Anthropic strict mode rejects:
  // - maxItems on arrays (any value)
  // - minItems > 1
  // - any minLength / maxLength
  // Walk the schema tree and assert none of these appear.
  function walk(node, path = []) {
    if (!node || typeof node !== 'object') return
    if ('maxItems' in node) {
      assert.fail(`maxItems found at ${path.join('.')} — strict mode rejects this`)
    }
    if ('minItems' in node && node.minItems > 1) {
      assert.fail(`minItems > 1 at ${path.join('.')} — strict mode rejects this`)
    }
    if ('minLength' in node) {
      assert.fail(`minLength at ${path.join('.')} — strict mode rejects this`)
    }
    if ('maxLength' in node) {
      assert.fail(`maxLength at ${path.join('.')} — strict mode rejects this`)
    }
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'object' && v !== null) walk(v, [...path, k])
    }
  }
  walk(SUBMIT_EXTRACTION_TOOL.input_schema)
})

test('every property in the schema declares a `type` (strict-mode requirement)', () => {
  // Anthropic strict mode rejects properties without a `type`. Walk the
  // schema; every property under a `properties` block must have `type` set.
  function walkProperties(node, path = []) {
    if (!node || typeof node !== 'object') return
    if (node.properties && typeof node.properties === 'object') {
      for (const [propName, propSchema] of Object.entries(node.properties)) {
        const propPath = [...path, propName]
        assert.ok(
          propSchema && typeof propSchema === 'object' && propSchema.type,
          `property at ${propPath.join('.')} is missing \`type\` (strict-mode requirement)`
        )
        walkProperties(propSchema, propPath)
      }
    }
    if (node.items) walkProperties(node.items, [...path, '[items]'])
  }
  walkProperties(SUBMIT_EXTRACTION_TOOL.input_schema)
})

// ── PHASE_3_STAGE_1_TOOLS + tool_choice ────────────────────────────────────

test('PHASE_3_STAGE_1_TOOLS exposes exactly one tool', () => {
  assert.equal(PHASE_3_STAGE_1_TOOLS.length, 1)
  assert.equal(PHASE_3_STAGE_1_TOOLS[0].name, 'submit_extraction')
})

test('PHASE_3_STAGE_1_TOOL_CHOICE forces the submit_extraction tool', () => {
  // Unlike Phase 2's { type: "any" } (which lets the model pick between
  // submit_pitch and report_insufficient_data), Stage 1 has only one tool
  // and pins to it directly.
  assert.equal(PHASE_3_STAGE_1_TOOL_CHOICE.type, 'tool')
  assert.equal(PHASE_3_STAGE_1_TOOL_CHOICE.name, 'submit_extraction')
  assert.equal(PHASE_3_STAGE_1_TOOL_CHOICE.disable_parallel_tool_use, true)
})

// ── Exported lookup tables are frozen ──────────────────────────────────────

test('exported enum/lookup arrays are frozen', () => {
  assert.equal(Object.isFrozen(STAGE_1_SIGNAL_TYPES), true)
  assert.equal(Object.isFrozen(ATTRIBUTE_TYPES), true)
  assert.equal(Object.isFrozen(ATTRIBUTE_CONFIDENCE_VALUES), true)
  assert.equal(Object.isFrozen(PHASE_3_STAGE_1_TOOLS), true)
  assert.equal(Object.isFrozen(PHASE_3_STAGE_1_TOOL_CHOICE), true)
})
