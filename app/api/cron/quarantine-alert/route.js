import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'

/**
 * GET /api/cron/quarantine-alert
 *
 * Daily report on the listings_quarantine table. Groups rows by
 * failure_reason and vertical, lists the 20 most recent, and emails
 * matt@australianatlas.com.au via sendAgentEmail.
 *
 * Phase 1.8 of docs/architecture/regions.md Implementation Plan.
 *
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 300

export async function GET(request) {
  // ── Auth ────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const runId = await startRun('quarantine-alert')

  const counts = {
    total: 0,
    verticals: 0,
    reasons: 0,
  }

  try {
    // ── Fetch all quarantine rows ──────────────────────────────
    const { data, error: fetchError } = await sb
      .from('listings_quarantine')
      .select('failure_reason, vertical, name, slug, quarantined_at')
      .order('quarantined_at', { ascending: false })

    if (fetchError) {
      console.error('[quarantine-alert] Fetch error:', fetchError.message)
      throw fetchError
    }

    const rows = data || []
    counts.total = rows.length

    // ── Group by reason and vertical ────────────────────────────
    const reasonCounts = {}
    const verticalCounts = {}
    for (const r of rows) {
      reasonCounts[r.failure_reason] = (reasonCounts[r.failure_reason] || 0) + 1
      verticalCounts[r.vertical || '(null)'] = (verticalCounts[r.vertical || '(null)'] || 0) + 1
    }
    counts.reasons = Object.keys(reasonCounts).length
    counts.verticals = Object.keys(verticalCounts).length

    const reasonEntries = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])
    const verticalEntries = Object.entries(verticalCounts).sort((a, b) => b[1] - a[1])
    const recentRows = rows.slice(0, 20)

    // ── Subject ────────────────────────────────────────────────
    const subject = counts.total === 0
      ? 'Quarantine Report: all clear'
      : `Quarantine Report: ${counts.total} row${counts.total === 1 ? '' : 's'}`

    // ── Record run + send email ────────────────────────────────
    await completeRun(runId, { summary: counts })

    await sendAgentEmail({
      subject,
      html: buildEmailHtml({
        total: counts.total,
        verticalsCount: counts.verticals,
        reasonEntries,
        verticalEntries,
        recentRows,
      }),
    })

    console.log(
      `[quarantine-alert] Done — total: ${counts.total}, reasons: ${counts.reasons}, verticals: ${counts.verticals}`
    )

    return NextResponse.json({ success: true, ...counts })

  } catch (err) {
    console.error('[quarantine-alert] Fatal error:', err.message)

    await completeRun(runId, {
      status: 'error',
      error: err.message,
      summary: counts,
    })

    return NextResponse.json(
      { error: 'Quarantine alert failed', detail: err.message },
      { status: 500 }
    )
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function buildEmailHtml({ total, verticalsCount, reasonEntries, verticalEntries, recentRows }) {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  if (total === 0) {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a;">Quarantine Report — ${today}</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #1a1a1a; margin: 0 0 20px;">
          No quarantined listings today. All syncs passed validation.
        </p>
        <div style="margin-top: 20px;">
          <a href="https://australianatlas.com.au/admin" style="display: inline-block; padding: 10px 20px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">
            Open Admin
          </a>
        </div>
        <p style="margin-top: 16px; font-size: 12px; color: #999;">Automated by Australian Atlas Quarantine Alert</p>
      </div>
    `.trim()
  }

  const reasonTable = `
    <h3 style="margin: 20px 0 8px; font-size: 14px; font-weight: 600; color: #1a1a1a;">Reason Breakdown</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 12px;">
      ${reasonEntries.map(([reason, count]) => `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;">${escapeHtml(reason)}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${count}</td>
        </tr>
      `).join('')}
    </table>
  `.trim()

  const verticalTable = `
    <h3 style="margin: 20px 0 8px; font-size: 14px; font-weight: 600; color: #1a1a1a;">Vertical Breakdown</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 12px;">
      ${verticalEntries.map(([vert, count]) => `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">${escapeHtml(vert)}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">${count}</td>
        </tr>
      `).join('')}
    </table>
  `.trim()

  const recentTable = `
    <h3 style="margin: 20px 0 8px; font-size: 14px; font-weight: 600; color: #1a1a1a;">Recent Quarantines</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px;">
      <thead>
        <tr>
          <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Name</th>
          <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Vertical</th>
          <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Reason</th>
          <th style="text-align: right; padding: 8px 0; border-bottom: 2px solid #eee; color: #999; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">At (UTC)</th>
        </tr>
      </thead>
      <tbody>
        ${recentRows.map(r => `
          <tr>
            <td style="padding: 6px 0; border-bottom: 1px solid #eee;">${escapeHtml(r.name || '—')}</td>
            <td style="padding: 6px 0; border-bottom: 1px solid #eee; color: #666;">${escapeHtml(r.vertical || '—')}</td>
            <td style="padding: 6px 0; border-bottom: 1px solid #eee; color: #666; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;">${escapeHtml(r.failure_reason)}</td>
            <td style="padding: 6px 0; border-bottom: 1px solid #eee; color: #999; text-align: right; font-size: 12px;">${r.quarantined_at ? new Date(r.quarantined_at).toISOString().slice(0, 16).replace('T', ' ') : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `.trim()

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a;">Quarantine Report — ${today}</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #1a1a1a; margin: 0 0 8px;">
        <strong>${total}</strong> row${total === 1 ? '' : 's'} in quarantine across <strong>${verticalsCount}</strong> vertical${verticalsCount === 1 ? '' : 's'}.
      </p>
      ${reasonTable}
      ${verticalTable}
      ${recentTable}
      <div style="margin-top: 20px;">
        <a href="https://australianatlas.com.au/admin" style="display: inline-block; padding: 10px 20px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">
          Open Admin
        </a>
      </div>
      <p style="margin-top: 16px; font-size: 12px; color: #999;">Automated by Australian Atlas Quarantine Alert</p>
    </div>
  `.trim()
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
