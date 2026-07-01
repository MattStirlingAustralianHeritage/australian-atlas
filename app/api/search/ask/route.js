import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkRateLimit } from '@/lib/rate-limit'
import { embedQueryCached } from '@/lib/embeddings/queryCache'
import { logSearchEvent } from '@/lib/search/log'
import { getPublicVerticals, isVerticalPublic } from '@/lib/verticalUrl'
import { parseQueryLocation } from '@/lib/search/parseQuery'
import { resolveQueryRegion } from '@/lib/search/resolveQueryRegion'
import { isPublicListing } from '@/lib/listings/publicFilter'
import { guardedAnthropicMessage } from '@/lib/ai/guardedAnthropic'
import { translateSearchQuery, hasHangul } from '@/lib/search/translateQuery'

export const maxDuration = 60

// Haiku: cheap + fast, on the search hot path. Two short calls per inquiry
// (interpret → retrieve → ground). Both budget-guarded and fully fail-open.
const MODEL = 'claude-haiku-4-5-20251001'

// A touch more permissive than the plain search floor (0.48): a described need
// ("something my niece would love that's made here") sits a little further from
// any one venue's description than a category term does, so we widen recall and
// let the grounding step + rerank-by-relevance do the precision work.
const ASK_FLOOR = parseFloat(process.env.SEARCH_ASK_FLOOR || '0.42')
const POOL = 24          // candidate pool ranked by the RPC
const SHOWN = 12         // curated results returned to the UI
const GROUNDED = 8       // how many real venues Claude sees when writing the answer

// The atlases, in the vocabulary Claude gets in the interpret prompt. Keeping the
// human labels here (not just keys) helps the model map "a gift" → corner/craft.
const ATLAS_MENU = [
  ['sba', 'Small Batch — independent drink producers: breweries, wineries, distilleries, cellar doors'],
  ['fine_grounds', 'Fine Grounds — specialty coffee roasters and cafés'],
  ['table', 'Table — food producers, providores, bakeries, cheesemakers, restaurants'],
  ['craft', 'Craft — makers & studios: ceramics, textiles, jewellery, woodwork, homewares'],
  ['collection', 'Culture — galleries, museums, heritage and cultural places'],
  ['corner', 'Corner — independent shops: bookshops, record stores, design & concept stores, gifts'],
  ['found', 'Found — vintage, antique, secondhand and retro'],
  ['rest', 'Rest — boutique stays: cottages, cabins, farm stays, guesthouses, retreats'],
  ['field', 'Field — natural places: national parks, walks, lookouts, swimming holes'],
  ['way', 'Way — experiences, tours and things to do'],
]

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table', way: 'Way',
}

// ── Small in-instance cache: identical inquiries within a warm lambda skip both
// Claude calls. Not durable (per-instance) — just trims obvious repeats. ────────
const CACHE = new Map()
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 200
function cacheKey(q) { return q.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200) }
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
  const TIMEOUT_MS = 22000
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

