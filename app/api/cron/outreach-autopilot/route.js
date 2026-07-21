import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { LISTING_REGION_SELECT } from '@/lib/regions'
import { discoverEmailsBatch } from '@/lib/outreach/discoverEmail'
import { persistDiscoveries } from '@/lib/outreach/discoverPersist'
import { generatePersonalNotesBatch } from '@/lib/outreach/personalise'
import { templateForVertical, FOLLOWUP_TEMPLATE, GENERIC_TEMPLATE } from '@/lib/outreach/templates'
import { filterSendable, sendCampaign, isSendableEmail, newCampaignId } from '@/lib/outreach/sendEngine'
import { loadAutopilotSettings, autopilotStatus } from '@/lib/outreach/autopilot'
import { isWithinSendWindow, sendWindowHoldNote, melbourneHour } from '@/lib/outreach/sendWindow'

/**
 * GET /api/cron/outreach-autopilot
 *
 * The outreach engine's daily heartbeat (09:30 Melbourne). Works through the
 * 10k-listing unclaimed backlog WITHOUT the admin tab being open:
 *
 *   0. claim-sync   — stamp outreach rows whose listing has since been claimed
 *                     (campaign conversion attribution). Always runs.
 *   1. discover     — scan the next N unchecked operator websites for a
 *                     contact email (time-boxed, partial results persist).
 *   2. personalise  — AI-write openers for sendable rows missing one
 *                     (metered through the monthly spend governor).
 *   3. send         — first-touch batch, per-vertical template, quality-first,
 *                     capped per Melbourne day. ONLY when send_enabled. Weekdays only.
 *   4. follow-up    — one (and only one) second touch, N days after the first,
 *                     skipping anyone claimed/replied/declined/suppressed.
 *
 * Settings live in outreach_settings ('autopilot'), edited on /admin/outreach.
 * ?dryRun=1 returns the plan + pool counts, writes nothing, sends nothing.
 *
 * Auth: Bearer CRON_SECRET
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const AGENT_NAME = 'outreach-autopilot'
const RUN_DEADLINE_MS = 240_000 // leave headroom inside maxDuration for bookkeeping
const IN_CHUNK = 150            // .in() id-list chunk — stays under PostgREST URL limits

const chunked = (arr, n) => {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// Weekday guard in AEST — cold outreach lands better Tue–Fri mornings, and
// never on a weekend.
function isWeekendAEST() {
  const day = new Date(Date.now() + 10 * 3600 * 1000).getUTCDay()
  return day === 0 || day === 6
}

// ---- Phase 0: claim attribution -----------------------------
async function syncClaims(sb) {
  // Outreach rows not yet marked claimed whose listing now is. The claimed set
  // is small; read it via the outreach rows' listings in pages.
  let updated = 0
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: rows } = await sb
      .from('operator_outreach')
      .select('id, listing_id, status')
      .neq('status', 'claimed')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (!rows || rows.length === 0) break
    const ids = [...new Set(rows.map((r) => r.listing_id).filter(Boolean))]
    const claimedListings = new Set()
    for (const chunk of chunked(ids, IN_CHUNK)) {
      const { data: ls } = await sb.from('listings').select('id').in('id', chunk).eq('is_claimed', true)
      for (const l of ls || []) claimedListings.add(l.id)
    }
    const now = new Date().toISOString()
    for (const r of rows) {
      if (claimedListings.has(r.listing_id)) {
        await sb.from('operator_outreach').update({ status: 'claimed', claimed_at: now, updated_at: now }).eq('id', r.id)
        updated++
      }
    }
    if (rows.length < PAGE) break
  }
  return updated
}

// ---- Workset: one quality-ordered pass over unclaimed listings ----
// Collects the discover / personalise / send pools in a single paged scan so
// the three phases share queries instead of each re-walking the table.
async function collectWorkset(sb, settings, wants) {
  const pools = { discover: [], note: [], send: [] }
  const PAGE = 400
  const MAX_PAGES = 12
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data: listings, error } = await sb
      .from('listings')
      .select(`id, name, slug, vertical, region, state, suburb, description, website, quality_score, is_claimed, status, ${LISTING_REGION_SELECT}`)
      .eq('status', 'active')
      .eq('is_claimed', false)
      .order('quality_score', { ascending: false, nullsFirst: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error || !listings || listings.length === 0) break

    const byId = new Map(listings.map((l) => [l.id, l]))
    const orows = []
    for (const chunk of chunked([...byId.keys()], IN_CHUNK)) {
      const { data } = await sb
        .from('operator_outreach')
        .select('id, listing_id, contact_email, email_source, send_status, status, personal_note, discovered_at')
        .in('listing_id', chunk)
      orows.push(...(data || []))
    }
    const oByListing = new Map(orows.map((r) => [r.listing_id, r]))

    for (const l of listings) {
      const o = oByListing.get(l.id)
      // Unchecked website → discovery pool.
      if (
        pools.discover.length < wants.discover &&
        l.website && !o?.contact_email && !o?.discovered_at
      ) pools.discover.push({ id: l.id, name: l.name, website: l.website })
      // Sendable but note-less → personalise pool.
      if (
        pools.note.length < wants.note &&
        o?.contact_email && !o.personal_note && !o.send_status
      ) pools.note.push({ listing: l, outreach: o })
      // Sendable → send pool (quality gate applies to sends only).
      if (
        pools.send.length < wants.send &&
        o?.contact_email && !o.send_status &&
        (l.quality_score == null || l.quality_score >= settings.min_quality)
      ) pools.send.push({ listing: l, outreach: o })
    }

    if (
      pools.discover.length >= wants.discover &&
      pools.note.length >= wants.note &&
      pools.send.length >= wants.send
    ) break
    if (listings.length < PAGE) break
  }
  return pools
}

// ---- Phase 4: follow-up eligibility -------------------------
async function collectFollowups(sb, settings, limit) {
  if (limit <= 0) return []
  const cutoff = new Date(Date.now() - settings.followup_after_days * 24 * 3600 * 1000).toISOString()
  const { data: rows } = await sb
    .from('operator_outreach')
    .select('id, listing_id, contact_email, personal_note, status, sent_at')
    .eq('send_status', 'sent')
    .is('followup_sent_at', null)
    .lte('sent_at', cutoff)
    .not('status', 'in', '("claimed","replied","declined")')
    .not('contact_email', 'is', null)
    .order('sent_at', { ascending: true })
    .limit(limit * 2)
  if (!rows || rows.length === 0) return []

  // Suppression check (unsubscribed since the first touch).
  const emails = [...new Set(rows.map((r) => r.contact_email.toLowerCase()))]
  const suppressed = new Set()
  for (const chunk of chunked(emails, IN_CHUNK)) {
    const { data: srows } = await sb.from('outreach_suppressions').select('email').in('email', chunk)
    for (const s of srows || []) suppressed.add(s.email.toLowerCase())
  }

  // Listing must still be live and unclaimed.
  const listingById = new Map()
  for (const chunk of chunked([...new Set(rows.map((r) => r.listing_id))], IN_CHUNK)) {
    const { data: ls } = await sb
      .from('listings')
      .select(`id, name, slug, vertical, region, state, suburb, description, is_claimed, status, ${LISTING_REGION_SELECT}`)
      .in('id', chunk)
    for (const l of ls || []) listingById.set(l.id, l)
  }

  const out = []
  const seen = new Set()
  for (const r of rows) {
    if (out.length >= limit) break
    const l = listingById.get(r.listing_id)
    const lower = r.contact_email.toLowerCase()
    if (!l || l.status !== 'active' || l.is_claimed) continue
    if (suppressed.has(lower) || seen.has(lower)) continue
    if (!isSendableEmail(r.contact_email)) continue
    seen.add(lower)
    out.push({ listing: l, outreachId: r.id, email: r.contact_email, personalNote: r.personal_note || '' })
  }
  return out
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dryRun = ['1', 'true'].includes(new URL(request.url).searchParams.get('dryRun') || '')

  const sb = getSupabaseAdmin()
  const settings = await loadAutopilotSettings(sb)
  const startedAt = Date.now()
  const timeLeft = () => RUN_DEADLINE_MS - (Date.now() - startedAt)
  const summary = { dryRun, settings }

  const runId = dryRun ? null : await startRun(AGENT_NAME)

  try {
    // ---- Phase 0: claim attribution (always, even when disabled) ----
    if (!dryRun) summary.claims_synced = await syncClaims(sb)

    const status = await autopilotStatus(sb, settings)
    summary.status = status

    if (!settings.enabled) {
      summary.note = 'autopilot disabled — claim-sync only'
      if (runId) await completeRun(runId, { status: 'success', summary })
      return NextResponse.json({ ok: true, ...summary })
    }

    const weekend = isWeekendAEST()
    const inWindow = isWithinSendWindow()
    summary.send_window = { open: inWindow, melbourne_hour: melbourneHour() }
    const sendQuota = settings.send_enabled && !weekend && inWindow ? status.send_quota_left : 0
    const followupQuota = settings.send_enabled && settings.followup_enabled && !weekend && inWindow ? status.followup_quota_left : 0

    // ---- Collect all pools in one scan ----
    const pools = await collectWorkset(sb, settings, {
      discover: settings.discover_per_run,
      note: settings.personalise_per_run,
      send: sendQuota > 0 ? sendQuota * 3 : 0,
    })
    summary.pools = {
      discover: pools.discover.length,
      note: pools.note.length,
      send_candidates: pools.send.length,
    }

    if (dryRun) {
      summary.would = {
        discover: pools.discover.length,
        personalise: pools.note.length,
        send: Math.min(sendQuota, pools.send.length),
        followups: (await collectFollowups(sb, settings, followupQuota || settings.followup_daily_cap)).length,
        weekend_hold: weekend,
        window_hold: !inWindow,
      }
      return NextResponse.json({ ok: true, ...summary })
    }

    // ---- Phase 1: discovery ----
    if (pools.discover.length && timeLeft() > 60_000) {
      const deadline = Math.min(140_000, timeLeft() - 70_000)
      const discovered = await discoverEmailsBatch(pools.discover, 6, { deadlineMs: Math.max(30_000, deadline) })
      const { statusCounts, foundCount } = await persistDiscoveries({ sb, listings: pools.discover, discovered })
      summary.discover = { scanned: discovered.length, found: foundCount, ...statusCounts }
    }

    // ---- Phase 2: personalise (governor-metered) ----
    if (pools.note.length && timeLeft() > 45_000) {
      const enriched = pools.note.map(({ listing }) => ({
        id: listing.id,
        name: listing.name,
        vertical: listing.vertical,
        region: listing.region || null,
        suburb: listing.suburb || null,
        description: listing.description || null,
      }))
      const { notes, budgetHit } = await generatePersonalNotesBatch(enriched, 4, sb)
      const now = new Date().toISOString()
      let wrote = 0
      for (const n of notes) {
        if (!n.personal_note) continue
        const o = pools.note.find((p) => p.listing.id === n.id)?.outreach
        if (!o) continue
        await sb.from('operator_outreach').update({
          personal_note: n.personal_note, personal_note_generated_at: now, updated_at: now,
        }).eq('id', o.id)
        wrote++
      }
      summary.personalise = { wrote, budgetHit }
    }

    // ---- Phase 3: first-touch sends ----
    if (sendQuota > 0 && pools.send.length && timeLeft() > 30_000) {
      const { recipients, skips } = await filterSendable({ sb, candidates: pools.send })
      const capped = recipients.slice(0, sendQuota)
      if (capped.length) {
        const generic = GENERIC_TEMPLATE
        const result = await sendCampaign({
          sb,
          recipients: capped,
          subject: generic.subject,
          body: generic.body,
          campaignId: newCampaignId('auto'),
          campaignName: `Autopilot ${new Date().toISOString().slice(0, 10)}`,
          kind: 'autopilot',
          segment: { autopilot: true, min_quality: settings.min_quality },
          resolveTemplate: (r) => templateForVertical(r.listing.vertical),
        })
        summary.send = { ...result, skips, errors: result.errors.slice(0, 3) }
      } else {
        summary.send = { sent: 0, skips }
      }
    } else if (settings.send_enabled && weekend) {
      summary.send = { held: 'weekend — no cold email Sat/Sun AEST' }
    } else if (settings.send_enabled && !inWindow) {
      summary.send = { held: sendWindowHoldNote('cold outreach') }
    }

    // ---- Phase 4: follow-ups ----
    if (followupQuota > 0 && timeLeft() > 25_000) {
      const followups = await collectFollowups(sb, settings, followupQuota)
      if (followups.length) {
        const result = await sendCampaign({
          sb,
          recipients: followups,
          subject: FOLLOWUP_TEMPLATE.subject,
          body: FOLLOWUP_TEMPLATE.body,
          campaignId: newCampaignId('fup'),
          campaignName: `Follow-up ${new Date().toISOString().slice(0, 10)}`,
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
    if (sentCount > 0 || failedCount > 0 || summary.personalise?.budgetHit) {
      try {
        await sendAgentEmail({
          subject: `Outreach autopilot: ${summary.send?.sent || 0} sent, ${summary.followup?.sent || 0} follow-ups`,
          html: `<p>Outreach autopilot run finished.</p>
<ul>
  <li>Emails discovered: ${summary.discover?.found ?? 0} (scanned ${summary.discover?.scanned ?? 0})</li>
  <li>AI openers written: ${summary.personalise?.wrote ?? 0}${summary.personalise?.budgetHit ? ' — <strong>monthly AI budget reached</strong>' : ''}</li>
  <li>First-touch sent: ${summary.send?.sent ?? 0} (failed ${summary.send?.failed ?? 0})</li>
  <li>Follow-ups sent: ${summary.followup?.sent ?? 0} (failed ${summary.followup?.failed ?? 0})</li>
  <li>Claims synced: ${summary.claims_synced ?? 0}</li>
</ul>
<p><a href="https://www.australianatlas.com.au/admin/outreach">Open the outreach console</a></p>`,
        })
      } catch (err) {
        console.warn('[outreach-autopilot] digest email failed:', err.message)
      }
    }

    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    console.error('[outreach-autopilot] failed:', err)
    if (runId) await completeRun(runId, { status: 'failed', summary, error: err.message })
    return NextResponse.json({ ok: false, error: err.message, ...summary }, { status: 500 })
  }
}
