import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/safe-redirect'

// Handles every Supabase Auth redirect that lands back on the portal:
//   - OAuth / PKCE password flows           → ?code=...            (exchangeCodeForSession)
//   - Email links: invite, magiclink,       → ?token_hash=..&type= (verifyOtp)
//     recovery, signup, email_change
// Admin-generated links (inviteUserByEmail, magic links) arrive as token_hash+type,
// NOT as a PKCE code — so both paths must be handled or operator invites dead-end on
// /login?error=auth_callback_error.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  // Guard against open-redirect: reject //host, /\host, and absolute URLs.
  const next = safeNextPath(searchParams.get('next'))

  const supabase = await createAuthServerClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
