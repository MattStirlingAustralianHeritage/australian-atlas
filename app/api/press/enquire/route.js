import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { PRESS_CONTACT_EMAIL } from '@/lib/press/config'

// Beta access request for the Newsroom — the council enquire pattern: persist
// the lead best-effort, notify the press desk, always succeed to the user.
// No account is created here; an admin provisions one at /admin/press.

// ── Rate limiter (5 enquiries per hour per IP) ──────────────────────────────
const _rateWindows = new Map()
function _checkRate(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const now = Date.now()
  const windowMs = 3_600_000 // 1 hour
  let entry = _rateWindows.get(ip)
  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 0 }
    _rateWindows.set(ip, entry)
  }
  entry.count++
  if (entry.count > 5) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    )
  }
  return null
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(request) {
  const rateLimited = _checkRate(request)
  if (rateLimited) return rateLimited

  const body = await request.json()
  const { name, outlet, outletType, email, regions, message } = body

  if (!name || !email || !outlet) {
    return NextResponse.json(
      { error: 'Name, outlet, and email are required' },
      { status: 400 }
    )
  }

  // Persist the lead (best-effort — an insert failure must not block the
  // enquiry; the press desk is still notified below).
  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.from('press_enquiries').insert({
      name: String(name).slice(0, 200),
      outlet: String(outlet).slice(0, 200),
      outlet_type: outletType ? String(outletType).slice(0, 50) : null,
      email: String(email).slice(0, 200).toLowerCase(),
      regions: regions ? String(regions).slice(0, 500) : null,
      message: message ? String(message).slice(0, 2000) : null,
      source: 'for-press-beta',
    })
    if (error) console.error('Press enquiry persist error:', error.message)
  } catch (err) {
    console.error('Press enquiry persist exception:', err)
  }

  const safeName = escapeHtml(name)
  const safeOutlet = escapeHtml(outlet)
  const safeType = escapeHtml(outletType)
  const safeEmail = escapeHtml(email)
  const safeRegions = escapeHtml(regions)
  const safeMessage = escapeHtml(message)

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: PRESS_CONTACT_EMAIL,
        subject: `Newsroom access request — ${safeOutlet}`,
        html: `
          <h2>New Newsroom access request</h2>
          <p><strong>Name:</strong> ${safeName}</p>
          <p><strong>Outlet:</strong> ${safeOutlet}</p>
          ${safeType ? `<p><strong>Type:</strong> ${safeType}</p>` : ''}
          <p><strong>Email:</strong> ${safeEmail}</p>
          ${safeRegions ? `<p><strong>Covers:</strong> ${safeRegions}</p>` : ''}
          ${safeMessage ? `<p><strong>Message:</strong> ${safeMessage}</p>` : ''}
          <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'}/admin/press">Review in the press admin</a></p>
        `,
      }),
    })

    if (!res.ok) {
      console.error('Resend error:', await res.text())
    }
  } catch (err) {
    console.error('Email send error:', err)
  }

  return NextResponse.json({ success: true })
}
