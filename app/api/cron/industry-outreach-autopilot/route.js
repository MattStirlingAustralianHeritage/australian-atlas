import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { discoverEmailsBatch } from '@/lib/outreach/discoverEmail'
import { generateIndustryNotesBatch } from '@/lib/outreach/industryPersonalise'
import { INDUSTRY_INTRO_TEMPLATE, INDUSTRY_FOLLOWUP_TEMPLATE } from '@/lib/outreach/industryTemplates'
import { filterSendableIndustry, sendIndustryCampaign, newCampaignId } from '@/lib/outreach/industrySend'
import { loadIndustryAutopilotSettings, industryAutopilotStatus } from '@/lib/outreach/industryAutopilot'
import { isWithinSendWindow, sendWindowHoldNote, melbourneHour } from '@/lib/outreach/sendWindow'

/**
 * GET /api/cron/industry-outreach-autopilot
 *
 * The industry engine's daily heartbeat. Works a small, curated directory of
 * industry bodies and their contacts WITHOUT the admin tab being open:
 *
 *   1. discover     — scan org/contact pages we haven't checked for a contact
 *                     email (time-boxed, partial results persist).
 *   2. personalise  — AI-write openers for sendable rows missing one.
 *   3. send         — first-touch batch (intro template), capped per Melbourne
 *                     day. ONLY when send_enabled. Weekdays only.
 *   4. follow-up    — one (and only one) second touch, N days after the first,
 *                     skipping anyone who responded / partnered / declined.
 *
 * Settings live in outreach_settings ('industry-autopilot'), edited on
 * /admin/industry-outreach. Deliberately low-volume — you court peak bodies,
 * you do not blast them. ?dryRun=1 returns the plan, writes nothing, sends
 * nothing.
 *
 * Auth: Bearer CRON_SECRET
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const AGENT_NAME = 'industry-outreach-autopilot'
const RUN_DEADLINE_MS = 240_000

const INDUSTRY_SELECT = 'id, kind, org_name, contact_name, role_title, org_type, focus, state, region_id, region_name, contact_email, send_status, status, personal_note, regions:region_id (id, name, slug, state)'

// Weekday guard in AEST — industry outreach lands better Tue–Fri, never weekends.
function isWeekendAEST() {
  const day = new Date(Date.now() + 10 * 3600 * 1000).getUTCDay()
  return day === 0 || day === 6
}

// ---- Phase 1 pool: unchecked org websites ----------------
async function collectDiscoverPool(sb, limit) {
  if (limit <= 0) return []
  const { data } = await sb
    .from('industry_outreach')
    .select('id, org_name, website, contact_email, discovered_at')
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
    .from('industry_outreach')
    .select('id, org_name, contact_name, focus, state, region_id, region_name, regions:region_id (id, name, state)')
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
    .from('industry_outreach')
    .select(INDUSTRY_SELECT)
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
    .from('industry_outreach')
    .select(INDUSTRY_SELECT)
    .eq('send_status', 'sent')
    .is('followup_sent_at', null)
    .lte('sent_at', cutoff)
    .not('status', 'in', '("responded","partnered","declined")')
    .not('contact_email', 'is', null)
    .order('sent_at', { ascending: true })
    .limit(limit * 2)
  if (!rows || rows.length === 0) return []

  // Reuse the shared eligibility filter (suppression, invalid, dup).
  const { recipients } = await filterSendableIndustry({ sb, rows })
  return recipients.slice(0, limit)
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dryRun = ['1', 'true'].includes(new URL(request.url).searchParams.get('dryRun') || '')

  const sb = getSupabaseAdmin()
  const settings = await loadIndustryAutopilotSettings(sb)
  const startedAt = Date.now()
  const timeLeft = () => RUN_DEADLINE_MS - (Date.now() - startedAt)
  const summary = { dryRun, settings }

  const runId = dryRun ? null : await startRun(AGENT_NAME)

  try {
    const status = await industryAutopilotStatus(sb, settings)
    summary.status = status

    if (!settings.enabled) {
      summary.note = 'industry autopilot disabled'
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
            await sb.from('industry_outreach').update({ contact_email: email, email_source: 'website', discovered_at: now, updated_at: now }).eq('id', p.id)
          } else {
            await sb.from('industry_outreach').update({ email_source: st, discovered_at: now, updated_at: now }).eq('id', p.id)
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
          org_name: c.org_name,
          contact_name: c.contact_name || null,
          focus: c.focus || [],
          region: c.regions?.name || c.region_name || null,
          state: c.state || c.regions?.state || null,
          examples: [],
        }))
        const generated = await generateIndustryNotesBatch(inputs, 4)
        const now = new Date().toISOString()
        let wrote = 0
        for (const g of generated) {
          if (!g.personal_note) continue
          await sb.from('industry_outreach').update({ personal_note: g.personal_note, personal_note_generated_at: now, updated_at: now }).eq('id', g.id)
          wrote++
        }
        summary.personalise = { wrote }
      }
    }

    // ---- Phase 3: first-touch sends ----
    if (sendQuota > 0 && timeLeft() > 30_000) {
      const pool = await collectSendPool(sb, sendQuota * 3)
      const { recipients, skips } = await filterSendableIndustry({ sb, rows: pool })
      const capped = recipients.slice(0, sendQuota)
      if (capped.length) {
        const result = await sendIndustryCampaign({
          sb,
          recipients: capped,
          subject: INDUSTRY_INTRO_TEMPLATE.subject,
          body: INDUSTRY_INTRO_TEMPLATE.body,
          campaignId: newCampaignId('ind'),
          campaignName: `Industry autopilot ${new Date().toISOString().slice(0, 10)}`,
          kind: 'autopilot',
          segment: { autopilot: true },
        })
        summary.send = { ...result, skips, errors: result.errors.slice(0, 3) }
      } else {
        summary.send = { sent: 0, skips }
      }
    } else if (settings.send_enabled && weekend) {
      summary.send = { held: 'weekend — no industry email Sat/Sun AEST' }
    } else if (settings.send_enabled && !inWindow) {
      summary.send = { held: sendWindowHoldNote('industry outreach') }
    }

    // ---- Phase 4: follow-ups ----
    if (followupQuota > 0 && timeLeft() > 25_000) {
      const followups = await collectFollowups(sb, settings, followupQuota)
      if (followups.length) {
        const result = await sendIndustryCampaign({
          sb,
          recipients: followups,
          subject: INDUSTRY_FOLLOWUP_TEMPLATE.subject,
          body: INDUSTRY_FOLLOWUP_TEMPLATE.body,
          campaignId: newCampaignId('ifup'),
          campaignName: `Industry follow-up ${new Date().toISOString().slice(0, 10)}`,
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
          subject: `Industry autopilot: ${summary.send?.sent || 0} introduced, ${summary.followup?.sent || 0} follow-ups`,
          html: `<p>Industry outreach autopilot run finished.</p>
<ul>
  <li>Emails discovered: ${summary.discover?.found ?? 0} (scanned ${summary.discover?.scanned ?? 0})</li>
  <li>AI openers written: ${summary.personalise?.wrote ?? 0}</li>
  <li>First-touch intros: ${summary.send?.sent ?? 0} (failed ${summary.send?.failed ?? 0})</li>
  <li>Follow-ups sent: ${summary.followup?.sent ?? 0} (failed ${summary.followup?.failed ?? 0})</li>
</ul>
<p><a href="https://www.australianatlas.com.au/admin/industry-outreach">Open the industry outreach console</a></p>`,
        })
      } catch (err) {
        console.warn('[industry-outreach-autopilot] digest email failed:', err.message)
      }
    }

    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    console.error('[industry-outreach-autopilot] failed:', err)
    if (runId) await completeRun(runId, { status: 'failed', summary, error: err.message })
    return NextResponse.json({ ok: false, error: err.message, ...summary }, { status: 500 })
  }
}
