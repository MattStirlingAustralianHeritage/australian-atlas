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

test('PHASE_2_PROMPT_VERSION matches current revision', () => {
  // v1 (2026-05-07): original Phase 2 prompt.
  // v2 (2026-05-22): added headline-grounding rule + atomic-claims rule.
  // v3 (2026-05-22): expanded headline-grounding rule to distinguish
  //   paraphrase (allowed) from arithmetic (forbidden) and added a positive
  //   grounded-headline example, after the v2 Morris dry-run produced "x"
  //   for headline/angle/framing rather than risk an unsourced word.
  // Per spec discipline, any prompt revision invalidates prior calibration-
  // gate runs — keep this assertion exact so a silent revision can't slip
  // past.
  assert.equal(typeof PHASE_2_PROMPT_VERSION, 'string')
  assert.equal(PHASE_2_PROMPT_VERSION, 'phase2-v3-2026-05-22')
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
    // v2/v3 additions (2026-05-22) — see the dedicated tests below for
    // why each rule exists and what bug it closes.
    // The headline-grounding rule was reworded in v3 to allow paraphrase
    // and forbid arithmetic; the opening sentence ("Every named entity…
    // must trace to a verified_facts entry") survives the revision and
    // is the right substring to lock in here.
    'Every named entity, date, number, and factual claim in your headline or angle must trace to a verified_facts entry',
    'Each verified_facts entry must contain exactly ONE atomic claim citing ONE database field',
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
  //
  // Note on the "when you can " entry: trailing space is deliberate. The v3
  // rule contains "When you cannot ground a claim through verified_facts",
  // which substring-matches the bare phrase "when you can" — but "cannot"
  // is exactly the opposite of softening, so the bare match was a false
  // positive. Trailing space catches the intended softening phrase ("when
  // you can do X" / "when you can manage") without catching "when you cannot".
  const forbidden = ['as much as possible', 'try to', 'when you can ', 'we recommend']
  for (const phrase of forbidden) {
    assert.equal(
      PHASE_2_SYSTEM_PROMPT.toLowerCase().includes(phrase),
      false,
      `system prompt should not contain "${phrase}"`
    )
  }
})

test('system prompt contains the headline grounding rule (v3)', () => {
  // Origin (v2, 2026-05-22): added after the Morris Whisky v1 dry-run
  // surfaced "166 Years" in the headline — a derived numeric (2026 - 1859)
  // that did NOT appear in any verified_facts entry. Fact-check validates
  // the verified_facts array but not headline/angle prose, so anything
  // the model puts in the headline that isn't also in verified_facts
  // bypasses the architectural anti-hallucination guarantee.
  //
  // Revision (v3, 2026-05-22): the v2 rule worked but caused Morris to
  // bail entirely — the model emitted "x" for headline/angle/framing
  // because "rephrase to avoid it" was read as license to omit prose.
  // v3 distinguishes PARAPHRASE (allowed and encouraged) from ARITHMETIC
  // and DERIVATION (forbidden), and adds a positive grounded-headline
  // example (locked in by the dedicated test below).
  assert.ok(
    PHASE_2_SYSTEM_PROMPT.includes(
      'Every named entity, date, number, and factual claim in your headline or angle must trace to a verified_facts entry'
    ),
    'The headline grounding rule is missing. The headline grounding rule prevents derived numerics like "166 Years" from slipping past fact-check. Without it, the model can put unsourced calculations and claims in the headline/angle that the fact-check function never sees. Re-add the rule before deleting this assertion.'
  )
  // Lock in the paraphrase carve-out. Without it, the v2 bail returns:
  // the model treats any rephrasing of cited facts as suspect and chooses
  // silence over violation.
  assert.ok(
    PHASE_2_SYSTEM_PROMPT.includes('PARAPHRASING is allowed and encouraged'),
    'The "PARAPHRASING is allowed and encouraged" clarification is missing from the headline grounding rule. This carve-out is what unblocked Morris-style data-rich headlines in v3 — without it, the model treats the rule as a hard reject and emits empty placeholders (the v2 "x" bail).'
  )
  // Lock in the explicit arithmetic prohibition. The model needs to know
  // that derived numerics (e.g. computing "166 years" from founding_year)
  // are factual claims requiring their own verified_facts entries.
  assert.ok(
    PHASE_2_SYSTEM_PROMPT.includes('ARITHMETIC and DERIVATION are not allowed'),
    'The "ARITHMETIC and DERIVATION are not allowed" clarification is missing. Without it, the model treats arithmetic on founding dates as creative framing rather than factual claims requiring grounding — the original "166 Years" bug returns.'
  )
})

