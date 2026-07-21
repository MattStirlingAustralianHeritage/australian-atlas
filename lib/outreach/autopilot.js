// ============================================================
// Outreach autopilot — settings + shared status queries
// ------------------------------------------------------------
// One jsonb row in outreach_settings (key 'autopilot') drives the daily cron.
// Defaults are conservative: the pipeline (claim-sync, email discovery, AI
// openers) runs, but NO email goes out until Matt flips send_enabled in the
// admin UI. Caps are small on purpose — matt@australianatlas.com.au is still
// warming its sender reputation.
// ============================================================

import { melbourneDayStart } from './sendWindow'

export const AUTOPILOT_KEY = 'autopilot'

export const AUTOPILOT_DEFAULTS = {
  enabled: true,            // master switch for the background pipeline
  send_enabled: false,      // actually email operators (first touch)
  daily_send_cap: 40,       // first-touch emails per Melbourne day
  discover_per_run: 200,    // websites scanned per run
  personalise_per_run: 40,  // AI openers written per run (governor-metered)
  min_quality: 0,           // don't email listings below this quality score
  followup_enabled: true,   // second touch (rides send_enabled)
  followup_after_days: 6,   // wait before the follow-up
  followup_daily_cap: 40,   // follow-ups per Melbourne day
}

const INT_FIELDS = ['daily_send_cap', 'discover_per_run', 'personalise_per_run', 'min_quality', 'followup_after_days', 'followup_daily_cap']
const BOOL_FIELDS = ['enabled', 'send_enabled', 'followup_enabled']
const LIMITS = {
  daily_send_cap: [0, 200],
  discover_per_run: [0, 400],
  personalise_per_run: [0, 100],
  min_quality: [0, 100],
  followup_after_days: [2, 60],
  followup_daily_cap: [0, 200],
}

export function sanitizeSettings(raw = {}) {
  const out = { ...AUTOPILOT_DEFAULTS }
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

export async function loadAutopilotSettings(sb) {
  try {
    const { data } = await sb.from('outreach_settings').select('value').eq('key', AUTOPILOT_KEY).maybeSingle()
    return sanitizeSettings(data?.value || {})
  } catch {
    return { ...AUTOPILOT_DEFAULTS }
  }
}

export async function saveAutopilotSettings(sb, patch) {
  const current = await loadAutopilotSettings(sb)
  const next = sanitizeSettings({ ...current, ...patch })
  const { error } = await sb.from('outreach_settings').upsert(
    { key: AUTOPILOT_KEY, value: next, updated_at: new Date().toISOString() },
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

/**
 * Live status for the admin Autopilot panel and the cron's dry run: today's
 * quota usage, work pools, and the last run record. All head-counts — cheap.
 */
export async function autopilotStatus(sb, settings) {
  const s = settings || await loadAutopilotSettings(sb)
  const cutoff = new Date(Date.now() - s.followup_after_days * 24 * 3600 * 1000).toISOString()

  const [sentToday, followupsToday, withEmailUnsent, needNote, followupDue, checked, lastRunRes] = await Promise.all([
    sb.from('operator_outreach').select('id', { count: 'exact', head: true }).gte('sent_at', quotaDayStart()),
    sb.from('operator_outreach').select('id', { count: 'exact', head: true }).gte('followup_sent_at', quotaDayStart()),
    sb.from('operator_outreach').select('id', { count: 'exact', head: true }).not('contact_email', 'is', null).is('send_status', null),
    sb.from('operator_outreach').select('id', { count: 'exact', head: true }).not('contact_email', 'is', null).is('send_status', null).is('personal_note', null),
    sb.from('operator_outreach').select('id', { count: 'exact', head: true }).eq('send_status', 'sent').is('followup_sent_at', null).lte('sent_at', cutoff).not('status', 'in', '("claimed","replied","declined")'),
    sb.from('operator_outreach').select('id', { count: 'exact', head: true }).not('discovered_at', 'is', null),
    sb.from('agent_runs').select('started_at, completed_at, status, summary').eq('agent', 'outreach-autopilot').order('started_at', { ascending: false }).limit(1),
  ])

  return {
    sent_today: sentToday.count || 0,
    followups_today: followupsToday.count || 0,
    send_quota_left: Math.max(0, s.daily_send_cap - (sentToday.count || 0)),
    followup_quota_left: Math.max(0, s.followup_daily_cap - (followupsToday.count || 0)),
    sendable_pool: withEmailUnsent.count || 0,
    need_note_pool: needNote.count || 0,
    followup_due: followupDue.count || 0,
    sites_checked: checked.count || 0,
    last_run: lastRunRes.data?.[0] || null,
  }
}
