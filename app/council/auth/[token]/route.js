// app/council/auth/[token]/route.js
// One-click magic-link login for freshly provisioned councils.
//
// The welcome email's primary CTA points here. This route:
//   1. looks up the account by its single-use login_link_token,
//   2. verifies it's approved, live, and unexpired,
//   3. burns the token (single use) and stamps last_login_at,
//   4. sets the HMAC council_session cookie,
//   5. redirects into the region dashboard (/council).
//
// It must run WITHOUT a prior session, so middleware exempts /council/auth/*.

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { createSessionValue } from '@/lib/council-session'

export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  const { token } = await params
  const origin = new URL(request.url).origin
  const fail = (reason) => NextResponse.redirect(new URL(`/council/login?link=${reason}`, origin))

  if (!token || token.length < 16) return fail('invalid')

  const sb = getSupabaseAdmin()

  const { data: council, error } = await sb
    .from('council_accounts')
    .select('id, slug, name, status, approved, login_link_expires_at')
    .eq('login_link_token', token)
    .maybeSingle()

  if (error || !council) return fail('invalid')
  if (!council.approved || council.status === 'suspended' || council.status === 'cancelled') {
    return fail('inactive')
  }
  if (!council.login_link_expires_at || new Date(council.login_link_expires_at) < new Date()) {
    return fail('expired')
  }

  // Burn the single-use token and record the login.
  await sb
    .from('council_accounts')
    .update({
      login_link_token: null,
      login_link_expires_at: null,
      last_login_at: new Date().toISOString(),
    })
    .eq('id', council.id)

  try {
    await sb.from('council_activity').insert({ council_id: council.id, action: 'login' })
  } catch (err) {
    console.error('[council/auth] activity log error:', err?.message || err)
  }

  const sessionValue = createSessionValue(council.id, council.slug)
  const res = NextResponse.redirect(new URL('/council?welcome=1', origin))
  res.cookies.set('council_session', sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return res
}
