import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { signupConfirmationEmail } from '@/lib/email/authEmails'

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
  let next = String(body?.next || '/account')
  // next is echoed into the emailed link and later used by the callback as
  // `${origin}${next}` — keep it a same-origin relative path.
  if (!next.startsWith('/')) next = '/account'

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
  if (!tokenHash) {
    console.error('[auth/signup] generateLink returned no hashed_token')
    return NextResponse.json({ error: 'Could not create your account. Please try again.' }, { status: 500 })
  }

  const confirmationUrl =
    `${origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=signup&next=${encodeURIComponent(next)}`

  if (!process.env.RESEND_API_KEY) {
    console.error('[auth/signup] RESEND_API_KEY not set — cannot send confirmation email')
    return NextResponse.json({ error: 'Email is not configured. Please contact support.' }, { status: 500 })
  }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { from, replyTo, subject, html } = signupConfirmationEmail({ confirmationUrl })
    const { error: sendErr } = await resend.emails.send({ from, replyTo, to: email, subject, html })
    if (sendErr) throw new Error(sendErr.message || 'send failed')
  } catch (err) {
    // The user row now exists (unconfirmed). A retry regenerates the link and
    // re-sends, so we don't delete here — just surface a retryable error.
    console.error('[auth/signup] confirmation email send failed:', err.message)
    return NextResponse.json(
      { error: 'We could not send your confirmation email. Please try again shortly.' },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
