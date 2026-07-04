import { guardedAnthropicMessage } from '@/lib/ai/guardedAnthropic'

// Multilingual launch (feat/ko-launch → feat/zh-launch): translate a non-English
// search query to English at request time so the existing English
// embedding/hybrid search runs unchanged.
//
// Detection is by script (Hangul → Korean, Han ideographs → Simplified Chinese)
// or an explicit ?lang= flag, so English/Latin queries incur zero added latency
// AND never load the Anthropic SDK (it is lazy-imported only on the translate
// path). Results are cached in-process (bounded) per normalized query. The
// Claude call is budget-governed like every other Anthropic call in the app.
// Every failure path is fail-open: the raw query is returned so search still
// runs (degraded) rather than erroring.

const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏ﾠ-ￜ]/
// CJK unified ideographs (+ ext-A + compatibility) — a Chinese query with no
// Hangul/Kana lands here.
const HAN = /[㐀-䶿一-鿿豈-﫿]/
const MODEL = 'claude-haiku-4-5-20251001'
const cache = new Map()
const CACHE_MAX = 500
let client = null

// Human-readable source language for the translation prompt, per locale.
const SOURCE_LANGUAGE = { ko: 'Korean', zh: 'Simplified Chinese' }

export function hasHangul(s) {
  return typeof s === 'string' && HANGUL.test(s)
}

export function hasHan(s) {
  return typeof s === 'string' && HAN.test(s)
}

// Which non-English locale a raw query is written in ('en' if Latin). Hangul is
// checked first because Korean text can contain the occasional Han character.
export function detectQueryLocale(s) {
  if (hasHangul(s)) return 'ko'
  if (hasHan(s)) return 'zh'
  return 'en'
}

export async function translateSearchQuery(q, lang) {
  const raw = (q || '').trim()
  if (!raw) return raw
  // Resolve the source locale: an explicit non-English flag wins, else detect by
  // script. A Latin/English query short-circuits with zero added latency.
  const detected = detectQueryLocale(raw)
  const srcLocale = SOURCE_LANGUAGE[lang] ? lang : detected
  if (srcLocale === 'en') return raw
  const srcLanguage = SOURCE_LANGUAGE[srcLocale]

  const key = `${srcLocale}:${raw.toLowerCase()}`
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
        `You translate a short search query from ${srcLanguage} into English for an Australian venue and travel search engine. Output ONLY the English translation — no quotes, no notes. Preserve place and proper names (romanize where needed). Keep it concise and natural as a search phrase.`,
      messages: [{ role: 'user', content: raw }],
    })
    const out = resp.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
      .replace(/^["']|["']$/g, '')
    const english = out || raw
    // Bounded FIFO cache — translate-path only; the key is scoped by source
    // locale so a query that collides across languages never cross-contaminates.
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
    cache.set(key, english)
    return english
  } catch (e) {
    console.warn(`[search] ${srcLocale} query translate failed:`, e.message)
    return raw
  }
}
