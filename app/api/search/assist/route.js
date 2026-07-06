import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkRateLimit } from '@/lib/rate-limit'
import { isPublicListing } from '@/lib/listings/publicFilter'
import { guardedAnthropicMessage } from '@/lib/ai/guardedAnthropic'

export const maxDuration = 30

// Haiku: one short call per interaction, on the search hot path. Budget-guarded
// and fully fail-open — the assistant degrades to "unavailable", never breaks
// the results underneath it.
const MODEL = 'claude-haiku-4-5-20251001'

const MAX_IDS = 30       // how many of the visitor's current results we consider
const MENU_DESC = 200    // description excerpt per place shown to the model

// Per-locale instruction so the assistant speaks the visitor's language.
// English (default) adds nothing.
const LANGUAGE_RULE = {
  ko: '\n- Write every human-facing string (greeting, labels, hints, answer, why, followUp) in natural, fluent Korean (한국어). Keep place names in their original form.',
  zh: '\n- Write every human-facing string (greeting, labels, hints, answer, why, followUp) in natural, fluent Simplified Chinese (简体中文). Keep place names in their original (usually English) form.',
}

// ── Small in-instance cache: repeating the same step for the same result set
// within a warm lambda skips the Claude call. Per-instance, best-effort only. ──
const CACHE = new Map()
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 200
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
  const TIMEOUT_MS = 20000
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
 * POST /api/search/assist
 *
 * The optional results-page assistant. A visitor whose lookup returned a set of
 * places ("museums in hobart" → 19 results) can ask for help whittling them
 * down. Two steps, both GROUNDED in the visitor's actual result set:
 *
 *   1. No `need` in the body → suggest: read the real results and propose 3-5
 *      distinct directions to narrow by (only differences that actually exist
 *      in the set), plus a one-line greeting.
 *   2. `need` present (a chosen direction or free text) → refine: pick the 2-5
 *      places that best fit, each with a one-line venue-bound "why", plus an
 *      optional follow-up question for further whittling. `history` carries the
 *      visitor's earlier refinements so follow-ups stay context-aware.
 *
 * The client sends only listing IDS from its current results — all content the
 * model sees is re-read from the database here, and picks are bound to a
 * numbered menu so a reason can never drift onto the wrong place. Nothing is
 * ever invented; if nothing fits, the assistant says so.
 */
