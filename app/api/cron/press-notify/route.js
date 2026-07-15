import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { startRun, completeRun } from '@/lib/agents/logRun'
import { sendAgentEmail } from '@/lib/agents/email'
import { buildEventAlertEmail, buildDigestEmail, sendPressEmail } from '@/lib/press/notify'
import { applyPublicListings } from '@/lib/press/insights'

/**
 * GET /api/cron/press-notify
 *
 * The events → press wire. Fires HOURLY; the route decides which lanes are
 * open on each run (Sydney time):
 *
 *   instant — every run. Members with cadence 'instant' hear about events
 *             that just went publicly visible in regions they follow (plus
 *             any fresh story leads), batched into ONE email per member.
 *   daily   — the 07:00 Sydney run. Members with cadence 'daily' get a
 *             briefing: new events + story leads + a new-places roundup
 *             over the last day.
 *   weekly  — the Monday 07:00 Sydney run. Same briefing, 7-day window,
 *             for cadence 'weekly'.
 *
 * What counts as a "new" event: publicly visible (status 'approved' AND
 * published IS NOT FALSE), upcoming (end_date >= today), in a followed
 * region, and it surfaced within the last 14 days (approved_at, falling
 * back to submitted_at) — so a brand-new follower isn't flooded with the
 * region's whole back-catalogue. Beat filters apply: an account with
 * beat_verticals only hears about events tagged with those verticals
 * (untagged events always pass — an empty tag list never hides news).
 *
 * Idempotency: press_event_sends / press_lead_sends are unique on
 * (press_id, event|lead) and the row is inserted BEFORE sending. A member
 * hears about a given event exactly once, whatever their cadence, however
 * often the cron re-runs.
 *
 * Embargoed leads (embargo_until in the future) are never emailed; they
 * surface in the newsroom with an embargo badge and are emailed by the
 * first run after the embargo lifts.
 *
 * Query params:
 *   ?dryRun=1        compute + return JSON; no ledger writes, no member
 *                    email; one sample email goes to the admin inbox
 *   ?force=daily     open a lane regardless of clock (also weekly|instant)
 *   ?pressId=<uuid>  restrict to one member
 *
 * Auth: Bearer CRON_SECRET
 */

export const maxDuration = 300

const AGENT_NAME = 'press-notify'
const DAY_MS = 24 * 60 * 60 * 1000
const EVENT_LOOKBACK_DAYS = 14
const ADMIN_SAMPLE_EMAIL = 'matt@australianatlas.com.au'

function sydneyNow() {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', weekday: 'short', hour: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const get = (t) => parts.find(p => p.type === t)?.value
  return { weekday: get('weekday'), hour: parseInt(get('hour'), 10) }
}

