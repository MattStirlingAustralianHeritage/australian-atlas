import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LISTING_REGION_SELECT } from '@/lib/regions'
import { renderEmail, REPLY_TO } from '@/lib/outreach/template'
import { isWithinSendWindow, SEND_WINDOW_LABEL } from '@/lib/outreach/sendWindow'
import {
  FROM, ADMIN_EMAIL, filterSendable, sendCampaign, unsubscribeUrl, removeListingUrl, newCampaignId,
} from '@/lib/outreach/sendEngine'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEFAULT_CAP = 100
const MAX_CAP = 500
const TEST_SAMPLE = 3

/**
 * POST /api/admin/outreach/send
 * Send a batch outreach campaign. Eligibility, compliance and bookkeeping live
 * in lib/outreach/sendEngine (shared with the autopilot cron).
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
 *   personal_notes?: { [listing_id]: string }  // UI-edited opener overrides
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
  const testEmail = (body.testEmail || ADMIN_EMAIL).trim()
  const cap = Math.min(Math.max(Number(body.cap) || DEFAULT_CAP, 1), MAX_CAP)
  const campaignName = (body.campaignName || '').trim() || null
  const notesOverride = body.personal_notes && typeof body.personal_notes === 'object' ? body.personal_notes : {}

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
    .select(`id, name, slug, vertical, region, state, suburb, description, is_claimed, status, ${LISTING_REGION_SELECT}`)
    .in('id', listingIds.slice(0, MAX_CAP * 2))
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })
  const listingById = new Map((listings || []).map((l) => [l.id, l]))

  const { data: orows } = await sb
    .from('operator_outreach')
    .select('id, listing_id, contact_email, send_status, personal_note')
    .in('listing_id', listingIds.slice(0, MAX_CAP * 2))
  const outreachByListing = new Map((orows || []).map((r) => [r.listing_id, r]))

  const candidates = listingIds.map((id) => ({
    listing: listingById.get(id) || null,
    outreach: outreachByListing.get(id) || null,
  }))

  const { recipients, skips } = await filterSendable({ sb, candidates, notesOverride })
  const eligibleCount = recipients.length
  const capped = recipients.slice(0, cap)
  const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://australianatlas.com.au').replace(/\/$/, '')

  // ---- Dry run: return the plan, send nothing. ----
  if (dryRun) {
    const sample = capped.slice(0, 3).map((r) => {
      const rendered = renderEmail({ subject, body: emailBody, listing: r.listing, origin: ORIGIN, unsubscribeUrl: unsubscribeUrl(r.email), removeUrl: removeListingUrl(r.email, r.listing?.id), personalNote: r.personalNote })
      return { name: r.listing.name, email: r.email, subject: rendered.subject }
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

  // ---- Test mode: render real recipients but deliver a small sample to the admin. ----
  if (testMode) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const sample = capped.slice(0, TEST_SAMPLE)
    const previewCid = newCampaignId('test')
    const payloads = sample.map((r) => {
      const unsub = unsubscribeUrl(r.email)
      const rendered = renderEmail({ subject, body: emailBody, listing: r.listing, origin: ORIGIN, unsubscribeUrl: unsub, removeUrl: removeListingUrl(r.email, r.listing?.id), personalNote: r.personalNote, campaignId: previewCid })
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

  // ---- Real send via the shared engine. ----
  if (!isWithinSendWindow()) {
    return NextResponse.json({ error: `Outreach email only goes out ${SEND_WINDOW_LABEL}. Test sends to yourself still work — real batches resume at 9am.` }, { status: 400 })
  }
  const { campaignId, sent, failed, errors } = await sendCampaign({
    sb,
    recipients: capped,
    subject,
    body: emailBody,
    campaignName,
    kind: 'manual',
    segment: { listing_ids: listingIds.length, cap },
  })

  // Fold the skip totals into the campaign row for the history view.
  await sb.from('outreach_campaigns').update({
    skipped: eligibleCount - capped.length + Object.values(skips).reduce((a, b) => a + b, 0),
  }).eq('id', campaignId)

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
