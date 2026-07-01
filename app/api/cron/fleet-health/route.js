import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

/**
 * GET /api/cron/fleet-health
 *
 * Daily heartbeat monitor for the whole agent fleet. The 2026-06-18
 * liveness audit found agents silently dead for months because nothing
 * alerted on a MISSING run — this closes that gap.
 *
 * For every scheduled agent it checks agent_runs for:
 *   - OVERDUE:  no run within the agent's expected cadence (+ grace)
 *   - FAILING:  the most recent completed run ended in 'error'
 *   - STRANDED: a run stuck at status='running' for 6+ hours
 *     (platform-killed before completeRun)
 *
 * Emails only when something is wrong; otherwise just records its own run.
 *
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 60

// agent key in agent_runs → max hours between runs before it's overdue.
// Cadences per vercel.json, roughly doubled for grace so a single missed
// window doesn't page.
const EXPECTED = {
  'sync': 13,                    // every 6h
  'embeddings': 3,               // hourly
  'prospect': 30,                // daily (9 per-vertical slots)
  'ensure-candidates': 30,       // daily
  'archive-events': 30,          // daily
  'trail-builder-health': 13,    // every 6h
  'enrichment-agent': 30,        // daily
  'quarantine-alert': 30,        // daily
  'staleness': 192,              // weekly
  'editorial-signals': 192,      // weekly
  'monday-briefing': 192,        // weekly
  'dead-image': 192,             // weekly
  'voice-consistency': 192,      // weekly
  'competitor-intelligence': 192,// weekly
  'seo-content': 192,            // weekly
  'geocoding-watchdog': 192,     // weekly
  'revenue-signal': 192,         // weekly
  'backlink-builder': 800,       // monthly
  'user-reactivation': 800,      // monthly
  'listing-velocity': 800,       // monthly
}

const STRANDED_HOURS = 6

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const runId = await startRun('fleet-health')

  const issues = [] // { agent, kind, detail }

  try {
    // One query: latest run + latest completed run per agent.
    const { data: runs, error: fetchError } = await sb
      .from('agent_runs')
      .select('agent, started_at, completed_at, status, error')
      .neq('agent', 'fleet-health')
      .order('started_at', { ascending: false })
      .limit(2000)

    if (fetchError) throw fetchError

    const latestByAgent = {}
    const latestCompletedByAgent = {}
    for (const r of runs || []) {
      if (!latestByAgent[r.agent]) latestByAgent[r.agent] = r
      if (!latestCompletedByAgent[r.agent] && r.completed_at) latestCompletedByAgent[r.agent] = r
    }

    const now = Date.now()

    for (const [agent, maxGapHours] of Object.entries(EXPECTED)) {
      const latest = latestByAgent[agent]

      if (!latest) {
        issues.push({ agent, kind: 'OVERDUE', detail: 'No run has ever been recorded' })
        continue
      }

      const hoursSince = (now - new Date(latest.started_at).getTime()) / 3600000
      if (hoursSince > maxGapHours) {
        issues.push({
          agent,
          kind: 'OVERDUE',
          detail: `Last run ${Math.round(hoursSince)}h ago (expected within ${maxGapHours}h)`,
        })
      }

      if (
        latest.status === 'running' &&
        !latest.completed_at &&
        hoursSince > STRANDED_HOURS
      ) {
        issues.push({
          agent,
          kind: 'STRANDED',
          detail: `Run started ${Math.round(hoursSince)}h ago never completed (likely platform-killed)`,
        })
      }

      const lastCompleted = latestCompletedByAgent[agent]
      if (lastCompleted && lastCompleted.status === 'error') {
        issues.push({
          agent,
          kind: 'FAILING',
          detail: `Last completed run errored: ${(lastCompleted.error || 'no error text').slice(0, 200)}`,
        })
      }
    }

    const healthy = Object.keys(EXPECTED).length - new Set(issues.map(i => i.agent)).size

    if (issues.length > 0) {
      await sendAgentEmail({
        subject: `Fleet Health: ${issues.length} issue${issues.length === 1 ? '' : 's'} across ${new Set(issues.map(i => i.agent)).size} agent${new Set(issues.map(i => i.agent)).size === 1 ? '' : 's'}`,
        html: buildEmailHtml(issues, healthy),
      })
    }

    await completeRun(runId, {
      status: issues.length > 0 ? 'partial' : 'success',
      summary: {
        agents_monitored: Object.keys(EXPECTED).length,
        healthy,
        issues: issues.length,
        agents_with_issues: [...new Set(issues.map(i => i.agent))].join(', ') || null,
      },
    })

    return NextResponse.json({ success: true, healthy, issues })
  } catch (err) {
    console.error('[fleet-health] Fatal error:', err.message)
    await completeRun(runId, { status: 'error', error: err.message })
    return NextResponse.json({ error: 'Fleet health check failed', detail: err.message }, { status: 500 })
  }
}

// ─── Helpers ────────────────────────────────────────────────────

const KIND_COLORS = {
  OVERDUE: '#dc2626',
  STRANDED: '#b45309',
  FAILING: '#dc2626',
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildEmailHtml(issues, healthy) {
  const rows = issues.map(i => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;">${escapeHtml(i.agent)}</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 12px; font-weight: 600; color: ${KIND_COLORS[i.kind] || '#666'};">${i.kind}</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px; color: #666;">${escapeHtml(i.detail)}</td>
    </tr>
  `).join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a;">Agent Fleet Health — ${new Date().toISOString().slice(0, 10)}</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #1a1a1a; margin: 0 0 8px;">
        <strong>${issues.length}</strong> issue${issues.length === 1 ? '' : 's'} detected. ${healthy} agents healthy.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
        <tr>
          <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Agent</th>
          <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Issue</th>
          <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Detail</th>
        </tr>
        ${rows}
      </table>
      <div style="margin-top: 20px;">
        <a href="https://australianatlas.com.au/admin/agents" style="display: inline-block; padding: 10px 20px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">
          Open Agent Dashboard
        </a>
      </div>
      <p style="margin-top: 16px; font-size: 12px; color: #999;">Automated by Australian Atlas Fleet Health</p>
    </div>
  `.trim()
}