function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === '1'
  const forceLane = searchParams.get('force')
  const onlyPressId = searchParams.get('pressId')

  const runId = await startRun(AGENT_NAME)
  const sb = getSupabaseAdmin()

  // ── Which lanes are open this run ─────────────────────────
  const { weekday, hour } = sydneyNow()
  const lanes = new Set(['instant'])
  if (hour === 7) lanes.add('daily')
  if (hour === 7 && weekday === 'Mon') lanes.add('weekly')
  if (forceLane && ['instant', 'daily', 'weekly'].includes(forceLane)) lanes.add(forceLane)

  const results = [] // { pressId, name, outlet, cadence, events, leads, listings, sentTo, status, detail }
  const errors = []

  try {
    // ── 1. Members whose cadence lane is open ────────────────
    let accountsQuery = sb
      .from('press_accounts')
      .select('id, name, outlet, slug, contact_email, cadence, notify_events, notify_listings, notify_leads, beat_verticals')
      .eq('approved', true)
      .eq('status', 'active')
      .neq('cadence', 'off')
    if (onlyPressId) accountsQuery = accountsQuery.eq('id', onlyPressId)

    const { data: accounts, error: accErr } = await accountsQuery
    if (accErr) throw accErr

    const dueAccounts = (accounts || []).filter(a => lanes.has(a.cadence))
    if (dueAccounts.length === 0) {
      await completeRun(runId, { status: 'success', summary: { lanes: [...lanes], due_members: 0, sent: 0 } })
      return NextResponse.json({ success: true, lanes: [...lanes], dueMembers: 0, results: [] })
    }

    // ── 2. Their follows, batched ────────────────────────────
    const { data: follows, error: folErr } = await sb
      .from('press_follows')
      .select('press_id, region_id, region:regions ( id, name, slug, status )')
      .in('press_id', dueAccounts.map(a => a.id))
    if (folErr) throw folErr

    const followsByPress = new Map()
    const allRegionIds = new Set()
    for (const f of follows || []) {
      if (!f.region || f.region.status !== 'live') continue
      if (!followsByPress.has(f.press_id)) followsByPress.set(f.press_id, new Map())
      followsByPress.get(f.press_id).set(f.region_id, f.region)
      allRegionIds.add(f.region_id)
    }

    // ── 3. Candidate events across all followed regions ──────
    const sinceIso = new Date(Date.now() - EVENT_LOOKBACK_DAYS * DAY_MS).toISOString()
    let candidateEvents = []
    if (allRegionIds.size > 0) {
      const { data: events, error: evErr } = await sb
        .from('events')
        .select('id, name, slug, description, category, category_label, start_date, end_date, location_name, suburb, state, ticket_url, is_free, region_id, verticals, approved_at, submitted_at, listing:listings ( id, name, slug )')
        .eq('status', 'approved')
        .not('published', 'is', false)
        .in('region_id', [...allRegionIds])
        .gte('end_date', todayYMD())
      if (evErr) throw evErr
      candidateEvents = (events || []).filter(e => (e.approved_at || e.submitted_at || '') >= sinceIso)
    }

    // ── 4. Published, un-embargoed leads ─────────────────────
    const nowIso = new Date().toISOString()
    const { data: leadRows, error: leadErr } = await sb
      .from('press_leads')
      .select('id, title, summary, lead_type, region_id, vertical, embargo_until, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(50)
    if (leadErr) throw leadErr
    const candidateLeads = (leadRows || []).filter(l => !l.embargo_until || l.embargo_until <= nowIso)

    // ── 5. Already-sent ledgers ──────────────────────────────
    const dueIds = dueAccounts.map(a => a.id)
    const [{ data: sentEvents }, { data: sentLeads }] = await Promise.all([
      candidateEvents.length
        ? sb.from('press_event_sends').select('press_id, event_id').in('press_id', dueIds).in('event_id', candidateEvents.map(e => e.id))
        : Promise.resolve({ data: [] }),
      candidateLeads.length
        ? sb.from('press_lead_sends').select('press_id, lead_id').in('press_id', dueIds).in('lead_id', candidateLeads.map(l => l.id))
        : Promise.resolve({ data: [] }),
    ])
    const eventSent = new Set((sentEvents || []).map(r => `${r.press_id}:${r.event_id}`))
    const leadSent = new Set((sentLeads || []).map(r => `${r.press_id}:${r.lead_id}`))

    // ── 6. Per-member compose + send ─────────────────────────
    let dryRunSampleSent = false

    for (const account of dueAccounts) {
      const regions = followsByPress.get(account.id) || new Map()
      const beats = account.beat_verticals || []

      // Events for this member: followed region, beat match, not yet sent.
      const memberEvents = account.notify_events === false ? [] : candidateEvents.filter(e =>
        regions.has(e.region_id)
        && !eventSent.has(`${account.id}:${e.id}`)
        && (!beats.length || !e.verticals?.length || e.verticals.some(v => beats.includes(v)))
      )

      // Leads: network-wide (no region) or in a followed region.
      const memberLeads = account.notify_leads === false ? [] : candidateLeads.filter(l =>
        !leadSent.has(`${account.id}:${l.id}`)
        && (!l.region_id || regions.has(l.region_id))
      )

      // Digest lanes also carry a new-places roundup (window = lane length).
      let memberListings = []
      if ((account.cadence === 'daily' || account.cadence === 'weekly') && account.notify_listings !== false && regions.size) {
        const windowDays = account.cadence === 'weekly' ? 7 : 1
        const { data: newRows } = await applyPublicListings(
          sb.from('listings_with_region')
            .select('id, name, slug, suburb, vertical, region_id, created_at')
            .in('region_id', [...regions.keys()])
        )
          .gte('created_at', new Date(Date.now() - windowDays * DAY_MS).toISOString())
          .order('created_at', { ascending: false })
          .limit(30)
        memberListings = newRows || []
      }

      if (!memberEvents.length && !memberLeads.length && !memberListings.length) {
        continue // nothing new for this member — no email, no record
      }

      const eventsByRegion = new Map()
      for (const e of memberEvents) {
        const name = regions.get(e.region_id)?.name || 'Your regions'
        if (!eventsByRegion.has(name)) eventsByRegion.set(name, [])
        eventsByRegion.get(name).push(e)
      }

      const email = account.cadence === 'instant'
        ? buildEventAlertEmail({ account, eventsByRegion, leads: memberLeads })
        : buildDigestEmail({ account, cadence: account.cadence, eventsByRegion, newListings: memberListings, leads: memberLeads })

      const base = {
        pressId: account.id, name: account.name, outlet: account.outlet, cadence: account.cadence,
        events: memberEvents.length, leads: memberLeads.length, listings: memberListings.length,
      }

      if (dryRun) {
        let sentTo = null
        if (!dryRunSampleSent) {
          try {
            const ok = await sendPressEmail({
              account: { ...account, contact_email: ADMIN_SAMPLE_EMAIL },
              subject: `[DRY RUN — ${account.outlet}] ${email.subject}`,
              html: email.html,
            })
            if (ok) { sentTo = ADMIN_SAMPLE_EMAIL; dryRunSampleSent = true }
          } catch (e) { errors.push(`dry-run sample: ${e.message}`) }
        }
        results.push({ ...base, sentTo, status: 'previewed', detail: 'dry run — nothing recorded' })
        continue
      }

      // Claim the ledgers BEFORE sending. A unique violation (23505) means a
      // concurrent run got there first — drop that item rather than resend.
      const claimedEvents = []
      for (const e of memberEvents) {
        const { error: insErr } = await sb.from('press_event_sends').insert({
          press_id: account.id, event_id: e.id, cadence: account.cadence, sent_to: account.contact_email,
        })
        if (!insErr) claimedEvents.push(e)
        else if (insErr.code !== '23505') throw insErr
      }
      const claimedLeads = []
      for (const l of memberLeads) {
        const { error: insErr } = await sb.from('press_lead_sends').insert({
          press_id: account.id, lead_id: l.id, sent_to: account.contact_email,
        })
        if (!insErr) claimedLeads.push(l)
        else if (insErr.code !== '23505') throw insErr
      }

      if (!claimedEvents.length && !claimedLeads.length && !memberListings.length) {
        results.push({ ...base, sentTo: null, status: 'skipped', detail: 'claimed by a concurrent run' })
        continue
      }

      try {
        const ok = await sendPressEmail({ account, subject: email.subject, html: email.html })
        results.push({
          ...base,
          sentTo: account.contact_email,
          status: ok ? 'sent' : 'failed',
          detail: ok ? null : 'RESEND_API_KEY not set — ledger recorded, email not sent',
        })
        if (ok) {
          await sb.from('press_activity').insert({
            press_id: account.id,
            action: 'notified',
            metadata: { cadence: account.cadence, events: claimedEvents.length, leads: claimedLeads.length, listings: memberListings.length },
          })
        }
      } catch (sendErr) {
        errors.push(`${account.outlet}: send failed: ${sendErr.message}`)
        results.push({ ...base, sentTo: account.contact_email, status: 'failed', detail: `ledger recorded; send failed: ${sendErr.message}` })
      }
    }

    // ── 7. Summary to the admin inbox (only when something happened) ────
    const sent = results.filter(r => r.status === 'sent').length
    if (results.length > 0) {
      const rows = results.map(r =>
        `<tr><td style="padding:4px 10px 4px 0;">${r.outlet}</td><td style="padding:4px 10px 4px 0;">${r.cadence}</td><td style="padding:4px 10px 4px 0;">${r.events}e / ${r.leads}l / ${r.listings}p</td><td style="padding:4px 0;">${r.status}${r.detail ? ` — ${r.detail}` : ''}</td></tr>`
      ).join('')
      await sendAgentEmail({
        subject: `Press notify${dryRun ? ' (dry run)' : ''} — ${sent} sent (${[...lanes].join('+')})`,
        html: `<p>Lanes: ${[...lanes].join(', ')}. Members due: ${dueAccounts.length}.</p><table style="font-size:13px;border-collapse:collapse;">${rows}</table>`,
      })
    }

    const summary = {
      lanes: [...lanes],
      due_members: dueAccounts.length,
      candidate_events: candidateEvents.length,
      candidate_leads: candidateLeads.length,
      sent,
      previewed: results.filter(r => r.status === 'previewed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'failed').length,
      dry_run: dryRun,
      errors: errors.length,
    }
    await completeRun(runId, {
      status: errors.length > 0 ? 'partial' : 'success',
      summary,
      error: errors.length > 0 ? errors.join('; ') : null,
    })

    return NextResponse.json({ success: true, dryRun, ...summary, results })
  } catch (err) {
    console.error('[press-notify] Fatal error:', err.message)
    await completeRun(runId, { status: 'error', error: err.message })
    return NextResponse.json({ error: 'Press notify failed', detail: err.message }, { status: 500 })
  }
}
