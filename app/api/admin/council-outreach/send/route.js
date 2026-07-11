import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'node:crypto'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { renderCouncilEmail, REPLY_TO } from '@/lib/outreach/councilTemplate'
import { signUnsubscribeToken } from '@/lib/outreach/unsubscribeToken'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const FROM = 'Matt at Australian Atlas <matt@australianatlas.com.au>'
const TEST_TO = 'matt@australianatlas.com.au'
const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://australianatlas.com.au').replace(/\/$/, '')

const BATCH_SIZE = 100
const BATCH_DELAY_MS = 600
const DEFAULT_CAP = 50
const MAX_CAP = 500
const TEST_SAMPLE = 3

const UNSENDABLE_STATUSES = new Set(['sent', 'bounced', 'complained', 'unsubscribed'])

// Same guard as the operator send route: Resend rejects the WHOLE batch.send()
// call if any single `to` is malformed, so one bad address must never reach a
// payload. Linear + anchored, requires a real ≥2-char TLD.
function isSendableEmail(email) {
  if (typeof email !== 'string') return false
  const e = email.trim()
  if (e.length < 6 || e.length > 254) return false
  if (/[\s<>(),;:"\\]/.test(e)) return false
  return /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9.-]+\.[a-z]{2,24}$/i.test(e)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function unsubscribeUrl(email) {
  return `${ORIGIN}/api/outreach/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(email))}`
}

/**
 * POST /api/admin/council-outreach/send
 * Send a council outreach campaign.
 *
 * Body: {
 *   council_ids: string[],    // vetted recipients from the segment UI
 *   subject: string,          // may contain {{merge tokens}}
 *   body: string,
 *   dryRun?: boolean,
 *   testMode?: boolean,       // deliver a small sample to the admin instead
 *   testEmail?: string,
 *   cap?: number,             // max real sends this run (default 50, max 500)
 *   campaignName?: string,
 *   personal_notes?: { [council_id]: string },  // UI-edited opener overrides
 * }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const councilIds = Array.isArray(body.council_ids) ? body.council_ids : []
  const subject = (body.subject || '').trim()
  const emailBody = (body.body || '').trim()
  const dryRun = !!body.dryRun
  const testMode = !!body.testMode
  const testEmail = (body.testEmail || TEST_TO).trim()
  const cap = Math.min(Math.max(Number(body.cap) || DEFAULT_CAP, 1), MAX_CAP)
  const campaignName = (body.campaignName || '').trim() || null
  const notesOverride = body.personal_notes && typeof body.personal_notes === 'object' ? body.personal_notes : {}

  if (councilIds.length === 0) {
    return NextResponse.json({ error: 'No recipients selected' }, { status: 400 })
  }
  if (!subject || !emailBody) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Re-validate every council server-side — never trust the client's list.
  const { data: councils, error: cErr } = await sb
    .from('council_outreach')
    .select('id, council_name, state, region_id, region_name, contact_email, send_status, status, personal_note, regions:region_id (id, name, slug, state, listing_count)')
    .in('id', councilIds.slice(0, MAX_CAP * 2))
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  const councilById = new Map((councils || []).map((c) => [c.id, c]))

  // Suppression set.
  const allEmails = (councils || []).map((c) => c.contact_email).filter(Boolean)
  const suppressed = new Set()
  if (allEmails.length) {
    const lowered = [...new Set(allEmails.map((e) => e.toLowerCase()))]
    const { data: srows } = await sb.from('outreach_suppressions').select('email').in('email', lowered)
    for (const s of srows || []) suppressed.add(s.email.toLowerCase())
  }

  // Councils that already hold a provisioned account are partners, not
  // prospects — the analogue of an operator's claimed listing.
  const partnerEmails = new Set()
  try {
    const { data: accounts } = await sb.from('council_accounts').select('contact_email')
    for (const a of accounts || []) if (a.contact_email) partnerEmails.add(a.contact_email.toLowerCase())
  } catch { /* table always exists in prod; guard is belt-and-braces */ }

  // Build the eligible recipient list, tracking why each is skipped.
  const skips = { no_council: 0, onboarded: 0, already_partner: 0, no_email: 0, invalid_email: 0, suppressed: 0, already_sent: 0, duplicate_email: 0 }
  const recipients = []
  const seenEmails = new Set()

  for (const id of councilIds) {
    const council = councilById.get(id)
    if (!council) { skips.no_council++; continue }
    if (council.status === 'onboarded') { skips.onboarded++; continue }
    const email = council.contact_email
    if (!email) { skips.no_email++; continue }
    if (!isSendableEmail(email)) { skips.invalid_email++; continue }
    const lower = email.toLowerCase()
    if (partnerEmails.has(lower)) { skips.already_partner++; continue }
    if (suppressed.has(lower)) { skips.suppressed++; continue }
    if (UNSENDABLE_STATUSES.has(council.send_status)) { skips.already_sent++; continue }
    if (seenEmails.has(lower)) { skips.duplicate_email++; continue }
    seenEmails.add(lower)
    const overridden = Object.prototype.hasOwnProperty.call(notesOverride, id)
    const personalNote = overridden ? String(notesOverride[id] || '') : (council.personal_note || '')
    recipients.push({ council, region: council.regions || null, email, personalNote, noteEdited: overridden })
  }

  const eligibleCount = recipients.length
  const capped = recipients.slice(0, cap)

  // ---- Dry run: return the plan, send nothing. ----
  if (dryRun) {
    const sample = capped.slice(0, 3).map((r) => {
      const rendered = renderCouncilEmail({ subject, body: emailBody, council: r.council, region: r.region, origin: ORIGIN, unsubscribeUrl: unsubscribeUrl(r.email), personalNote: r.personalNote })
      return { name: r.council.council_name, email: r.email, subject: rendered.subject }
    })
    const withNote = capped.filter((r) => r.personalNote).length
    return NextResponse.json({
      ok: true,
      dryRun: true,
      eligible: eligibleCount,
      wouldSend: capped.length,
      withPersonalNote: withNote,
      cap,
      skips,
      sample,
    })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  const campaignId = `cmp_${new Date().toISOString().slice(0, 10)}_${crypto.randomBytes(3).toString('hex')}`
  const now = () => new Date().toISOString()

  // ---- Test mode: render real recipients but deliver a sample to the admin. ----
  if (testMode) {
    const sample = capped.slice(0, TEST_SAMPLE)
    const payloads = sample.map((r) => {
      const unsub = unsubscribeUrl(r.email)
      const rendered = renderCouncilEmail({ subject, body: emailBody, council: r.council, region: r.region, origin: ORIGIN, unsubscribeUrl: unsub, personalNote: r.personalNote })
      return {
        from: FROM,
        to: testEmail,
        replyTo: REPLY_TO,
        subject: `[TEST → ${r.email}] ${rendered.subject}`,
        html: rendered.html,
        text: rendered.text,
      }
    })
    let sent = 0
    const errors = []
    if (payloads.length) {
      try {
        const { error } = await resend.batch.send(payloads)
        if (error) errors.push(error.message || String(error))
        else sent = payloads.length
      } catch (err) {
        errors.push(err.message)
      }
    }
    return NextResponse.json({ ok: errors.length === 0, testMode: true, sentToAdmin: sent, testEmail, eligible: eligibleCount, errors })
  }

  // ---- Real send. ----
  let sent = 0
  let failed = 0
  const errors = []

  for (let i = 0; i < capped.length; i += BATCH_SIZE) {
    const chunk = capped.slice(i, i + BATCH_SIZE)
    const payloads = chunk.map((r) => {
      const unsub = unsubscribeUrl(r.email)
      const rendered = renderCouncilEmail({ subject, body: emailBody, council: r.council, region: r.region, origin: ORIGIN, unsubscribeUrl: unsub, personalNote: r.personalNote })
      return {
        from: FROM,
        to: r.email,
        replyTo: REPLY_TO,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          'List-Unsubscribe': `<${unsub}>, <mailto:${REPLY_TO}?subject=unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }
    })

    let ids = []
    let chunkError = null
    try {
      const { data, error } = await resend.batch.send(payloads)
      if (error) chunkError = error.message || String(error)
      else ids = (data?.data || []).map((d) => d?.id || null)
    } catch (err) {
      chunkError = err.message
    }

    // Persist per-recipient outcome.
    for (let j = 0; j < chunk.length; j++) {
      const r = chunk[j]
      if (chunkError) {
        failed++
        await sb.from('council_outreach').update({
          send_status: 'failed', send_error: chunkError.slice(0, 300), campaign_id: campaignId, updated_at: now(),
        }).eq('id', r.council.id)
      } else {
        sent++
        const upd = {
          send_status: 'sent',
          resend_message_id: ids[j] || null,
          sent_at: now(),
          status: 'contacted',
          last_contacted_at: now(),
          campaign_id: campaignId,
          send_error: null,
          updated_at: now(),
        }
        // Persist an edited opener so the sent record matches what went out.
        if (r.noteEdited) upd.personal_note = r.personalNote || null
        await sb.from('council_outreach').update(upd).eq('id', r.council.id)
      }
    }
    if (chunkError) errors.push(chunkError)

    if (i + BATCH_SIZE < capped.length) await sleep(BATCH_DELAY_MS)
  }

  // Record the campaign summary (audience 'council' keeps the two outreach
  // histories separable in one table).
  await sb.from('outreach_campaigns').insert({
    id: campaignId,
    name: campaignName,
    subject,
    body: emailBody,
    segment: { council_ids: councilIds.length, cap },
    audience: 'council',
    total: capped.length,
    sent,
    failed,
    skipped: eligibleCount - capped.length + Object.values(skips).reduce((a, b) => a + b, 0),
    test_mode: false,
    status: 'sent',
    created_by: 'admin',
    created_at: now(),
    sent_at: now(),
  })

  return NextResponse.json({
    ok: failed === 0,
    campaignId,
    eligible: eligibleCount,
    attempted: capped.length,
    sent,
    failed,
    skips,
    errors: errors.slice(0, 5),
  })
}
