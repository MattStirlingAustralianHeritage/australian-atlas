// ============================================================
// Budget-guarded Anthropic call. Reserves estimated cost against the
// monthly 'anthropic' cap BEFORE the call (throwing AI_BUDGET_EXCEEDED
// when over budget) and reconciles with actual token usage after.
//
// Drop-in for `client.messages.create(params)` →
//   `guardedAnthropicMessage(client, params)`
//
// Callers already wrap Claude calls in try/catch with a graceful non-AI
// fallback; an AI_BUDGET_EXCEEDED error simply routes into that fallback.
// Use isBudgetError(err) to distinguish it from real failures if needed.
// ============================================================

import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { reserve, reconcile, estimateAnthropicCost, estimateTokens } from '@/lib/budget/governor'

export class BudgetExceededError extends Error {
  constructor(message = 'AI_BUDGET_EXCEEDED') {
    super(message)
    this.name = 'BudgetExceededError'
    this.code = 'AI_BUDGET_EXCEEDED'
  }
}

export function isBudgetError(err) {
  return err && (err.code === 'AI_BUDGET_EXCEEDED' || err instanceof BudgetExceededError)
}

/** Estimate input tokens from a messages.create params object. */
function estimateInputTokens(params) {
  let chars = 0
  const sys = params.system
  if (typeof sys === 'string') chars += sys.length
  else if (Array.isArray(sys)) for (const b of sys) chars += (b?.text || '').length
  for (const m of params.messages || []) {
    const c = m?.content
    if (typeof c === 'string') chars += c.length
    else if (Array.isArray(c)) for (const b of c) chars += (b?.text || '').length || 0
  }
  return estimateTokens('x'.repeat(chars))
}

/**
 * Budget-guarded wrapper around client.messages.create.
 * @param client an Anthropic SDK client
 * @param params messages.create params (model, max_tokens, messages, ...)
 * @param opts.estInputTokens optional override of the input-token estimate
 * @throws BudgetExceededError when the monthly anthropic cap would be breached
 */
export async function guardedAnthropicMessage(client, params, opts = {}) {
  const sb = getSupabaseAdmin()
  const model = params.model
  const inTok = opts.estInputTokens ?? estimateInputTokens(params)
  const maxOut = params.max_tokens || 1024
  const estCost = estimateAnthropicCost(model, inTok, maxOut)

  const ok = await reserve(sb, 'anthropic', estCost)
  if (!ok) throw new BudgetExceededError()

  const res = await client.messages.create(params)

  // Reconcile the reservation with actual usage from the response.
  try {
    const u = res?.usage
    if (u) {
      const actual = estimateAnthropicCost(
        model,
        u.input_tokens ?? inTok,
        u.output_tokens ?? maxOut,
      )
      await reconcile(sb, 'anthropic', actual - estCost)
    }
  } catch { /* reconcile is best-effort; the reservation already protects the cap */ }

  return res
}

// ── Low-level helpers for sites that call the Anthropic REST API directly ────
// (many crons/agents fetch https://api.anthropic.com/v1/messages instead of
// using the SDK). Pattern:
//   const r = await reserveAnthropicBudget({ model, inputTokens, maxOutputTokens })
//   if (!r.ok) { ...graceful fallback / skip... }
//   const res = await fetch('https://api.anthropic.com/v1/messages', {...})
//   const data = await res.json()
//   await reconcileAnthropicBudget(r, data.usage)

/** Reserve the estimated cost of one Anthropic call against the monthly cap. */
export async function reserveAnthropicBudget({ model, inputTokens = 0, maxOutputTokens = 1024 }) {
  const sb = getSupabaseAdmin()
  const estCost = estimateAnthropicCost(model, inputTokens, maxOutputTokens)
  const ok = await reserve(sb, 'anthropic', estCost)
  return { ok, sb, estCost, model }
}

/** Reconcile a reservation with the call's actual token usage (best-effort). */
export async function reconcileAnthropicBudget(resv, usage) {
  if (!resv?.sb || !usage) return
  try {
    const actual = estimateAnthropicCost(resv.model, usage.input_tokens ?? 0, usage.output_tokens ?? 0)
    await reconcile(resv.sb, 'anthropic', actual - resv.estCost)
  } catch { /* best-effort */ }
}
