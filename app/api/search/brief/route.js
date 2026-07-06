import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkRateLimit } from '@/lib/rate-limit'
import { getPublicVerticals } from '@/lib/verticalUrl'
import { excludeTestListings, excludeNeedsReview } from '@/lib/listings/publicFilter'
import { guardedAnthropicMessage } from '@/lib/ai/guardedAnthropic'

export const maxDuration = 30

// Haiku: cheap + fast — ONE short grounding call per settled search.
const MODEL = 'claude-haiku-4-5-20251001'

// Per-locale instruction so the brief answers in the visitor's language.
const ANSWER_LANGUAGE_RULE = {
  ko: '\n- Write the "answer" and every "why" in natural, fluent Korean (한국어). Keep place names in their original form.',
  zh: '\n- Write the "answer" and every "why" in natural, fluent Simplified Chinese (简体中文). Keep place names in their original (usually English) form.',
}

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

const MAX_IDS = 10       // how many of the caller's top results we ground on
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Small in-instance cache: the same settled search within a warm lambda
// skips the Claude call. Not durable — just trims repeats (back button,
// filter toggled off and on, several visitors on one hot query). ─────────────
const CACHE = new Map()
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 300
function cacheGet(k) {
  const hit = CACHE.get(k)
  if (!hit) return null
  if (Date.now() - hit.t > CACHE_TTL_MS) { CACHE.delete(k); return null }
  return hit.v
}
function cacheSet(k, v) {
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value)
  CACHE.set(k, { t: Date.now(), v })
}

/** Call Claude with a timeout + one retry on overload; returns null on failure. */
async function callClaude(client, params) {
  const TIMEOUT_MS = 15000
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await Promise.race([
        guardedAnthropicMessage(client, params),
        new Promise((_, reject) => setTimeout(() => reject(new Error('CLAUDE_TIMEOUT')), TIMEOUT_MS)),
      ])
    } catch (err) {
      if ((err.message === 'CLAUDE_TIMEOUT' || err.status === 529) && attempt === 0) continue
      return null
    }
  }
  return null
}

function firstJson(text, fallback) {
  if (!text) return fallback
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return fallback
  try { return JSON.parse(m[0]) } catch { return fallback }
}

/**
 * POST /api/search/brief
 *
 * The concierge's post-search write-up. After a plain (keyword) search settles,
 * the client sends the query + the ids of the top results it is SHOWING; we
 * re-fetch those rows server-side (client text is never trusted into the
 * prompt) and have Claude write a short, grounded note that helps the visitor
 * choose — plus a one-line "why it fits" per venue, bound to the venue's id.
 *
 * This complements /api/search/ask (which OWNS retrieval for plain-language
 * inquiries): the brief never changes what the results are, it only reads the
 * ranking the visitor is already looking at. Fully fail-open: no key, over
 * budget, timeout → { answer: null } and the results page shows no panel.
 */
