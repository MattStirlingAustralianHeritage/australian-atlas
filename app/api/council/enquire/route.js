import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { provisionCouncil, isGovEmail } from '@/lib/council-provision'

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

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim())

export async function POST(request) {
  const rateLimited = _checkRate(request)
  if (rateLimited) return rateLimited

  const body = await request.json().catch(() => ({}))
  const { name, organisation, email, region, regionId, role, message } = body

  if (!name || !organisation || !email || !region || !role) {
    return NextResponse.json(
      { error: 'Name, organisation, email, region, and role are required' },
      { status: 400 }
    )
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const normEmail = String(email).trim().toLowerCase()

  // ── Resolve the chosen region against the real regions table ─────────────
  // The autocomplete sends a regionId; verify it and denormalise the name so the
  // admin inbox and provisioning know exactly which region is being joined.
  let resolvedRegionId = null
  let resolvedRegionName = null
  if (regionId) {
    try {
      const { data: r } = await sb
        .from('regions')
        .select('id, name')
        .eq('id', regionId)
        .maybeSingle()
      if (r) {
        resolvedRegionId = r.id
        resolvedRegionName = r.name
      }
    } catch { /* fall through to free-text region */ }
  }
  // Display label the enquirer saw (matched name if resolved, else what they typed).
  const regionLabel = resolvedRegionName || String(region).trim()

  // ── Persist the lead (best-effort; never blocks the enquiry) ─────────────
  let enquiryId = null
  try {
    const { data, error } = await sb
      .from('council_enquiries')
      .insert({
        name: String(name).slice(0, 200),
        organisation: String(organisation).slice(0, 200),
        email: normEmail.slice(0, 200),
        region: String(regionLabel).slice(0, 500),
        region_id: resolvedRegionId,
        region_name: resolvedRegionName,
        role: String(role).slice(0, 200),
        message: message ? String(message).slice(0, 2000) : null,
        source: 'for-councils-beta',
        status: 'new',
      })
      .select('id')
      .single()
    if (error) console.error('Council enquiry persist error:', error.message)
    else enquiryId = data?.id || null
  } catch (err) {
    console.error('Council enquiry persist exception:', err)
  }

  // ── Instant activation for government mailboxes ──────────────────────────
  // A .gov.au email + a matched region → provision immediately and email a
  // one-click login link. Everything else is held as a lead for admin review.
  // Provisioning failure must never break the enquiry — fall back to "held".
  let instant = false
  if (isGovEmail(normEmail) && resolvedRegionId) {
    try {
      const result = await provisionCouncil({
        contactEmail: normEmail,
        name: String(organisation).trim(),
        contactName: String(name).trim(),
        regionId: resolvedRegionId,
        regionName: resolvedRegionName,
        enquiryId,
        tier: 'partner',
        sendEmail: true,
      })
      instant = !!result?.emailSent
      // If the welcome email couldn't be sent, treat it as held so the user is
      // told we'll be in touch rather than "check your inbox" for nothing.
    } catch (err) {
      console.error('Council auto-provision error:', err?.message || err)
      instant = false
    }
  }

  // ── Acknowledgement email to the enquirer (held leads only) ──────────────
  // Auto-provisioned councils already received the welcome+login email.
  if (!instant && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: normEmail,
        subject: 'We received your Australian Atlas council enquiry',
        html: `
          <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:2rem;color:#2D2A26;">
            <h1 style="font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:1.5rem;margin:0 0 1rem;">Australian Atlas</h1>
            <p style="color:#4a463f;line-height:1.55;">Hi ${escapeHtml(String(name).trim())},</p>
            <p style="color:#4a463f;line-height:1.55;">Thanks for your interest in the Australian Atlas council portal for <strong>${escapeHtml(regionLabel)}</strong>. We're confirming your access now and you'll receive a sign-in link — usually within one business day.</p>
            <p style="color:#9a938a;font-size:0.85rem;line-height:1.5;margin-top:1.5rem;">Free while we're in founding beta — no card required. Questions? Reply here or reach us at councils@australianatlas.com.au.</p>
          </div>
        `,
      })
    } catch (err) {
      console.error('Council ack email error:', err?.message || err)
    }
  }

  // ── Notify councils@ (Matt) of the lead + what happened ───────────────────
  try {
    const safeName = escapeHtml(name)
    const safeOrg = escapeHtml(organisation)
    const safeEmail = escapeHtml(normEmail)
    const safeRegion = escapeHtml(regionLabel)
    const safeRole = escapeHtml(role)
    const safeMessage = escapeHtml(message)
    const outcome = instant
      ? '<p style="color:#166534;"><strong>&#10003; Auto-provisioned</strong> (government email) — welcome + login link sent.</p>'
      : '<p style="color:#B8860B;"><strong>Held for review</strong> — approve &amp; provision in the admin applications inbox.</p>'
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Australian Atlas <noreply@australianatlas.com.au>',
        to: 'councils@australianatlas.com.au',
        subject: `Council application — ${safeOrg}${instant ? ' (auto-provisioned)' : ''}`,
        html: `
          <h2>New council application</h2>
          ${outcome}
          <p><strong>Name:</strong> ${safeName}</p>
          <p><strong>Role:</strong> ${safeRole}</p>
          <p><strong>Organisation:</strong> ${safeOrg}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Region:</strong> ${safeRegion}${resolvedRegionId ? ' <em>(matched)</em>' : ' <em>(free text)</em>'}</p>
          ${safeMessage ? `<p><strong>Message:</strong> ${safeMessage}</p>` : ''}
          <p style="margin-top:16px;"><a href="https://www.australianatlas.com.au/admin/councils">Open council applications &rarr;</a></p>
        `,
      }),
    })
    if (!res.ok) console.error('Resend error:', await res.text())
  } catch (err) {
    console.error('Email send error:', err)
  }

  return NextResponse.json({ success: true, instant })
}
