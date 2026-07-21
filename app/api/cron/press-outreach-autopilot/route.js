import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { discoverEmailsBatch } from '@/lib/outreach/discoverEmail'
import { generatePressNotesBatch } from '@/lib/outreach/pressPersonalise'
import { PRESS_INVITE_TEMPLATE, PRESS_FOLLOWUP_TEMPLATE } from '@/lib/outreach/pressTemplates'
import { filterSendablePress, sendPressCampaign, newCampaignId } from '@/lib/outreach/pressSend'
import { loadPressAutopilotSettings, pressAutopilotStatus } from '@/lib/outreach/pressAutopilot'
import { isWithinSendWindow, sendWindowHoldNote, melbourneHour } from '@/lib/outreach/sendWindow'

/**
 * GET /api/cron/press-outreach-autopilot
 *
 * The press engine's daily heartbeat (09:45 Melbourne). Works a small, curated
 * directory of press desks and journalists WITHOUT the admin tab being open:
 *
 *   1. discover     — scan outlet/staff pages we haven't checked for a contact
 *                     email (time-boxed, partial results persist).
 *   2. personalise  — AI-write openers for sendable rows missing one.
 *   3. send         — first-touch batch (invite template), capped per 24h.
 *                     ONLY when send_enabled. Weekdays only.
 *   4. follow-up    — one (and only one) second touch, N days after the first,
 *                     skipping anyone who responded / declined / suppressed.
 *
 * Settings live in outreach_settings ('press-autopilot'), edited on
 * /admin/press-outreach. Deliberately low-volume — you court journalists, you
 * do not blast them. ?dryRun=1 returns the plan, writes nothing, sends nothing.
 *
 * Auth: Bearer CRON_SECRET
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const AGENT_NAME = 'press-outreach-autopilot'
const RUN_DEADLINE_MS = 240_000

const PRESS_SELECT = 'id, kind, outlet_name, journalist_name, role_title, beat, state, region_id, region_name, contact_email, send_status, status, personal_note, regions:region_id (id, name, slug, state)'

// Weekday guard in AEST — press outreach lands better Tue–Fri, never weekends.
function isWeekendAEST() {
  const day = new Date(Date.now() + 10 * 3600 * 1000).getUTCDay()
  return day === 0 || day === 6
}

// ---- Phase 1 pool: unchecked outlet websites ----------------
async function collectDiscoverPool(sb, limit) {
  if (limit <= 0) return []
  const { data } = await sb
    .from('press_outreach')
    .select('id, outlet_name, website, contact_email, discovered_at')
    .not('website', 'is', null)
    .is('contact_email', null)
    .is('discovered_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  return (data || []).map((r) => ({ id: r.id, website: r.website }))
}

// ---- Phase 2 pool: sendable rows with no opener -------------
async function collectNotePool(sb, limit) {
  if (limit <= 0) return []
  const { data } = await sb
    .from('press_outreach')
    .select('id, outlet_name, journalist_name, beat, state, region_id, region_name, regions:region_id (id, name, state)')
    .not('contact_email', 'is', null)
    .is('send_status', null)
    .is('personal_note', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  return data || []
}

// ---- Phase 3 pool: first-touch candidates ------------------
async function collectSendPool(sb, limit) {
  if (limit <= 0) return []
  const { data } = await sb
    .from('press_outreach')
    .select(PRESS_SELECT)
    .not('contact_email', 'is', null)
    .is('send_status', null)
    .neq('status', 'declined')
    .order('created_at', { ascending: true })
    .limit(limit)
  return data || []
}

// ---- Phase 4 pool: follow-up eligibility -------------------
async function collectFollowups(sb, settings, limit) {
  if (limit <= 0) return []
  const cutoff = new Date(Date.now() - settings.followup_after_days * 24 * 3600 * 1000).toISOString()
  const { data: rows } = await sb
    .from('press_outreach')
    .select(PRESS_SELECT)
    .eq('send_status', 'sent')
    .is('followup_sent_at', null)
    .lte('sent_at', cutoff)
    .not('status', 'in', '("responded","featured","declined")')
    .not('contact_email', 'is', null)
    .order('sent_at', { ascending: true })
    .limit(limit * 2)
  if (!rows || rows.length === 0) return []

  // Reuse the shared eligibility filter (suppression, invalid, dup).
  const { recipients } = await filterSendablePress({ sb, rows })
  return recipients.slice(0, limit)
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dryRun = ['1', 'true'].includes(new URL(request.url).searchParams.get('dryRun') || '')

  const sb = getSupabaseAdmin()
  const settings = await loadPressAutopilotSettings(sb)
  const startedAt = Date.now()
  const timeLeft = () => RUN_DEADLINE_MS - (Date.now() - startedAt)
  const summary = { dryRun, settings }

  const runId = dryRun ? null : await startRun(AGENT_NAME)

  try {
    const status = await pressAutopilotStatus(sb, settings)
    summary.status = status

    if (!settings.enabled) {
      summary.note = 'press autopilot disabled'
      if (runId) await completeRun(runId, { status: 'success', summary })
      return NextResponse.json({ ok: true, ...summary })
    }

    const weekend = isWeekendAEST()
    const inWindow = isWithinSendWindow()
    summary.send_window = { open: inWindow, melbourne_hour: melbourneHour() }
    const sendQuota = settings.send_enabled && !weekend && inWindow ? status.send_quota_left : 0
    const followupQuota = settings.send_enabled && settings.followup_enabled && !weekend && inWindow ? status.followup_quota_left : 0

    if (dryRun) {
      const [dPool, nPool, sPool, fPool] = await Promise.all([
        collectDiscoverPool(sb, settings.discover_per_run),
        collectNotePool(sb, settings.personalise_per_run),
        collectSendPool(sb, sendQuota > 0 ? sendQuota * 3 : 0),
        collectFollowups(sb, settings, followupQuota || settings.followup_daily_cap),
      ])
      summary.would = {
        discover: dPool.length,
        personalise: nPool.length,
        send: Math.min(sendQuota, sPool.length),
        followups: fPool.length,
        weekend_hold: weekend,
        window_hold: !inWindow,
      }
      return NextResponse.json({ ok: true, ...summary })
    }

    // ---- Phase 1: discovery ----
    if (settings.discover_per_run > 0 && timeLeft() > 60_000) {
      const pool = await collectDiscoverPool(sb, settings.discover_per_run)
      if (pool.length) {
        const deadline = Math.min(140_000, timeLeft() - 70_000)
        const discovered = await discoverEmailsBatch(pool, 6, { deadlineMs: Math.max(30_000, deadline) })
        const byId = new Map(discovered.map((d) => [d.id, d]))
        const now = new Date().toISOString()
        const tally = { found: 0, no_email: 0, dead: 0, blocked: 0 }
        for (const p of pool) {
          const d = byId.get(p.id)
          if (!d) continue
          const email = d.email || null
          const st = d.status || (email ? 'found' : 'no_email')
          tally[st] = (tally[st] || 0) + 1
          if (email) {
            await sb.from('press_outreach').update({ contact_email: email, email_source: 'website', discovered_at: now, updated_at: now }).eq('id', p.id)
          } else {
            await sb.from('press_outreach').update({ email_source: st, discovered_at: now, updated_at: now }).eq('id', p.id)
          }
        }
        summary.discover = { scanned: discovered.length, found: tally.found, ...tally }
      }
    }

    // ---- Phase 2: personalise ----
    if (settings.personalise_per_run > 0 && timeLeft() > 45_000) {
      const pool = await collectNotePool(sb, settings.personalise_per_run)
      if (pool.length) {
        const inputs = pool.map((c) => ({
          id: c.id,
          outlet_name: c.outlet_name,
          journalist_name: c.journalist_name || null,
          beat: c.beat || [],
          region: c.regions?.name || c.region_name || null,
          state: c.state || c.regions?.state || null,
          examples: [],
        }))
        const generated = await generatePressNotesBatch(inputs, 4)
        const now = new Date().toISOString()
        let wrote = 0
        for (const g of generated) {
          if (!g.personal_note) continue
          await sb.from('press_outreach').update({ personal_note: g.personal_note, personal_note_generated_at: now, updated_at: now }).eq('id', g.id)
          wrote++
        }
        summary.personalise = { wrote }
      }
    }

    // ---- Phase 3: first-touch sends ----
    if (sendQuota > 0 && timeLeft() > 30_000) {
      const pool = await collectSendPool(sb, sendQuota * 3)
      const { recipients, skips } = await filterSendablePress({ sb, rows: pool })
      const capped = recipients.slice(0, sendQuota)
      if (capped.length) {
        const result = await sendPressCampaign({
          sb,
          recipients: capped,
          subject: PRESS_INVITE_TEMPLATE.subject,
          body: PRESS_INVITE_TEMPLATE.body,
          campaignId: newCampaignId('press'),
          campaignName: `Press autopilot ${new Date().toISOString().slice(0, 10)}`,
          kind: 'autopilot',
          segment: { autopilot: true },
        })
        summary.send = { ...result, skips, errors: result.errors.slice(0, 3) }
      } else {
        summary.send = { sent: 0, skips }
      }
    } else if (settings.send_enabled && weekend) {
      summary.send = { held: 'weekend — no press email Sat/Sun AEST' }
    } else if (settings.send_enabled && !inWindow) {
      summary.send = { held: sendWindowHoldNote('press outreach') }
    }

    // ---- Phase 4: follow-ups ----
    if (followupQuota > 0 && timeLeft() > 25_000) {
      const followups = await collectFollowups(sb, settings, followupQuota)
      if (followups.length) {
        const result = await sendPressCampaign({
          sb,
          recipients: followups,
          subject: PRESS_FOLLOWUP_TEMPLATE.subject,
          body: PRESS_FOLLOWUP_TEMPLATE.body,
          campaignId: newCampaignId('pfup'),
          campaignName: `Press follow-up ${new Date().toISOString().slice(0, 10)}`,
          kind: 'followup',
          isFollowup: true,
        })
        summary.followup = { ...result, errors: result.errors.slice(0, 3) }
      } else {
        summary.followup = { sent: 0 }
      }
    }

    if (runId) await completeRun(runId, { status: 'success', summary })

    // Digest to Matt only when something outward-facing happened.
    const sentCount = (summary.send?.sent || 0) + (summary.followup?.sent || 0)
    const failedCount = (summary.send?.failed || 0) + (summary.followup?.failed || 0)
    if (sentCount > 0 || failedCount > 0) {
      try {
        await sendAgentEmail({
          subject: `Press autopilot: ${summary.send?.sent || 0} pitched, ${summary.followup?.sent || 0} follow-ups`,
          html: `<p>Press outreach autopilot run finished.</p>
<ul>
  <li>Emails discovered: ${summary.discover?.found ?? 0} (scanned ${summary.discover?.scanned ?? 0})</li>
  <li>AI openers written: ${summary.personalise?.wrote ?? 0}</li>
  <li>First-touch pitched: ${summary.send?.sent ?? 0} (failed ${summary.send?.failed ?? 0})</li>
  <li>Follow-ups sent: ${summary.followup?.sent ?? 0} (failed ${summary.followup?.failed ?? 0})</li>
</ul>
<p><a href="https://www.australianatlas.com.au/admin/press-outreach">Open the press outreach console</a></p>`,
        })
      } catch (err) {
        console.warn('[press-outreach-autopilot] digest email failed:', err.message)
      }
    }

    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    console.error('[press-outreach-autopilot] failed:', err)
    if (runId) await completeRun(runId, { status: 'failed', summary, error: err.message })
    return NextResponse.json({ ok: false, error: err.message, ...summary }, { status: 500 })
  }
}
