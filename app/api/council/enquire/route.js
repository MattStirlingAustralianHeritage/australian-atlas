import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

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
      { error: 'Too many enquiries. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    )
  }
  return null
}

// ── HTML sanitisation ────────────────────────────────────────────────────────
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
  const { name, organisation, email, region, role, plan, message } = body

  // Plan is optional now the council portal is a free founding beta — the
  // landing-page CTA sends enquirers here without preselecting a tier. Role is
  // the enquirer's job title at the council/organisation.
  if (!name || !organisation || !email || !region || !role) {
    return NextResponse.json(
      { error: 'Name, organisation, email, region, and role are required' },
      { status: 400 }
    )
  }

  // Persist the lead (best-effort). RLS-locked table, service-role write. A
  // missing table (migration 180 not yet applied) or any insert failure must
  // NOT block the enquiry — councils@ is still notified below and the user
  // still sees success, mirroring the best-effort email path.
  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.from('council_enquiries').insert({
      name: String(name).slice(0, 200),
      organisation: String(organisation).slice(0, 200),
      email: String(email).slice(0, 200),
      region: String(region).slice(0, 500),
      role: String(role).slice(0, 200),
      plan: plan ? String(plan).slice(0, 100) : null,
      message: message ? String(message).slice(0, 2000) : null,
      source: 'for-councils-beta',
    })
    if (error) console.error('Council enquiry persist error:', error.message)
  } catch (err) {
    console.error('Council enquiry persist exception:', err)
  }

  // Sanitise all user input before embedding in HTML
  const safeName = escapeHtml(name)
  const safeOrg = escapeHtml(organisation)
  const safeEmail = escapeHtml(email)
  const safeRegion = escapeHtml(region)
  const safeRole = escapeHtml(role)
  const safePlan = escapeHtml(plan)
  const safeMessage = escapeHtml(message)

  // Send email via Resend
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: 'councils@australianatlas.com.au',
        subject: `Council enquiry — ${safeOrg}${safePlan ? ` (${safePlan})` : ''}`,
        html: `
          <h2>New council portal enquiry</h2>
          <p><strong>Name:</strong> ${safeName}</p>
          <p><strong>Role:</strong> ${safeRole}</p>
          <p><strong>Organisation:</strong> ${safeOrg}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Region:</strong> ${safeRegion}</p>
          ${safePlan ? `<p><strong>Plan of interest:</strong> ${safePlan}</p>` : ''}
          ${safeMessage ? `<p><strong>Message:</strong> ${safeMessage}</p>` : ''}
        `,
      }),
    })

    if (!res.ok) {
      console.error('Resend error:', await res.text())
      // Still return success to the user
    }
  } catch (err) {
    console.error('Email send error:', err)
  }

  return NextResponse.json({ success: true })
}
