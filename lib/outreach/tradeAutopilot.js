// ============================================================
// Trade outreach autopilot — settings + shared status queries
// ------------------------------------------------------------
// One jsonb row in outreach_settings (key 'trade-autopilot') drives the daily
// trade cron, independent of the operator ('autopilot') and press
// ('press-autopilot') rows. Defaults are conservative: the pipeline (email
// discovery, AI openers) runs, but NO email goes out until Matt flips
// send_enabled in the admin UI. Caps are modest — trade buyers are a small,
// considered audience (you invite product teams, you don't blast them), so the
// daily cap stays low.
// ============================================================

import { melbourneDayStart } from './sendWindow'

export const TRADE_AUTOPILOT_KEY = 'trade-autopilot'

export const TRADE_AUTOPILOT_DEFAULTS = {
  enabled: true,            // master switch for the background pipeline
  send_enabled: false,      // actually email trade buyers (first touch)
  daily_send_cap: 25,       // first-touch invites per Melbourne day
  discover_per_run: 60,     // company sites scanned per run
  personalise_per_run: 25,  // AI openers written per run (governor-metered)
  followup_enabled: true,   // second touch (rides send_enabled)
  followup_after_days: 7,   // wait before the follow-up
  followup_daily_cap: 25,   // follow-ups per Melbourne day
}

const INT_FIELDS = ['daily_send_cap', 'discover_per_run', 'personalise_per_run', 'followup_after_days', 'followup_daily_cap']
const BOOL_FIELDS = ['enabled', 'send_enabled', 'followup_enabled']
const LIMITS = {
  daily_send_cap: [0, 200],
  discover_per_run: [0, 200],
  personalise_per_run: [0, 60],
  followup_after_days: [2, 60],
  followup_daily_cap: [0, 200],
}

export function sanitizeTradeSettings(raw = {}) {
  const out = { ...TRADE_AUTOPILOT_DEFAULTS }
  for (const f of BOOL_FIELDS) if (typeof raw[f] === 'boolean') out[f] = raw[f]
  for (const f of INT_FIELDS) {
    const n = Number(raw[f])
    if (Number.isFinite(n)) {
      const [lo, hi] = LIMITS[f]
      out[f] = Math.min(Math.max(Math.round(n), lo), hi)
    }
  }
  return out
}

export async function loadTradeAutopilotSettings(sb) {
  try {
    const { data } = await sb.from('outreach_settings').select('value').eq('key', TRADE_AUTOPILOT_KEY).maybeSingle()
    return sanitizeTradeSettings(data?.value || {})
  } catch {
    return { ...TRADE_AUTOPILOT_DEFAULTS }
  }
}

export async function saveTradeAutopilotSettings(sb, patch) {
  const current = await loadTradeAutopilotSettings(sb)
  const next = sanitizeTradeSettings({ ...current, ...patch })
  const { error } = await sb.from('outreach_settings').upsert(
    { key: TRADE_AUTOPILOT_KEY, value: next, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
  if (error) throw new Error(error.message)
  return next
}

// Quota window = the current Melbourne calendar day. A rolling now-minus-24h
// window starved the daily cron: it sends minutes AFTER run start, so the next
// day's run (same wall time) still saw yesterday's whole batch inside the
// window and sent ~0. Same-day re-fires still count the earlier batch.
const quotaDayStart = () => melbourneDayStart().toISOString()

// Funnel statuses that end the conversation — never followed up.
const CLOSED_STATUSES = '("responded","onboarded","declined")'

/**
 * Live status for the admin Autopilot panel and the cron's dry run: today's
 * quota usage, work pools, and the last run record. All head-counts — cheap.
 * Every query tolerates the table not existing yet (pre-migration).
 */
export async function tradeAutopilotStatus(sb, settings) {
  const s = settings || await loadTradeAutopilotSettings(sb)
  const cutoff = new Date(Date.now() - s.followup_after_days * 24 * 3600 * 1000).toISOString()

  try {
    const [sentToday, followupsToday, withEmailUnsent, needNote, needDiscover, followupDue, lastRunRes] = await Promise.all([
      sb.from('trade_outreach').select('id', { count: 'exact', head: true }).gte('sent_at', quotaDayStart()),
      sb.from('trade_outreach').select('id', { count: 'exact', head: true }).gte('followup_sent_at', quotaDayStart()),
      sb.from('trade_outreach').select('id', { count: 'exact', head: true }).not('contact_email', 'is', null).is('send_status', null).neq('status', 'onboarded'),
      sb.from('trade_outreach').select('id', { count: 'exact', head: true }).not('contact_email', 'is', null).is('send_status', null).neq('status', 'onboarded').is('personal_note', null),
      sb.from('trade_outreach').select('id', { count: 'exact', head: true }).not('website', 'is', null).is('contact_email', null).is('discovered_at', null),
      sb.from('trade_outreach').select('id', { count: 'exact', head: true }).eq('send_status', 'sent').is('followup_sent_at', null).lte('sent_at', cutoff).not('status', 'in', CLOSED_STATUSES),
      sb.from('agent_runs').select('started_at, completed_at, status, summary').eq('agent', 'trade-outreach-autopilot').order('started_at', { ascending: false }).limit(1),
    ])

    return {
      sent_today: sentToday.count || 0,
      followups_today: followupsToday.count || 0,
      send_quota_left: Math.max(0, s.daily_send_cap - (sentToday.count || 0)),
      followup_quota_left: Math.max(0, s.followup_daily_cap - (followupsToday.count || 0)),
      sendable_pool: withEmailUnsent.count || 0,
      need_note_pool: needNote.count || 0,
      need_discover_pool: needDiscover.count || 0,
      followup_due: followupDue.count || 0,
      last_run: lastRunRes.data?.[0] || null,
    }
  } catch {
    return {
      sent_today: 0, followups_today: 0,
      send_quota_left: s.daily_send_cap, followup_quota_left: s.followup_daily_cap,
      sendable_pool: 0, need_note_pool: 0, need_discover_pool: 0, followup_due: 0, last_run: null,
    }
  }
}
