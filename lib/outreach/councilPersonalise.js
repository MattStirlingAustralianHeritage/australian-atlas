// ============================================================
// Council outreach AI personalisation
// ------------------------------------------------------------
// Council counterpart of lib/outreach/personalise.js: one warm, grounded
// opening line per council (Claude Haiku), used as {{personal_note}} right
// after "Hi,". Grounded ONLY in what we pass — the council, its region, how
// many places we've mapped there, and a few real venue names from our own
// guide. Same no-fabrication discipline; fails soft to ''.
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import { resolveApiKey } from '@/lib/outreach/personalise'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 70
const TEMPERATURE = 0.6

const BANNED = ['hidden gem', 'nestled', 'unparalleled', 'bespoke', 'curated experience', 'curated experiences', 'vibrant', 'stunning', 'must-visit', 'one-stop', 'rich tapestry']

const SYSTEM_PROMPT = `You write ONE opening line for a friendly, professional outreach email from Australian Atlas — a curated guide to independent Australian places — to the tourism or economic development team at a local council. The line appears immediately after "Hi," and before we explain the free council dashboard we're offering.

Rules:
- Exactly one sentence, 12 to 28 words. No greeting, no sign-off, no quotation marks, no emoji, no exclamation marks.
- Warm, specific, restrained — plain Australian editorial voice, writing to a colleague in local government, not marketing copy. No tourism cliché (never "hidden gem", "nestled", "unparalleled", "vibrant", "stunning", "must-visit", "rich tapestry").
- Ground it ONLY in the facts given: the region, how many places we've mapped there, and the example venues if provided. Do NOT invent statistics, events, campaigns, staff names, or anything not stated. If little is known, write something honest about mapping independent operators across their area — never fabricate a detail.
- Refer to the region by name at most once; you may mention one example venue by name if examples are given.
- Output only the sentence, nothing else.`

function buildUserMessage({ council_name, region, state, listing_count, examples }) {
  const lines = [
    `Council: ${council_name}`,
    region ? `Region we cover: ${region}${state ? `, ${state}` : ''}` : null,
    listing_count != null ? `Independent places we have mapped in this region: ${listing_count}` : null,
    examples && examples.length
      ? `Example venues from our guide there: ${examples.slice(0, 3).join('; ')}`
      : 'Example venues: (none on file)',
  ].filter(Boolean)
  return lines.join('\n')
}

function acceptable(sentence) {
  if (!sentence) return false
  const words = sentence.split(/\s+/).length
  if (words < 8 || words > 34) return false
  const lower = sentence.toLowerCase()
  if (BANNED.some((b) => lower.includes(b))) return false
  return true
}

/**
 * Generate one council opener. Returns '' on any failure or off-spec output.
 */
export async function generateCouncilNote(council, client) {
  if (!council?.council_name) return ''
  try {
    const anthropic = client || new Anthropic({ apiKey: resolveApiKey() })
    const res = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(council) }],
    })
    let note = (res.content?.[0]?.text || '').trim().replace(/^["']|["']$/g, '').trim()
    const firstStop = note.search(/[.!?]\s/)
    if (firstStop > 0) note = note.slice(0, firstStop + 1).trim()
    return acceptable(note) ? note : ''
  } catch (err) {
    console.error('[outreach/councilPersonalise] generation failed:', err.message)
    return ''
  }
}

/**
 * Generate notes for many councils with bounded concurrency (shares one client).
 * @returns {Promise<Array<{ id, personal_note }>>}
 */
export async function generateCouncilNotesBatch(councils, concurrency = 4) {
  const apiKey = resolveApiKey()
  if (!apiKey) return councils.map((c) => ({ id: c.id, personal_note: '' }))
  const client = new Anthropic({ apiKey })
  const out = []
  let idx = 0
  async function worker() {
    while (idx < councils.length) {
      const i = idx++
      const c = councils[i]
      const note = await generateCouncilNote(c, client)
      out[i] = { id: c.id, personal_note: note }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, councils.length) }, worker))
  return out
}
