// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 prose verification gate.
//
// fact-check.mjs validates the self-declared verified_facts[] by substring — it
// proves each FACT the model listed traces to a real column value. It does NOT
// read the PROSE (headline, angle, editorial_framing). The prose is where the
// dangerous hallucinations hide: a true founding year ("since 2009") silently
// becomes "over fifteen years" (arithmetic); separately-true facts get
// recombined into an unstated composite ("family-run for three decades");
// the model infers beyond what the record states ("the region's leading
// studio"). Substring matching cannot catch any of these — the words simply
// aren't in the source to match against.
//
// This gate closes that hole. It is an independent Sonnet 4.6 call that reads
// the PROSE plus the allowed SOURCE (the listing record + the model's declared
// verified_facts) and flags every claim in the prose that is not directly and
// literally supported. Paraphrase is allowed; derivation, inference,
// recombination, and invention are not.
//
// Gate contract: flags.length > 0 → the pitch FAILS. There is no soft pass.
// The decision is derived from the flags array, NOT from the model's
// self-reported `passed` — a model that lists a flag but claims passed:true is
// overruled. The pipeline does not write a failed pitch and does not fill a
// slot; the failure (listing + flagged claims + reasons) is surfaced to the
// caller for logging.
//
// Model + forced tool_choice + usage capture mirror generate.mjs. No `thinking`
// (incompatible with forced tool_choice). No second tool — verification always
// returns a result; there is no "insufficient data" branch.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk'
import { extractUsage } from './usage.mjs'
import { renderListingRecord } from './generate.mjs'

/** Model used for prose verification. Same family as composition — the gate is
 *  a focused checking task, not a generation task, so Sonnet is ample. */
export const VERIFY_MODEL = 'claude-sonnet-4-6'

/** Stable version string. Bump when the system prompt or tool schema changes. */
export const VERIFY_PROMPT_VERSION = 'verify-v1-2026-05-29'

/** Verification is a short structured response; this is comfortable headroom. */
const MAX_TOKENS = 4000

export const VERIFY_SYSTEM_PROMPT = `You are a strict editorial fact-verifier for the Atlas Network, a curated discovery platform for independent Australian venues.

You are given two things:
1. The PROSE of an editorial pitch — its headline, angle, and editorial framing.
2. The SOURCE — the venue's database record, plus the list of facts the writer declared they relied on.

Your job: find every factual claim in the PROSE that is NOT directly and literally supported by the SOURCE.

A claim is SUPPORTED when its meaning is stated in the source, or is a faithful paraphrase of it. PARAPHRASE IS ALLOWED AND EXPECTED — if the source says "six generations of fortified winemaking," the prose may say "generations-old winemaking heritage." Do not flag faithful paraphrase.

A claim MUST be FLAGGED if it falls into any of these categories:

- ARITHMETIC / DATE-MATH: a number, age, span, duration, total, or percentage computed from source values. Example: source has founded_year 2009; prose says "over fifteen years" or "more than a decade" — FLAG. Source has founded_year 1859; prose says "166 years of heritage" — FLAG. The underlying date is grounded, but the derived span is not.

- INFERENCE BEYOND THE RECORD: a claim that asserts more than the data states. Example: source describes "hand-building classes at a Beaufort Street studio"; prose claims "the region's leading ceramics school" — FLAG ("leading" and "region's" are not in the data).

- RECOMBINATION: two or more separately-true facts joined into a composite the source never states. Example: source says is_owner_operator=true AND founded_year=1990; prose says "family-run for over three decades" — FLAG (the "family" + "three decades" composite is unstated and derived).

- ABSENT: a named entity, person, date, number, award, place, superlative (oldest / first / only / best / largest), or factual assertion about the venue that does not appear in the source at all.

Do NOT flag:
- Faithful paraphrase of source facts.
- Editorial suggestions about angle, voice, or structure that make no factual claim about the venue (e.g. "this piece could open at the cellar door at dusk", "lead with the maker's hands").
- Generic framing language that asserts nothing checkable.

For each flagged claim, return the exact claim text quoted from the prose, and a one-sentence reason that names the category and the specific problem.

Be thorough and literal. When a claim is borderline between faithful paraphrase and derivation, flag it — the cost of a false flag is one regeneration; the cost of a missed derivation is a published falsehood. Call submit_verification with your findings. If every claim in the prose is supported, return passed=true with an empty flags array.`

// ─── Tool schema ──────────────────────────────────────────────────────────────

export const SUBMIT_VERIFICATION_TOOL = {
  name: 'submit_verification',
  description:
    'Return the verification result: whether every claim in the prose is supported by the source, and the list of any unsupported claims.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      passed: {
        type: 'boolean',
        description:
          'true only if there are zero flagged claims. (The pipeline derives the gate decision from the flags array regardless, so this must agree with flags being empty.)',
      },
      flags: {
        type: 'array',
        description:
          'Every claim in the prose (headline, angle, editorial framing) that is not directly and literally supported by the source. Empty array if all claims are supported.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            claim: {
              type: 'string',
              description: 'The exact claim text, quoted from the headline, angle, or editorial framing.',
            },
            reason: {
              type: 'string',
              description:
                'One sentence naming the category (arithmetic / inference / recombination / absent) and the specific problem.',
            },
          },
          required: ['claim', 'reason'],
        },
      },
    },
    required: ['passed', 'flags'],
  },
}

