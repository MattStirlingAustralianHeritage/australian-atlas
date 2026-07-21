import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * GET /api/health/cron-fleet
 *
 * External dead-man's-switch probe. Everything that monitors the agent fleet
 * (fleet-health, outreach-watchdog) runs ON Vercel cron — so if the cron layer
 * itself dies, the monitors die with it and nobody hears anything. This
 * endpoint lets an OUTSIDE scheduler (.github/workflows/cron-deadman.yml,
 * GitHub's infrastructure) verify the pulse:
 *
 *   - fleet:    the hourly agents (embeddings, press-notify) mean a healthy
 *               platform ALWAYS has an agent_runs row younger than 3 hours
 *   - outreach: the operator autopilot runs twice every day (incl. weekends;
 *               only sends hold on weekends), so >26h without a run is dead
 *
 * 200 when healthy, 503 with reasons when not. Deliberately unauthenticated:
 * it exposes only two ages and a verdict, and a dead-man endpoint guarded by
 * a secret the prober must fetch from the dying platform defeats itself.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const FLEET_STALE_HOURS = 3
const OUTREACH_STALE_HOURS = 26

export async function GET() {
  try {
    const sb = getSupabaseAdmin()
    const [newestRes, outreachRes] = await Promise.all([
      sb.from('agent_runs').select('started_at').order('started_at', { ascending: false }).limit(1),
      sb.from('agent_runs').select('started_at').eq('agent', 'outreach-autopilot').order('started_at', { ascending: false }).limit(1),
    ])
    const hoursSince = (ts) => (ts ? (Date.now() - new Date(ts).getTime()) / 3_600_000 : Infinity)
    const fleetAge = hoursSince(newestRes.data?.[0]?.started_at)
    const outreachAge = hoursSince(outreachRes.data?.[0]?.started_at)

    const problems = []
    if (fleetAge > FLEET_STALE_HOURS) {
      problems.push(`no agent run in ${Number.isFinite(fleetAge) ? fleetAge.toFixed(1) + 'h' : 'recorded history'} — Vercel cron layer looks dead`)
    }
    if (outreachAge > OUTREACH_STALE_HOURS) {
      problems.push(`outreach-autopilot last ran ${Number.isFinite(outreachAge) ? outreachAge.toFixed(1) + 'h ago' : 'never'}`)
    }

    const ok = problems.length === 0
    return NextResponse.json({
      ok,
      fleet_last_run_hours: Number.isFinite(fleetAge) ? Math.round(fleetAge * 10) / 10 : null,
      outreach_last_run_hours: Number.isFinite(outreachAge) ? Math.round(outreachAge * 10) / 10 : null,
      problems,
    }, { status: ok ? 200 : 503 })
  } catch (err) {
    return NextResponse.json({ ok: false, problems: [`health check failed: ${err.message}`] }, { status: 503 })
  }
}
