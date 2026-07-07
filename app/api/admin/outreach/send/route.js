import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'node:crypto'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LISTING_REGION_SELECT } from '@/lib/regions'
import { renderEmail, REPLY_TO } from '@/lib/outreach/template'
import { signUnsubscribeToken } from '@/lib/outreach/unsubscribeToken'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const FROM = 'Matt at Australian Atlas <matt@australianatlas.com.au>'
const TEST_TO = 'matt@australianatlas.com.au'
const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://australianatlas.com.au').replace(/\/$/, '')

const BATCH_SIZE = 100
const BATCH_DELAY_MS = 600
const DEFAULT_CAP = 100
const MAX_CAP = 500
const TEST_SAMPLE = 3

const UNSENDABLE_STATUSES = new Set(['sent', 'bounced', 'complained', 'unsubscribed'])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function unsubscribeUrl(email) {
  return `${ORIGIN}/api/outreach/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(email))}`
}

/**
 * POST /api/admin/outreach/send
 * Send a batch outreach campaign.
 *
 * Body: {
 *   listing_ids: string[],   // vetted recipients from the segment UI
 *   subject: string,         // may contain {{merge tokens}}
 *   body: string,            // may contain {{merge tokens}}
 *   dryRun?: boolean,        // compute the plan, send nothing
 *   testMode?: boolean,      // send a small sample to the admin instead of recipients
 *   testEmail?: string,      // override the test recipient
 *   cap?: number,            // max real sends this run (default 100, max 500)
 *   campaignName?: string,
 * }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const listingIds = Array.isArray(body.listing_ids) ? body.listing_ids : []
  const subject = (body.subject || '').trim()
  const emailBody = (body.body || '').trim()
  const dryRun = !!body.dryRun
  const testMode = !!body.testMode
  const testEmail = (body.testEmail || TEST_TO).trim()
  const cap = Math.min(Math.max(Number(body.cap) || DEFAULT_CAP, 1), MAX_CAP)
  const campaignName = (body.campaignName || '').trim() || null

  if (listingIds.length === 0) {
    return NextResponse.json({ error: 'No recipients selected' }, { status: 400 })
  }
  if (!subject || !emailBody) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Re-validate every listing server-side — never trust the client's list.
  const { data: listings, error: lErr } = await sb
    .from('listings')
    .select(`id, name, slug, vertical, region, state, is_claimed, status, ${LISTING_REGION_SELECT}`)
    .in('id', listingIds.slice(0, MAX_CAP * 2))
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })

  const listingById = new Map((listings || []).map((l) => [l.id, l]))

  // Outreach rows (source of the contact email + prior send state).
  const { data: orows } = await sb
    .from('operator_outreach')
    .select('id, listing_id, contact_email, send_status')
    .in('listing_id', listingIds.slice(0, MAX_CAP * 2))
  const outreachByListing = new Map((orows || []).map((r) => [r.listing_id, r]))

  // Suppression set.
  const allEmails = [...outreachByListing.values()].map((r) => r.contact_email).filter(Boolean)
  const suppressed = new Set()
  if (allEmails.length) {
    const lowered = [...new Set(allEmails.map((e) => e.toLowerCase()))]
    const { data: srows } = await sb.from('outreach_suppressions').select('email').in('email', lowered)
    for (const s of srows || []) suppressed.add(s.email.toLowerCase())
  }

  // Build the eligible recipient list, tracking why each is skipped.
  const skips = { no_listing: 0, not_active: 0, claimed: 0, no_email: 0, suppressed: 0, already_sent: 0, duplicate_email: 0 }
  const recipients = []
  const seenEmails = new Set()

  for (const id of listingIds) {
    const listing = listingById.get(id)
    if (!listing) { skips.no_listing++; continue }
    if (listing.status !== 'active') { skips.not_active++; continue }
    if (listing.is_claimed) { skips.claimed++; continue }
    const o = outreachByListing.get(id)
    const email = o?.contact_email
    if (!email) { skips.no_email++; continue }
    const lower = email.toLowerCase()
    if (suppressed.has(lower)) { skips.suppressed++; continue }
    if (UNSENDABLE_STATUSES.has(o.send_status)) { skips.already_sent++; continue }
    if (seenEmails.has(lower)) { skips.duplicate_email++; continue }
    seenEmails.add(lower)
    recipients.push({ listing, outreachId: o.id, email })
  }

  const eligibleCount = recipients.length
  const capped = recipients.slice(0, cap)

  // ---- Dry run: return the plan, send nothing. ----
  if (dryRun) {
    const sample = capped.slice(0, 3).map((r) => {
      const rendered = renderEmail({ subject, body: emailBody, listing: r.listing, origin: ORIGIN, unsubscribeUrl: unsubscribeUrl(r.email) })
      return { name: r.listing.name, email: r.email, subject: rendered.subject }
    })
    return NextResponse.json({
      ok: true,
      dryRun: true,
      eligible: eligibleCount,
      wouldSend: capped.length,
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

  // ---- Test mode: render real recipients but deliver a small sample to the admin. ----
  if (testMode) {
    const sample = capped.slice(0, TEST_SAMPLE)
    const payloads = sample.map((r) => {
      const unsub = unsubscribeUrl(r.email)
      const rendered = renderEmail({ subject, body: emailBody, listing: r.listing, origin: ORIGIN, unsubscribeUrl: unsub })
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
      const rendered = renderEmail({ subject, body: emailBody, listing: r.listing, origin: ORIGIN, unsubscribeUrl: unsub })
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
        await sb.from('operator_outreach').update({
          send_status: 'failed', send_error: chunkError.slice(0, 300), campaign_id: campaignId, updated_at: now(),
        }).eq('id', r.outreachId)
      } else {
        sent++
        await sb.from('operator_outreach').update({
          send_status: 'sent',
          resend_message_id: ids[j] || null,
          sent_at: now(),
          status: 'contacted',
          last_contacted_at: now(),
          campaign_id: campaignId,
          send_error: null,
          updated_at: now(),
        }).eq('id', r.outreachId)
      }
    }
    if (chunkError) errors.push(chunkError)

    if (i + BATCH_SIZE < capped.length) await sleep(BATCH_DELAY_MS)
  }

  // Record the campaign summary.
  await sb.from('outreach_campaigns').insert({
    id: campaignId,
    name: campaignName,
    subject,
    body: emailBody,
    segment: { listing_ids: listingIds.length, cap },
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
