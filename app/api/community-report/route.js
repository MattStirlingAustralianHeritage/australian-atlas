import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkRateLimit } from '@/lib/rate-limit'

const REPORTS_EMAIL = 'listings@australianatlas.com.au'

const REPORT_LABELS = {
  permanently_closed: 'Permanently closed',
  temporarily_closed: 'Temporarily closed',
  incorrect_info: 'Something is incorrect',
  request_deletion: 'Removal / deletion requested',
  other: 'Other',
}

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/**
 * Notify the listings team of a community report. Best-effort — a send
 * failure never blocks the report from being recorded.
 */
async function sendReportEmail({ listing, reportType, details, contactEmail }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[community-report] RESEND_API_KEY not set — skipping notification email')
    return
  }

  const label = REPORT_LABELS[reportType] || reportType
  const isDeletion = reportType === 'request_deletion'
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://australianatlas.com.au'
  const placeUrl = listing.slug ? `${baseUrl}/place/${listing.slug}` : null
  const subject = isDeletion
    ? `Deletion request: ${listing.name || 'a listing'}`
    : `Listing report (${label}): ${listing.name || 'a listing'}`

  const rows = [
    ['Listing', listing.name || listing.id],
    ['Vertical', listing.vertical || '—'],
    ['Report type', label],
    contactEmail ? ['From', contactEmail] : null,
    details ? ['Details', details] : null,
  ].filter(Boolean)

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:#6b6560;width:120px;vertical-align:top;">${k}</td><td style="padding:8px 0;color:#1a1614;">${String(v).replace(/</g, '&lt;')}</td></tr>`
    )
    .join('')

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'Australian Atlas <noreply@australianatlas.com.au>',
      to: REPORTS_EMAIL,
      replyTo: isValidEmail(contactEmail) ? contactEmail.trim() : REPORTS_EMAIL,
      subject,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 0;">
          <h2 style="font-size:22px;color:#1a1614;margin-bottom:16px;">${isDeletion ? 'Listing deletion request' : 'New listing report'}</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${tableRows}</table>
          ${placeUrl ? `<a href="${placeUrl}" style="display:inline-block;background:#5f8a7e;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:500;">View listing</a>` : ''}
          <hr style="border:none;border-top:1px solid #e8e4df;margin:24px 0;" />
          <p style="color:#999;font-size:13px;">Australian Atlas — Community reports</p>
        </div>
      `,
    })
    console.log(`[community-report] Notification sent to ${REPORTS_EMAIL} (${reportType})`)
  } catch (err) {
    console.error('[community-report] Email error:', err.message)
  }
}

export async function POST(request) {
  const rl = checkRateLimit(request, { keyPrefix: 'report', maxRequests: 10, windowMs: 60_000 })
  if (rl) return rl
  try {
    const body = await request.json()
    const { listing_id, report_type, details } = body
    const contactEmail = isValidEmail(body.contact_email) ? body.contact_email.trim() : null

    if (!listing_id || !report_type) {
      return NextResponse.json({ error: 'listing_id and report_type required' }, { status: 400 })
    }

    const validTypes = ['permanently_closed', 'temporarily_closed', 'incorrect_info', 'request_deletion', 'other']
    if (!validTypes.includes(report_type)) {
      return NextResponse.json({ error: `report_type must be one of: ${validTypes.join(', ')}` }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // Fetch current listing
    const { data: listing, error: fetchErr } = await sb
      .from('listings')
      .select('id, name, slug, vertical, staleness_flags, community_reports')
      .eq('id', listing_id)
      .maybeSingle()

    if (fetchErr || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Build updated staleness_flags
    const flags = listing.staleness_flags || {}
    const reports = flags.community_reports || []
    reports.push({
      type: report_type,
      details: details || null,
      contact_email: contactEmail,
      submitted_at: new Date().toISOString(),
    })
    flags.community_reports = reports

    // Update listing
    const { error: updateErr } = await sb
      .from('listings')
      .update({
        staleness_flags: flags,
        community_reports: (listing.community_reports || 0) + 1,
      })
      .eq('id', listing_id)

    if (updateErr) {
      console.error('[community-report] Update error:', updateErr.message)
      return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 })
    }

    // Notify the listings team (best-effort — never blocks the report)
    await sendReportEmail({
      listing,
      reportType: report_type,
      details: details || null,
      contactEmail,
    })

    return NextResponse.json({ success: true, message: 'Thank you for your report. We will review it shortly.' })
  } catch (err) {
    console.error('[community-report] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
