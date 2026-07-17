import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { provisionPress } from '@/lib/press-provision'

// Self-serve Newsroom signup — the council enquire pattern. A working-press
// signup provisions its own account immediately (approved + active) and gets a
// sign-in email; no admin has to provision it by hand. We still persist the
// lead and notify the press desk, so signups are auditable and can be suspended
// in one click from /admin/press if a signup isn't genuine press. If
// provisioning fails for any reason the request still succeeds as a held lead.

// ── Rate limiter (5 signups per hour per IP) ────────────────────────────────
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

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim())

export async function POST(request) {
  const rateLimited = _checkRate(request)
  if (rateLimited) return rateLimited

  const body = await request.json().catch(() => ({}))
  const { name, outlet, outletType, email, regions, message } = body

  if (!name || !email || !outlet) {
    return NextResponse.json(
      { error: 'Name, outlet, and email are required' },
      { status: 400 }
    )
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const normEmail = String(email).slice(0, 200).toLowerCase().trim()

  // ── Persist the lead (best-effort — an insert failure must not block the
  // signup; provisioning + the press-desk notification still run below). ────
  let enquiryId = null
  try {
    const { data, error } = await sb.from('press_enquiries').insert({
      name: String(name).slice(0, 200),
      outlet: String(outlet).slice(0, 200),
      outlet_type: outletType ? String(outletType).slice(0, 50) : null,
      email: normEmail,
      regions: regions ? String(regions).slice(0, 500) : null,
      message: message ? String(message).slice(0, 2000) : null,
      source: 'newsroom-signup',
    }).select('id').single()
    if (error) console.error('Press enquiry persist error:', error.message)
    else enquiryId = data?.id || null
  } catch (err) {
    console.error('Press enquiry persist exception:', err)
  }

  // ── Provision the account immediately and email the sign-in link ─────────
  // Provisioning failure must never break the signup — fall back to "held".
  let activated = false
  try {
    const result = await provisionPress({
      contactEmail: normEmail,
      name: String(name).trim(),
      outlet: String(outlet).trim(),
      outletType,
      sendEmail: true,
    })
    activated = !!result?.emailSent
    // Mark the lead handled so the admin inbox doesn't show it as pending.
    if (enquiryId && activated) {
      try {
        await sb.from('press_enquiries').update({ status: 'approved' }).eq('id', enquiryId)
      } catch (err) {
        console.error('Press enquiry status update error:', err?.message || err)
      }
    }
  } catch (err) {
    console.error('Press auto-provision error:', err?.message || err)
    activated = false
  }

  // ── Notify the press desk of the signup + what happened ──────────────────
  const safeName = escapeHtml(name)
  const safeOutlet = escapeHtml(outlet)
  const safeType = escapeHtml(outletType)
  const safeEmail = escapeHtml(normEmail)
  const safeRegions = escapeHtml(regions)
  const safeMessage = escapeHtml(message)
  const outcome = activated
    ? '<p style="color:#166534;"><strong>&#10003; Auto-provisioned</strong> — Newsroom account created and sign-in email sent.</p>'
    : '<p style="color:#B8860B;"><strong>Held</strong> — account not provisioned automatically; review &amp; provision in the press admin.</p>'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: 'editor@australianatlas.com.au',
        subject: `Newsroom signup — ${safeOutlet}${activated ? ' (auto-provisioned)' : ''}`,
        html: `
          <h2>New Newsroom signup</h2>
          ${outcome}
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

  return NextResponse.json({ success: true, activated })
}
