import { guardedAnthropicMessage } from '@/lib/ai/guardedAnthropic'

// Korean launch (feat/ko-launch): translate a Korean search query to English at
// request time so the existing English embedding/hybrid search runs unchanged.
//
// Detection is by Hangul codepoints (or an explicit ?lang=ko), so English
// queries incur zero added latency AND never load the Anthropic SDK (it is
// lazy-imported only on the Korean path). Results are cached in-process (bounded)
// per normalized query. The Claude call is budget-governed like every other
// Anthropic call in the app. Every failure path is fail-open: the raw query is
// returned so search still runs (degraded) rather than erroring.

const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏ﾠ-ￜ]/
const MODEL = 'claude-haiku-4-5-20251001'
const cache = new Map()
const CACHE_MAX = 500
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
    if (!client) {
      const mod = await import('@anthropic-ai/sdk')
      client = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY })
    }
    const resp = await guardedAnthropicMessage(client, {
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
    // Bounded FIFO cache — Korean-path only; keeps a warm instance from growing
    // without limit across distinct queries.
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
    cache.set(key, english)
    return english
  } catch (e) {
    console.warn('[search] ko query translate failed:', e.message)
    return raw
  }
}
