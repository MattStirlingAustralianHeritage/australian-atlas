// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 Stage 1 — extraction prompt + structured-output tool schema.
//
// Same architectural pattern as Phase 2's lib/pitch/prompt.mjs:
//   - System prompt with CRITICAL RULES locked in by unit tests
//   - Versioned via PHASE_3_STAGE_1_PROMPT_VERSION (bumped on any wording
//     change so audit history is preserved on pitch_sources / pitch_characters
//     / pitch_signals rows generated under each prompt revision)
//   - Forced tool-use for structured JSON output (Anthropic's canonical
//     pattern; `tool_choice` pins the model to submit_extraction)
//   - strict: true on the tool enables Anthropic's server-side schema
//     enforcement
//
// Spec: docs/pitch-system-phase3-design.md §Stage 1 → Structured extraction
// prompt + §Stage 1 → JSON output structure.
//
// The model's job here is RETRIEVAL, not generation. Every source_excerpt
// must be a verbatim substring of the page text we pass in. The substring
// validator (lib/pitch/stage1/validate.mjs) runs after the LLM returns and
// rejects anything that doesn't trace.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stable version string written to pitch_sources / pitch_characters /
 * pitch_signals via the orchestrator. Bump on ANY wording change to the
 * system prompt or tool schema.
 */
export const PHASE_3_STAGE_1_PROMPT_VERSION = 'phase3-stage1-v1-2026-05-22'

/**
 * The Stage 1 system prompt. Quoted-tight from the spec
 * (docs/pitch-system-phase3-design.md §Stage 1 → Structured extraction
 * prompt). The CRITICAL RULES below are the architectural anti-hallucination
 * contract — do not edit them without (a) bumping PHASE_3_STAGE_1_PROMPT_VERSION
 * and (b) re-running calibration from scratch.
 */
export const PHASE_3_STAGE_1_SYSTEM_PROMPT = `You are extracting structured research material from the first-party website of an independent Australian venue. The output feeds editorial pre-reporting — research a human reads to decide whether to pursue a story. The architectural rule of this system is that every claim that lands in the database must trace to a literal substring of a fetched source.

YOUR JOB IS RETRIEVAL, NOT GENERATION. You read the fetched content and fill structured slots. You do not compose prose. You do not infer beyond the source. You do not bring in outside knowledge.

CRITICAL RULES:

- Every source_excerpt MUST be a verbatim substring of the source text I provide. Paraphrasing source_excerpts is forbidden. The substring must appear in the text under the source_url you cite, character-for-character (whitespace and case differences are tolerated by the validator; semantic rephrasing is not).
- Every attribute and signal's source_excerpt must directly support the claim it cites. The excerpt is the proof; the attribute_text or signal_data is the structured restatement.
- confidence: "explicit" means the source_excerpt literally states the claim. confidence: "implied" means the inference between excerpt and claim is one short logical step. Multi-step inference, aesthetic interpretation, and speculation are rejected — surface only what the source actually supports.
- Do not invent characters not named in the source. Names that appear only in third-party context, captions about "us with X visiting", or passing references do not qualify.
- A character must be presented as connected to the venue's identity: founders, makers, head chefs, owners, named team members. Customers, suppliers mentioned in passing, or family members not part of the operation do not qualify.
- One quote per character maximum. Quotes only when literally in the source with named attribution. If the source has the phrase "Tom McHugh says: 'We've always made cheese from a single herd'", that's a quote. If the source has "Tom believes in single-herd cheese", that's NOT a quote — it's a paraphrase the venue did, and you would extract it as a philosophy attribute, not a quote.
- A character can carry multiple attributes. Each attribute is one atomic claim with one source_excerpt. Do not pack multiple sub-claims into a single attribute_text.
- Venue signals capture non-character facts: founder pivots, recent openings, awards mentioned on-site, methodology novelty, cross-references to other venues. Each signal must trace to a source_excerpt the same way attributes do.
- If a page mentions something interesting but you cannot find a clean source_excerpt that supports it, leave it out. Better to extract fewer well-grounded items than many weakly-grounded ones.
- Return { "characters": [], "venue_signals": [] } as the top-level structure. Empty arrays are valid output — a venue may legitimately have no extractable characters or signals on its first-party site.`

/**
 * Subset of pitch_signal_type values that Stage 1 can produce. The other
 * signal types (listing_change, cluster, silence) are produced by later
 * stages and are not in the LLM's allowed set here.
 *
 * Mirrors the spec's §Stage 1 → JSON output structure → signal_type list.
 * If a value here doesn't match the DB enum, INSERTs will fail with 22P02.
 */
export const STAGE_1_SIGNAL_TYPES = Object.freeze([
  'recently_opened',
  'first_in_category',
  'founder_pivot',
  'emerging_recognition',
  'unusual_location',
  'methodology_novelty',
  'award',
  'press_coverage',
  'cross_reference',
])

