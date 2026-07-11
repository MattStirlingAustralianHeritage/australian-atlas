// Descriptive-recall expansion — the old "Vibe" mode folded into the ONE search.
//
// WHY. Vibe search used to be a separate mode with its own UI and endpoint, and
// its only real ranking difference from the standard search was this: expanding
// a moody/descriptive query ("somewhere quiet to read on a rainy day") into the
// concrete venue vocabulary the lexical arm can actually match ("bookshop",
// "reading room", "quiet cafe", "second hand books"). The semantic arm already
// understands the feeling; the lexical arm — the only arm that can surface
// venues with no embedding yet — matches stemmed tokens and gets nothing from
// abstract phrasing. websearch_to_tsquery understands OR and quoted phrases, so
// the expansion is OR'd into query_text and rows matching ANY phrase become
// candidates (ranked below full matches by migration 165's coverage bonus).
//
// WHEN. /api/search fires this ONLY as a second-chance pass: the query reads as
// descriptive AND the first hybrid pass produced nothing that cleared the
// strong floor. Strong lookups ("four pillars", "galleries in hobart") never
// pay for it; a per-keystroke weak prefix is bounded by the in-process cache,
// the Haiku price point, and the monthly budget governor.
//
// SAFETY. Fully fail-open: no API key, over budget, timeout, malformed reply →
// null, and the caller keeps the original pool. The expansion can only ever ADD
// recall — the cross-encoder re-ranks the widened pool against the ORIGINAL
// query, so precision is still earned per-row, never assumed.

import { guardedAnthropicMessage } from '@/lib/ai/guardedAnthropic'

const MODEL = 'claude-haiku-4-5-20251001'
const TIMEOUT_MS = 6000
const CACHE_MAX = 300

// In-instance LRU: normalized query → phrases array ([] = expansion declined).
const cache = new Map()

function cacheGet(key) {
  if (!cache.has(key)) return undefined
  const v = cache.get(key)
  cache.delete(key)
  cache.set(key, v)     // refresh recency
  return v
}

function cacheSet(key, v) {
  cache.delete(key)
  cache.set(key, v)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
}

/**
 * Does the (location-stripped) query read as a described feeling/scenario a
 * lexical expansion could help, rather than a name or bare category? Short
 * queries and one-worders are lookups; the semantic arm covers the middle.
 */
export function looksDescriptive(cleaned) {
  const s = String(cleaned || '').trim()
  if (s.length < 15) return false
  return (s.match(/\S+/g) || []).length >= 3
}

/**
 * Expand a descriptive query into `<cleaned> OR "phrase" OR "phrase" …` for the
 * lexical arm. Returns the expanded query_text string, or null (fail-open:
 * caller keeps the original text/pool).
 */
export async function expandDescriptiveQuery(cleaned) {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const key = String(cleaned).toLowerCase().replace(/\s+/g, ' ').trim()
  let phrases = cacheGet(key)

  if (phrases === undefined) {
    try {
      const mod = await import('@anthropic-ai/sdk')
      const anthropic = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY })
      const resp = await Promise.race([
        guardedAnthropicMessage(anthropic, {
          model: MODEL,
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `Mood/vibe searched on a directory of independent Australian venues: "${cleaned}". Return ONLY a JSON array of 4 short noun phrases (2-3 words each) naming the kinds of venue or concrete offering this evokes. Example: ["pottery studio","rustic retreat","quiet garden","wood fired"]`,
          }],
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('EXPAND_TIMEOUT')), TIMEOUT_MS)),
      ])
      const m = (resp?.content?.[0]?.text || '').match(/\[[\s\S]*\]/)
      phrases = m
        ? JSON.parse(m[0]).filter((p) => typeof p === 'string' && p.trim()).slice(0, 5)
        : []
      cacheSet(key, phrases)
    } catch (e) {
      // Transient failures stay uncached; a budget stop caches [] so the rest
      // of the month doesn't re-pay the (cheap) reserve check per search.
      if (e?.code === 'AI_BUDGET_EXCEEDED') cacheSet(key, [])
      console.warn('[search] descriptive expansion skipped:', e.message)
      return null
    }
  }

  if (!phrases || !phrases.length) return null
  return `${cleaned} OR ${phrases.map((p) => `"${p.replace(/"/g, '')}"`).join(' OR ')}`
}
