import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkRateLimit } from '@/lib/rate-limit'

// Notice-and-takedown intake. Persists an infringement_reports row, then emails
// the team. INTERIM process — final wording/process pending solicitor review.

const NOTIFY_EMAIL = 'matt@australianatlas.com.au'

// Escape reporter-supplied values interpolated into the outbound email HTML.
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

const isValidEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

async function sendNotification(report) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[report-infringement] RESEND_API_KEY not set — skipping notification email')
    return
  }
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://australianatlas.com.au'
  const rows = [
    ['Listing', report.listing_slug ? `${baseUrl}/place/${report.listing_slug}` : '—'],
    ['Reporter', `${report.reporter_name || '—'} (${report.reporter_email || 'no email'})`],
    ['Rights basis', report.rights_basis || '—'],
    ['Allegedly infringing URL', report.allegedly_infringing_url || '—'],
    ['Good-faith statement', report.good_faith_statement ? 'Yes' : 'No'],
    ['Description', report.description || '—'],
  ]
  const tableRows = rows
    .map(([k, v]) => `<tr><td style="padding:8px 0;color:#6b6560;width:170px;vertical-align:top;">${escHtml(k)}</td><td style="padding:8px 0;color:#1a1614;">${escHtml(v)}</td></tr>`)
    .join('')
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'Australian Atlas <noreply@australianatlas.com.au>',
      to: NOTIFY_EMAIL,
      replyTo: isValidEmail(report.reporter_email) ? report.reporter_email.trim() : NOTIFY_EMAIL,
      subject: `Infringement report: ${report.listing_slug || 'a listing'}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 0;">
          <h2 style="font-size:22px;color:#1a1614;margin-bottom:6px;">New infringement report</h2>
          <p style="color:#6b6560;font-size:13px;margin:0 0 16px;">Status: received. Triage in the admin console.</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${tableRows}</table>
          <a href="${baseUrl}/admin/infringement-reports" style="display:inline-block;background:#5f8a7e;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:500;">Open admin queue</a>
        </div>
      `,
    })
    console.log('[report-infringement] Notification sent to', NOTIFY_EMAIL)
  } catch (err) {
    console.error('[report-infringement] Email error:', err.message)
  }
}

export async function POST(request) {
  const rl = checkRateLimit(request, { keyPrefix: 'infringement', maxRequests: 8, windowMs: 60_000 })
  if (rl) return rl
  try {
    const body = await request.json()
    const reporterName = (body.reporter_name || '').toString().trim()
    const reporterEmail = (body.reporter_email || '').toString().trim()
    const rightsBasis = (body.rights_basis || '').toString().trim()
    const description = (body.description || '').toString().trim()
    const allegedlyInfringingUrl = (body.allegedly_infringing_url || '').toString().trim() || null
    const listingSlug = (body.listing_slug || '').toString().trim() || null
    const goodFaith = body.good_faith_statement === true

    // Required for a takedown notice we can act on.
    if (!reporterName || !isValidEmail(reporterEmail) || !rightsBasis || !description) {
      return NextResponse.json(
        { error: 'Please provide your name, a valid email, the basis of your rights, and a description.' },
        { status: 400 }
      )
    }
    if (!goodFaith) {
      return NextResponse.json(
        { error: 'Please confirm the good-faith statement to submit a report.' },
        { status: 400 }
      )
    }

    const sb = getSupabaseAdmin()
    const insertRow = {
      listing_slug: listingSlug,
      reporter_name: reporterName,
      reporter_email: reporterEmail,
      rights_basis: rightsBasis,
      allegedly_infringing_url: allegedlyInfringingUrl,
      description,
      good_faith_statement: true,
      status: 'received',
    }
    const { data, error } = await sb
      .from('infringement_reports')
      .insert(insertRow)
      .select('id')
      .single()

    if (error) {
      console.error('[report-infringement] Insert error:', error.message)
      return NextResponse.json({ error: 'Could not submit your report. Please try again.' }, { status: 500 })
    }

    // Notify the team (best-effort — never blocks the report being recorded).
    await sendNotification(insertRow)

    return NextResponse.json({ success: true, id: data?.id, message: 'Your report has been received. We will review it promptly.' })
  } catch (err) {
    console.error('[report-infringement] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
