import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { signupConfirmationEmail } from '@/lib/email/authEmails'
import { safeNextPath } from '@/lib/safe-redirect'

// Public self-signup, Atlas-branded.
//
// Instead of the client calling supabase.auth.signUp() (which makes GoTrue send
// its own "Supabase Auth" email), this route:
//   1. Mints a signup confirmation link server-side with admin.generateLink()
//      — which creates the unconfirmed user WITHOUT sending any email.
//   2. Sends OUR branded confirmation email via Resend.
//
// The link is built as a token_hash URL pointing at /auth/callback, which runs
// verifyOtp({ type:'signup', token_hash }). We deliberately do NOT use the raw
// action_link: admin-minted links carry no PKCE verifier, so the callback's
// code-exchange path can't complete them — the token_hash path can.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')
  // next is echoed into the emailed link and later used by the callback as
  // `${origin}${next}` — keep it a same-origin relative path (open-redirect guard:
  // startsWith('/') alone would still allow //evil.com).
  const next = safeNextPath(String(body?.next || '/account'))

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }
  if (password.length > 72) {
    return NextResponse.json({ error: 'Password must be 72 characters or fewer.' }, { status: 400 })
  }

  const origin = new URL(request.url).origin
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`

  const sb = getSupabaseAdmin()

  // Create the unconfirmed user + get a confirmation token. No email is sent here.
  const { data, error } = await sb.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { redirectTo },
  })

  if (error) {
    const msg = (error.message || '').toLowerCase()
    if (/registered|already|exists/.test(msg)) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Try signing in instead.' },
        { status: 409 }
      )
    }
    console.error('[auth/signup] generateLink error:', error.message)
    return NextResponse.json({ error: 'Could not create your account. Please try again.' }, { status: 500 })
  }

  const tokenHash = data?.properties?.hashed_token
  const userId = data?.user?.id
  if (!tokenHash || !userId) {
    console.error('[auth/signup] generateLink returned no hashed_token / user id')
    return NextResponse.json({ error: 'Could not create your account. Please try again.' }, { status: 500 })
  }

  const confirmationUrl =
    `${origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=signup&next=${encodeURIComponent(next)}`

  // Try to send OUR branded confirmation email. If it can't be sent — most
  // commonly because the Resend sending domain isn't verified yet (see
  // docs/auth-email-setup.md) — we do NOT dead-end the signup. We fall back to
  // confirming the account server-side so the person can sign in immediately
  // (the client then signs them straight in). This is self-healing: the day the
  // domain is verified the send succeeds and the proper click-to-confirm flow
  // resumes automatically, with no code change.
  let emailSent = false
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { from, replyTo, subject, html } = signupConfirmationEmail({ confirmationUrl })
      const { error: sendErr } = await resend.emails.send({ from, replyTo, to: email, subject, html })
      if (sendErr) throw new Error(sendErr.message || 'send failed')
      emailSent = true
    } catch (err) {
      console.error('[auth/signup] confirmation email send failed — auto-confirming instead:', err.message)
    }
  } else {
    console.error('[auth/signup] RESEND_API_KEY not set — auto-confirming instead')
  }

  if (emailSent) {
    // Proper flow: the user must click the emailed link to activate the account.
    return NextResponse.json({ success: true, requiresEmailConfirmation: true }, { status: 200 })
  }

  // Fallback: confirm the just-created (still unconfirmed) user so signup never
  // dead-ends on a mail outage. The client signs them in with the password they
  // just chose (already proven to work end-to-end).
  const { error: confirmErr } = await sb.auth.admin.updateUserById(userId, { email_confirm: true })
  if (confirmErr) {
    console.error('[auth/signup] auto-confirm failed:', confirmErr.message)
    return NextResponse.json(
      { error: 'We could not finish creating your account. Please try again shortly.' },
      { status: 502 }
    )
  }
  return NextResponse.json({ success: true, requiresEmailConfirmation: false }, { status: 200 })
}
