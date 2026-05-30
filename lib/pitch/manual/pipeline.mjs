// ─────────────────────────────────────────────────────────────────────────────
// Manual pitch — pipeline orchestrator.
//
//   name (+ optional listing) (+ optional website)
//        │
//        ▼
//   fetch first-party website pages (if a website was given)  ──► cap + index
//        │
//        ├─► no listing AND no pages? → no_grounding_source (terminal)
//        ▼
//   generateManualPitch (LLM, two-source grounding)
//        │
//        ├─► insufficient_data / bail_token / llm_error → terminal
//        ▼
//   factCheckManual (listing field-match + website excerpt substring)
//        │
//        ├─► failed → recompose with feedback (if budget) → else fact_check_failed
//        ▼
//   verifyManualPitch (PROSE gate)
//        │
//        ├─► flags → recompose with feedback (if budget) → else verification_failed
//        └─► clean → researched_pitch  (RETURNED — never written to the DB)
//
// Mirrors the batch pipeline's two-gate, recompose-on-failure discipline (with a
// larger manual composition budget, see MAX_COMPOSITIONS), minus all
// persistence: a manual pitch is ephemeral until an editor keeps it from the
// UI. No slot lookup, no pitches insert, no failure logging. The only writers
// to the DB are the API route's keep action (→ story_ideas) and nothing else.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchFirstPartyPages } from '../stage1/fetch.mjs'
import { normaliseText } from '../stage1/validate.mjs'
import { detectBailToken } from '../pipeline.mjs'
import { sumUsage } from '../usage.mjs'
import { generateManualPitch } from './generate.mjs'
import { factCheckManual } from './fact-check.mjs'
import { verifyManualPitch } from './verify.mjs'

/** Per-page character cap fed to the model AND indexed for excerpt matching.
 *  Both use the SAME capped text so any verbatim quote the model copies is
 *  guaranteed substring-matchable. */
const MAX_PAGE_CHARS = 6000
/** Cap on pages forwarded to the model (the fetch chain can return up to 14). */
const MAX_PAGES = 8
/** Overall corpus cap, to keep the prompt bounded on content-heavy sites. */
const MAX_TOTAL_CHARS = 40000

/**
 * Composition budget. On each failed gate (fact-check or prose-verify) the
 * specific reasons are fed back and the pitch is recomposed. The batch pipeline
 * uses 2 because it runs unattended across many venues; the manual path is
 * operator-triggered for a SINGLE venue and can afford more grounded-rewrite
 * iterations to converge — the strict "when in doubt, flag" verifier routinely
 * flags borderline phrasing that one rewrite alone doesn't fully settle.
 *
 * This is a convergence budget ONLY. Both gates must still pass on the final
 * draft; more attempts never relaxes a gate, it just gives the rewrite loop
 * room to land a fully-grounded draft instead of failing closed prematurely.
 */
const MAX_COMPOSITIONS = 4

/**
 * @param {Object} input
 * @param {string} input.name                 - The place's name (required).
 * @param {Object|null} [input.listing]        - Atlas listing row, or null.
 * @param {string} [input.website]             - Website URL to research.
 * @param {('general'|'new_producer')} [input.slotType='general']
 * @param {Object} [opts]
 * @param {Anthropic} [opts.anthropicClient]
 * @param {typeof fetch} [opts.fetchImpl]      - Injectable fetch (tests).
 * @param {(level:string,msg:string)=>void} [opts.log]
 * @returns {Promise<Object>}  result — `kind` discriminates outcome.
 */
