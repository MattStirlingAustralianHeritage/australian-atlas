// Single idempotent entry point for GRANTING a venue claim.
//
// Both grant paths funnel through here:
//   - admin approval of a free / manually-approved claim  → tier 'free'
//   - Stripe paid-claim webhook                           → tier 'standard'
//
// Responsibilities (all idempotent):
//   a. Resolve identity by claimant_email — find the auth user, or provision
//      one (invite + magic link). Resolution is by EMAIL, so portal-originated
//      claims (no vertical user id) no longer fall through.
//   b. Promote the profile to role=vendor and add the vertical (find-or-create).
//   c. Insert the listing_claims ownership row (no-op if an active one exists;
//      upgrade free→paid in place if Stripe ids arrive for an existing active row).
//   d. updateListing(listing_id, { is_claimed: true }) — is_claimed ONLY. This
//      is the one claim field that syncs down to the vertical (display state).
//   e. On any failure, log to failed_role_promotions (real columns) for retry.
//
// Establishes the invariant (with the partial unique index in migration 140):
//   listings.is_claimed = true  <=>  exactly one active listing_claims row.

import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { updateListing } from '@/lib/admin/updateListing'
import { promoteRole } from '@/lib/auth/promoteRole'
import { inviteEmail } from '@/lib/email/authEmails'

/**
 * Find the auth user for an email, or provision one via invite (magic link).
 * Returns { userId }.
 */
async function resolveOrProvisionUser(sb, email) {
  // Fast path: profiles.id == auth.users.id, so a profile row gives us the id.
  const { data: prof } = await sb
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (prof) return { userId: prof.id, provisioned: false }

  // Provision: creates the auth user and emails an invite (a secure magic
  // sign-in link). redirectTo lands the operator on /account after they accept —
  // the canonical post-login surface, which links vendors through to /dashboard.
  // The signup trigger creates the profile row; promoteRole() find-or-creates as
  // a backstop.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'
  const redirectTo = `${siteUrl}/auth/callback?next=/account`
  // Mint the invite link with generateLink (creates the auth user if new, no
  // GoTrue email), then send OUR branded invite via Resend.
  const { data: invited, error: inviteErr } = await sb.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  })
  if (inviteErr || !invited?.user) {
    // generateLink(invite) does NOT error for an existing user, so a failure
    // here is genuine — treat as an auth user lacking a profile row and resolve.
    const { data: list } = await sb.auth.admin.listUsers()
    const match = list?.users?.find(u => u.email?.toLowerCase() === email)
    if (match) return { userId: match.id, provisioned: false }
    throw new Error(`Could not resolve or provision user for ${email}: ${inviteErr?.message || 'unknown error'}`)
  }

  // Send the branded invite. Best-effort: a mail hiccup must never roll back a
  // granted claim — the operator is already provisioned and can recover via
  // password reset. (The invite re-sends on a later grant of the same listing.)
  const tokenHash = invited.properties?.hashed_token
  if (tokenHash && process.env.RESEND_API_KEY) {
    const inviteUrl = `${siteUrl}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=invite&next=/account`
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { from, replyTo, subject, html } = inviteEmail({ url: inviteUrl })
      const { error: sendErr } = await resend.emails.send({ from, replyTo, to: email, subject, html })
      if (sendErr) throw new Error(sendErr.message || 'send failed')
    } catch (err) {
      console.error('[grantClaim] invite email send failed (user provisioned, claim continues):', err.message)
    }
  } else {
    console.error('[grantClaim] invite provisioned but token/RESEND_API_KEY missing — invite email NOT sent')
  }

  return { userId: invited.user.id, provisioned: true }
}

/**
 * Grant a claim. Idempotent.
 *
 * @param {object} args
 * @param {string} args.listing_id
 * @param {string} args.vertical
 * @param {string} args.claimant_email
 * @param {'free'|'standard'} args.tier
 * @param {string} [args.stripe_subscription_id]
 * @param {string} [args.stripe_customer_id]
 * @param {string} [args.source_review_id]   claims_review.id this grant originated from
 * @returns {Promise<{ ok: boolean, userId?: string, claimId?: string|null, error?: string }>}
 */
