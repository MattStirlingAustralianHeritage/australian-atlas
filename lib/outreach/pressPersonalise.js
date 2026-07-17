// ============================================================
// Press outreach AI personalisation
// ------------------------------------------------------------
// Press counterpart of lib/outreach/councilPersonalise.js: one warm, grounded
// opening line per press contact (Claude Haiku), used as {{personal_note}}
// right after the greeting. Grounded ONLY in what we pass — the outlet, the
// journalist's beat, the region/state we can offer them, and a few real venue
// names from our own guide. Same no-fabrication discipline; fails soft to ''.
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import { resolveApiKey } from '@/lib/outreach/personalise'
import { beatPhrase } from '@/lib/outreach/pressTemplate'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 80
const TEMPERATURE = 0.6

const BANNED = ['hidden gem', 'nestled', 'unparalleled', 'bespoke', 'curated experience', 'curated experiences', 'vibrant', 'stunning', 'must-visit', 'one-stop', 'rich tapestry', 'game-changer', 'unlock']

const SYSTEM_PROMPT = `You write ONE opening line for a friendly, professional outreach email from Australian Atlas — a curated guide to independent Australian places — to a journalist or a newsdesk. The line appears immediately after the greeting and before we explain that we're a free story source for press (regional leads, a data room, intros to operators).

Rules:
- Exactly one sentence, 12 to 30 words. No greeting, no sign-off, no quotation marks, no emoji, no exclamation marks.
- Warm, specific, restrained — plain Australian editorial voice, one editor writing to another journalist, NOT marketing copy or a pitch deck. No cliché (never "hidden gem", "nestled", "unparalleled", "vibrant", "stunning", "must-visit", "game-changer", "unlock", "rich tapestry").
- Ground it ONLY in the facts given: the outlet, the journalist's beat, the region or state we can offer, and the example venues if provided. Do NOT invent statistics, past articles, story angles, staff names, or anything not stated. If little is known, write something honest that acknowledges their beat and offers the Atlas as a source — never fabricate a detail.
- You may name the beat and mention one example venue by name if examples are given. Refer to the outlet by name at most once.
- Output only the sentence, nothing else.`

function buildUserMessage({ outlet_name, journalist_name, beat, region, state, examples }) {
  const lines = [
    `Outlet: ${outlet_name}`,
    journalist_name ? `Journalist: ${journalist_name}` : 'Contact: the newsdesk (no named journalist)',
    beat ? `Beat: ${beat}` : null,
    region ? `Region we can offer them: ${region}${state ? `, ${state}` : ''}` : (state ? `State focus: ${state}` : null),
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
 * Generate one press opener. Returns '' on any failure or off-spec output.
 * @param {object} press  { outlet_name, journalist_name?, beat?(string|array), region?, state?, examples? }
 */
export async function generatePressNote(press, client) {
  if (!press?.outlet_name) return ''
  try {
    const anthropic = client || new Anthropic({ apiKey: resolveApiKey() })
    const input = { ...press, beat: press.beat ? beatPhrase(press.beat) : '' }
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
    console.error('[outreach/pressPersonalise] generation failed:', err.message)
    return ''
  }
}

/**
 * Generate notes for many press contacts with bounded concurrency (shares one
 * client). @returns {Promise<Array<{ id, personal_note }>>}
 */
export async function generatePressNotesBatch(rows, concurrency = 4) {
  const apiKey = resolveApiKey()
  if (!apiKey) return rows.map((r) => ({ id: r.id, personal_note: '' }))
  const client = new Anthropic({ apiKey })
  const out = []
  let idx = 0
  async function worker() {
    while (idx < rows.length) {
      const i = idx++
      const note = await generatePressNote(rows[i], client)
      out[i] = { id: rows[i].id, personal_note: note }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker))
  return out
}