test('system prompt contains the grounded-headline positive example (v3)', () => {
  // Added 2026-05-22 with the v3 revision. Show-don't-tell: a concrete
  // positive example of a grounded headline gives the model a target
  // shape to aim at when working with venues like Morris (rich data,
  // derived-numeric temptations). Without the example, even the
  // PARAPHRASE/ARITHMETIC carve-out wording may not be enough to coax
  // the model out of bail mode on data-rich candidates.
  assert.ok(
    PHASE_2_SYSTEM_PROMPT.includes('Morris of Rutherglen'),
    'The grounded-headline positive example is load-bearing. Removing it caused the model to bail on data-rich pitches in v2 (Morris emitted "x" for headline/angle/framing). The example shows the model what a valid grounded headline looks like when working with derived-numeric temptations. Re-add the example before deleting this assertion.'
  )
  // Lock in the contrast pair — the example is more useful with the
  // non-grounded counterexample alongside it.
  assert.ok(
    PHASE_2_SYSTEM_PROMPT.includes('NON-GROUNDED'),
    'The NON-GROUNDED counterexample is missing. The grounded/non-grounded contrast pair is what makes the positive example pedagogically useful — without it, the model sees only "what to do" and not "what to avoid", which previously caused the v2 bail.'
  )
})

test('system prompt contains the atomic-claims rule (v2)', () => {
  // Added 2026-05-22 after the Morris Whisky dry-run produced a single
  // verified_facts entry that aggregated five sub-claims (six generations,
  // 1859, Darren Peck, tokay-cask technique, $148 Tokay Barrel, Halliday
  // recognition) all citing the description field. The substring match
  // passed because the aggregate substring is genuinely in the description,
  // but if any individual sub-claim had been wrong, fact-check could not
  // have caught it — the parent substring would still match.
  assert.ok(
    PHASE_2_SYSTEM_PROMPT.includes(
      'Each verified_facts entry must contain exactly ONE atomic claim citing ONE database field'
    ),
    'The atomic claims rule is missing. The atomic claims rule prevents aggregated multi-claim verified_facts entries from passing fact-check via substring overlap. Without it, the model can pack multiple sub-claims into a single entry, and fact-check cannot validate each sub-claim independently. Re-add the rule before deleting this assertion.'
  )
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
  // item must require {claim, field, value}. minItems of 0 or 1 are allowed
  // under Anthropic strict mode (verified against the live API docs);
  // anything > 1 would fail server-side validation, so do not raise this.
  const vf = SUBMIT_PITCH_TOOL.input_schema.properties.verified_facts
  assert.equal(vf.minItems, 1)
  for (const key of ['claim', 'field', 'value']) {
    assert.ok(vf.items.required.includes(key), `verified_facts item is missing required key: ${key}`)
  }

  // verified_facts.items.value MUST declare type: 'string'. Anthropic's strict
  // tool schema rejects properties without a `type`. The validator
  // (fact-check.mjs) coerces stringified numbers/booleans back to their
  // underlying types — emit "1859" not 1859, "true" not true. Re-introducing
  // a union type (anyOf or omitting `type`) will break every real LLM call
  // with: "tools.0.custom: Invalid schema: Schema type is missing".
  // (Verified via smoke test, request_id req_011CbFANkCxx1MauoS7kj75w, 7 May 2026.)
  const valueProp = SUBMIT_PITCH_TOOL.input_schema.properties.verified_facts.items.properties.value
  assert.equal(
    valueProp.type,
    'string',
    'verified_facts.items.value.type must be "string" — Anthropic strict mode rejects missing/union types here. Coercion to source-column type happens in fact-check.mjs.'
  )

  // editorial_framing must NOT declare `minLength`. Anthropic's strict tool
  // schema rejects all string-length constraints (verified against the live
  // API docs, 7 May 2026). The 40-char floor is enforced by the confidence-
  // scoring function (no +10 award when framing.length < 40) — that's a
  // low-confidence signal, not a hard pitch rejection, which matches the
  // spec's "confidence < 70 surfaces with a flag" design. Re-adding minLength
  // here will break every real LLM call.
  const framing = SUBMIT_PITCH_TOOL.input_schema.properties.editorial_framing
  assert.equal(
    framing.minLength,
    undefined,
    'editorial_framing.minLength must be absent — Anthropic strict mode rejects minLength. The 40-char floor is checked in confidence.mjs (no +10 award) rather than as a hard schema constraint.'
  )

  // supporting_listings must NOT declare `maxItems` in the schema.
  // Anthropic's tool input_schema returns 400 on this with the message:
  //   "tools.0.custom: For 'array' type, property 'maxItems' is not supported"
  // (verified via smoke test against the live API, request_id
  //  req_011CbF9w2YzcGm3DLG5NcpAG, 7 May 2026).
  // The spec's four-supporting-listings cap is enforced in the pipeline
  // orchestrator's defensive check, not in the schema. Re-adding `maxItems`
  // here will break every real LLM call.
  const supporting = SUBMIT_PITCH_TOOL.input_schema.properties.supporting_listings
  assert.equal(
    supporting.maxItems,
    undefined,
    'supporting_listings.maxItems must be absent — Anthropic 400s on maxItems for array types. The 4-listing cap is enforced in pipeline.mjs, not in the schema.'
  )
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
