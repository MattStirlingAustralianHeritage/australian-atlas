// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 system prompt + structured-output tool schema.
//
// The PHASE_2_SYSTEM_PROMPT below is quoted VERBATIM from
// docs/pitch-system-design.md §Phase 2 → System prompt. The seven CRITICAL
// RULES are non-negotiable; do not reword, soften, or extend them. Changes to
// the prompt require bumping PHASE_2_PROMPT_VERSION so audit history is
// preserved — every pitch row stores the version it was generated under.
//
// Structured output is produced via forced tool use (Anthropic's canonical
// pattern). The model must call exactly one of two tools per request:
//
//   • submit_pitch              — the structured editorial brief
//   • report_insufficient_data  — declares the listing data too thin to ground
//                                 a pitch (spec's "insufficient data" response)
//
// `tool_choice: { type: "any", disable_parallel_tool_use: true }` forces a
// single tool call without prescribing which one, so the model can self-route
// to "insufficient data" when warranted instead of fabricating to fill the gap.
//
// strict: true on each tool enables Claude's strict schema enforcement —
// invalid shapes are rejected server-side rather than slipping through.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stable version string written to `pitches.prompt_version` on every generated
 * pitch. Bump when any of the constants in this file change.
 */
export const PHASE_2_PROMPT_VERSION = 'phase2-v1-2026-05-07'

/**
 * The Phase 2 system prompt, quoted verbatim from docs/pitch-system-design.md
 * §Phase 2 → System prompt. The seven CRITICAL RULES below are the
 * architectural anti-hallucination contract — do not edit them without
 * (a) bumping PHASE_2_PROMPT_VERSION and (b) re-running calibration Gate 1
 * from scratch.
 */
export const PHASE_2_SYSTEM_PROMPT = `You are generating an editorial article brief for the Atlas Network, a curated discovery platform for independent Australian venues.

CRITICAL RULES:

- You will be given the exact database record(s) for one or more listings. Every factual claim in your pitch MUST come directly from this data. You may quote it, paraphrase it, or summarise it, but you cannot extend it.
- If a field is empty or null, you MUST NOT invent content for it. State explicitly that the field is unpopulated and add it to research-needed.
- You may suggest an editorial ANGLE or FRAMING — a hook, a thesis, a why-this-why-now — but the underlying facts must all be verifiable from the provided data.
- Do NOT invent operator names, founding dates, backstories, philosophies, awards, or superlative claims (oldest, first, only, best).
- Do NOT use phrases like "likely", "probably", "perhaps they...", "one imagines", or "it stands to reason" to smuggle speculation in as soft fact.
- Editorial framing is creative. Facts are not. Tag them separately in your output.
- If the data is too thin to support a grounded pitch, return a structured "insufficient data" response. Do not fabricate to fill the gap.`

// ─── Tool schemas ────────────────────────────────────────────────────────────

/**
 * The tool the model calls when it has a grounded pitch to return. Shape
 * mirrors docs/pitch-system-design.md §Output structure. `verified_facts` is
 * the load-bearing array — every claim must trace to a real column on a
 * listing record passed into the user turn (the fact-check pass enforces this
 * after the model returns).
 */
