// ─────────────────────────────────────────────────────────────────────────────
// Manual pitch — LLM call wrapper.
//
// Mirrors lib/pitch/generate.mjs (the batch wrapper) but renders up to two
// grounding sources into the user turn — an optional Atlas listing record and
// the venue's fetched first-party website pages — and forces the manual tool
// set. Returns the structured tool output (submit_pitch or
// report_insufficient_data). Does not fact-check or verify; that is the
// pipeline orchestrator's job.
//
// Model + forced tool_choice + usage capture mirror the batch wrapper. No
// `thinking` (incompatible with forced tool_choice). The pages passed in are
// the SAME (possibly length-capped) page objects the fact-checker validates
// excerpts against, so a verbatim quote the model copies from what it saw will
// always be substring-matchable downstream.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk'
import {
  MANUAL_SYSTEM_PROMPT,
  MANUAL_TOOLS,
  MANUAL_TOOL_CHOICE,
  MANUAL_PROMPT_VERSION,
} from './prompt.mjs'
import { renderListingRecord } from '../generate.mjs'
import { extractUsage } from '../usage.mjs'

/** Same family as the batch generator — Sonnet is ample for a structured brief. */
export const MANUAL_MODEL = 'claude-sonnet-4-6'

const MAX_TOKENS = 16000

const LLM_REQUEST_DEFAULTS = Object.freeze({
  model: MANUAL_MODEL,
  max_tokens: MAX_TOKENS,
  // Do NOT add `thinking` — adaptive thinking + forced tool_choice 400s.
})

const VALID_SLOT_TYPES = new Set(['general', 'new_producer'])

/**
 * Generate a manual pitch via Claude.
 *
 * @param {Object}  input
 * @param {string}  input.name              - The place's name (always required).
 * @param {Object|null} [input.listing]     - Full listings row, or null if the
 *                                             place is not on Atlas.
 * @param {Array<{url:string,text:string}>} [input.pages] - Fetched website pages.
 * @param {Object}  [opts]
 * @param {('general'|'new_producer')} [opts.slotType='general']
 * @param {Anthropic} [opts.client]
 * @param {Object}  [opts.feedback]         - Recomposition feedback (see below).
 * @returns {Promise<Object>}  pitch | insufficient_data result.
 */
export async function generateManualPitch(input, opts = {}) {
  if (!input || typeof input !== 'object') throw new Error('generateManualPitch: input is required')
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) throw new Error('generateManualPitch: input.name is required')

  const listing = input.listing && typeof input.listing === 'object' ? input.listing : null
  const pages = Array.isArray(input.pages) ? input.pages : []
  if (!listing && pages.length === 0) {
    throw new Error('generateManualPitch: at least one grounding source (listing or pages) is required')
  }

  const slotType = opts.slotType || 'general'
  if (!VALID_SLOT_TYPES.has(slotType)) {
    throw new Error(`generateManualPitch: invalid slotType "${slotType}"`)
  }

  const client = opts.client || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const userMessage = buildManualUserMessage({ name, listing, pages }, slotType, opts.feedback)

  const stream = client.messages.stream({
    ...LLM_REQUEST_DEFAULTS,
    system: [{ type: 'text', text: MANUAL_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }],
    tools: MANUAL_TOOLS,
    tool_choice: MANUAL_TOOL_CHOICE,
  })

  const response = await stream.finalMessage()
  return parseResponse(response)
}

// ─── Internal: user-turn rendering ──────────────────────────────────────────

