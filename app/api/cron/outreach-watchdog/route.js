import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { loadAutopilotSettings, saveAutopilotSettings } from '@/lib/outreach/autopilot'
import { loadPressAutopilotSettings, savePressAutopilotSettings } from '@/lib/outreach/pressAutopilot'
import { loadTradeAutopilotSettings, saveTradeAutopilotSettings } from '@/lib/outreach/tradeAutopilot'
import { melbourneHour, SEND_WINDOW_LABEL } from '@/lib/outreach/sendWindow'

/**
 * GET /api/cron/outreach-watchdog
 *
 * Quality-of-service monitor for the three outreach engines (operator, press,
 * trade). fleet-health answers "did the agents run?"; this answers "did
 * outreach actually behave as intended?" — the 2026-07-21 quota-starvation
 * incident ran green for a week (status: success, 1 email sent) precisely
 * because nothing watched outcomes, only liveness.
 *
 * Checks, per engine:
 *   UNDER_CAP    — ≥2 of the last 3 Melbourne weekdays sent <50% of the daily
 *                  cap while the sendable pool wasn't the limit (starvation-
 *                  class regressions, mass filter skips, quiet API failure)
 *   ZERO_TODAY   — weekday, past 10:00 Melbourne, pool waiting, nothing sent
 *                  since Melbourne midnight (same-day total-failure alarm)
 *   BOUNCE_RATE  — trailing-7d bounce rate >20% on ≥20 sends; >35% AUTO-PAUSES
 *                  that engine's send_enabled to protect the sender domain
 *   OFF_WINDOW   — any send in the trailing 24h stamped outside 9am–5pm
 *                  Melbourne or on a Melbourne weekend (verifies the
 *                  sendWindow guard end-to-end, from the data not the code)
 *   FU_BACKLOG   — follow-up backlog beyond 7× the daily follow-up cap
 *   RUN_STUCK    — agent_runs row 'running' for 2+ hours
 *   RUN_ERROR    — most recent completed run ended in 'error'
 *
 * Emails Matt ONLY when something is wrong; always logs its own agent_runs
 * row with full metrics so trends are queryable. ?dryRun=1 returns findings
 * without emailing, auto-pausing, or logging a run.
 *
 * Auth: Bearer CRON_SECRET
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const AGENT_NAME = 'outreach-watchdog'
const STUCK_HOURS = 2
const BOUNCE_WARN = 0.20
const BOUNCE_PAUSE = 0.35
const BOUNCE_MIN_SAMPLE = 20
const UNDER_CAP_FRACTION = 0.5
const BACKLOG_MULTIPLE = 7

const ENGINES = [
  {
    key: 'operator',
    agent: 'outreach-autopilot',
    table: 'operator_outreach',
    admin: '/admin/outreach',
    load: loadAutopilotSettings,
    save: saveAutopilotSettings,
  },
  {
    key: 'press',
    agent: 'press-outreach-autopilot',
    table: 'press_outreach',
    admin: '/admin/press-outreach',
    load: loadPressAutopilotSettings,
    save: savePressAutopilotSettings,
  },
  {
    key: 'trade',
    agent: 'trade-outreach-autopilot',
    table: 'trade_outreach',
    admin: '/admin/trade-outreach',
    load: loadTradeAutopilotSettings,
    save: saveTradeAutopilotSettings,
  },
]

// Melbourne wall-clock parts for ANY timestamp — used to judge historical
// sends, so it must come from the tz database (DST), not a fixed offset.
const MEL_FMT = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: 'numeric', hourCycle: 'h23', weekday: 'short',
})
function melbourneParts(date) {
  const parts = {}
  for (const p of MEL_FMT.formatToParts(date)) parts[p.type] = p.value
  return {
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    weekend: parts.weekday === 'Sat' || parts.weekday === 'Sun',
  }
}

// Last N Melbourne weekday dayKeys, most recent first, including today.
function lastMelbourneWeekdays(n, now = new Date()) {
  const keys = []
  for (let back = 0; keys.length < n && back < n * 3 + 4; back++) {
    const d = new Date(now.getTime() - back * 24 * 3600 * 1000)
    const p = melbourneParts(d)
    if (!p.weekend) keys.push(p.dayKey)
  }
  return keys
}

// Paged select — PostgREST caps a single response at 1000 rows.
async function pagedSelect(sb, table, columns, apply) {
  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(columns).range(from, from + PAGE - 1)
    q = apply(q)
    const { data, error } = await q
    if (error || !data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

async function inspectEngine(sb, engine, now) {
  const settings = await engine.load(sb)
  const issues = []
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString()
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()

  // Sendable pool (email found, never sent).
  const { count: pool } = await sb
    .from(engine.table)
    .select('id', { count: 'exact', head: true })
    .not('contact_email', 'is', null)
    .is('send_status', null)

  // Every send stamp in the trailing 7 days (first touch + follow-up).
  const firstTouches = await pagedSelect(sb, engine.table, 'sent_at, send_status', (q) =>
    q.gte('sent_at', sevenDaysAgo))
  const followups = await pagedSelect(sb, engine.table, 'followup_sent_at', (q) =>
    q.gte('followup_sent_at', sevenDaysAgo))

  // Bucket first-touch sends per Melbourne day.
  const perDay = {}
  for (const r of firstTouches) {
    const key = melbourneParts(new Date(r.sent_at)).dayKey
    perDay[key] = (perDay[key] || 0) + 1
  }
  const todayKey = melbourneParts(now).dayKey
  const sentToday = perDay[todayKey] || 0

  // UNDER_CAP — ≥2 of the last 3 Melbourne weekdays badly under cap while the
  // pool could have filled it. Catches slow-burn regressions the day after
  // they start, without paging on a single odd day. Days before the engine's
  // first-ever send don't count — a freshly enabled engine has honest zeros.
  const { data: firstSendRow } = await sb
    .from(engine.table)
    .select('sent_at')
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: true })
    .limit(1)
  const firstSendKey = firstSendRow?.[0] ? melbourneParts(new Date(firstSendRow[0].sent_at)).dayKey : null
  if (settings.send_enabled && (pool || 0) > settings.daily_send_cap && firstSendKey) {
    const days = lastMelbourneWeekdays(3, now).filter((d) => d >= firstSendKey)
    const under = days.filter((d) => (perDay[d] || 0) < settings.daily_send_cap * UNDER_CAP_FRACTION)
    if (days.length === 3 && under.length >= 2) {
      issues.push({
        engine: engine.key, kind: 'UNDER_CAP',
        detail: `sent ${days.map((d) => `${d}: ${perDay[d] || 0}`).join(', ')} against a cap of ${settings.daily_send_cap}/day with ${pool} sendable waiting`,
      })
    }
  }

  // ZERO_TODAY — same-day alarm once the morning batch window has passed.
  const nowMel = melbourneParts(now)
  if (
    settings.send_enabled && !nowMel.weekend && melbourneHour(now) >= 10 &&
    (pool || 0) > 0 && sentToday === 0
  ) {
    issues.push({
      engine: engine.key, kind: 'ZERO_TODAY',
      detail: `nothing sent since Melbourne midnight despite ${pool} sendable rows (cap ${settings.daily_send_cap})`,
    })
  }

  // BOUNCE_RATE — trailing 7 days, with auto-pause at the critical level.
  const sent7d = firstTouches.length
  const bounced7d = firstTouches.filter((r) => r.send_status === 'bounced').length
  const bounceRate = sent7d ? bounced7d / sent7d : 0
  let autoPaused = false
  if (sent7d >= BOUNCE_MIN_SAMPLE && bounceRate > BOUNCE_WARN) {
    const critical = bounceRate > BOUNCE_PAUSE
    issues.push({
      engine: engine.key, kind: critical ? 'BOUNCE_CRITICAL' : 'BOUNCE_RATE',
      detail: `${bounced7d}/${sent7d} sends bounced in 7 days (${Math.round(bounceRate * 100)}%)` +
        (critical ? ' — send_enabled auto-paused to protect the sender domain' : ''),
      critical,
    })
    if (critical) autoPaused = true
  }

  // OFF_WINDOW — any stamp in the trailing 24h outside 9am–5pm Melbourne or
  // on a Melbourne weekend. This audits actual delivery data, so it catches
  // regressions in ANY future send path, not just the ones guarded today.
  const recentStamps = [
    ...firstTouches.filter((r) => r.sent_at >= dayAgo).map((r) => r.sent_at),
    ...followups.filter((r) => r.followup_sent_at >= dayAgo).map((r) => r.followup_sent_at),
  ]
  const offWindow = recentStamps.filter((ts) => {
    const p = melbourneParts(new Date(ts))
    return p.weekend || p.hour < 9 || p.hour >= 17
  })
  if (offWindow.length) {
    issues.push({
      engine: engine.key, kind: 'OFF_WINDOW',
      detail: `${offWindow.length} send(s) in the last 24h outside ${SEND_WINDOW_LABEL} — e.g. ${offWindow.slice(0, 3).join(', ')}`,
    })
  }

  // FU_BACKLOG — follow-ups due but not going out.
  const followupCutoff = new Date(now.getTime() - settings.followup_after_days * 24 * 3600 * 1000).toISOString()
  const { count: backlog } = await sb
    .from(engine.table)
    .select('id', { count: 'exact', head: true })
    .eq('send_status', 'sent')
    .is('followup_sent_at', null)
    .lte('sent_at', followupCutoff)
  if (settings.send_enabled && settings.followup_enabled && (backlog || 0) > settings.followup_daily_cap * BACKLOG_MULTIPLE) {
    issues.push({
      engine: engine.key, kind: 'FU_BACKLOG',
      detail: `${backlog} follow-ups due against a cap of ${settings.followup_daily_cap}/day — more than a week behind`,
    })
  }

  // RUN_STUCK / RUN_ERROR — the engine's own run history.
  const { data: runs } = await sb
    .from('agent_runs')
    .select('status, started_at, completed_at, error')
    .eq('agent', engine.agent)
    .order('started_at', { ascending: false })
    .limit(3)
  const stuckCutoff = new Date(now.getTime() - STUCK_HOURS * 3600 * 1000).toISOString()
  for (const r of runs || []) {
    if (r.status === 'running' && r.started_at < stuckCutoff) {
      issues.push({ engine: engine.key, kind: 'RUN_STUCK', detail: `run started ${r.started_at} still 'running' after ${STUCK_HOURS}h+` })
      break
    }
  }
  const lastCompleted = (runs || []).find((r) => r.status !== 'running')
  if (lastCompleted?.status === 'error') {
    issues.push({ engine: engine.key, kind: 'RUN_ERROR', detail: `latest run errored: ${String(lastCompleted.error || '').slice(0, 160)}` })
  }

  return {
    issues,
    autoPaused,
    metrics: {
      pool: pool || 0,
      sent_today_melbourne: sentToday,
      sent_per_melbourne_day: perDay,
      sent_7d: sent7d,
      bounced_7d: bounced7d,
      bounce_rate_7d: Math.round(bounceRate * 1000) / 1000,
      followup_backlog: backlog || 0,
      send_enabled: settings.send_enabled,
      daily_send_cap: settings.daily_send_cap,
    },
  }
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dryRun = ['1', 'true'].includes(new URL(request.url).searchParams.get('dryRun') || '')

  const sb = getSupabaseAdmin()
  const now = new Date()
  const runId = dryRun ? null : await startRun(AGENT_NAME)
  const summary = { dryRun, engines: {}, issues: [] }

  try {
    for (const engine of ENGINES) {
      const { issues, autoPaused, metrics } = await inspectEngine(sb, engine, now)
      summary.engines[engine.key] = metrics
      summary.issues.push(...issues)

      if (autoPaused && !dryRun) {
        await engine.save(sb, { send_enabled: false })
        summary.engines[engine.key].auto_paused = true
      }
    }

    if (summary.issues.length && !dryRun) {
      const rows = summary.issues.map((i) =>
        `<tr><td style="padding:4px 10px"><strong>${i.engine}</strong></td><td style="padding:4px 10px">${i.kind}</td><td style="padding:4px 10px">${i.detail}</td></tr>`
      ).join('')
      await sendAgentEmail({
        subject: `Outreach watchdog: ${summary.issues.length} issue${summary.issues.length === 1 ? '' : 's'}${summary.issues.some((i) => i.critical) ? ' (CRITICAL — sending paused)' : ''}`,
        html: `
          <p>The outreach watchdog found problems on its ${melbourneParts(now).dayKey} sweep:</p>
          <table style="border-collapse:collapse;font-family:sans-serif;font-size:13px">${rows}</table>
          <p>Consoles: <a href="https://www.australianatlas.com.au/admin/outreach">operator</a> ·
          <a href="https://www.australianatlas.com.au/admin/press-outreach">press</a> ·
          <a href="https://www.australianatlas.com.au/admin/trade-outreach">trade</a></p>
          <p style="color:#888;font-size:12px">Checks: cap throughput, same-day zero-send, bounce rate
          (auto-pause &gt;${Math.round(BOUNCE_PAUSE * 100)}%), ${SEND_WINDOW_LABEL} compliance, follow-up backlog, stuck/errored runs.</p>`,
      })
      summary.emailed = true
    }

    if (runId) await completeRun(runId, { status: 'success', summary })
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    if (runId) await completeRun(runId, { status: 'error', summary, error: err.message })
    return NextResponse.json({ ok: false, error: err.message, ...summary }, { status: 500 })
  }
}
