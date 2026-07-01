import Anthropic from '@anthropic-ai/sdk'

// Korean launch (feat/ko-launch): translate a Korean search query to English at
// request time so the existing English embedding/hybrid search runs unchanged.
//
// Detection is by Hangul codepoints (or an explicit ?lang=ko), so English
// queries incur zero added latency. Results are cached in-process per normalized
// query. Every failure path is fail-open: the raw query is returned so search
// still runs (degraded) rather than erroring.

const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏ﾠ-ￜ]/
const MODEL = 'claude-haiku-4-5-20251001'
const cache = new Map()
let client = null

export function hasHangul(s) {
  return typeof s === 'string' && HANGUL.test(s)
}

export async function translateSearchQuery(q, lang) {
  const raw = (q || '').trim()
  if (!raw) return raw
  // Only translate when the query is actually Korean (or explicitly flagged).
  if (lang !== 'ko' && !hasHangul(raw)) return raw

  const key = raw.toLowerCase()
  if (cache.has(key)) return cache.get(key)

  if (!process.env.ANTHROPIC_API_KEY) return raw

  try {
    client = client || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 120,
      system:
        'You translate a short search query from Korean into English for an Australian venue and travel search engine. Output ONLY the English translation — no quotes, no notes. Preserve place and proper names (romanize where needed). Keep it concise and natural as a search phrase.',
      messages: [{ role: 'user', content: raw }],
    })
    const out = resp.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
      .replace(/^["']|["']$/g, '')
    const english = out || raw
    cache.set(key, english)
    return english
  } catch (e) {
    console.warn('[search] ko query translate failed:', e.message)
    return raw
  }
}
