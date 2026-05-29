// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 LLM call wrapper.
//
// Single-anchor pitches only. Streams the Anthropic request and returns the
// structured tool output: either a `submit_pitch` payload or an
// `insufficient_data` report. Does not run fact-check or confidence scoring —
// that's the pipeline orchestrator's job. This module is a pure wrapper around
// the LLM call.
//
// Model: claude-sonnet-4-6. Adaptive thinking is NOT used — it returns a 400
// when combined with forced tool_choice ("Thinking may not be enabled when
// tool_choice forces tool use"). Forced tool_choice is the structural
// guarantee that every response is structured output; that's load-bearing and
// stays. The anti-hallucination guarantee lives in fact-check + the prose
// verification gate (verify.mjs), not in deliberation depth. The system prompt
// is the architectural anti-hallucination contract; the tool schema is the
// structured-output contract. Both live in prompt.mjs and are versioned via
// PHASE_2_PROMPT_VERSION.
//
// Token usage: every call captures response.usage (via usage.mjs) so the batch
// runner can report per-run token totals and a dollar estimate.
//
// Streaming + .finalMessage() is used to handle tool-use blocks cleanly (the
// helper accumulates the full Message including the forced tool_use block)
// and to keep headroom under HTTP idle timeouts.
//
// Prompt caching: the system prompt is marked cache_control: ephemeral. The
// effective prefix is around the Sonnet cache minimum, so caching may or may
// not engage during Phase 2 — the marker is retained as a no-op breakpoint so
// future prompt growth caches automatically.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk'
import {
  PHASE_2_SYSTEM_PROMPT,
  PHASE_2_TOOLS,
  PHASE_2_TOOL_CHOICE,
  PHASE_2_PROMPT_VERSION,
} from './prompt.mjs'
import { extractUsage } from './usage.mjs'

/** Model used for Phase 2 pitch generation. Pinned here so reviewers see it.
 *  Sonnet 4.6 (not Opus): the output is a structured research brief, not
 *  publishable prose, so ~5× the Opus cost buys nothing here. The
 *  anti-hallucination guarantee lives in fact-check + the prose verification
 *  gate (verify.mjs), not in model depth. */
export const PHASE_2_MODEL = 'claude-sonnet-4-6'

/** Per-request max output tokens. Pitches are short structured payloads; this
 *  is comfortable headroom and well under the streamable cap. */
const MAX_TOKENS = 16000

/**
 * Static defaults for the Anthropic call. Extracted so a unit test can lock
 * in the absence of `thinking` (re-adding it triggers a 400 — adaptive
 * thinking is incompatible with forced tool_choice). Frozen so accidental
 * mutation surfaces in tests.
 */
const LLM_REQUEST_DEFAULTS = Object.freeze({
  model: PHASE_2_MODEL,
  max_tokens: MAX_TOKENS,
  // Do NOT add `thinking` here. Adaptive thinking + forced tool_choice 400s
  // with "Thinking may not be enabled when tool_choice forces tool use." That
  // incompatibility holds on every model, Sonnet 4.6 included. Forced
  // tool_choice is the structured-output guarantee and stays. The
  // anti-hallucination guarantee lives in fact-check + the prose verification
  // gate, not in deliberation depth. (No `output_config.effort` either — that
  // was an Opus-only knob and is dropped with the move to Sonnet.)
})

/** Valid slot types passed in the user turn. */
const VALID_SLOT_TYPES = new Set(['general', 'new_producer'])

/**
 * @typedef {Object} GenerateResult
 * @property {'pitch'} kind
 * @property {Object}  data              - The `submit_pitch` tool's input
 *                                         (structured pitch payload).
 * @property {string}  prompt_version
 * @property {string}  generated_by
 * @property {string}  generated_at
 * @property {Object}  usage             - Normalised token usage (usage.mjs).
 * @property {Object}  raw               - Full Anthropic Message object.
 *
 * @typedef {Object} InsufficientDataResult
 * @property {'insufficient_data'} kind
 * @property {string} reason             - LLM's stated reason.
 * @property {string} prompt_version
 * @property {string} generated_by
 * @property {string} generated_at
 * @property {Object} raw
 */

/**
 * Generate a single-anchor pitch via Claude.
 *
 * Throws on:
 *   - missing/invalid anchor listing
 *   - invalid slot type
 *   - model failing to call any tool (forced tool_choice violation; would
 *     indicate an API regression rather than a normal failure mode)
 *
 * Returns a `GenerateResult` (pitch) or `InsufficientDataResult`. Neither
 * outcome is an error from this function's perspective — both are valid
 * model responses per the spec. The caller decides what to do with each.
 *
 * @param {Object} anchorListing       - Full row from the `listings` table.
 * @param {Object} [opts]
 * @param {('general'|'new_producer')} [opts.slotType='general']
 * @param {Anthropic} [opts.client]    - Anthropic client (defaults to env-key).
 * @returns {Promise<GenerateResult|InsufficientDataResult>}
 */
