// ============================================================
// Trade outreach AI personalisation
// ------------------------------------------------------------
// Travel-trade counterpart of lib/outreach/personalise.js (operators) and
// lib/outreach/councilPersonalise.js: one warm, grounded opening line per
// company (Claude Haiku), used as {{personal_note}} right after "Hi,".
// Grounded ONLY in what we pass — the company, what it sells, its focus
// region (if we've linked one) with our listing count and a few real venue
// names from our own guide, else the network-wide count. Same no-fabrication
// discipline; fails soft to ''.
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import { resolveApiKey } from '@/lib/outreach/personalise'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 70
const TEMPERATURE = 0.6

const BANNED = ['hidden gem', 'nestled', 'unparalleled', 'bespoke', 'curated experience', 'curated experiences', 'vibrant', 'stunning', 'must-visit', 'one-stop', 'rich tapestry', 'game-changer', 'seamless', 'elevate']

const ORG_TYPE_LABELS = {
  tour_operator: 'a tour operator',
  inbound_operator: 'an inbound tour operator',
  dmc: 'a destination management company',
  wholesaler: 'a tour wholesaler',
  travel_agent: 'a travel agency',
  trip_designer: 'a trip-design studio',
  other: 'a travel company',
}

const SYSTEM_PROMPT = `You write ONE opening line for a friendly, professional outreach email from Australian Atlas — a curated guide to independent Australian places — to the product or itinerary team at a travel-trade company (a tour operator, DMC, wholesaler, agency or trip designer). The line appears immediately after "Hi," and before we explain the free trade itinerary-building platform we're offering.

Rules:
- Exactly one sentence, 12 to 28 words. No greeting, no sign-off, no quotation marks, no emoji, no exclamation marks.
- Warm, specific, restrained — plain Australian editorial voice, one professional writing to another, not marketing copy. No tourism or startup cliché (never "hidden gem", "nestled", "unparalleled", "vibrant", "stunning", "must-visit", "seamless", "game-changer", "elevate").
- Ground it ONLY in the facts given: what the company does, the region it focuses on, how many places we have mapped there or nationally, and the example venues if provided. Do NOT invent statistics, awards, itineraries, staff names, or anything not stated. If little is known, write something honest about mapping independent operators across Australia — never fabricate a detail.
- Refer to the company or its focus at most once; you may mention one example venue by name if examples are given.
- Output only the sentence, nothing else.`

function buildUserMessage({ company_name, org_type, focus, region, state, listing_count, network_count, examples }) {
  const lines = [
    `Company: ${company_name}${org_type && ORG_TYPE_LABELS[org_type] ? ` (${ORG_TYPE_LABELS[org_type]})` : ''}`,
    focus ? `What they sell: ${focus}` : null,
    region ? `Region they focus on (which we cover): ${region}${state ? `, ${state}` : ''}` : null,
    listing_count != null ? `Independent places we have mapped in that region: ${listing_count}` : null,
    network_count != null ? `Independent places we have mapped across Australia: ${network_count}` : null,
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
 * Generate one trade opener. Returns '' on any failure or off-spec output.
 */
export async function generateTradeNote(company, client) {
  if (!company?.company_name) return ''
  try {
    const anthropic = client || new Anthropic({ apiKey: resolveApiKey() })
    const res = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(company) }],
    })
    let note = (res.content?.[0]?.text || '').trim().replace(/^["']|["']$/g, '').trim()
    const firstStop = note.search(/[.!?]\s/)
    if (firstStop > 0) note = note.slice(0, firstStop + 1).trim()
    return acceptable(note) ? note : ''
  } catch (err) {
    console.error('[outreach/tradePersonalise] generation failed:', err.message)
    return ''
  }
}

/**
 * Generate notes for many companies with bounded concurrency (shares one client).
 * @returns {Promise<Array<{ id, personal_note }>>}
 */
export async function generateTradeNotesBatch(companies, concurrency = 4) {
  const apiKey = resolveApiKey()
  if (!apiKey) return companies.map((c) => ({ id: c.id, personal_note: '' }))
  const client = new Anthropic({ apiKey })
  const out = []
  let idx = 0
  async function worker() {
    while (idx < companies.length) {
      const i = idx++
      const c = companies[i]
      const note = await generateTradeNote(c, client)
      out[i] = { id: c.id, personal_note: note }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, companies.length) }, worker))
  return out
}
