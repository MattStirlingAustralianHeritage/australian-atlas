#!/usr/bin/env node

/**
 * Generate messages/<locale>.json from messages/en.json using Claude Haiku.
 *
 * Translates ONE NAMESPACE PER CALL so the full (large) catalogue never exceeds
 * a single response's token budget, then merges. ICU placeholders like {town}
 * and rich-text tags like <em></em> are preserved verbatim. Existing values in
 * the target file are reused for namespaces whose English is unchanged (unless
 * --force), so re-runs are cheap.
 *
 * Usage: node scripts/translate-ui.mjs --locale ko [--force] [--only ns1,ns2]
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', override: true })
const { default: Anthropic } = await import('@anthropic-ai/sdk')

const argv = process.argv.slice(2)
const li = argv.indexOf('--locale')
const LOCALE = li !== -1 && argv[li + 1] ? argv[li + 1] : 'ko'
const FORCE = argv.includes('--force')
const onlyI = argv.indexOf('--only')
const ONLY = onlyI !== -1 && argv[onlyI + 1] ? argv[onlyI + 1].split(',') : null
const LOCALE_NAMES = { ko: 'Korean (한국어)', zh: 'Simplified Chinese (简体中文)' }
const LOCALE_LABEL = LOCALE_NAMES[LOCALE] || LOCALE
const MODEL = 'claude-haiku-4-5-20251001'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const en = JSON.parse(fs.readFileSync(path.resolve('messages/en.json'), 'utf-8'))
const outPath = path.resolve(`messages/${LOCALE}.json`)
const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf-8')) : {}
// Sidecar of source hashes so we only re-translate a namespace whose English changed.
const hashPath = path.resolve(`messages/.${LOCALE}.hash.json`)
const prevHash = fs.existsSync(hashPath) ? JSON.parse(fs.readFileSync(hashPath, 'utf-8')) : {}
const nsHash = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex')

const SYSTEM = `You localize UI strings for a web app into ${LOCALE_LABEL}.
Rules:
- Return a JSON object with EXACTLY the same keys as the input. Translate only the string VALUES.
- Preserve ICU placeholders in braces verbatim, e.g. {town}, {count}, {query}.
- Preserve any HTML-like tags verbatim, e.g. <em>...</em> (translate the text between, keep the tags).
- Keep the proper noun "Australian Atlas" as-is, and keep "Atlas" in product names.
- Translate concisely and naturally, as UI chrome (nav, buttons, labels, headings, empty states). Use natural ${LOCALE_LABEL}, not literal word-for-word.
- CRITICAL: never place a raw ASCII double-quote (") inside a translated value — it breaks the JSON. If the source quotes a phrase, use the target language's own quotation marks instead (Chinese: “ ” or 「 」; Korean: 「 」).
- Output ONLY the JSON object.`

// CJK values sometimes contain a raw ASCII double-quote (the model rendered a
// quoted phrase with " instead of target-language quote marks), which is an
// unescaped quote inside a JSON string value and breaks JSON.parse. Since the
// model emits one flat `"key": "value"[,]` per line (mirroring our pretty
// input), we can losslessly re-escape the inner quotes line-by-line as a repair.
function repairJsonQuotes(jsonish) {
  return jsonish.split('\n').map((line) => {
    const m = line.match(/^(\s*"(?:[^"\\]|\\.)*"\s*:\s*)"([\s\S]*)"(\s*,?)\s*$/)
    if (!m) return line
    const inner = m[2].replace(/\\"/g, '"').replace(/"/g, '\\"')
    return `${m[1]}"${inner}"${m[3]}`
  }).join('\n')
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const s = body.indexOf('{'); const e = body.lastIndexOf('}')
  const slice = body.slice(s, e + 1)
  try { return JSON.parse(slice) }
  catch { return JSON.parse(repairJsonQuotes(slice)) }
}

function fill(src, dst) {
  const out = {}
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object') out[k] = fill(src[k], dst?.[k] || {})
    else out[k] = typeof dst?.[k] === 'string' && dst[k].trim() ? dst[k] : src[k]
  }
  return out
}

const result = {}
const newHash = {}
let inTok = 0, outTok = 0, translated = 0, skipped = 0

for (const ns of Object.keys(en)) {
  const h = nsHash(en[ns])
  newHash[ns] = h
  const unchanged = !FORCE && prevHash[ns] === h && prev[ns]
  const included = !ONLY || ONLY.includes(ns)
  if (unchanged || !included) {
    // Reuse prior translation; fill any missing keys with English.
    result[ns] = fill(en[ns], prev[ns] || {})
    skipped++
    continue
  }
  // CJK values occasionally contain a raw ASCII double-quote (a quoted phrase
  // the model failed to render with target-language quote marks), which breaks
  // the JSON. That failure is stochastic, so retry a few times before giving up
  // and falling back to English for the namespace.
  let parsed = null
  let lastErr = null
  for (let attempt = 1; attempt <= 4 && !parsed; attempt++) {
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 16000, system: SYSTEM,
      messages: [{ role: 'user', content: `Translate this "${ns}" namespace to ${LOCALE_LABEL}:\n\n${JSON.stringify(en[ns], null, 2)}` }],
    })
    inTok += resp.usage?.input_tokens || 0
    outTok += resp.usage?.output_tokens || 0
    try { parsed = extractJson(resp.content.map(b => b.type === 'text' ? b.text : '').join('')) }
    catch (e) { lastErr = e }
  }
  if (!parsed) { console.warn(`  ns "${ns}" parse failed after retries (${lastErr?.message}) — falling back to English`); parsed = {} }
  result[ns] = fill(en[ns], parsed)
  translated++
  process.stdout.write(`\r  translated ${translated} namespaces…   `)
}

fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n')
fs.writeFileSync(hashPath, JSON.stringify(newHash, null, 2) + '\n')
console.log(`\nWrote messages/${LOCALE}.json — ${Object.keys(result).length} namespaces (${translated} translated, ${skipped} reused). Tokens in=${inTok} out=${outTok}.`)