export const SUBMIT_PITCH_TOOL = {
  name: 'submit_pitch',
  description:
    'Submit the structured editorial pitch. Use this when the provided listing data is rich enough to ground a complete brief.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      headline: {
        type: 'string',
        description: 'Working title for the editorial piece. Plain prose, no markdown.',
      },
      angle: {
        type: 'string',
        description:
          'One paragraph stating the editorial thesis: what makes this story worth writing now. Plain prose.',
      },
      anchor_listing: {
        type: 'object',
        additionalProperties: false,
        description: 'The primary venue. Must match the anchor listing record provided in the user turn.',
        properties: {
          id: { type: 'string', description: "The anchor listing's UUID (from the input record)." },
          name: { type: 'string' },
          vertical: { type: 'string' },
          region: { type: 'string' },
          slug: { type: 'string' },
        },
        required: ['id', 'name', 'vertical', 'region', 'slug'],
      },
      supporting_listings: {
        type: 'array',
        // NOTE: do NOT add `maxItems` here. Anthropic's tool input_schema
        // rejects `maxItems` on array types (400 with
        // "tools.0.custom: For 'array' type, property 'maxItems' is not
        // supported"). The spec's four-supporting-listings cap is enforced
        // server-side by the pipeline orchestrator's defensive check, not by
        // the schema. The cap belongs there because Phase 2 is single-anchor
        // anyway — this array should be empty in every Phase 2 pitch.
        description:
          'Optional supporting venues (up to four, enforced by the orchestrator). Empty for single-anchor pitches. In Phase 2 of the build this is always empty — leave as [].',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            vertical: { type: 'string' },
            region: { type: 'string' },
            slug: { type: 'string' },
            contribution: {
              type: 'string',
              description: 'One-line note on what this supporting listing contributes to the editorial argument.',
            },
          },
          required: ['id', 'name', 'vertical', 'region', 'slug', 'contribution'],
        },
      },
      verified_facts: {
        type: 'array',
        minItems: 1, // 0 and 1 are supported under strict mode; do not raise.
        description:
          'Every factual claim referenced in the headline, angle, or framing. Each entry MUST cite a real column on a listing record provided in the user turn — the fact-check pass will reject the pitch otherwise.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            claim: {
              type: 'string',
              description: 'Natural-language statement of the fact, in the form a reader would encounter it.',
            },
            field: {
              type: 'string',
              description:
                "Database column name on the listings table that supports the claim. Must match a column passed in the input record (e.g. 'description', 'founded_year', 'awards', 'is_owner_operator').",
            },
            value: {
              // Always declared as `string` — Anthropic's strict tool schema
              // requires every property to have a `type`, and the validator
              // (lib/pitch/fact-check.mjs) already coerces stringified
              // numbers/booleans back to their underlying types during
              // verification. A union-typed schema would be redundant with
              // that coercion and more fragile to schema tightening.
              type: 'string',
              description:
                'The cell value supporting the claim. ALWAYS emit as a string; the fact-check function coerces back to the source column type. Examples: integers as their decimal string ("1859"), booleans as "true" or "false", regular text fields verbatim. For array-typed source columns (e.g. awards), cite ONE element per fact — never JSON-encode the whole array; if a pitch references multiple awards, emit multiple verified_facts entries with the same field and different values.',
            },
          },
          required: ['claim', 'field', 'value'],
        },
      },
      editorial_framing: {
        type: 'string',
        // NOTE: do NOT add `minLength` here. Anthropic's strict tool schema
        // rejects string length constraints (verified against the live API
        // docs, 7 May 2026). The 40-char floor that previously lived here is
        // checked by the confidence-scoring function (no +10 award if framing
        // is below 40 chars). That matches the spec's design: confidence < 70
        // is surfaced as a low-confidence flag, not a hard pitch rejection —
        // the editor still sees the pitch and decides. Re-adding a schema
        // minLength here will break every real LLM call.
        description:
          'The creative angle, voice suggestion, and structural ideas for the writer. Explicitly distinct from the verified facts. Plain prose — speculation about angle/voice is fine here; speculation about the venue is not. Aim for at least 40 characters: shorter framings receive a low confidence score from the deterministic scorer.',
      },
      research_needed: {
        type: 'array',
        description:
          'Gaps the writer must close before publishing: empty fields the pitch cited, unverifiable claims, places where the data is silent.',
        items: { type: 'string' },
      },
    },
    required: [
      'headline',
      'angle',
      'anchor_listing',
      'supporting_listings',
      'verified_facts',
      'editorial_framing',
      'research_needed',
    ],
  },
}

/**
 * The tool the model calls when the provided listing data is too thin to
 * ground a pitch. Per the spec: "If the data is too thin to support a grounded
 * pitch, return a structured 'insufficient data' response. Do not fabricate to
 * fill the gap." Logged to `pitch_generation_failures` with failure_mode =
 * 'insufficient_data_returned'.
 */
export const REPORT_INSUFFICIENT_DATA_TOOL = {
  name: 'report_insufficient_data',
  description:
    'Report that the provided listing data is too thin to ground a complete pitch. Use this rather than fabricating content to fill gaps.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reason: {
        type: 'string',
        description:
          'Specific reason the data is insufficient — e.g. "Description is 60 characters and contains no operator detail; no founding date, no awards, no distinguishing practice."',
      },
    },
    required: ['reason'],
  },
}

/**
 * Both Phase 2 tools, in the order they appear in the request. The order is
 * stable so prompt caching keeps a clean prefix; do not reorder.
 */
export const PHASE_2_TOOLS = Object.freeze([SUBMIT_PITCH_TOOL, REPORT_INSUFFICIENT_DATA_TOOL])

/**
 * Tool-choice that forces the model to call exactly one tool but lets it pick
 * which one (so it can route to `report_insufficient_data` when warranted).
 */
export const PHASE_2_TOOL_CHOICE = Object.freeze({
  type: 'any',
  disable_parallel_tool_use: true,
})
