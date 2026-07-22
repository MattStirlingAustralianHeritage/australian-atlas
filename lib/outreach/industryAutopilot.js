// ============================================================
// Industry outreach autopilot — settings + shared status queries
// ------------------------------------------------------------
// One jsonb row in outreach_settings (key 'industry-autopilot') drives the
// daily industry cron, independent of the other autopilot rows. Defaults are
// conservative: the pipeline (email discovery, AI openers) runs, but NO email
// goes out until Matt flips send_enabled in the admin UI. Caps are small —
// industry outreach is low-volume and relationship-driven by nature (you
// court peak bodies, you do not blast them), so the daily cap is tiny.
// ============================================================

import { melbourneDayStart } from './sendWindow'

export const INDUSTRY_AUTOPILOT_KEY = 'industry-autopilot'

export const INDUSTRY_AUTOPILOT_DEFAULTS = {
  enabled: true,            // master switch for the background pipeline
  send_enabled: false,      // actually email industry contacts (first touch)
  daily_send_cap: 10,       // first-touch emails per Melbourne day (small on purpose)
  discover_per_run: 40,     // org contact pages scanned per run
  personalise_per_run: 15,  // AI openers written per run
  followup_enabled: true,   // second touch (rides send_enabled)
  followup_after_days: 7,   // wait before the follow-up
  followup_daily_cap: 10,   // follow-ups per Melbourne day
}

const INT_FIELDS = ['daily_send_cap', 'discover_per_run', 'personalise_per_run', 'followup_after_days', 'followup_daily_cap']
const BOOL_FIELDS = ['enabled', 'send_enabled', 'followup_enabled']
const LIMITS = {
  daily_send_cap: [0, 60],
  discover_per_run: [0, 200],
  personalise_per_run: [0, 60],
  followup_after_days: [2, 60],
  followup_daily_cap: [0, 60],
}

export function sanitizeIndustrySettings(raw = {}) {
  const out = { ...INDUSTRY_AUTOPILOT_DEFAULTS }
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

export async function loadIndustryAutopilotSettings(sb) {
  try {
    const { data } = await sb.from('outreach_settings').select('value').eq('key', INDUSTRY_AUTOPILOT_KEY).maybeSingle()
    return sanitizeIndustrySettings(data?.value || {})
  } catch {
    return { ...INDUSTRY_AUTOPILOT_DEFAULTS }
  }
}

export async function saveIndustryAutopilotSettings(sb, patch) {
  const current = await loadIndustryAutopilotSettings(sb)
  const next = sanitizeIndustrySettings({ ...current, ...patch })
  const { error } = await sb.from('outreach_settings').upsert(
    { key: INDUSTRY_AUTOPILOT_KEY, value: next, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
  if (error) throw new Error(error.message)
  return next
}

// Quota window = the current Melbourne calendar day (never a rolling 24h
// window — see the starvation note in pressAutopilot.js).
const quotaDayStart = () => melbourneDayStart().toISOString()

/**
 * Live status for the admin Autopilot panel and the cron's dry run: today's
 * quota usage, work pools, and the last run record. All head-counts — cheap.
 * Every query tolerates the table not existing yet (pre-migration).
 */
export async function industryAutopilotStatus(sb, settings) {
  const s = settings || await loadIndustryAutopilotSettings(sb)
  const cutoff = new Date(Date.now() - s.followup_after_days * 24 * 3600 * 1000).toISOString()

  try {
    const [sentToday, followupsToday, withEmailUnsent, needNote, needDiscover, followupDue, lastRunRes] = await Promise.all([
      sb.from('industry_outreach').select('id', { count: 'exact', head: true }).gte('sent_at', quotaDayStart()),
      sb.from('industry_outreach').select('id', { count: 'exact', head: true }).gte('followup_sent_at', quotaDayStart()),
      sb.from('industry_outreach').select('id', { count: 'exact', head: true }).not('contact_email', 'is', null).is('send_status', null),
      sb.from('industry_outreach').select('id', { count: 'exact', head: true }).not('contact_email', 'is', null).is('send_status', null).is('personal_note', null),
      sb.from('industry_outreach').select('id', { count: 'exact', head: true }).not('website', 'is', null).is('contact_email', null).is('discovered_at', null),
      sb.from('industry_outreach').select('id', { count: 'exact', head: true }).eq('send_status', 'sent').is('followup_sent_at', null).lte('sent_at', cutoff).not('status', 'in', '("responded","partnered","declined")'),
      sb.from('agent_runs').select('started_at, completed_at, status, summary').eq('agent', 'industry-outreach-autopilot').order('started_at', { ascending: false }).limit(1),
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