/**
 * attribute_type values per the CHECK constraint on
 * pitch_character_attributes. Locked here so the tool schema and the DB
 * stay in sync.
 */
export const ATTRIBUTE_TYPES = Object.freeze([
  'background',
  'family_history',
  'technique',
  'achievement',
  'quote',
  'biographical',
  'philosophy',
])

/** Allowed values for the pitch_attribute_confidence enum. */
export const ATTRIBUTE_CONFIDENCE_VALUES = Object.freeze(['explicit', 'implied'])

// ─── Tool schema ────────────────────────────────────────────────────────────

/**
 * Forced-tool structured output. The model must call submit_extraction with
 * a payload matching this schema. Anthropic strict mode rejects unknown JSON
 * Schema features — see lib/pitch/prompt.mjs for the audit of what's allowed
 * (additionalProperties: false required on objects, no minLength/maxLength,
 * no maxItems, missing `type` not allowed, enum supported, anyOf supported).
 */
export const SUBMIT_EXTRACTION_TOOL = {
  name: 'submit_extraction',
  description:
    'Submit the structured first-party extraction. Use this for every Stage 1 invocation, even if both arrays end up empty — empty arrays are a valid result (some venue sites legitimately have no extractable characters or signals).',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      characters: {
        type: 'array',
        description:
          'Named people presented as part of the venue\'s identity. Empty array is valid.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: {
              type: 'string',
              description: 'The person\'s name as it appears on the venue\'s site.',
            },
            role: {
              type: 'string',
              description:
                'Role at the venue (founder, head distiller, owner, etc.) if stated. Empty string if unstated.',
            },
            source_url: {
              type: 'string',
              description:
                'The exact URL (from the fetched_pages list provided in the user turn) where this character was introduced.',
            },
            source_excerpt: {
              type: 'string',
              description:
                'A verbatim substring of the source text at source_url that names and introduces this person.',
            },
            attributes: {
              type: 'array',
              description:
                'Atomic claims about the character. Each carries its own source_excerpt and confidence.',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  attribute_type: {
                    type: 'string',
                    enum: [...ATTRIBUTE_TYPES],
                    description:
                      'One of the enum-restricted attribute classifications. Quote = literally a quoted statement with named attribution. Philosophy = stated belief or ethos. Biographical = personal history. Technique = how they work. Achievement = recognised accomplishment. Family_history = inherited or generational context. Background = origin / training / prior career.',
                  },
                  attribute_text: {
                    type: 'string',
                    description:
                      'The atomic claim in your own structured restatement. One claim per row. Do not pack multiple sub-claims here.',
                  },
                  source_excerpt: {
                    type: 'string',
                    description:
                      'A verbatim substring of source_url\'s text that supports this attribute.',
                  },
                  confidence: {
                    type: 'string',
                    enum: [...ATTRIBUTE_CONFIDENCE_VALUES],
                    description:
                      '"explicit" = the source literally states this. "implied" = one short logical step from the source. Multi-step inference is not allowed.',
                  },
                },
                required: ['attribute_type', 'attribute_text', 'source_excerpt', 'confidence'],
              },
            },
          },
          required: ['name', 'role', 'source_url', 'source_excerpt', 'attributes'],
        },
      },
      venue_signals: {
        type: 'array',
        description:
          'Non-character signals visible in first-party content. Empty array is valid.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            signal_type: {
              type: 'string',
              enum: [...STAGE_1_SIGNAL_TYPES],
              description:
                'The classification of signal. Only Stage 1-relevant types are listed; press/award signals here are venue-claimed, not editorially verified (verification happens in Stages 2-3).',
            },
            source_url: {
              type: 'string',
              description:
                'The exact URL where this signal was extracted from.',
            },
            source_excerpt: {
              type: 'string',
              description:
                'A verbatim substring of source_url\'s text supporting the signal.',
            },
            signal_data: {
              type: 'object',
              description:
                'Type-specific structured fields. The schema is open per signal_type; use your judgement to capture the editorially-useful structure. For award: { name, year, awarding_body } when in source. For recently_opened: { opened_date_text } if a date is given. Keep it minimal — what a researcher would want to look up.',
            },
          },
          required: ['signal_type', 'source_url', 'source_excerpt', 'signal_data'],
        },
      },
    },
    required: ['characters', 'venue_signals'],
  },
}

/**
 * Stage 1 exposes exactly one tool. Force the model to call it.
 */
export const PHASE_3_STAGE_1_TOOLS = Object.freeze([SUBMIT_EXTRACTION_TOOL])

/**
 * Forced tool choice — the model has no option but to return structured
 * output via submit_extraction. (Unlike Phase 2, there's no insufficient_data
 * second tool, because empty arrays already cover the no-extraction case.)
 */
export const PHASE_3_STAGE_1_TOOL_CHOICE = Object.freeze({
  type: 'tool',
  name: 'submit_extraction',
  disable_parallel_tool_use: true,
})
