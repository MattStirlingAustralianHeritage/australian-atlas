import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { verifyUnsubscribeToken } from '@/lib/outreach/unsubscribeToken'

export const dynamic = 'force-dynamic'

// Public (no admin auth): operators click this from an outreach email. The token
// is an HMAC over their email so no login is needed and nothing can be spoofed.

async function suppress(email) {
  const sb = getSupabaseAdmin()
  const normalised = String(email).toLowerCase().trim()
  await sb
    .from('outreach_suppressions')
    .upsert({ email: normalised, reason: 'unsubscribed' }, { onConflict: 'email' })
  // Reflect it on the funnel rows too, so the UIs show the state. The
  // suppression itself is email-keyed and audience-blind — one unsubscribe
  // silences both operator and council outreach.
  const stamp = { send_status: 'unsubscribed', updated_at: new Date().toISOString() }
  await sb.from('operator_outreach').update(stamp).ilike('contact_email', normalised)
  await sb.from('council_outreach').update(stamp).ilike('contact_email', normalised)
}

function page(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Australian Atlas</title></head>
<body style="margin:0;background:#faf8f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2d2a26;">
  <div style="max-width:480px;margin:0 auto;padding:80px 24px;text-align:center;">
    <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8a8378;margin:0 0 16px;">Australian Atlas</p>
    <h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;margin:0 0 12px;">${title}</h1>
    <p style="font-size:15px;line-height:1.6;color:#6b6459;margin:0 0 24px;">${message}</p>
    <a href="https://australianatlas.com.au" style="font-size:14px;color:#8a6520;text-decoration:none;">Return to australianatlas.com.au &rarr;</a>
  </div>
</body></html>`
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token')
  const email = verifyUnsubscribeToken(token)
  if (!email) {
    return new NextResponse(
      page('Link expired', 'This unsubscribe link is invalid. If you keep hearing from us, reply to any email and we\'ll remove you.'),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }
  try {
    await suppress(email)
  } catch (err) {
    console.error('[outreach/unsubscribe] error:', err.message)
  }
  return new NextResponse(
    page('You\'re unsubscribed', `We won\'t email <strong>${email}</strong> again. Thanks for letting us know.`),
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

// One-click unsubscribe (RFC 8058) — mail clients POST here directly.
export async function POST(request) {
  const token = new URL(request.url).searchParams.get('token')
  const email = verifyUnsubscribeToken(token)
  if (!email) return NextResponse.json({ ok: false }, { status: 400 })
  try {
    await suppress(email)
  } catch (err) {
    console.error('[outreach/unsubscribe POST] error:', err.message)
  }
  return NextResponse.json({ ok: true })
}