export async function POST(request) {
  // One Claude call per settled search — throttle to curb cost abuse.
  const rl = checkRateLimit(request, { keyPrefix: 'brief', maxRequests: 20, windowMs: 60_000 })
  if (rl) return rl

  try {
    const body = await request.json().catch(() => ({}))
    const query = String(body.query || '').trim().slice(0, 200)
    const weak = body.weak === true
    const locale = ['ko', 'zh'].includes(body.locale) ? body.locale : 'en'
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.filter((id) => typeof id === 'string' && UUID_RE.test(id)))].slice(0, MAX_IDS)
      : []
    if (query.length < 3 || ids.length === 0) {
      return NextResponse.json({ answer: null, reasons: [] })
    }

    const ckey = `${locale}|${weak ? 'w' : 's'}|${query.toLowerCase()}|${[...ids].sort().join(',')}`
    const cached = cacheGet(ckey)
    if (cached) return NextResponse.json({ ...cached, cached: true })

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ answer: null, reasons: [] })
    }

    // Re-fetch the rows by id under the same public gates as search itself —
    // ids are opaque to the prompt, so a caller can't inject text via them.
    const sb = getSupabaseAdmin()
    const { data: rowsRaw, error } = await excludeNeedsReview(excludeTestListings(
      sb.from('listings_with_region')
        .select('id, name, vertical, sub_type, suburb, region, state, description')
        .in('id', ids)
        .eq('status', 'active')
        .in('vertical', getPublicVerticals())
    ))
    if (error || !rowsRaw?.length) {
      return NextResponse.json({ answer: null, reasons: [] })
    }
    // Preserve the caller's rank order — the write-up should read the page
    // the way the visitor does, best match first.
    const byId = new Map(rowsRaw.map((r) => [r.id, r]))
    const rows = ids.map((id) => byId.get(id)).filter(Boolean)

    let anthropic = null
    try {
      const mod = await import('@anthropic-ai/sdk')
      anthropic = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY })
    } catch { anthropic = null }
    if (!anthropic) return NextResponse.json({ answer: null, reasons: [] })

    const menu = rows.map((r, i) => {
      const label = VERTICAL_LABELS[r.vertical] || r.vertical
      const where = [r.suburb, r.region, r.state].filter(Boolean).slice(0, 2).join(', ') || 'Australia'
      const desc = (r.description || '').replace(/\s+/g, ' ').slice(0, 180)
      return `${i + 1}. ${r.name} — ${label}, ${where}${desc ? `: ${desc}` : ''}`
    }).join('\n')

    const weakRule = weak
      ? '\n- IMPORTANT: none of these places cleared our relevance bar for this search — they are the CLOSEST RELATED places, not exact matches. Open by saying so honestly in your own words (e.g. what the Atlas does and doesn\'t hold for this), then point out which places come nearest and why. Never pretend a place matches when its line doesn\'t support it.'
      : ''

    const resp = await callClaude(anthropic, {
      model: MODEL,
      max_tokens: 600,
      system: `You are the concierge for the Australian Atlas, a curated guide to independent Australian places. A visitor just searched and these are the top results (each numbered), best match first. Write a brief, warm, specific note that helps them choose where to look first.\n\nHARD RULES:\n- Ground everything in the numbered places. NEVER invent a place, product, price, or detail. NEVER mention a place not in the list.\n- Each "why" must be about THAT exact numbered place, using only what its line says. If a place only partly fits the search, say what it is honestly — do not borrow another place's detail.\n- Voice: understated, place-literate, no marketing hype, no exclamation marks. Australian spelling. Do not restate the search back as a headline; just be useful.${weakRule}\n\nReturn ONLY minified JSON: {"answer": string, "picks": [{"n": number, "why": string}]}.\n- answer: 2-3 sentences that orient the visitor across what came back; name 1-2 of the places where it genuinely helps.\n- picks: the 3-6 places most worth their attention, each with its number "n" and a "why" of max 14 words — no place name in the why, no full stop.${ANSWER_LANGUAGE_RULE[locale] || ''}`,
      messages: [{ role: 'user', content: `Search: "${query}"\n\nTop results:\n${menu}` }],
    })
    const out = firstJson(resp?.content?.[0]?.text, null)

    let answer = null
    const reasons = []
    if (out) {
      if (typeof out.answer === 'string' && out.answer.trim()) answer = out.answer.trim()
      if (Array.isArray(out.picks)) {
        for (const p of out.picks) {
          const idx = Number(p?.n) - 1
          if (Number.isInteger(idx) && idx >= 0 && idx < rows.length && typeof p.why === 'string' && p.why.trim()) {
            reasons.push({ id: rows[idx].id, why: p.why.trim() })
          }
        }
      }
    }

    const payload = { answer, reasons }
    if (answer) cacheSet(ckey, payload)
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[brief] Error:', err)
    // Fail-open: the results page simply shows no concierge panel.
    return NextResponse.json({ answer: null, reasons: [] })
  }
}