export async function POST(request) {
  const rl = checkRateLimit(request, { keyPrefix: 'assist', maxRequests: 20, windowMs: 60_000 })
  if (rl) return rl

  try {
    const body = await request.json().catch(() => ({}))
    const query = String(body.query || '').trim().slice(0, 200)
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.filter((x) => typeof x === 'string' && x.length < 80))].slice(0, MAX_IDS)
      : []
    if (!query || ids.length < 2) {
      return NextResponse.json({ error: 'query and ids are required' }, { status: 400 })
    }
    const need = String(body.need || '').trim().slice(0, 300)
    const history = (Array.isArray(body.history) ? body.history : [])
      .map((h) => String(h || '').trim().slice(0, 200)).filter(Boolean).slice(-3)
    const place = String(body.place || '').trim().slice(0, 80)
    const locale = ['ko', 'zh'].includes(body.locale) ? body.locale : 'en'

    // No key / SDK → honest "unavailable"; the UI keeps the plain results.
    let anthropic = null
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const mod = await import('@anthropic-ai/sdk')
        anthropic = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY })
      } catch { anthropic = null }
    }
    if (!anthropic) return NextResponse.json({ available: false })

    const ckey = [locale, query.toLowerCase(), ids.join(','), need.toLowerCase(), history.join('|').toLowerCase()].join('§').slice(0, 1200)
    const cached = cacheGet(ckey)
    if (cached) return NextResponse.json({ ...cached, cached: true })

    // Re-read the places server-side — client ids are only pointers, never
    // content — and keep the client's ranking order for the numbered menu.
    const sb = getSupabaseAdmin()
    const { data: rowsData, error } = await sb
      .from('listings')
      .select('id, slug, name, vertical, sub_type, suburb, region, state, description, needs_review')
      .in('id', ids)
      .eq('status', 'active')
    if (error) {
      console.error('[assist] listings fetch error:', error.message)
      return NextResponse.json({ available: false })
    }
    const order = new Map(ids.map((id, i) => [id, i]))
    const rows = (rowsData || [])
      .filter(isPublicListing)
      .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
    if (rows.length < 2) return NextResponse.json({ available: false })

    const menu = rows.map((r, i) => {
      const where = [r.suburb, r.region, r.state].filter(Boolean).join(', ')
      const type = String(r.sub_type || r.vertical || '').replace(/_/g, ' ')
      const desc = (r.description || '').replace(/\s+/g, ' ').slice(0, MENU_DESC)
      return `${i + 1}. ${r.name}${type ? ` (${type})` : ''}${where ? ` — ${where}` : ''}${desc ? `: ${desc}` : ''}`
    }).join('\n')
    const searched = `"${query}"${place ? ` in ${place}` : ''}`

    if (!need) {
      // ── Step 1: propose grounded directions to narrow by ──────────────────
      const resp = await callClaude(anthropic, {
        model: MODEL,
        max_tokens: 400,
        system: `You are the results assistant for the Australian Atlas, a curated guide to independent Australian places. A visitor searched ${searched} and is looking at the numbered results below. Offer ways to narrow them down.\n\nHARD RULES:\n- Every direction must reflect a REAL difference among the numbered places (their type, theme, setting, or town). NEVER invent a place, attribute, or category the list doesn't support.\n- Directions must be distinct from each other and from the search itself, and each must fit at least 2 of the places.\n- Voice: understated, place-literate, no marketing hype, no exclamation marks. Australian spelling.\n\nReturn ONLY minified JSON: {"greeting": string, "angles": [{"label": string, "hint": string}]}.\n- greeting: one short sentence (max 16 words) offering to help them choose, hinting at the spread of what's actually here.\n- angles: 3-5 directions. label: max 4 words, sentence case. hint: max 8 words on what in the set fits it.${LANGUAGE_RULE[locale] || ''}`,
        messages: [{ role: 'user', content: `The results:\n${menu}` }],
      })
      const out = firstJson(resp?.content?.[0]?.text, null)
      const angles = (Array.isArray(out?.angles) ? out.angles : [])
        .filter((a) => a && typeof a.label === 'string' && a.label.trim())
        .slice(0, 5)
        .map((a) => ({
          label: a.label.trim().slice(0, 40),
          hint: typeof a.hint === 'string' ? a.hint.trim().slice(0, 80) : '',
        }))
      if (!angles.length) return NextResponse.json({ available: false })
      const payload = {
        available: true,
        greeting: typeof out?.greeting === 'string' ? out.greeting.trim().slice(0, 180) : null,
        angles,
      }
      cacheSet(ckey, payload)
      return NextResponse.json(payload)
    }

    // ── Step 2: whittle to a grounded shortlist for the stated need ──────────
    // Picks bind to a place NUMBER so a "why" can never drift to another card.
    const context = history.length ? `\nEarlier in this conversation they also said: ${history.map((h) => `"${h}"`).join(', ')}.` : ''
    const resp = await callClaude(anthropic, {
      model: MODEL,
      max_tokens: 600,
      system: `You are the results assistant for the Australian Atlas, a curated guide to independent Australian places. A visitor searched ${searched}, and from the numbered results below wants: "${need}".${context}\n\nHARD RULES:\n- Ground everything in the numbered places. NEVER invent a place, product, price, or detail. NEVER mention a place not in the list.\n- Each "why" must be about THAT exact numbered place, using only what its line says. If a place only partly fits, say so honestly — do not borrow another place's detail.\n- If nothing genuinely fits, return an empty picks array and say so plainly in the answer.\n- Voice: understated, place-literate, no marketing hype, no exclamation marks. Australian spelling.\n\nReturn ONLY minified JSON: {"answer": string, "picks": [{"n": number, "why": string}], "followUp": string}.\n- answer: 1-3 sentences addressing their need directly; you may name 1-2 of the picked places.\n- picks: the 2-5 places that best fit, best first, each with its number "n" and a "why" of max 14 words — no place name, no full stop.\n- followUp: one short question (max 12 words) that would narrow further, or "" if none is useful.${LANGUAGE_RULE[locale] || ''}`,
      messages: [{ role: 'user', content: `The results:\n${menu}` }],
    })
    const out = firstJson(resp?.content?.[0]?.text, null)
    if (!out) return NextResponse.json({ available: false })
    const picks = []
    if (Array.isArray(out.picks)) {
      for (const p of out.picks.slice(0, 5)) {
        const idx = Number(p?.n) - 1
        if (Number.isInteger(idx) && idx >= 0 && idx < rows.length && typeof p.why === 'string' && p.why.trim()) {
          picks.push({ id: rows[idx].id, why: p.why.trim().slice(0, 140) })
        }
      }
    }
    const payload = {
      available: true,
      answer: typeof out.answer === 'string' && out.answer.trim() ? out.answer.trim().slice(0, 600) : null,
      picks,
      followUp: typeof out.followUp === 'string' && out.followUp.trim() ? out.followUp.trim().slice(0, 140) : null,
    }
    cacheSet(ckey, payload)
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[assist] Error:', err)
    return NextResponse.json({ error: 'Assist failed. Please try again.' }, { status: 500 })
  }
}
