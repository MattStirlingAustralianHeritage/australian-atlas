// ============================================================
// API spend governor — enforces a hard monthly ceiling on paid
// third-party APIs (Anthropic, Voyage, Google Places) so total
// spend cannot exceed ~$20/month.
//
// Backed by one Postgres table `api_spend_ledger(period_month, api,
// est_cost_usd)` and two atomic RPCs:
//   - api_spend_reserve(month, api, est, cap) → bool: atomically
//     reserves `est` against the month's running total IF it stays
//     under `cap` (so concurrent serverless calls can't race past it).
//   - api_spend_add(month, api, delta): reconciles the reservation
//     with the call's ACTUAL cost (delta can be negative).
//
// Reserve-before-call + reconcile-after guarantees the cap even if a
// post-call write fails. FAIL-CLOSED: on KILL switch, over-cap, or any
// ledger error, reserve() returns false and the caller falls back to
// its non-AI path (every gated site degrades gracefully — never crashes).
//
// This module has NO '@/' imports and takes the supabase client as a
// param, so it works in Next routes AND raw-node scripts alike.
// ============================================================

// Monthly sub-caps (USD). Env-overridable; defaults sum to $19 (+$1 buffer
// under the $20 ceiling). Set AI_CAP_* in Vercel to retune without a deploy.
// Voyage is $5 (was $3): it now backs BOTH query embeddings and the search
// reranker (rerank-2.5, ~$0.0004/uncached search) — both cheap and cached, but
// the reranker is fail-CLOSED-shared with embeddings, so the cap carries headroom
// to keep semantic search alive under a traffic spike.
export const CAPS = {
  anthropic: num(process.env.AI_CAP_ANTHROPIC_USD, 12),
  voyage: num(process.env.AI_CAP_VOYAGE_USD, 5),
  google_places: num(process.env.AI_CAP_PLACES_USD, 2),
  // Interactive admin repairs (Gate Check "Fix"). Separate pool so the cron
  // prospector — which burns the shared google_places cap within days — can't
  // starve a human clicking Fix in the review queue. Click-driven, so spend
  // only happens while an admin is actively repairing.
  google_places_admin: num(process.env.AI_CAP_PLACES_ADMIN_USD, 2),
}

// Manual panic button: AI_BUDGET_KILL=1 disables ALL paid calls instantly.
export function killed() {
  const v = process.env.AI_BUDGET_KILL
  return v === '1' || v === 'true'
}

function num(v, dflt) {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : dflt
}

// Price per MILLION tokens (input, output), USD.
const PRICING = {
  'claude-opus': { in: 15, out: 75 },
  'claude-sonnet': { in: 3, out: 15 },
  'claude-haiku': { in: 0.8, out: 4 },
  voyage: { in: 0.06, out: 0 },
}

function modelClass(model = '') {
  const m = String(model).toLowerCase()
  if (m.includes('opus')) return 'claude-opus'
  if (m.includes('haiku')) return 'claude-haiku'
  return 'claude-sonnet' // default to the priciest common tier (conservative)
}

export function estimateAnthropicCost(model, inputTokens, maxOutputTokens) {
  const p = PRICING[modelClass(model)]
  return (Math.max(0, inputTokens) / 1e6) * p.in + (Math.max(0, maxOutputTokens) / 1e6) * p.out
}

export function estimateVoyageCost(tokens) {
  return (Math.max(0, tokens) / 1e6) * PRICING.voyage.in
}

// Per-call cost for a Google Places Text Search (~$32/1k).
export const PLACES_CALL_USD = 0.032
// Per-call cost for a Place Details request with Basic + Contact + Atmosphere
// fields ($17 + $3 + $5 per 1k). Reserving the old flat 0.032 for details
// over-charged the pool ~28% per call.
export const PLACES_DETAILS_USD = 0.025

/** Rough token estimate from text length (≈4 chars/token). */
export function estimateTokens(text) {
  if (!text) return 0
  return Math.ceil(String(text).length / 4)
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7) // 'YYYY-MM'
}

/**
 * Atomically reserve `estCostUsd` against this month's spend for `api`.
 * @returns {Promise<boolean>} true if allowed (and reserved), false if it
 *   would breach the cap / kill switch / on any error (fail-closed).
 */
export async function reserve(sb, api, estCostUsd) {
  if (killed()) return false
  const cap = CAPS[api]
  if (cap == null) return true // un-capped api → not gated
  if (!sb) return false
  try {
    const { data, error } = await sb.rpc('api_spend_reserve', {
      p_month: currentMonth(),
      p_api: api,
      p_est: Math.max(0, estCostUsd),
      p_cap: cap,
    })
    if (error) {
      console.error('[budget] reserve error:', error.message)
      return false // fail-closed
    }
    return data === true
  } catch (e) {
    console.error('[budget] reserve exception:', e?.message || e)
    return false
  }
}

/**
 * Reconcile a prior reservation with the call's actual cost.
 * @param deltaUsd actualCost − estimatedCost (may be negative).
 */
export async function reconcile(sb, api, deltaUsd) {
  if (!sb || !deltaUsd) return
  try {
    await sb.rpc('api_spend_add', { p_month: currentMonth(), p_api: api, p_delta: deltaUsd })
  } catch (e) {
    console.error('[budget] reconcile error:', e?.message || e)
  }
}

/** Read month-to-date spend for one or all APIs (for diagnostics/admin). */
export async function getSpend(sb, api = null) {
  if (!sb) return null
  try {
    let q = sb.from('api_spend_ledger').select('api, est_cost_usd').eq('period_month', currentMonth())
    if (api) q = q.eq('api', api)
    const { data } = await q
    return data || []
  } catch {
    return null
  }
}
