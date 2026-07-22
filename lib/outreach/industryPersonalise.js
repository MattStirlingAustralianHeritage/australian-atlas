// ============================================================
// Industry outreach AI personalisation
// ------------------------------------------------------------
// Industry counterpart of lib/outreach/pressPersonalise.js: one warm, grounded
// opening line per industry contact (Claude Haiku), used as {{personal_note}}
// right after the greeting. Grounded ONLY in what we pass — the organisation,
// its sector focus, the region/state we can offer, and a few real venue names
// from our own guide. Same no-fabrication discipline; fails soft to ''.
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import { resolveApiKey } from '@/lib/outreach/personalise'
import { focusPhrase } from '@/lib/outreach/industryTemplate'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 80
const TEMPERATURE = 0.6

const BANNED = ['hidden gem', 'nestled', 'unparalleled', 'bespoke', 'curated experience', 'curated experiences', 'vibrant', 'stunning', 'must-visit', 'one-stop', 'rich tapestry', 'game-changer', 'unlock']

const SYSTEM_PROMPT = `You write ONE opening line for a friendly, professional outreach email from Australian Atlas — a curated guide to independent Australian places — to an industry body, association or similar organisation. The line appears immediately after the greeting and before we explain that the Atlas offers free listings for their member operators, regional coverage, and shared data.

Rules:
- Exactly one sentence, 12 to 30 words. No greeting, no sign-off, no quotation marks, no emoji, no exclamation marks.
- Warm, specific, restrained — plain Australian professional voice, one founder writing to a peak body, NOT marketing copy or a pitch deck. No cliché (never "hidden gem", "nestled", "unparalleled", "vibrant", "stunning", "must-visit", "game-changer", "unlock", "rich tapestry").
- Ground it ONLY in the facts given: the organisation's name, its sector focus, the region or state, and the example venues if provided. Do NOT invent statistics, member counts, programs, staff names, or anything not stated. If little is known, write something honest that acknowledges the sector they represent and the independent operators we both care about — never fabricate a detail.
- You may name the sector focus and mention one example venue by name if examples are given. Refer to the organisation by name at most once.
- Output only the sentence, nothing else.`

function buildUserMessage({ org_name, contact_name, focus, region, state, examples }) {
  const lines = [
    `Organisation: ${org_name}`,
    contact_name ? `Contact: ${contact_name}` : 'Contact: the organisation generally (no named person)',
    focus ? `Sector focus: ${focus}` : null,
    region ? `Region they cover: ${region}${state ? `, ${state}` : ''}` : (state ? `State focus: ${state}` : null),
    examples && examples.length
      ? `Example independent operators from our guide there: ${examples.slice(0, 3).join('; ')}`
      : 'Example operators: (none on file)',
  ].filter(Boolean)
  return lines.join('\n')
}

function acceptable(sentence) {
  if (!sentence) return false
  const words = sentence.split(/\s+/).length
  if (words < 8 || words > 36) return false
  const lower = sentence.toLowerCase()
  if (BANNED.some((b) => lower.includes(b))) return false
  return true
}

/**
 * Generate one industry opener. Returns '' on any failure or off-spec output.
 * @param {object} org  { org_name, contact_name?, focus?(string|array), region?, state?, examples? }
 */
export async function generateIndustryNote(org, client) {
  if (!org?.org_name) return ''
  try {
    const anthropic = client || new Anthropic({ apiKey: resolveApiKey() })
    const input = { ...org, focus: org.focus ? focusPhrase(org.focus) : '' }
    const res = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(input) }],
    })
    let note = (res.content?.[0]?.text || '').trim().replace(/^["']|["']$/g, '').trim()
    const firstStop = note.search(/[.!?]\s/)
    if (firstStop > 0) note = note.slice(0, firstStop + 1).trim()
    return acceptable(note) ? note : ''
  } catch (err) {
    console.error('[outreach/industryPersonalise] generation failed:', err.message)
    return ''
  }
}

/**
 * Generate notes for many industry contacts with bounded concurrency (shares
 * one client). @returns {Promise<Array<{ id, personal_note }>>}
 */
export async function generateIndustryNotesBatch(rows, concurrency = 4) {
  const apiKey = resolveApiKey()
  if (!apiKey) return rows.map((r) => ({ id: r.id, personal_note: '' }))
  const client = new Anthropic({ apiKey })
  const out = []
  let idx = 0
  async function worker() {
    while (idx < rows.length) {
      const i = idx++
      const note = await generateIndustryNote(rows[i], client)
      out[i] = { id: rows[i].id, personal_note: note }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker))
  return out
}
