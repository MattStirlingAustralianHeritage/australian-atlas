// ─────────────────────────────────────────────────────────────────────────────
// Manual pitch — prose verification gate.
//
// fact-check.mjs proves each declared FACT traces to its source. It does not
// read the PROSE (headline, angle, editorial_framing), where the dangerous
// hallucinations hide: arithmetic ("over a century"), inference ("the region's
// leading studio"), recombination, and absent assertions. This gate closes
// that hole for manual pitches.
//
// It reuses the batch gate's system prompt and tool schema verbatim
// (lib/pitch/verify.mjs) — the contract (flag derivation/inference/
// recombination/absence; allow faithful paraphrase) is source-agnostic. Only
// the SOURCE rendering differs: the listing record is OPTIONAL, and website
// facts present their verbatim excerpt + URL instead of a column/value.
//
// Gate contract is identical: flags.length > 0 → FAIL. The decision derives
// from the flags array, never the model's self-reported `passed`. A thrown
// error means FAIL CLOSED — never finalize an unverified pitch.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk'
import {
  VERIFY_MODEL,
  VERIFY_SYSTEM_PROMPT,
  SUBMIT_VERIFICATION_TOOL,
  VERIFY_TOOL_CHOICE,
  parseVerifyResponse,
} from '../verify.mjs'
import { renderListingRecord } from '../generate.mjs'

const MAX_TOKENS = 4000

// Output-discipline addendum, appended to the shared VERIFY_SYSTEM_PROMPT for
// the manual path only (the batch/triage prompt stays byte-for-byte unchanged
// so its prompt cache and behaviour are untouched).
//
// Why: the gate runs with forced tool_choice and no `thinking`, so the model
// has no scratchpad. Observed failure mode — it uses the `flags` array itself
// to reason, emitting candidate claims with reasons that conclude "...this is
// actually supported by the declared facts" or trail into "re-checking other
// claims", then never prunes them. Because the contract is flags.length>0 →
// FAIL, those cleared-but-left-in flags false-fail an otherwise clean pitch.
//
// This addendum changes only OUTPUT discipline, never detection strength: it
// tells the model to emit confirmed violations only and to omit any claim it
// concludes is supported. The "when in doubt, flag" posture is preserved, so a
// genuine unsupported claim is still flagged and still fails the gate.
const MANUAL_VERIFY_OUTPUT_DISCIPLINE = `OUTPUT DISCIPLINE — read before calling submit_verification:
The \`flags\` array is your FINAL list of CONFIRMED violations only. It is not a scratchpad.
Decide each claim fully before you emit it. If, after deliberation, you conclude a claim IS supported — a faithful paraphrase of a declared fact's website excerpt or a listing field value, or otherwise in-scope — you MUST omit it from \`flags\` entirely. Never leave a claim in \`flags\` whose reason concludes it is supported, in-scope, faithful, or "withdrawn". Every entry in \`flags\` must assert a real, unresolved arithmetic / inference / recombination / absent violation.
This does not relax your strictness: when a claim remains genuinely borderline after deliberation, flag it.`

/**
 * Verify a manual pitch's prose against its sources. Independent Sonnet call.
 *
 * @param {Object} pitch                 - submit_pitch payload.
 * @param {Object} sources
 * @param {Object|null} [sources.listing]
 * @param {Object} [opts]
 * @param {Anthropic} [opts.client]
 * @returns {Promise<{passed:boolean, flags:Array, ...}>}
 */
