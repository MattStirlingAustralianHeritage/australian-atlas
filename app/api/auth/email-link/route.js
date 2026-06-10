import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { magicLinkEmail, recoveryEmail } from '@/lib/email/authEmails'

// Atlas-branded magic-link sign-in + password-reset, sent APP-SIDE via Resend.
//
// Instead of the client calling supabase.auth.signInWithOtp() /
// resetPasswordForEmail() (which make GoTrue send its own "Supabase Auth"
// email), this route mints the link server-side with admin.generateLink() — no
// GoTrue email — and sends OUR branded message via Resend. Same token_hash flow
// as signup: the link points at /auth/callback which runs verifyOtp().
//
//   type 'magiclink' → generateLink auto-creates the user if new (matches
//                      signInWithOtp's default), so any email gets a link.
//   type 'recovery'  → requires an existing user; a 404 is swallowed and we
//                      still return success so we never reveal whether an
//                      email is registered.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TYPES = { magiclink: magicLinkEmail, recovery: recoveryEmail }

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const type = String(body?.type || '')
  const email = String(body?.email || '').trim().toLowerCase()
  let next = String(body?.next || '/account')
  if (!next.startsWith('/')) next = '/account'

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
    if (type === 'recovery' && (error.status === 404 || /not found/i.test(error.message || ''))) {
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

  // The callback runs verifyOtp({ type }). A magiclink token — including one for
  // a newly auto-created user — verifies as type 'email' (NOT 'magiclink', which
  // only works for pre-existing users), so the link must carry the verify type.
  const callbackType = type === 'magiclink' ? 'email' : type
  const url =
    `${origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${callbackType}&next=${encodeURIComponent(next)}`

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
