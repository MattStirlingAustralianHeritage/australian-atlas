import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { recoveryEmail } from '@/lib/email/authEmails'
import { safeNextPath } from '@/lib/safe-redirect'
import { checkRateLimit } from '@/lib/rate-limit'

// Atlas-branded password-reset email, sent APP-SIDE via Resend.
//
// Instead of the client calling supabase.auth.resetPasswordForEmail() (which
// makes GoTrue send its own "Supabase Auth" email), this route mints the link
// server-side with admin.generateLink() — no GoTrue email — and sends OUR
// branded message via Resend. The link points at /auth/callback which runs
// verifyOtp() and lands on /auth/update-password.
//
// 'recovery' is the ONLY type this route mints. It used to offer 'magiclink'
// too; that was removed deliberately — emailed links verify an address or
// reset a password, they are not a way to sign in. Every account signs in
// with email + password (or Google). Do not add magiclink back.
//
// 'recovery' requires an existing user; a 404 is swallowed and we still
// return success so we never reveal whether an email is registered.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TYPES = { recovery: recoveryEmail }

export async function POST(request) {
  // In-memory limiter: this endpoint sends mail to any address on request, so
  // it must not be free to script (mail-bombing inboxes / burning Resend quota).
  const rateLimited = checkRateLimit(request, { keyPrefix: 'email-link', maxRequests: 5 })
  if (rateLimited) return rateLimited

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const type = String(body?.type || '')
  const email = String(body?.email || '').trim().toLowerCase()
  // open-redirect guard (startsWith('/') alone would still allow //evil.com)
  const next = safeNextPath(String(body?.next || '/account'))

  if (!TYPES[type]) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const origin = new URL(request.url).origin
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`
  const sb = getSupabaseAdmin()

  const { data, error } = await sb.auth.admin.generateLink({ type, email, options: { redirectTo } })

  if (error) {
    // Recovery for a non-existent email: stay silent (no account enumeration) —
    // the client shows the same "if an account exists…" message either way.
    if (error.status === 404 || /not found/i.test(error.message || '')) {
      return NextResponse.json({ success: true }, { status: 200 })
    }
    console.error(`[auth/email-link] generateLink(${type}) error:`, error.message)
    return NextResponse.json({ error: 'Could not send your email. Please try again.' }, { status: 500 })
  }

  const tokenHash = data?.properties?.hashed_token
  if (!tokenHash) {
    console.error(`[auth/email-link] generateLink(${type}) returned no hashed_token`)
    return NextResponse.json({ error: 'Could not send your email. Please try again.' }, { status: 500 })
  }

  const url =
    `${origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${type}&next=${encodeURIComponent(next)}`

  if (!process.env.RESEND_API_KEY) {
    console.error('[auth/email-link] RESEND_API_KEY not set — cannot send')
    return NextResponse.json({ error: 'Email is not configured. Please contact support.' }, { status: 500 })
  }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { from, replyTo, subject, html } = TYPES[type]({ url })
    const { error: sendErr } = await resend.emails.send({ from, replyTo, to: email, subject, html })
    if (sendErr) throw new Error(sendErr.message || 'send failed')
  } catch (err) {
    console.error(`[auth/email-link] ${type} send failed:`, err.message)
    return NextResponse.json(
      { error: 'We could not send your email. Please try again shortly.' },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
