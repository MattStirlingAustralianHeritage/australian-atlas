import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { magicLinkEmail } from '@/lib/email/authEmails'
import { safeNextPath } from '@/lib/safe-redirect'

// Break-glass diagnosis for "an operator says they can't get in".
//
// Both lockout incidents this platform has had (the 2026-07-21 sync trample,
// the password-reset dead end) shared a failure mode: the operator's report
// was the FIRST signal, and diagnosing it meant an engineer spelunking four
// tables by hand. diagnoseAccess() does the spelunking in one call — auth
// identity, profile role, claims, listing state — and names the fix, so a
// lockout report becomes a two-minute admin action instead of an incident.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'

/**
 * Full account-access diagnosis for an email address.
 * Returns { email, profile, authUser, claims, reviews, findings } where
 * findings is a list of { severity: 'critical'|'warn'|'info'|'ok', code,
 * message, fix }.
 */
export async function diagnoseAccess(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return { error: 'Enter a valid email address.' }
  }
  const sb = getSupabaseAdmin()
  const findings = []

  // ── Profile (the portal identity row; auto-created on signup) ──
  const { data: profile } = await sb
    .from('profiles')
    .select('id, email, full_name, role, vendor_verticals, created_at')
    .ilike('email', email)
    .maybeSingle()

  // ── Auth user (GoTrue) — reachable via the profile id (same uuid) ──
  let authUser = null
  if (profile?.id) {
    const { data, error } = await sb.auth.admin.getUserById(profile.id)
    if (error) {
      findings.push({
        severity: 'critical',
        code: 'auth_user_missing',
        message: `A profiles row exists (${profile.id}) but there is no matching auth user — the login identity is gone.`,
        fix: 'Send a magic sign-in link below: it re-provisions the auth user on the same email.',
      })
    } else {
      const u = data?.user
      authUser = u && {
        id: u.id,
        email: u.email,
        email_confirmed_at: u.email_confirmed_at,
        last_sign_in_at: u.last_sign_in_at,
        providers: (u.identities || []).map(i => i.provider),
        banned_until: u.banned_until || null,
      }
    }
  }

  // ── Claims: by claimed_by (canonical) plus claimant_email (catches rows
  //    that were never linked to a user id — themselves a finding) ──
  const claimSelect = 'id, listing_id, status, tier, claimed_by, claimant_email, claimed_at, listings(id, name, slug, vertical, status, is_claimed)'
  const [byUser, byEmail] = await Promise.all([
    profile?.id
      ? sb.from('listing_claims').select(claimSelect).eq('claimed_by', profile.id)
      : Promise.resolve({ data: [] }),
    sb.from('listing_claims').select(claimSelect).ilike('claimant_email', email),
  ])
  const claimById = new Map()
  for (const c of [...(byUser.data || []), ...(byEmail.data || [])]) claimById.set(c.id, c)
  const claims = [...claimById.values()].sort((a, b) => (b.claimed_at || '').localeCompare(a.claimed_at || ''))
  const liveClaims = claims.filter(c => LIVE_CLAIM_STATUSES.includes(c.status))

  // ── Claim applications (the review funnel) ──
  const { data: reviews } = await sb
    .from('claims_review')
    .select('id, listing_id, vertical, status, tier, created_at, reviewed_at')
    .ilike('claimant_email', email)
    .order('created_at', { ascending: false })
    .limit(10)

  // ── Findings ──
  if (!profile && claims.length === 0 && (reviews || []).length === 0) {
    findings.push({
      severity: 'info',
      code: 'no_account',
      message: 'No profile, claims or claim applications exist for this email.',
      fix: 'If they should have access, send a magic sign-in link — it creates the account on first use.',
    })
  }
  if (!profile && claims.length > 0) {
    findings.push({
      severity: 'critical',
      code: 'claims_without_profile',
      message: 'Claims exist for this email but there is no profile — the owner cannot log in at all.',
      fix: 'Send a magic sign-in link (creates the account), then re-link the claim via grantClaim / admin claims.',
    })
  }
  if (authUser && !authUser.email_confirmed_at) {
    findings.push({
      severity: 'warn',
      code: 'email_unconfirmed',
      message: 'The auth user exists but the email address was never confirmed — password sign-in may be refused.',
      fix: 'A magic sign-in link both signs them in and confirms the address.',
    })
  }
  if (authUser?.banned_until) {
    findings.push({
      severity: 'critical',
      code: 'banned',
      message: `The auth user is banned until ${authUser.banned_until}.`,
      fix: 'Lift the ban in Supabase Auth if unintended.',
    })
  }
  if (liveClaims.length > 0 && profile && profile.role !== 'vendor' && profile.role !== 'admin') {
    findings.push({
      severity: 'critical',
      code: 'role_locked_out',
      message: `They own ${liveClaims.length} live claim${liveClaims.length === 1 ? '' : 's'} but their profile role is '${profile.role}' — the dashboard 403s them at the door.`,
      fix: `Promote the role: POST /api/auth/promote-role, or re-run the grant from /admin/claims.`,
    })
  }
  for (const c of liveClaims) {
    const l = c.listings
    if (!c.claimed_by) {
      findings.push({
        severity: 'critical',
        code: 'orphaned_claim',
        message: `Live claim on “${l?.name || c.listing_id}” has no claimed_by user — no account is linked to this ownership.`,
        fix: 'Send a magic sign-in link, then set listing_claims.claimed_by to the resulting user id.',
      })
    } else if (profile && c.claimed_by !== profile.id) {
      findings.push({
        severity: 'warn',
        code: 'claim_owned_elsewhere',
        message: `A claim on “${l?.name || c.listing_id}” carries this email but claimed_by is a different user (${c.claimed_by}).`,
        fix: 'Confirm which account is legitimate before re-pointing anything.',
      })
    }
    if (l && l.is_claimed !== true) {
      findings.push({
        severity: 'critical',
        code: 'flag_trampled',
        message: `“${l.name}” has a live claim but is_claimed=${l.is_claimed} — the 2026-07-21 trample class; migration 256 should make this impossible.`,
        fix: 'Re-stamp via updateListing({ is_claimed: true }) and investigate what wrote it.',
      })
    }
    if (l && l.status !== 'active') {
      findings.push({
        severity: 'warn',
        code: 'listing_hidden',
        message: `“${l.name}” is owned but its listing status is '${l.status}' — the public page is dark while the operator pays for it.`,
        fix: 'Restore listing status, or deliberately deactivate the claim first if the hide is intended.',
      })
    }
  }
  if (liveClaims.length === 0 && claims.length > 0) {
    findings.push({
      severity: 'info',
      code: 'claims_inactive',
      message: `All ${claims.length} claim${claims.length === 1 ? '' : 's'} for this email are inactive — cancelled or never completed.`,
      fix: 'If they believe they still own the listing, check Stripe subscription state before reactivating.',
    })
  }
  if (findings.length === 0) {
    findings.push({
      severity: 'ok',
      code: 'all_clear',
      message: 'Identity, role, claims and listing state all check out. If they still cannot get in, it is a credentials problem on their side.',
      fix: authUser?.providers?.includes('google')
        ? 'They can sign in with Google instantly — or send a magic sign-in link.'
        : 'Send a magic sign-in link (no password needed), or a password reset from the login page.',
    })
  }

  return { email, profile: profile || null, authUser, claims, reviews: reviews || [], findings }
}

/**
 * One-click unblock: mint a magic sign-in link (auto-creates the user if
 * missing) and email it via Resend with the Atlas-branded template. Mirrors
 * /api/auth/email-link — including the 'email' verify type a magiclink token
 * requires — but callable from the admin console.
 */
export async function sendSignInLink(rawEmail, rawNext) {
  const email = String(rawEmail || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return { ok: false, error: 'Invalid email.' }
  const next = safeNextPath(String(rawNext || '/account'))
  const sb = getSupabaseAdmin()

  const { data, error } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
  })
  const tokenHash = data?.properties?.hashed_token
  if (error || !tokenHash) {
    return { ok: false, error: error?.message || 'generateLink returned no token' }
  }

  // Magiclink tokens verify as type 'email' (see /api/auth/email-link).
  const url = `${SITE_URL}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent(next)}`

  if (!process.env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY not set' }
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { from, replyTo, subject, html } = magicLinkEmail({ url })
    const { error: sendErr } = await resend.emails.send({ from, replyTo, to: email, subject, html })
    if (sendErr) return { ok: false, error: sendErr.message || String(sendErr) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
