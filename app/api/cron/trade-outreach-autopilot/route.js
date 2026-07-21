import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { discoverEmailsBatch } from '@/lib/outreach/discoverEmail'
import { generateTradeNotesBatch } from '@/lib/outreach/tradePersonalise'
import { TRADE_BETA_TEMPLATE, TRADE_FOLLOWUP_TEMPLATE } from '@/lib/outreach/tradeTemplates'
import { filterSendableTrade, sendTradeCampaign, newCampaignId, fetchNetworkCount } from '@/lib/outreach/tradeSend'
import { loadTradeAutopilotSettings, tradeAutopilotStatus } from '@/lib/outreach/tradeAutopilot'
import { isWithinSendWindow, sendWindowHoldNote, melbourneHour } from '@/lib/outreach/sendWindow'

/**
 * GET /api/cron/trade-outreach-autopilot
 *
 * The trade engine's daily heartbeat (09:00 AEST). Works the curated directory
 * of travel-trade buyers (tour operators, inbound operators, DMCs, wholesalers,
 * agencies, trip designers) WITHOUT the admin tab being open:
 *
 *   1. discover     — scan company sites we haven't checked for a contact
 *                     email (time-boxed, partial results persist).
 *   2. personalise  — AI-write openers for sendable rows missing one.
 *   3. send         — first-touch batch (founding-beta invite), capped per Melbourne day.
 *                     ONLY when send_enabled. Weekdays only.
 *   4. follow-up    — one (and only one) second touch, N days after the first,
 *                     skipping anyone who responded / onboarded / declined /
 *                     was suppressed.
 *
 * Settings live in outreach_settings ('trade-autopilot'), edited on
 * /admin/trade-outreach. Deliberately modest volume — trade buyers are a small,
 * considered audience. ?dryRun=1 returns the plan, writes nothing, sends nothing.
 *
 * Auth: Bearer CRON_SECRET
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const AGENT_NAME = 'trade-outreach-autopilot'
const RUN_DEADLINE_MS = 240_000

const TRADE_SELECT = 'id, company_name, org_type, state, region_id, region_name, focus, contact_email, send_status, status, personal_note, regions:region_id (id, name, slug, state, listing_count)'

// Weekday guard in AEST — trade outreach lands better Tue–Fri, never weekends.
function isWeekendAEST() {
  const day = new Date(Date.now() + 10 * 3600 * 1000).getUTCDay()
  return day === 0 || day === 6
}

// ---- Phase 1 pool: unchecked company websites ---------------
async function collectDiscoverPool(sb, limit) {
  if (limit <= 0) return []
  const { data } = await sb
    .from('trade_outreach')
    .select('id, company_name, website, contact_email, discovered_at')
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
    .from('trade_outreach')
    .select('id, company_name, org_type, focus, state, region_id, region_name, regions:region_id (id, name, state, listing_count)')
    .not('contact_email', 'is', null)
    .is('send_status', null)
    .neq('status', 'onboarded')
    .is('personal_note', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  return data || []
}

// ---- Phase 3 pool: first-touch candidates ------------------
async function collectSendPool(sb, limit) {
  if (limit <= 0) return []
  const { data } = await sb
    .from('trade_outreach')
    .select(TRADE_SELECT)
    .not('contact_email', 'is', null)
    .is('send_status', null)
    .neq('status', 'onboarded')
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
    .from('trade_outreach')
    .select(TRADE_SELECT)
    .eq('send_status', 'sent')
    .is('followup_sent_at', null)
    .lte('sent_at', cutoff)
    .not('status', 'in', '("responded","onboarded","declined")')
    .not('contact_email', 'is', null)
    .order('sent_at', { ascending: true })
    .limit(limit * 2)
  if (!rows || rows.length === 0) return []

  // Reuse the shared eligibility filter (suppression, invalid, partner, dup).
  const { recipients } = await filterSendableTrade({ sb, rows })
  return recipients.slice(0, limit)
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dryRun = ['1', 'true'].includes(new URL(request.url).searchParams.get('dryRun') || '')

  const sb = getSupabaseAdmin()
  const settings = await loadTradeAutopilotSettings(sb)
  const startedAt = Date.now()
  const timeLeft = () => RUN_DEADLINE_MS - (Date.now() - startedAt)
  const summary = { dryRun, settings }

  const runId = dryRun ? null : await startRun(AGENT_NAME)

  try {
    const status = await tradeAutopilotStatus(sb, settings)
    summary.status = status

    if (!settings.enabled) {
      summary.note = 'trade autopilot disabled'
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
            await sb.from('trade_outreach').update({ contact_email: email, email_source: 'website', discovered_at: now, updated_at: now }).eq('id', p.id)
          } else {
            await sb.from('trade_outreach').update({ email_source: st, discovered_at: now, updated_at: now }).eq('id', p.id)
          }
        }
        summary.discover = { scanned: discovered.length, found: tally.found, ...tally }
      }
    }

    // ---- Phase 2: personalise ----
    if (settings.personalise_per_run > 0 && timeLeft() > 45_000) {
      const pool = await collectNotePool(sb, settings.personalise_per_run)
      if (pool.length) {
        const networkCount = await fetchNetworkCount(sb)
        const inputs = pool.map((c) => ({
          id: c.id,
          company_name: c.company_name,
          org_type: c.org_type || null,
          focus: c.focus || null,
          region: c.regions?.name || c.region_name || null,
          state: c.state || c.regions?.state || null,
          listing_count: c.regions?.listing_count ?? null,
          network_count: networkCount,
          examples: [],
        }))
        const generated = await generateTradeNotesBatch(inputs, 4)
        const now = new Date().toISOString()
        let wrote = 0
        for (const g of generated) {
          if (!g.personal_note) continue
          await sb.from('trade_outreach').update({ personal_note: g.personal_note, personal_note_generated_at: now, updated_at: now }).eq('id', g.id)
          wrote++
        }
        summary.personalise = { wrote }
      }
    }

    // ---- Phase 3: first-touch sends ----
    if (sendQuota > 0 && timeLeft() > 30_000) {
      const pool = await collectSendPool(sb, sendQuota * 3)
      const { recipients, skips } = await filterSendableTrade({ sb, rows: pool })
      const capped = recipients.slice(0, sendQuota)
      if (capped.length) {
        const result = await sendTradeCampaign({
          sb,
          recipients: capped,
          subject: TRADE_BETA_TEMPLATE.subject,
          body: TRADE_BETA_TEMPLATE.body,
          campaignId: newCampaignId('trade'),
          campaignName: `Trade autopilot ${new Date().toISOString().slice(0, 10)}`,
          kind: 'autopilot',
          segment: { autopilot: true },
        })
        summary.send = { ...result, skips, errors: result.errors.slice(0, 3) }
      } else {
        summary.send = { sent: 0, skips }
      }
    } else if (settings.send_enabled && weekend) {
      summary.send = { held: 'weekend — no trade email Sat/Sun AEST' }
    } else if (settings.send_enabled && !inWindow) {
      summary.send = { held: sendWindowHoldNote('trade outreach') }
    }

    // ---- Phase 4: follow-ups ----
    if (followupQuota > 0 && timeLeft() > 25_000) {
      const followups = await collectFollowups(sb, settings, followupQuota)
      if (followups.length) {
        const result = await sendTradeCampaign({
          sb,
          recipients: followups,
          subject: TRADE_FOLLOWUP_TEMPLATE.subject,
          body: TRADE_FOLLOWUP_TEMPLATE.body,
          campaignId: newCampaignId('tfup'),
          campaignName: `Trade follow-up ${new Date().toISOString().slice(0, 10)}`,
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
          subject: `Trade autopilot: ${summary.send?.sent || 0} invited, ${summary.followup?.sent || 0} follow-ups`,
          html: `<p>Trade outreach autopilot run finished.</p>
<ul>
  <li>Emails discovered: ${summary.discover?.found ?? 0} (scanned ${summary.discover?.scanned ?? 0})</li>
  <li>AI openers written: ${summary.personalise?.wrote ?? 0}</li>
  <li>First-touch invited: ${summary.send?.sent ?? 0} (failed ${summary.send?.failed ?? 0})</li>
  <li>Follow-ups sent: ${summary.followup?.sent ?? 0} (failed ${summary.followup?.failed ?? 0})</li>
</ul>
<p><a href="https://www.australianatlas.com.au/admin/trade-outreach">Open the trade outreach console</a></p>`,
        })
      } catch (err) {
        console.warn('[trade-outreach-autopilot] digest email failed:', err.message)
      }
    }

    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    console.error('[trade-outreach-autopilot] failed:', err)
    if (runId) await completeRun(runId, { status: 'failed', summary, error: err.message })
    return NextResponse.json({ ok: false, error: err.message, ...summary }, { status: 500 })
  }
}
