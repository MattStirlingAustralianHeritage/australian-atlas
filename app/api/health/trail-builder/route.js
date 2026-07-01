/**
 * Health check for the trail builder pipeline.
 *
 * Tests: Anthropic API key present, Supabase connectivity, Claude API reachable.
 * Returns 200 (all ok) or 503 (degraded) with individual check results.
 *
 * GET /api/health/trail-builder
 */

import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { reserveAnthropicBudget, reconcileAnthropicBudget } from '@/lib/ai/guardedAnthropic'
import { estimateTokens } from '@/lib/budget/governor'
import { startRun, completeRun } from '@/lib/agents/logRun'

export const maxDuration = 15

export async function GET(request) {
  // This endpoint is public (uptime monitors hit it). Only the scheduled cron
  // invocation — identified by the CRON_SECRET bearer — records to agent_runs,
  // so external pings don't flood the run log.
  const authHeader = request.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`
  const runId = isCron ? await startRun('trail-builder-health') : null

  const checks = {
    anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabase_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    db_reachable: false,
    claude_reachable: false,
    listing_count: 0,
  }

  // Test DB connection — verify we can read listings
  try {
    const sb = getSupabaseAdmin()
    const { count, error } = await sb
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .not('lat', 'is', null)

    checks.db_reachable = !error
    checks.listing_count = count || 0
  } catch {
    checks.db_reachable = false
  }

  // Test Claude API with minimal call (haiku, 10 tokens)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const _resv = await reserveAnthropicBudget({
        model: 'claude-haiku-4-5-20251001',
        inputTokens: estimateTokens('ping'),
        maxOutputTokens: 10,
      })
      if (!_resv.ok) {
        checks.claude_reachable = false
        checks.claude_budget_reached = true
      } else {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'ping' }],
          }),
        })
        checks.claude_reachable = response.ok
        try {
          const data = await response.json()
          await reconcileAnthropicBudget(_resv, data.usage)
        } catch {}
      }
    } catch {
      checks.claude_reachable = false
    }
  }

  const allOk = Object.entries(checks)
    .filter(([key]) => key !== 'listing_count')
    .every(([, val]) => val === true)

  await completeRun(runId, {
    status: allOk ? 'success' : 'error',
    error: allOk ? null : 'degraded',
    summary: { ...checks },
  })

  return Response.json(
    {
      status: allOk ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  )
}
