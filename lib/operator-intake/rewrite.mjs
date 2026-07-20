// ─────────────────────────────────────────────────────────────────────────────
// Claude-powered description REVISION for the admin review queue.
//
// The operator asked for changes (a request-changes note on a pending draft,
// or a coverage_request the first generation didn't land). The admin reads the
// request, clicks "Rewrite with Claude", reviews the revised copy, and only
// then publishes. This module produces that revised copy.
//
// It differs from generate.mjs in three deliberate ways:
//   1. The prompt is a revision brief: current copy + the change request,
//      not a from-scratch write. The request may remove/reorder/rephrase
//      freely but may only ADD details present in the facts or the current
//      copy — never invent to satisfy a request.
//   2. The ground set for source-binding is facts PLUS the previously
//      admin-approved live description: claims a human already approved
//      remain legitimate to keep, even if no structured fact carries them.
//   3. The model is Opus (admin-triggered, low volume, quality-critical) and
//      the call is budget-governed via guardedAnthropicMessage, so a runaway
//      month fails closed instead of blowing the API cap.
//
// Same non-negotiable as generate.mjs: NO template fallback. A failing draft
// is returned as failing with its gate flags — never silently replaced.
//
// Heavy deps (Anthropic SDK, budget governor) are imported lazily inside the
// default caller so this module loads — and unit-tests with an injected
// `llm` — without the SDK, a key, or a database.
// ─────────────────────────────────────────────────────────────────────────────

import { SYSTEM_PROMPT, bannedPhraseCheck } from './voice.mjs'
import { validateSourceBinding } from './source-binding.mjs'
import { resolveAnthropicKey } from './generate.mjs'

export const REWRITE_MODEL = 'claude-opus-4-8'
const MAX_TOKENS = 500
const LLM_TIMEOUT_MS = 60_000

const REWRITE_ADDENDUM = `

THIS IS A REVISION TASK. You will be given the current description, the operator's facts, and a change request. Rewrite the description to honour the change request — the absolute rules above still bind you:
- The request may ask you to REMOVE, REORDER, REPHRASE, shorten, or shift emphasis — do those freely.
- The request may only ADD a detail if that detail appears in the facts or in the current description. If it asks for something present in neither, leave it out; never invent to satisfy the request.
- Keep what the request does not ask you to change, tightening prose where it helps.
- Keep the five-movement structure and the 80–170 word length.

Output: just the revised description text, paragraphs separated by blank lines. No preamble, no headings.`

function str(v) {
  return typeof v === 'string' && v.trim().length > 0
}

/** Render the labelled facts block — same field vocabulary as generate.mjs. */
function renderFacts(facts) {
  const F = facts || {}
  const lines = []
  if (str(F.building_description)) lines.push(`The building: ${F.building_description.trim()}`)
  if (str(F.what_you_book)) lines.push(`What you book: ${F.what_you_book.trim()}`)
  if (str(F.design_fitting_detail)) lines.push(`Design & fittings: ${F.design_fitting_detail.trim()}`)
  if (str(F.where_it_sits)) lines.push(`Where it sits: ${F.where_it_sits.trim()}`)
  if (F.established_year !== null && F.established_year !== undefined && F.established_year !== '') {
    lines.push(`Established: ${F.established_year}`)
  }
  if (Array.isArray(F.products_operators_named) && F.products_operators_named.filter(str).length > 0) {
    lines.push(`Named products / makers: ${F.products_operators_named.filter(str).map(s => s.trim()).join('; ')}`)
  }
  if (str(F.ownership_transition_note)) lines.push(`Ownership / change note: ${F.ownership_transition_note.trim()}`)
  if (str(F.coverage_request)) lines.push(`What the operator wants covered, in their own words: ${F.coverage_request.trim()}`)
  return lines.length ? lines.join('\n') : '(no structured facts on file — ground every claim in the current description)'
}

/**
 * Build the revision brief. The change request leads — it is what the admin
 * is asking the model to act on — followed by the copy being revised and the
 * facts that bound it.
 */
