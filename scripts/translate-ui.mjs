#!/usr/bin/env node

/**
 * Generate messages/<locale>.json from messages/en.json using Claude Haiku.
 *
 * Interface (chrome) strings only — small and cheap. ICU placeholders like
 * {region} and rich-text tags like <em></em> are preserved verbatim.
 *
 * Usage: node scripts/translate-ui.mjs --locale ko
 */

import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', override: true })
const { default: Anthropic } = await import('@anthropic-ai/sdk')

const argv = process.argv.slice(2)
const li = argv.indexOf('--locale')
const LOCALE = li !== -1 && argv[li + 1] ? argv[li + 1] : 'ko'
const LOCALE_NAMES = { ko: 'Korean (한국어)' }
const LOCALE_LABEL = LOCALE_NAMES[LOCALE] || LOCALE
const MODEL = 'claude-haiku-4-5-20251001'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const en = JSON.parse(fs.readFileSync(path.resolve('messages/en.json'), 'utf-8'))

const SYSTEM = `You localize UI strings for a web app into ${LOCALE_LABEL}.
Rules:
- Return a JSON object with EXACTLY the same keys and nesting as the input. Translate only the string VALUES.
- Preserve ICU placeholders in braces verbatim, e.g. {region}, {query}, {count}.
- Preserve any HTML-like tags verbatim, e.g. <em>...</em>. Translate the text between tags but keep the tags.
- Keep the proper noun "Australian Atlas" as-is. Keep "Atlas" as-is in product names.
- Translate concisely and naturally, as UI chrome (buttons, nav, labels).
- For the "language" namespace: keep "korean" as "한국어" and render "english" appropriately for a ${LOCALE_LABEL} reader.
- Output ONLY the JSON object.`

const resp = await anthropic.messages.create({
  model: MODEL,
  max_tokens: 4096,
  system: SYSTEM,
  messages: [{ role: 'user', content: `Translate these UI strings to ${LOCALE_LABEL}:\n\n${JSON.stringify(en, null, 2)}` }],
})

const text = resp.content.map(b => (b.type === 'text' ? b.text : '')).join('')
const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
const body = fenced ? fenced[1] : text
const start = body.indexOf('{')
const end = body.lastIndexOf('}')
const ko = JSON.parse(body.slice(start, end + 1))

// Deep-merge safety: ensure every en key exists in ko, falling back to English
// so the UI never renders a missing key.
function fill(src, dst) {
  const out = {}
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object') out[k] = fill(src[k], dst?.[k] || {})
    else out[k] = typeof dst?.[k] === 'string' && dst[k].trim() ? dst[k] : src[k]
  }
  return out
}
const merged = fill(en, ko)

fs.writeFileSync(`messages/${LOCALE}.json`, JSON.stringify(merged, null, 2) + '\n')
console.log(`Wrote messages/${LOCALE}.json (${Object.keys(merged).length} namespaces). Tokens in=${resp.usage?.input_tokens} out=${resp.usage?.output_tokens}.`)
