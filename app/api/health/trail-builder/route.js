/**
 * Health check for the trail builder pipeline.
 *
 * Tests: Anthropic API key present, Supabase connectivity, Claude API reachable.
 * Returns 200 (all ok) or 503 (degraded) with individual check results.
 *
 * GET /api/health/trail-builder
 */

import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const maxDuration = 15

export async function GET() {
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
    } catch {
      checks.claude_reachable = false
    }
  }

  const allOk = Object.entries(checks)
    .filter(([key]) => key !== 'listing_count')
    .every(([, val]) => val === true)

  return Response.json(
    {
      status: allOk ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  )
}