export function buildRewriteMessage({ facts, listing = null, currentText = '', draftText = '', requestNote = '', adminGuidance = '' }) {
  const lines = ['Revise this venue description.']

  const asks = []
  if (str(requestNote)) asks.push(`From the operator: ${requestNote.trim()}`)
  if (str(adminGuidance)) asks.push(`From the editor: ${adminGuidance.trim()}`)
  lines.push(
    '',
    'CHANGE REQUEST:',
    asks.length ? asks.join('\n') : 'No written note — bring the description fully within the facts below and lift the prose, changing nothing factual.',
  )

  const current = str(draftText) ? draftText : currentText
  lines.push('', 'CURRENT DESCRIPTION (the text being revised):', str(current) ? current.trim() : '(none yet)')

  if (str(currentText) && str(draftText) && currentText.trim() !== draftText.trim()) {
    lines.push('', 'PREVIOUSLY PUBLISHED DESCRIPTION (also legitimate source material):', currentText.trim())
  }

  lines.push(
    '',
    'FACTS the operator submitted. Details may only be added from these or from the description text above:',
    renderFacts(facts),
  )

  const name = listing && (listing.title || listing.name)
  if (str(name)) {
    lines.push('', `(Readers see this venue under its own name, "${name.trim()}", as the page heading. Do not state the name in the description.)`)
  }

  lines.push('', 'Write the revised description now.')
  return lines.join('\n')
}

function buildCorrection(banned, binding) {
  const problems = []
  if (!banned.passed) {
    problems.push(`Remove these banned words/phrases entirely: ${banned.violations.join(', ')}.`)
  }
  if (!binding.passed) {
    const claims = binding.failed_claims.map(c => `"${c.value}"`).join(', ')
    problems.push(`These details are in NEITHER the facts NOR the current description and must be deleted, not replaced with a guess: ${claims}.`)
  }
  return `That revision is not publishable. ${problems.join(' ')} Rewrite using ONLY the facts and the current description, keeping the same structure and voice. Output only the description text.`
}

function stripWrappers(text) {
  let t = String(text || '').trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim()
  }
  return t
}

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`LLM call timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Default LLM caller — Opus through the budget governor. Lazy imports so raw
 * node (tests, scripts) never needs the SDK or the '@/' alias resolved.
 * Throws BudgetExceededError (code AI_BUDGET_EXCEEDED) when the monthly
 * anthropic cap would be breached — the route surfaces that as a clean 402.
 */
async function defaultOpusCall({ system, messages }) {
  const apiKey = resolveAnthropicKey()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not available')
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const { guardedAnthropicMessage } = await import('@/lib/ai/guardedAnthropic')
  const client = new Anthropic({ apiKey })
  const response = await withTimeout(
    guardedAnthropicMessage(client, { model: REWRITE_MODEL, max_tokens: MAX_TOKENS, system, messages }),
    LLM_TIMEOUT_MS,
  )
  const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  return { text, model: REWRITE_MODEL }
}

/**
 * Produce a revised description honouring a change request, gated exactly
 * like first-generation drafts (banned phrases + source binding, with the
 * previously published copy admitted as ground).
 *
 * @param {Object}   args
 * @param {Object}   args.facts         - operator_facts shape (may be null).
 * @param {Object}  [args.listing]      - listing row (name suppression only).
 * @param {string}  [args.currentText]  - the live published description.
 * @param {string}  [args.draftText]    - the pending draft text being revised.
 * @param {string}  [args.requestNote]  - the operator's change request.
 * @param {string}  [args.adminGuidance]- optional editor guidance.
 * @param {Function}[args.llm]          - injectable async ({system,messages}) => {text, model}.
 * @param {number}  [args.maxRetries]   - corrective retries on gate failure (default 2).
 */
export async function generateRewrite({
  facts,
  listing = null,
  currentText = '',
  draftText = '',
  requestNote = '',
  adminGuidance = '',
  llm = null,
  maxRetries = 2,
} = {}) {
  const callLLM = llm || defaultOpusCall
  const system = SYSTEM_PROMPT + REWRITE_ADDENDUM
  const userMessage = buildRewriteMessage({ facts, listing, currentText, draftText, requestNote, adminGuidance })
  // The previously APPROVED copy grounds claims; the unapproved draft being
  // revised does not (its own flagged inventions must not self-legitimise).
  const extraSources = [currentText].filter(str)

  let messages = [{ role: 'user', content: userMessage }]
  const attempts = []
  let last = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { text, model } = await callLLM({ system, messages })
    const clean = stripWrappers(text)
    const banned = bannedPhraseCheck(clean)
    const binding = validateSourceBinding(clean, facts, extraSources)
    const ok = banned.passed && binding.passed
    last = { ok, text: clean, model: model || REWRITE_MODEL, banned, binding, attempt: attempt + 1 }
    attempts.push(last)
    if (ok) break
    if (attempt < maxRetries) {
      messages = [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: text },
        { role: 'user', content: buildCorrection(banned, binding) },
      ]
    }
  }

  return { ...last, attempts }
}
