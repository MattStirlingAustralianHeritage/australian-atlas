import { createAuthServerClient } from '@/lib/supabase/auth-clients'
import { NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/safe-redirect'
import { finalizePendingClaimsForUser } from '@/lib/claims/grantClaim'
import { landsOnPasswordSetup, UNPROVEN_CONFIRM_SOURCE } from '@/lib/claims/claimGate.mjs'

// Handles every Supabase Auth redirect that lands back on the portal:
//   - OAuth / PKCE password flows           → ?code=...            (exchangeCodeForSession)
//   - Email links: invite, recovery,        → ?token_hash=..&type= (verifyOtp)
//     signup, email_change
// Admin-generated links (invites, recovery links) arrive as token_hash+type,
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

  // Reaching this point with a session means the address just proved itself.
  // That proof is what a pending claim has been waiting for, so settle it here
  // — this is the ONLY moment ownership is created for an emailed claim.
  // Fail-soft: the operator lands on their destination regardless, and the
  // claim-integrity sweep retries anything that didn't take.
  // A link that arrived by email has just been opened, which is real proof of
  // the mailbox. If this account was auto-confirmed during a Resend outage
  // (/api/auth/signup stamps email_confirm_source), that stamp is now stale and
  // must be cleared — lib/claims/grantClaim.js refuses stamped accounts as
  // claim proof, and leaving it set would lock a legitimate operator out of
  // owning their listing forever.
  async function clearOutageConfirmStamp(user) {
    if (user?.app_metadata?.email_confirm_source !== UNPROVEN_CONFIRM_SOURCE) return
    try {
      const { getSupabaseAdmin } = await import('@/lib/supabase/clients')
      await getSupabaseAdmin().auth.admin.updateUserById(user.id, {
        app_metadata: { email_confirm_source: 'email_link' },
      })
    } catch (err) {
      console.error('[auth/callback] could not clear outage confirm stamp:', err.message)
    }
  }

  async function settleClaims({ linkVerified = false } = {}) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      if (linkVerified) await clearOutageConfirmStamp(user)
      await finalizePendingClaimsForUser(user)
    } catch (err) {
      console.error('[auth/callback] claim finalize failed (sign-in still succeeded):', err.message)
    }
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await settleClaims()
      return NextResponse.redirect(`${origin}${next}`)
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      // A recovery link only mints a session — the password is NOT changed yet.
      // It must land on the set-new-password screen, never straight on `next`,
      // or the reset silently becomes a one-machine session and the operator
      // stays locked out everywhere else. `next` is preserved as the
      // destination AFTER the new password is saved.
      // Every link type that lands here proved the address, recovery included,
      // so settle before branching. The recovery branch redirects to a page
      // that never returns through this route, and leaving it to the 6-hourly
      // sweep would strand a verified operator's claim for no reason.
      await settleClaims({ linkVerified: true })
      if (landsOnPasswordSetup(type)) {
        // Both link types mint a session for an account that has no working
        // password yet (recovery: being reset; invite: never had one). Land on
        // the set-password screen so every account leaves this flow able to
        // sign in with email + password — emailed links are how an address is
        // VERIFIED here, never a standing way to log in. `next` is preserved
        // as the destination AFTER the password is saved.
        return NextResponse.redirect(`${origin}/auth/update-password?next=${encodeURIComponent(next)}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
