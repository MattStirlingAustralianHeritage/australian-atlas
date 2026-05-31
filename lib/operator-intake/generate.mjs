// ─────────────────────────────────────────────────────────────────────────────
// Description generation for operator-fed intake.
//
// Orchestrates: submitted facts → Haiku (Atlas house voice) → the two hard
// gates (banned phrases + source-binding). Mirrors the Haiku wiring in
// lib/plan-a-stay/title-generation.js (same model, same key resolution, same
// messages.create shape) but differs in one decisive way: there is NO template
// fallback. An off-voice or ungrounded title can degrade to a safe template; an
// off-voice or ungrounded *description* would be invented copy about a real
// venue, which the no-hallucination rule forbids. So a failing draft is returned
// as failing — never silently replaced — and the admin gate sees the flags.
//
// The Anthropic SDK is imported lazily inside the default caller so this module
// loads (and unit-tests, with an injected `llm`) without the SDK or a key.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs'
import path from 'path'
import { SYSTEM_PROMPT, bannedPhraseCheck } from './voice.mjs'
import { validateSourceBinding } from './source-binding.mjs'

export const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 400
const TEMPERATURE = 0.4
const LLM_TIMEOUT_MS = 30_000

function str(v) {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Resolve the Anthropic key. process.env first (the value a request runs with);
 * .env.local is a dev fallback for when the system env shadows it with an empty
 * value. Mirrors lib/plan-a-stay/title-generation.js. Returns null if unavailable.
 */
export function resolveAnthropicKey() {
  let apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    try {
      const envPath = path.resolve(process.cwd(), '.env.local')
      const envContent = fs.readFileSync(envPath, 'utf8')
      const match = envContent.match(/^ANTHROPIC_API_KEY=(.+)$/m)
      if (match) apiKey = match[1].trim()
    } catch (_) { /* absent/unreadable — caller throws a clean error */ }
  }
  return apiKey || null
}

/**
 * Render the submitted facts as a labelled block. Only non-empty fields appear,
 * so the model is told exactly which movements it can write — there is no slot
 * to fill from general knowledge.
 */
export function buildUserMessage({ facts, listing = null }) {
  const F = facts || {}
  const lines = [
    'FACTS the operator submitted. Use ONLY these. Anything not listed here does not exist for the purposes of this description — do not infer, guess, or fill gaps.',
    '',
  ]
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

  const name = listing && (listing.title || listing.name)
  if (str(name)) {
    lines.push(
      '',
      `(Readers see this venue under its own name, "${name.trim()}", as the page heading. Do not state the name in the description.)`,
    )
  }
  lines.push('', 'Write the description now.')
  return lines.join('\n')
}

/**
 * A corrective follow-up turn naming exactly what failed, so the retry edits the
 * specific problem rather than rolling the dice again.
 */
function buildCorrection(banned, binding) {
  const problems = []
  if (!banned.passed) {
    problems.push(`Remove these banned words/phrases entirely: ${banned.violations.join(', ')}.`)
  }
  if (!binding.passed) {
    const claims = binding.failed_claims.map(c => `"${c.value}"`).join(', ')
    problems.push(`These details are NOT in the facts and must be deleted, not replaced with a guess: ${claims}.`)
  }
  return `That draft is not publishable. ${problems.join(' ')} Rewrite using ONLY the facts provided, keeping the same structure and voice. Output only the description text.`
}

/** Strip quotes wrapping the entire output (the voice forbids them). */
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

/** Default LLM caller — real Haiku. SDK imported lazily so tests need neither. */
async function defaultHaikuCall({ system, messages }) {
  const apiKey = resolveAnthropicKey()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not available')
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  const response = await withTimeout(
    client.messages.create({ model: HAIKU_MODEL, max_tokens: MAX_TOKENS, temperature: TEMPERATURE, system, messages }),
    LLM_TIMEOUT_MS,
  )
  const text = response.content?.[0]?.text || ''
  return { text, model: HAIKU_MODEL }
}

/**
 * Generate a description from submitted facts and run it through both gates.
 *
 * @param {Object}   args
 * @param {Object}   args.facts      - operator_facts shape.
 * @param {Object}  [args.listing]   - the listing row (for name suppression only).
 * @param {Function}[args.llm]       - injectable async ({system,messages}) =>
 *                                     {text, model}. Defaults to real Haiku.
 * @param {number}  [args.maxRetries]- corrective retries on gate failure (default 1).
 * @returns {Promise<{
 *   ok: boolean, text: string, model: string,
 *   banned: {passed:boolean, violations:string[]},
 *   binding: {passed:boolean, failed_claims:Array, warnings:Array},
 *   attempt: number,
 *   attempts: Array,
 * }>}
 */
export async function generateDescription({ facts, listing = null, llm = null, maxRetries = 1 } = {}) {
  const callLLM = llm || defaultHaikuCall
  const userMessage = buildUserMessage({ facts, listing })
  let messages = [{ role: 'user', content: userMessage }]
  const attempts = []
  let last = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { text, model } = await callLLM({ system: SYSTEM_PROMPT, messages })
    const clean = stripWrappers(text)
    const banned = bannedPhraseCheck(clean)
    const binding = validateSourceBinding(clean, facts)
    const ok = banned.passed && binding.passed
    last = { ok, text: clean, model: model || HAIKU_MODEL, banned, binding, attempt: attempt + 1 }
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
