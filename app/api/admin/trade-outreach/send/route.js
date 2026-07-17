import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { renderTradeEmail, REPLY_TO } from '@/lib/outreach/tradeTemplate'
import { unsubscribeUrl } from '@/lib/outreach/sendEngine'
import { filterSendableTrade, sendTradeCampaign, newCampaignId, fetchNetworkCount } from '@/lib/outreach/tradeSend'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const FROM = 'Matt at Australian Atlas <matt@australianatlas.com.au>'
const TEST_TO = 'matt@australianatlas.com.au'
const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://australianatlas.com.au').replace(/\/$/, '')

const DEFAULT_CAP = 50
const MAX_CAP = 500
const TEST_SAMPLE = 3

/**
 * POST /api/admin/trade-outreach/send
 * Send a trade outreach campaign.
 *
 * Body: {
 *   trade_ids: string[],      // vetted recipients from the segment UI
 *   subject: string,          // may contain {{merge tokens}}
 *   body: string,
 *   dryRun?: boolean,
 *   testMode?: boolean,       // deliver a small sample to the admin instead
 *   testEmail?: string,
 *   cap?: number,             // max real sends this run (default 50, max 500)
 *   campaignName?: string,
 *   personal_notes?: { [trade_id]: string },  // UI-edited opener overrides
 * }
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const tradeIds = Array.isArray(body.trade_ids) ? body.trade_ids : []
  const subject = (body.subject || '').trim()
  const emailBody = (body.body || '').trim()
  const dryRun = !!body.dryRun
  const testMode = !!body.testMode
  const testEmail = (body.testEmail || TEST_TO).trim()
  const cap = Math.min(Math.max(Number(body.cap) || DEFAULT_CAP, 1), MAX_CAP)
  const campaignName = (body.campaignName || '').trim() || null
  const notesOverride = body.personal_notes && typeof body.personal_notes === 'object' ? body.personal_notes : {}

  if (tradeIds.length === 0) {
    return NextResponse.json({ error: 'No recipients selected' }, { status: 400 })
  }
  if (!subject || !emailBody) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Re-validate every company server-side — never trust the client's list.
  const { data: rows, error: cErr } = await sb
    .from('trade_outreach')
    .select('id, company_name, org_type, state, region_id, region_name, contact_email, send_status, status, personal_note, regions:region_id (id, name, slug, state, listing_count)')
    .in('id', tradeIds.slice(0, MAX_CAP * 2))
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  const { recipients, skips } = await filterSendableTrade({ sb, rows: rows || [], notesOverride })
  const eligibleCount = recipients.length
  const capped = recipients.slice(0, cap)

  // ---- Dry run: return the plan, send nothing. ----
  if (dryRun) {
    const networkCount = await fetchNetworkCount(sb)
    const sample = capped.slice(0, 3).map((r) => {
      const rendered = renderTradeEmail({ subject, body: emailBody, company: r.company, region: r.region, origin: ORIGIN, unsubscribeUrl: unsubscribeUrl(r.email, ORIGIN), personalNote: r.personalNote, networkCount })
      return { name: r.company.company_name, email: r.email, subject: rendered.subject }
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

  // ---- Test mode: render real recipients but deliver a sample to the admin. ----
  if (testMode) {
    const networkCount = await fetchNetworkCount(sb)
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const sample = capped.slice(0, TEST_SAMPLE)
    const payloads = sample.map((r) => {
      const unsub = unsubscribeUrl(r.email, ORIGIN)
      const rendered = renderTradeEmail({ subject, body: emailBody, company: r.company, region: r.region, origin: ORIGIN, unsubscribeUrl: unsub, personalNote: r.personalNote, networkCount })
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

  // ---- Real send (shared engine). ----
  const campaignId = newCampaignId('trade')
  const result = await sendTradeCampaign({
    sb,
    recipients: capped,
    subject,
    body: emailBody,
    campaignId,
    campaignName,
    kind: 'manual',
    segment: { trade_ids: tradeIds.length, cap },
  })

  return NextResponse.json({
    ok: result.failed === 0,
    campaignId: result.campaignId,
    eligible: eligibleCount,
    attempted: capped.length,
    sent: result.sent,
    failed: result.failed,
    skips,
    errors: result.errors.slice(0, 5),
  })
}