/** Collapse rows sharing a slug (same venue cross-listed), keep the best-ranked. */
function dedupeBySlug(rows) {
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const key = r.slug || r.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/**
 * POST /api/search/ask
 *
 * The "Ask the Atlas" concierge. For a plain-language request (a gift, an
 * occasion, "somewhere to take my mum") it: (1) interprets the request into a
 * search plan with Claude, (2) retrieves real venues via the canonical hybrid
 * RPC, (3) writes a short, GROUNDED answer + a one-line "why it fits" per venue.
 *
 * Everything AI is fail-open: no key / over budget / timeout → the endpoint still
 * returns the retrieved listings, just without the written answer and reasons.
 * Nothing is ever invented — the answer only references retrieved venues.
 */
export async function POST(request) {
  // Two Claude calls + Voyage per request — throttle to curb cost abuse.
  const rl = checkRateLimit(request, { keyPrefix: 'ask', maxRequests: 20, windowMs: 60_000 })
  if (rl) return rl

  const t0 = Date.now()
  try {
    const body = await request.json().catch(() => ({}))
    const rawQuery = (body.query || '').trim()
    if (!rawQuery || rawQuery.length < 3) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }
    // Korean launch: a Hangul inquiry is translated to English up front so
    // location resolution, interpretation, and embedding all run against the
    // English corpus unchanged; the grounded answer is then written back in
    // Korean (see the ground step). Fully gated behind hasHangul — a non-Korean
    // request is byte-for-byte unchanged. Fail-open (raw query) on any error.
    const answerLocale = hasHangul(rawQuery) ? 'ko' : 'en'
    const query = answerLocale === 'ko' ? await translateSearchQuery(rawQuery, 'ko') : rawQuery
    const loggedQuery = query.slice(0, 200)
    const sb = getSupabaseAdmin()

    // Optional explicit refinements from the results-page filter pills. A pinned
    // vertical / state narrows the concierge just like a plain search.
    const reqVertical = body.vertical && isVerticalPublic(String(body.vertical)) ? String(body.vertical) : null
    const reqState = body.state ? String(body.state).toUpperCase().slice(0, 3) : null

    // Cache key includes the refinements so pinning a pill doesn't serve the
    // unfiltered answer.
    const ckey = cacheKey(`${answerLocale}|${query}|${reqVertical || ''}|${reqState || ''}`)
    const cached = cacheGet(ckey)
    if (cached) return NextResponse.json({ ...cached, cached: true })

    // ── Location constraint (mirrors /api/search): a named region binds that
    // region, else a state/suburb; the matched phrase is stripped from `cleaned`
    // so the ranking arms focus on the actual need, not the place words.
    let filterRegion = null
    let filterState = null
    let filterSuburb = null
    let detectedRegion = null
    let detectedState = null
    let cleaned
    {
      const qr = await resolveQueryRegion(sb, query).catch(() => ({ region: null }))
      if (qr && qr.region) {
        filterRegion = qr.region.id
        detectedRegion = { slug: qr.region.slug, name: qr.region.name, state: qr.region.state }
        detectedState = qr.region.state
        cleaned = qr.cleaned
      } else {
        const parsed = parseQueryLocation(query)
        filterState = parsed.state
        detectedState = parsed.state
        if (parsed.suburb) filterSuburb = parsed.suburb
        cleaned = parsed.cleaned
      }
    }
    cleaned = (cleaned || query).trim()
    // An explicit state pill overrides whatever the query text implied.
    if (reqState) { filterState = reqState; detectedState = reqState }

    // ── Optional Claude client (interpret + ground). No key → search still works.
    let anthropic = null
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const mod = await import('@anthropic-ai/sdk')
        anthropic = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY })
      } catch { anthropic = null }
    }

    // ── Step 1: interpret the request into a search plan ──────────────────────
    let searchText = cleaned
    let expansions = []
    let leadVertical = null
    let intent = null
    if (anthropic) {
      const menu = ATLAS_MENU.map(([k, d]) => `- ${k}: ${d}`).join('\n')
      const interp = await callClaude(anthropic, {
        model: MODEL,
        max_tokens: 320,
        system: `You turn a visitor's plain-language request into a search plan for the Australian Atlas — a curated guide to INDEPENDENT Australian venues, makers and experiences. The atlases:\n${menu}\n\nReturn ONLY minified JSON: {"query": string, "expansions": string[], "atlases": string[], "intent": string}.\n- query: a concise 3-7 word keyword search capturing the core need (no location words).\n- expansions: 3-6 short noun phrases (2-3 words) describing the kinds of independent places/products that answer it — the vocabulary that would appear in their listings.\n- atlases: 0-3 atlas keys from the list above that best fit, most relevant first (empty if it truly spans many).\n- intent: 2-4 word label for what they're after (e.g. "gift shopping", "birthday outing", "coffee near me").`,
        messages: [{ role: 'user', content: query.slice(0, 400) }],
      })
      const plan = firstJson(interp?.content?.[0]?.text, null)
      if (plan) {
        if (typeof plan.query === 'string' && plan.query.trim()) searchText = plan.query.trim()
        if (Array.isArray(plan.expansions)) {
          expansions = plan.expansions.filter((p) => typeof p === 'string' && p.trim()).slice(0, 6)
        }
        if (typeof plan.intent === 'string' && plan.intent.trim()) intent = plan.intent.trim().slice(0, 40)
        if (Array.isArray(plan.atlases)) {
          const first = plan.atlases.find((a) => typeof a === 'string' && isVerticalPublic(a.trim()))
          if (first) leadVertical = first.trim()
        }
      }
    }

    // ── Step 2: retrieve real venues via the canonical hybrid RPC ─────────────
    // OR-expand the lexical arm with the interpreted phrases; embed the core
    // need for the semantic arm. Location filters stay hard.
    const queryText = expansions.length
      ? `${searchText} OR ${expansions.map((p) => `"${p.replace(/"/g, '')}"`).join(' OR ')}`
      : searchText
    const { lit: queryEmbedding, error: voyageError } = await embedQueryCached(sb, searchText)

    let all = []
    {
      const { data, error } = await sb.rpc('search_listings_hybrid', {
        query_embedding: queryEmbedding,
        query_text: queryText,
        filter_vertical: reqVertical,
        filter_state: filterState,
        filter_region: filterRegion,
        filter_suburb: filterSuburb,
        match_count: POOL,
        similarity_floor: ASK_FLOOR,
        include_way: reqVertical === 'way' || isVerticalPublic('way'),
      })
      if (error) {
        console.error('[ask] hybrid RPC error:', error.message)
        logSearchEvent(sb, { query_text: loggedQuery, surface: 'ask', result_count: 0, latency_ms: Date.now() - t0, vector_arm_fired: !!queryEmbedding, fell_back: !queryEmbedding, voyage_error: voyageError || error.message, zero_result: true })
        return NextResponse.json({ query, intent, answer: null, listings: [], total: 0 })
      }
      all = data || []
      // A suburb filter that stranded the search → retry state-only.
      if (filterSuburb && all.filter(isPublicListing).length === 0) {
        const { data: stateData } = await sb.rpc('search_listings_hybrid', {
          query_embedding: queryEmbedding, query_text: queryText, filter_vertical: reqVertical,
          filter_state: filterState, filter_region: filterRegion, filter_suburb: null,
          match_count: POOL, similarity_floor: ASK_FLOOR, include_way: reqVertical === 'way' || isVerticalPublic('way'),
        })
        if (stateData && stateData.length) { all = stateData; filterSuburb = null }
      }
    }

    const publicVerticals = getPublicVerticals()
    let rows = dedupeBySlug(all.filter((r) => isPublicListing(r) && publicVerticals.includes(r.vertical)))

    // Soft lead: float the interpreted best-fit atlas to the top (keep the rest).
    if (leadVertical) {
      const lead = [], rest = []
      for (const r of rows) (r.vertical === leadVertical ? lead : rest).push(r)
      rows = lead.concat(rest)
    }

    const shown = rows.slice(0, SHOWN)

    if (shown.length === 0) {
      logSearchEvent(sb, { query_text: loggedQuery, surface: 'ask', result_count: 0, latency_ms: Date.now() - t0, vector_arm_fired: !!queryEmbedding, fell_back: !queryEmbedding, voyage_error: voyageError, zero_result: true })
      const payload = { query, intent, answer: null, listings: [], total: 0, detectedState, detectedRegion }
      return NextResponse.json(payload)
    }

    // ── Step 3: ground a short answer + per-venue reasons in the REAL results ──
    // Reasons are bound to a venue NUMBER (not positional order) so Claude can't
    // silently attach one venue's detail to another card — it must say which
    // numbered place each "why" is about, and we map it back deterministically.
    let answer = null
    const reasons = new Array(shown.length).fill(null)
    if (anthropic) {
      const grounded = shown.slice(0, GROUNDED)
      const menu = grounded.map((r, i) => {
        const label = VERTICAL_LABELS[r.vertical] || r.vertical
        const where = [r.suburb, r.region, r.state].filter(Boolean)[0] || 'Australia'
        const desc = (r.description || '').replace(/\s+/g, ' ').slice(0, 160)
        return `${i + 1}. ${r.name} — ${label}, ${where}${desc ? `: ${desc}` : ''}`
      }).join('\n')
      const resp = await callClaude(anthropic, {
        model: MODEL,
        max_tokens: 700,
        system: `You are the concierge for the Australian Atlas, a curated guide to independent Australian places. A visitor made a plain-language request and we retrieved REAL matching places (each numbered). Write a brief, warm, specific reply that helps them choose.\n\nHARD RULES:\n- Ground everything in the numbered places. NEVER invent a place, product, price, or detail. NEVER mention a place not in the list.\n- Each "why" must be about THAT exact numbered place, using only what its line says. If a place only partly fits, say what it is honestly — do not borrow another place's detail.\n- Voice: understated, place-literate, no marketing hype, no exclamation marks. Australian spelling.\n\nReturn ONLY minified JSON: {"answer": string, "picks": [{"n": number, "why": string}]}.\n- answer: 2-3 sentences framing what we found; you may name 1-2 of the places. Address the visitor directly.\n- picks: the 4-6 places that best fit, each with its number "n" and a "why" of max 14 words — no place name, no full stop. Only include a place if it genuinely fits.${answerLocale === 'ko' ? '\n- Write the "answer" and every "why" in natural, fluent Korean (한국어). Keep place names in their original form.' : ''}`,
        messages: [{ role: 'user', content: `Request: "${query.slice(0, 400)}"\n\nMatching places:\n${menu}` }],
      })
      const out = firstJson(resp?.content?.[0]?.text, null)
      if (out) {
        if (typeof out.answer === 'string' && out.answer.trim()) answer = out.answer.trim()
        if (Array.isArray(out.picks)) {
          for (const p of out.picks) {
            const idx = Number(p?.n) - 1
            if (Number.isInteger(idx) && idx >= 0 && idx < reasons.length && typeof p.why === 'string' && p.why.trim()) {
              reasons[idx] = p.why.trim()
            }
          }
        }
      }
    }

    // Strip internal scoring + address; attach the venue-bound reason.
    const listings = shown.map((r, i) => {
      const { fused_score, address, description, ...rest } = r
      return { ...rest, description, reason: reasons[i] || null }
    })

    const payload = {
      query, intent, answer, listings, total: listings.length,
      detectedState: detectedState || null, detectedRegion,
      atlas: leadVertical || null,
    }
    cacheSet(ckey, payload)

    logSearchEvent(sb, { query_text: loggedQuery, surface: 'ask', result_count: listings.length, latency_ms: Date.now() - t0, vector_arm_fired: !!queryEmbedding, fell_back: !queryEmbedding, voyage_error: voyageError, zero_result: false })
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[ask] Error:', err)
    return NextResponse.json({ error: 'Ask failed. Please try again.' }, { status: 500 })
  }
}