export async function runManualPipeline(input, opts = {}) {
  if (!input || typeof input !== 'object') throw new Error('runManualPipeline: input is required')
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) throw new Error('runManualPipeline: input.name is required')

  const listing = input.listing && typeof input.listing === 'object' ? input.listing : null
  const slotType = input.slotType === 'new_producer' ? 'new_producer' : 'general'
  const website = typeof input.website === 'string' ? input.website.trim() : ''
  const { anthropicClient, fetchImpl, log = () => {} } = opts

  // ── Fetch the website corpus (if a URL was given) ────────────────────────
  let pages = []
  let fetchErrors = []
  let attempted = []
  if (website) {
    try {
      const res = await fetchFirstPartyPages(website, { fetch: fetchImpl, log })
      attempted = res.attempted
      fetchErrors = res.errors
      pages = capPages(res.pages)
    } catch (err) {
      // An invalid URL or total fetch failure isn't fatal on its own — if a
      // listing exists we can still ground on it. Record and continue.
      fetchErrors = [{ url: website, status: null, error: err?.message ?? String(err) }]
      log('warn', `manual fetch failed for ${website}: ${err?.message ?? err}`)
    }
  }

  // pageIndex: URL → normalised capped text, for excerpt substring matching.
  const pageIndex = new Map()
  for (const p of pages) pageIndex.set(p.url, normaliseText(p.text))

  const sources = {
    listing: listing
      ? {
          id: listing.id,
          name: listing.name,
          slug: listing.slug ?? null,
          vertical: listing.vertical ?? null,
          region: listing.region ?? null,
          website: listing.website ?? null,
        }
      : null,
    pages: pages.map(p => ({ url: p.url, chars: p.text.length })),
    pages_attempted: attempted,
    fetch_errors: fetchErrors,
  }

  // ── Anti-hallucination guard: nothing to ground against → refuse ─────────
  if (!listing && pages.length === 0) {
    return {
      kind: 'no_grounding_source',
      sources,
      note: website
        ? `No Atlas listing and no website pages could be fetched from ${website}. There is nothing to ground a pitch against, so none was generated.`
        : 'No Atlas listing and no website provided. A manual pitch needs at least one source to ground every claim against.',
    }
  }

  // ── Composition loop ─────────────────────────────────────────────────────
  const usages = []
  let feedback = null

  for (let attemptNo = 1; attemptNo <= MAX_COMPOSITIONS; attemptNo++) {
    let llm
    try {
      llm = await generateManualPitch({ name, listing, pages }, { slotType, client: anthropicClient, feedback })
    } catch (err) {
      return { kind: 'llm_error', error: err?.message ?? String(err), attempts: attemptNo, sources, usage: sumUsage(usages) }
    }
    if (llm.usage) usages.push(llm.usage)

    if (llm.kind === 'insufficient_data') {
      return { kind: 'insufficient_data', reason: llm.reason, attempts: attemptNo, sources, usage: sumUsage(usages) }
    }

    // Bail-token safety net (shared with the batch pipeline).
    const bail = detectBailToken(llm.data)
    if (bail) {
      return { kind: 'bail_token_detected', bail, attempts: attemptNo, sources, usage: sumUsage(usages) }
    }

    // Gate 1: two-source fact-check.
    const fact_check = factCheckManual(llm.data.verified_facts, { listing, pageIndex })
    if (!fact_check.passed) {
      if (attemptNo < MAX_COMPOSITIONS) {
        feedback = { failedClaims: fact_check.failed_claims }
        continue
      }
      return {
        kind: 'fact_check_failed',
        reason: 'failed_fact_check_after_max_compositions',
        failed_claims: fact_check.failed_claims,
        pitch_data: llm.data,
        attempts: attemptNo,
        sources,
        usage: sumUsage(usages),
      }
    }

    // Gate 2: prose verification.
    let verification
    try {
      verification = await verifyManualPitch(llm.data, { listing }, { client: anthropicClient })
    } catch (err) {
      verification = { passed: false, flags: [{ claim: '<verification call errored>', reason: err?.message ?? String(err) }], error: true, usage: zeroUsage() }
    }
    if (verification.usage) usages.push(verification.usage)

    if (!verification.passed) {
      const verifyErrored = verification.error === true
      if (!verifyErrored && attemptNo < MAX_COMPOSITIONS) {
        feedback = { verifyFlags: verification.flags }
        continue
      }
      return {
        kind: 'verification_failed',
        reason: verifyErrored ? 'verification_call_errored' : 'verification_failed_after_max_compositions',
        flags: verification.flags,
        verify_error: verifyErrored,
        pitch_data: llm.data,
        attempts: attemptNo,
        sources,
        usage: sumUsage(usages),
      }
    }

    // ── Both gates passed ────────────────────────────────────────────────
    return {
      kind: 'researched_pitch',
      pitch_data: llm.data,
      fact_check, // { passed: true }
      verification: { passed: true, flags: [] },
      sources,
      prompt_version: llm.prompt_version,
      generated_by: llm.generated_by,
      generated_at: llm.generated_at,
      slot_type: slotType,
      attempts: attemptNo,
      usage: sumUsage(usages),
    }
  }

  throw new Error('runManualPipeline: composition loop exited without returning')
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Cap pages by count, per-page length, and total length. */
function capPages(rawPages) {
  const out = []
  let total = 0
  for (const p of Array.isArray(rawPages) ? rawPages : []) {
    if (out.length >= MAX_PAGES) break
    if (!p || typeof p.text !== 'string' || typeof p.url !== 'string') continue
    const text = p.text.length > MAX_PAGE_CHARS ? p.text.slice(0, MAX_PAGE_CHARS) : p.text
    if (total + text.length > MAX_TOTAL_CHARS && out.length > 0) break
    out.push({ url: p.url, text, fetched_at: p.fetched_at })
    total += text.length
  }
  return out
}

function zeroUsage() {
  return { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
}
