import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { signNewsletterToken } from '@/lib/newsletter/confirmToken'
import { newsletterConfirmEmail } from '@/lib/email/authEmails'
import { checkRateLimit } from '@/lib/rate-limit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Double opt-in newsletter signup. Subscribing does NOT add anyone to the list —
// it sends a branded Resend confirmation, and the subscriber is only inserted
// (status 'active') when they click the link (app/api/newsletter/confirm). This
// keeps the list free of unconfirmed / spoofed addresses.
export async function POST(request) {
  const rl = checkRateLimit(request, { keyPrefix: 'newsletter', maxRequests: 6, windowMs: 60_000 })
  if (rl) return rl
  try {
    const { email } = await request.json()
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const normalised = email.toLowerCase().trim()

    // Already confirmed? Don't make them confirm again.
    const { data: existing } = await sb
      .from('newsletter_subscribers')
      .select('id, status')
      .eq('email', normalised)
      .maybeSingle()
    if (existing && existing.status === 'active') {
      return NextResponse.json({ ok: true, already: true })
    }

    // Send the confirmation (no DB write yet).
    const origin = new URL(request.url).origin
    const url = `${origin}/api/newsletter/confirm?token=${encodeURIComponent(signNewsletterToken(normalised))}`

    if (!process.env.RESEND_API_KEY) {
      console.error('[newsletter] RESEND_API_KEY not set — cannot send confirmation')
      return NextResponse.json({ error: 'server_error' }, { status: 500 })
    }
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { from, replyTo, subject, html } = newsletterConfirmEmail({ url })
      const { error: sendErr } = await resend.emails.send({ from, replyTo, to: normalised, subject, html })
      if (sendErr) throw new Error(sendErr.message || 'send failed')
    } catch (err) {
      console.error('[newsletter] confirmation send failed:', err.message)
      return NextResponse.json({ error: 'server_error' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, pending: true }, { status: 200 })
  } catch (err) {
    console.error('Newsletter signup error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