export async function grantClaim({
  listing_id,
  vertical,
  claimant_email,
  tier,
  stripe_subscription_id = null,
  stripe_customer_id = null,
  source_review_id = null,
}) {
  const sb = getSupabaseAdmin()
  const email = (claimant_email || '').toLowerCase().trim()

  try {
    if (!listing_id || !vertical || !email) {
      throw new Error('grantClaim requires listing_id, vertical, and claimant_email')
    }
    if (!['free', 'standard'].includes(tier)) {
      throw new Error(`grantClaim invalid tier: ${tier}`)
    }
    // Invariant: 'standard' is a PAID tier — it can ONLY be granted with a Stripe
    // subscription (supplied by the paid-checkout webhook). Admin/manual approvals
    // grant 'free'. This makes "no Standard listing without payment" a hard rule at
    // the grant layer, so no caller can ever grant premium for free.
    if (tier === 'standard' && !stripe_subscription_id) {
      throw new Error('grantClaim: Standard tier requires a paid Stripe subscription — refusing to grant Standard without payment')
    }

    // ── (c-pre) Idempotency probe: is there already a LIVE claim here? ──
    // Live = active OR past_due. Probing 'active' only left a hole: during a
    // claimant's Stripe dunning window their claim is past_due, this probe
    // missed it, and a re-grant would insert a duplicate live claim — or,
    // for a different email, silently re-point an owned listing.
    const { data: liveRows } = await sb
      .from('listing_claims')
      .select('id, claimed_by, tier, status')
      .eq('listing_id', listing_id)
      .in('status', LIVE_CLAIM_STATUSES)
      .order('status', { ascending: true }) // 'active' sorts before 'past_due'
      .limit(1)
    const existingActive = liveRows?.[0] || null

    // ── (a) Resolve / provision identity by email ──
    const { userId, provisioned } = await resolveOrProvisionUser(sb, email)

    // Guard: never silently re-point a listing already owned by someone else.
    if (existingActive?.claimed_by && existingActive.claimed_by !== userId) {
      throw new Error(`listing ${listing_id} already has a live (${existingActive.status}) claim owned by a different user`)
    }

    // ── (b) Promote to vendor + vertical (find-or-create profile) ──
    const promo = await promoteRole({ userId, email, role: 'vendor', vertical, createIfMissing: true, sb })
    if (!promo.ok) throw new Error(`role promotion failed (${promo.status}): ${promo.error}`)

    // ── (c) Insert the ownership row, or reconcile an existing active one ──
    let claimId = existingActive?.id || null
    if (!existingActive) {
      const { data: inserted, error: insErr } = await sb
        .from('listing_claims')
        .insert({
          listing_id,
          vertical,
          claimed_by: userId,
          claimant_email: email,
          tier,
          stripe_subscription_id,
          stripe_customer_id,
          status: 'active',
          source_review_id,
          claimed_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (insErr) {
        // Partial unique index race — another active row just appeared. Re-read.
        if (insErr.code === '23505') {
          const { data: now } = await sb
            .from('listing_claims')
            .select('id')
            .eq('listing_id', listing_id)
            .eq('status', 'active')
            .maybeSingle()
          claimId = now?.id || null
        } else {
          throw new Error(`listing_claims insert failed: ${insErr.message}`)
        }
      } else {
        claimId = inserted.id
      }
    } else if (tier === 'standard' && (stripe_subscription_id || stripe_customer_id)) {
      // Free → paid upgrade (or paid re-grant): attach Stripe ids to the live
      // row. A fresh subscription also clears a past_due state — the new sub
      // IS the payment, so the claim goes back to 'active'.
      await sb
        .from('listing_claims')
        .update({ tier, stripe_subscription_id, stripe_customer_id, status: 'active', updated_at: new Date().toISOString() })
        .eq('id', existingActive.id)
    }

    // ── (d) Flip display state; this is the field that syncs to the vertical ──
    const upd = await updateListing(listing_id, { is_claimed: true }, { action: 'claim-grant' })
    if (!upd.success) throw new Error(`updateListing failed: ${upd.error}`)

    // provisioned=true means we just emailed a fresh invite (new auth user);
    // approval comms branch on this so they never promise a link that doesn't exist.
    return { ok: true, userId, claimId, provisioned }
  } catch (err) {
    // ── (e) Log failure for admin retry (real failed_role_promotions columns) ──
    await sb
      .from('failed_role_promotions')
      .insert({
        user_email: email || null,
        claim_id: source_review_id,
        target_role: 'vendor',
        vertical,
        error_message: (err.message || 'grantClaim failed').slice(0, 500),
      })
      .then(null, logErr => console.error('[grantClaim] failed_role_promotions insert error:', logErr.message))

    console.error('[grantClaim] error:', err.message)
    return { ok: false, error: err.message }
  }
}