function buildManualUserMessage({ name, listing, pages }, slotType, feedback) {
  const slotTypeBlock =
    slotType === 'new_producer'
      ? 'NEW-PRODUCER SLOT. This pitch is for a new producer (light coverage). The editorial purpose is uplift, not over-curation — a thin record is acceptable so long as every claim still traces to a source.'
      : 'GENERAL SLOT. This pitch is for an editorially-ready venue with enough material to ground a complete brief.'

  const listingBlock = listing
    ? `═══ ATLAS LISTING RECORD ═══\n${renderListingRecord(listing)}\n═══ END LISTING RECORD ═══`
    : '═══ ATLAS LISTING RECORD ═══\n(This place is not on Atlas — there is no listing record. Ground every fact in the website pages below.)\n═══ END LISTING RECORD ═══'

  const websiteBlock = pages.length
    ? `═══ WEBSITE PAGES (${pages.length}) ═══\n${pages.map(renderPage).join('\n\n')}\n═══ END WEBSITE PAGES ═══`
    : '═══ WEBSITE PAGES ═══\n(No website pages were fetched. Ground every fact in the listing record above.)\n═══ END WEBSITE PAGES ═══'

  return `${slotTypeBlock}

PLACE: ${name}

NO OTHER CONTEXT. You have no web access beyond the pages below and no prior knowledge of this venue. Every factual claim must trace to the listing record or to a verbatim excerpt from one of the website pages.

${listingBlock}

${websiteBlock}

Generate the pitch by calling the \`submit_pitch\` tool. For each verified fact, declare its source: cite the exact listing column (source="listing") or copy a verbatim website excerpt with its page URL (source="website"). If the sources together are too thin to ground a complete brief, call \`report_insufficient_data\` with a specific reason instead — do not fabricate to fill gaps.${renderFeedback(feedback)}`
}

/** Render a fetched page as a labelled block for the user turn. */
function renderPage(page) {
  const url = page?.url ?? '<unknown url>'
  const text = typeof page?.text === 'string' ? page.text : ''
  return `[PAGE] ${url}\n${text}`
}

/**
 * Recomposition-feedback block appended to the user turn. Empty when there is
 * no feedback. Fact-check failures list the verified_facts that did not trace
 * to their declared source; verification-gate flags list the prose claims that
 * were not literally supported.
 */
function renderFeedback(feedback) {
  if (!feedback) return ''
  const parts = []

  if (Array.isArray(feedback.failedClaims) && feedback.failedClaims.length) {
    const lines = feedback.failedClaims
      .map(c => {
        const fact = c.fact || {}
        const where = fact.source === 'website'
          ? `website excerpt from ${fact.url ?? '?'}`
          : `listing field=${fact.field ?? '?'}`
        return `  - "${fact.claim ?? c.claim ?? '?'}" (${where}) — ${c.reason ?? 'did not trace to its source'}`
      })
      .join('\n')
    parts.push(
      `A PRIOR ATTEMPT WAS REJECTED BY FACT-CHECK. These declared facts did not trace to their source:\n${lines}\nDo not repeat them. Cite only listing values that appear verbatim in the record, and only website excerpts copied character-for-character from a fetched page.`
    )
  }

  if (Array.isArray(feedback.verifyFlags) && feedback.verifyFlags.length) {
    const lines = feedback.verifyFlags
      .map(f => `  - "${f.claim}" — ${f.reason}`)
      .join('\n')
    parts.push(
      `A PRIOR ATTEMPT WAS REJECTED BY PROSE VERIFICATION. These claims in the headline, angle, or editorial_framing were not literally supported — derived numbers, inferences beyond the sources, recombinations of separate facts, and absent assertions are ALL forbidden:\n${lines}\nRewrite to avoid every one of them, or call report_insufficient_data.`
    )
  }

  if (!parts.length) return ''
  return `\n\n═══ REVISION REQUIRED ═══\n${parts.join('\n\n')}\n═══ END REVISION REQUIRED ═══`
}

// ─── Internal: response parsing ─────────────────────────────────────────────

function parseResponse(response) {
  const toolUse = (response?.content || []).find(b => b.type === 'tool_use')
  if (!toolUse) {
    throw new Error(
      'generateManualPitch: model did not call any tool — forced tool_choice should have prevented this. ' +
        `stop_reason=${response?.stop_reason ?? '<missing>'}`
    )
  }

  const common = {
    prompt_version: MANUAL_PROMPT_VERSION,
    generated_by: `${response.model}-${response.id?.slice(-8) ?? 'unknown'}`,
    generated_at: new Date().toISOString(),
    usage: extractUsage(response),
    raw: response,
  }

  if (toolUse.name === 'submit_pitch') {
    return { kind: 'pitch', data: toolUse.input, ...common }
  }
  if (toolUse.name === 'report_insufficient_data') {
    return { kind: 'insufficient_data', reason: toolUse.input?.reason ?? '<no reason given>', ...common }
  }
  throw new Error(`generateManualPitch: model called unexpected tool "${toolUse.name}"`)
}

export { buildManualUserMessage, parseResponse }