export const VERIFY_TOOL_CHOICE = Object.freeze({
  type: 'any',
  disable_parallel_tool_use: true,
})

/**
 * @typedef {Object} VerifyResult
 * @property {boolean} passed                 - Derived: flags.length === 0.
 * @property {Array<{claim:string, reason:string}>} flags
 * @property {string}  model
 * @property {string}  verify_prompt_version
 * @property {Object}  usage                  - Normalised token usage (usage.mjs).
 * @property {Object}  raw                    - Full Anthropic Message object.
 */

/**
 * Verify a composed pitch's prose against its source. Independent Sonnet call.
 *
 * Throws on:
 *   - missing/invalid pitch or listing
 *   - the model failing to call submit_verification (forced tool_choice
 *     violation — an API regression, not a normal outcome)
 *
 * A thrown error is the caller's signal to FAIL CLOSED: an unverified pitch
 * must never be treated as verified. The pipeline catches and converts a throw
 * into a verification failure (no write, no slot fill).
 *
 * @param {Object} pitch      - The submit_pitch payload (headline, angle,
 *                              editorial_framing, verified_facts).
 * @param {Object} listing    - The full listings record the pitch was built on.
 * @param {Object} [opts]
 * @param {Anthropic} [opts.client]
 * @returns {Promise<VerifyResult>}
 */
export async function verifyPitch(pitch, listing, opts = {}) {
  if (!pitch || typeof pitch !== 'object' || Array.isArray(pitch)) {
    throw new Error('verifyPitch: pitch is required')
  }
  if (!listing || typeof listing !== 'object' || Array.isArray(listing)) {
    throw new Error('verifyPitch: listing is required')
  }

  const client = opts.client || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const userMessage = buildVerifyUserMessage(pitch, listing)

  const stream = client.messages.stream({
    model: VERIFY_MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: VERIFY_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }],
    tools: [SUBMIT_VERIFICATION_TOOL],
    tool_choice: VERIFY_TOOL_CHOICE,
  })

  const response = await stream.finalMessage()
  return parseVerifyResponse(response)
}

// ─── Internal: user-turn rendering ──────────────────────────────────────────

function buildVerifyUserMessage(pitch, listing) {
  const verifiedFacts = Array.isArray(pitch.verified_facts) ? pitch.verified_facts : []
  const factsBlock = verifiedFacts.length
    ? verifiedFacts
        .map((f, i) => `${i + 1}. "${f.claim}"  [field=${f.field}, value=${JSON.stringify(f.value)}]`)
        .join('\n')
    : '(none declared)'

  return `Verify the PROSE of this editorial pitch against the SOURCE below.

═══ PROSE TO VERIFY ═══
HEADLINE: ${pitch.headline ?? '<missing>'}

ANGLE: ${pitch.angle ?? '<missing>'}

EDITORIAL FRAMING: ${pitch.editorial_framing ?? '<missing>'}
═══ END PROSE ═══

═══ SOURCE — VENUE DATABASE RECORD ═══
${renderListingRecord(listing)}
═══ END RECORD ═══

═══ SOURCE — FACTS THE WRITER DECLARED ═══
${factsBlock}
═══ END FACTS ═══

Flag every claim in the PROSE (headline, angle, editorial framing) that is not directly and literally supported by the SOURCE. Arithmetic/date-math derivations, inferences beyond the record, recombinations of separate facts, and absent assertions must all be flagged. Faithful paraphrase is allowed. Call submit_verification.`
}

// ─── Internal: response parsing ─────────────────────────────────────────────

function parseVerifyResponse(response) {
  const toolUse = (response?.content || []).find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.name !== 'submit_verification') {
    throw new Error(
      'verifyPitch: model did not call submit_verification — forced tool_choice should have prevented this. ' +
        `stop_reason=${response?.stop_reason ?? '<missing>'}`
    )
  }

  const flags = Array.isArray(toolUse.input?.flags) ? toolUse.input.flags : []
  // The gate decision is derived from the flags array, NOT from the model's
  // self-reported `passed`. A model that lists a flag but claims passed:true is
  // overruled — flags present means the pitch fails, full stop.
  const passed = flags.length === 0

  return {
    passed,
    flags,
    model: response.model,
    verify_prompt_version: VERIFY_PROMPT_VERSION,
    usage: extractUsage(response),
    raw: response,
  }
}

// Exported for tests + advanced callers who need to inspect the rendered
// user-turn shape or the parser without making a real API call.
export { buildVerifyUserMessage, parseVerifyResponse }