export async function verifyManualPitch(pitch, sources = {}, opts = {}) {
  if (!pitch || typeof pitch !== 'object' || Array.isArray(pitch)) {
    throw new Error('verifyManualPitch: pitch is required')
  }
  const listing = sources.listing && typeof sources.listing === 'object' ? sources.listing : null

  const client = opts.client || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const userMessage = buildManualVerifyUserMessage(pitch, listing)

  const stream = client.messages.stream({
    model: VERIFY_MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: 'text', text: VERIFY_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: MANUAL_VERIFY_OUTPUT_DISCIPLINE },
    ],
    messages: [{ role: 'user', content: userMessage }],
    tools: [SUBMIT_VERIFICATION_TOOL],
    tool_choice: VERIFY_TOOL_CHOICE,
  })

  const response = await stream.finalMessage()
  const parsed = parseVerifyResponse(response)

  // Drop self-cleared scratchpad flags. With forced tool_choice and no
  // `thinking`, the verifier has no scratchpad and sometimes reasons INSIDE the
  // flags array — it emits a candidate claim, then concludes in that flag's own
  // reason that there is no violation: "withdrawing this flag", "no flag
  // needed", "not a factual claim" (it recognised an editorial-voice/structure
  // instruction, not a venue fact), "no violation". The strict gate
  // (flags.length > 0 → FAIL) would count those self-cleared entries as failures
  // and reject an otherwise-clean pitch. A genuine violation never exonerates
  // itself in its own reason, so removing flags whose reason explicitly declares
  // no-violation strips only false positives — the anti-hallucination guarantee
  // (no truly-unsupported claim passes) is fully preserved. The
  // MANUAL_VERIFY_OUTPUT_DISCIPLINE addendum asks the model to do this itself;
  // this is the reliable backstop for when it doesn't. Manual path only.
  const realFlags = (parsed.flags || []).filter(f => !isSelfClearedFlag(f))
  if (realFlags.length === (parsed.flags || []).length) return parsed
  return { ...parsed, flags: realFlags, passed: realFlags.length === 0 }
}

/**
 * True when a flag's reason explicitly clears ITSELF — the model emitted the
 * flag, then concluded in the same reason that there is no violation. Matches
 * only phrasings that can solely mean "no violation here", never a negated form
 * like "not a faithful paraphrase" that asserts one, so a genuine violation can
 * never be mistaken for self-cleared.
 */
function isSelfClearedFlag(flag) {
  const reason = typeof flag?.reason === 'string' ? flag.reason : ''
  return /\bwithdraw|no flag needed|not a flag\b|\bno violation|not a violation|not a factual claim/i.test(reason)
}

// ─── Internal: user-turn rendering ──────────────────────────────────────────

function buildManualVerifyUserMessage(pitch, listing) {
  const facts = Array.isArray(pitch.verified_facts) ? pitch.verified_facts : []
  const factsBlock = facts.length
    ? facts.map((f, i) => `${i + 1}. "${f.claim}"  ${renderFactSource(f)}`).join('\n')
    : '(none declared)'

  const recordBlock = listing
    ? `═══ SOURCE — VENUE DATABASE RECORD ═══\n${renderListingRecord(listing)}\n═══ END RECORD ═══\n\n`
    : '═══ SOURCE — VENUE DATABASE RECORD ═══\n(Not on Atlas — no database record. The declared facts below are the only source.)\n═══ END RECORD ═══\n\n'

  return `Verify the PROSE of this editorial pitch against the SOURCE below.

═══ PROSE TO VERIFY ═══
HEADLINE: ${pitch.headline ?? '<missing>'}

ANGLE: ${pitch.angle ?? '<missing>'}

EDITORIAL FRAMING: ${pitch.editorial_framing ?? '<missing>'}
═══ END PROSE ═══

${recordBlock}═══ SOURCE — FACTS THE WRITER DECLARED ═══
${factsBlock}
═══ END FACTS ═══

Flag every claim in the PROSE (headline, angle, editorial framing) that is not directly and literally supported by the SOURCE. Arithmetic/date-math derivations, inferences beyond the sources, recombinations of separate facts, and absent assertions must all be flagged. Faithful paraphrase is allowed. A claim is supported if it paraphrases a declared fact's verbatim website excerpt or a listing field value. Call submit_verification.`
}

function renderFactSource(f) {
  if (f?.source === 'website') return `[website ${f.url ?? '?'} — excerpt: "${f.excerpt ?? ''}"]`
  return `[listing field=${f?.field ?? '?'}, value=${JSON.stringify(f?.value)}]`
}

export { buildManualVerifyUserMessage }
