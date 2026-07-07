// ============================================================
// Outreach AI personalisation
// ------------------------------------------------------------
// Generates a single warm, grounded opening line per venue (Claude Haiku), used
// as the {{personal_note}} merge token. The line is inserted right after "Hi,"
// so a cold email reads as if it was written by hand.
//
// Hard rule: ground ONLY in the facts we pass (name, type, region, our own
// editorial description). The prompt forbids inventing awards, dates, owner
// names, menu items — anything not given — in keeping with the Atlas
// no-fabrication discipline. Fails soft: returns '' rather than throwing.
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 70
const TEMPERATURE = 0.6

const VERTICAL_NOUN = {
  sba: 'independent small-batch producer',
  table: 'independent place to eat or drink',
  fine_grounds: 'independent cafe or roaster',
  rest: 'independent place to stay',
  collection: 'gallery or cultural space',
  craft: 'maker studio or workshop',
  corner: 'independent neighbourhood shop',
  found: 'vintage / second-hand shop',
  way: 'independent tour or experience',
  field: 'place in the outdoors',
}

const BANNED = ['hidden gem', 'nestled', 'unparalleled', 'bespoke', 'curated experience', 'curated experiences', 'vibrant', 'stunning', 'must-visit', 'one-stop']

const SYSTEM_PROMPT = `You write ONE opening line for a friendly, low-key outreach email from Australian Atlas — a curated guide to independent Australian places — to the owner of a venue we've added to the guide. The line appears immediately after "Hi," and before we explain their listing.

Rules:
- Exactly one sentence, 12 to 28 words. No greeting, no sign-off, no quotation marks, no emoji, no exclamation marks.
- Warm, specific, restrained — plain Australian editorial voice. No hospitality cliché (never "hidden gem", "nestled", "unparalleled", "bespoke", "curated experience", "vibrant", "stunning", "must-visit").
- Ground it ONLY in the facts given. Do NOT invent awards, dates, owners' names, menu or product specifics, or anything not stated. If little is known, write something honest and general about coming across them while mapping independent operators in their region — never fabricate a detail.
- Refer to the venue by its name at most once; address the reader as "you" where it reads naturally.
- Output only the sentence, nothing else.`

function resolveApiKey() {
  let key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    try {
      const envContent = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8')
      const m = envContent.match(/^ANTHROPIC_API_KEY=(.+)$/m)
      if (m) key = m[1].trim()
    } catch { /* fall through */ }
  }
  return key
}

function buildUserMessage({ name, vertical, region, suburb, description }) {
  const lines = [
    `Venue name: ${name}`,
    `Type: ${VERTICAL_NOUN[vertical] || 'independent place'}`,
    region ? `Region: ${region}` : null,
    suburb ? `Town/suburb: ${suburb}` : null,
    description ? `Our editorial description: ${String(description).slice(0, 600)}` : 'Our editorial description: (none on file)',
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
 * Generate one personal opener. Returns '' on any failure or if the output is
 * off-spec (caller treats empty as "no note").
 */
export async function generatePersonalNote(listing, client) {
  const name = listing?.name
  if (!name) return ''
  try {
    const anthropic = client || new Anthropic({ apiKey: resolveApiKey() })
    const res = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(listing) }],
    })
    let note = (res.content?.[0]?.text || '').trim().replace(/^["']|["']$/g, '').trim()
    // Keep the first sentence only, in case the model over-produces.
    const firstStop = note.search(/[.!?]\s/)
    if (firstStop > 0) note = note.slice(0, firstStop + 1).trim()
    return acceptable(note) ? note : ''
  } catch (err) {
    console.error('[outreach/personalise] generation failed:', err.message)
    return ''
  }
}

/**
 * Generate notes for many listings with bounded concurrency (shares one client).
 * @returns {Promise<Array<{ id, personal_note }>>}
 */
export async function generatePersonalNotesBatch(listings, concurrency = 4) {
  const apiKey = resolveApiKey()
  if (!apiKey) return listings.map((l) => ({ id: l.id, personal_note: '' }))
  const client = new Anthropic({ apiKey })
  const out = []
  let idx = 0
  async function worker() {
    while (idx < listings.length) {
      const i = idx++
      const l = listings[i]
      const note = await generatePersonalNote(l, client)
      out[i] = { id: l.id, personal_note: note }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, listings.length) }, worker))
  return out
}