export async function generatePitch(anchorListing, opts = {}) {
  if (!anchorListing || typeof anchorListing !== 'object' || Array.isArray(anchorListing)) {
    throw new Error('generatePitch: anchorListing is required')
  }
  if (!anchorListing.id || typeof anchorListing.id !== 'string') {
    throw new Error('generatePitch: anchorListing must have a string `id`')
  }

  const slotType = opts.slotType || 'general'
  if (!VALID_SLOT_TYPES.has(slotType)) {
    throw new Error(`generatePitch: invalid slotType "${slotType}" (must be 'general' or 'new_producer')`)
  }

  const client = opts.client || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const userMessage = buildUserMessage(anchorListing, slotType)

  const stream = client.messages.stream({
    ...LLM_REQUEST_DEFAULTS,
    system: [
      { type: 'text', text: PHASE_2_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
    tools: PHASE_2_TOOLS,
    tool_choice: PHASE_2_TOOL_CHOICE,
  })

  const response = await stream.finalMessage()
  return parseResponse(response)
}

// ─── Internal: user-turn rendering ──────────────────────────────────────────

/**
 * Build the user turn per docs/pitch-system-design.md §Phase 2 → Input. Mirrors
 * the spec's four input components: slot type, the listing record, single-
 * anchor declaration (Phase 2 scope), explicit "no other context" instruction.
 *
 * The vertical's editorial voice guide is not included in this version — the
 * editor iterates voice during Gate 1 calibration. The grounding rules in the
 * system prompt are independent of voice.
 */
function buildUserMessage(listing, slotType) {
  const slotTypeBlock =
    slotType === 'new_producer'
      ? 'NEW-PRODUCER SLOT. This pitch is for a new producer (under three years old in the network, light coverage). The editorial purpose is uplift, not over-curation — a thin record is acceptable so long as every claim still traces to the data.'
      : 'GENERAL SLOT. This pitch is for an editorially-ready venue with enough data to ground a complete brief.'

  return `${slotTypeBlock}

SINGLE-ANCHOR MODE. There are no supporting listings in this request — set the \`supporting_listings\` field in your output to an empty array []. (Multi-listing pitches are deferred to a future build step.)

NO OTHER CONTEXT. You do not have web access, prior knowledge of this venue, or any data beyond the record below. Every factual claim must trace to a field in this record.

═══ ANCHOR LISTING RECORD ═══
${renderListingRecord(listing)}
═══ END RECORD ═══

Generate the pitch by calling the \`submit_pitch\` tool. Cite each verified fact with the exact column name from the record above. If the data is too thin to ground a complete brief, call \`report_insufficient_data\` with a specific reason instead — do not fabricate to fill gaps.`
}

/**
 * Render a listings row as a deterministic key/value block. Sorted keys keep
 * the output stable across calls (and helps caching). Null fields are surfaced
 * explicitly as `<null>` so the model knows they are present-but-empty rather
 * than absent from the record — useful for `research_needed` flagging.
 */
function renderListingRecord(listing) {
  const lines = []
  for (const key of Object.keys(listing).sort()) {
    const value = listing[key]
    if (value === null || value === undefined) {
      lines.push(`${key}: <null>`)
    } else if (Array.isArray(value)) {
      lines.push(value.length === 0 ? `${key}: []` : `${key}: ${JSON.stringify(value)}`)
    } else if (typeof value === 'object') {
      lines.push(`${key}: ${JSON.stringify(value)}`)
    } else {
      lines.push(`${key}: ${String(value)}`)
    }
  }
  return lines.join('\n')
}

// ─── Internal: response parsing ─────────────────────────────────────────────

function parseResponse(response) {
  const toolUse = (response?.content || []).find(b => b.type === 'tool_use')
  if (!toolUse) {
    throw new Error(
      'generatePitch: model did not call any tool — forced tool_choice should have prevented this. ' +
        `stop_reason=${response?.stop_reason ?? '<missing>'}`
    )
  }

  const common = {
    prompt_version: PHASE_2_PROMPT_VERSION,
    generated_by: `${response.model}-${response.id?.slice(-8) ?? 'unknown'}`,
    generated_at: new Date().toISOString(),
    usage: extractUsage(response),
    raw: response,
  }

  if (toolUse.name === 'submit_pitch') {
    return { kind: 'pitch', data: toolUse.input, ...common }
  }
  if (toolUse.name === 'report_insufficient_data') {
    return {
      kind: 'insufficient_data',
      reason: toolUse.input?.reason ?? '<no reason given>',
      ...common,
    }
  }
  throw new Error(`generatePitch: model called unexpected tool "${toolUse.name}"`)
}

// Exported for tests + advanced callers who need to inspect the rendered
// user-turn shape without making a real API call.
export { buildUserMessage, renderListingRecord, parseResponse, LLM_REQUEST_DEFAULTS }
