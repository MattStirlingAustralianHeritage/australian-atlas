// Granting a venue claim, in TWO halves separated by proof.
//
// ── Why it is two halves ──
// This module used to do everything in one pass the moment an admin clicked
// approve: provision the auth user, promote the profile to role=vendor, insert
// the ACTIVE listing_claims ownership row, and set listings.is_claimed=true.
// Verification was something that might happen later, if the invite link ever
// got clicked. On 2026-07-29 an audit found 33 of 58 live claims where it never
// had: real listings marked owned, vendor accounts provisioned, for addresses
// nobody had ever proven control of. Ownership was resting on a string typed
// into a form.
//
// So the writes are now split around the one event that actually proves
// something — the claimed address confirming a sign-in:
//
//   beginClaim()     admin approves. Resolve or provision the identity, send
//                    the invite, mark claims_review 'pending_verification'.
//                    Writes NO ownership: no listing_claims row, no vendor
//                    promotion, no is_claimed. The listing stays unclaimed and
//                    stays claimable by someone else.
//
//   finalizeClaim()  the address is proven. NOW promote to vendor, insert the
//                    ownership row, set is_claimed=true, stamp verified_at and
//                    move claims_review to 'approved'.
//
// grantClaim() keeps the old name and does begin-then-finalize-if-already-
// verified, so callers that legitimately hold proof (the Stripe webhook, an
// admin approving a claim submitted from a signed-in account) get the old
// one-shot behaviour, while anything unproven stops at the gate.
//
// Both halves stay idempotent, and finalizeClaim is safe to re-run: it is the
// path every returning operator takes through /auth/callback.
//
// Establishes the invariant (with the partial unique index in migration 140):
//   listings.is_claimed = true  <=>  exactly one active listing_claims row.
// And now also:
//   an active listing_claims row  =>  its owner's email has been verified.

import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { LIVE_CLAIM_STATUSES } from '@/lib/claims/statuses'
import { isConfirmationProof } from '@/lib/claims/claimGate.mjs'
import { updateListing } from '@/lib/admin/updateListing'
import { promoteRole } from '@/lib/auth/promoteRole'
import { inviteEmail } from '@/lib/email/authEmails'
import { logListingActivity, ACTIVITY_ACTIONS } from '@/lib/activity/logListingActivity'

/**
 * Has this account ever proven it can read mail at its own address?
 *
 * last_sign_in_at is deliberately NOT the test. An account can be confirmed by
 * paths that never reach a session, and an operator who confirmed months ago
 * but hasn't signed in since is verified, not suspect. email_confirmed_at is
 * the durable fact: at some point, a link sent to that address was opened.
 *
 * With one exception. When Resend is down, /api/auth/signup confirms the
 * account server-side so signup doesn't dead-end, and stamps
 * app_metadata.email_confirm_source. Such an account has a confirmation
 * timestamp but nobody ever opened anything, so it is NOT proof of the mailbox
 * — accepting it would let someone sign up as a venue's published address
 * during an outage and have their claim finalize. They can still browse; they
 * just have to open a real link before they can own a listing.
 */
async function isEmailVerified(sb, userId) {
  if (!userId) return false
  const { data } = await sb.auth.admin.getUserById(userId)
  return isConfirmationProof(data?.user)
}

/** Minimal listing context for the activity log. Never throws. */
async function listingForLog(sb, listing_id) {
  const { data } = await sb
    .from('listings')
    .select('id, name, slug, vertical')
    .eq('id', listing_id)
    .maybeSingle()
  return data || { id: listing_id }
}

/**
 * Mint an invite link for `email` and send the branded invite. The link
 * verifies the address and lands on set-password via /auth/callback — accounts
 * sign in with email + password, never with a standing emailed link.
 * Best-effort: returns true if the email actually went out.
 */
async function mintAndSendInvite(sb, email, existingTokenHash = null) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'
  let tokenHash = existingTokenHash
  if (!tokenHash) {
    const { data, error } = await sb.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${siteUrl}/auth/callback?next=/account` },
    })
    if (error || !data?.properties?.hashed_token) {
      console.error('[grantClaim] invite link mint failed:', error?.message || 'no hashed_token')
      return false
    }
    tokenHash = data.properties.hashed_token
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('[grantClaim] RESEND_API_KEY missing — invite email NOT sent')
    return false
  }
  const inviteUrl = `${siteUrl}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=invite&next=/account`
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { from, replyTo, subject, html } = inviteEmail({ url: inviteUrl })
    const { error: sendErr } = await resend.emails.send({ from, replyTo, to: email, subject, html })
    if (sendErr) throw new Error(sendErr.message || 'send failed')
    return true
  } catch (err) {
    console.error('[grantClaim] invite email send failed (claim continues):', err.message)
    return false
  }
}

/**
 * Find the auth user for an email, or provision one via invite. The invite
 * link confirms the address and has the operator set a password.
 * Returns { userId, provisioned, linkSent }.
 */
async function resolveOrProvisionUser(sb, email) {
  // Fast path: profiles.id == auth.users.id, so a profile row gives us the id.
  const { data: prof } = await sb
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (prof) {
    // An existing account that never confirmed its address (e.g. a prior
    // invite that was never opened) would otherwise wait on a verification
    // email nobody sends — the invite only went out on the provision path,
    // and approval copy told them to look for mail that didn't exist. Send a
    // fresh link now so "check your email" is always true.
    if (!(await isEmailVerified(sb, prof.id))) {
      const linkSent = await mintAndSendInvite(sb, email)
      return { userId: prof.id, provisioned: false, linkSent }
    }
    return { userId: prof.id, provisioned: false, linkSent: false }
  }

  // Provision: generateLink(invite) creates the auth user if new (no GoTrue
  // email), then we send OUR branded invite via Resend. The signup trigger
  // creates the profile row; promoteRole() find-or-creates as a backstop.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.australianatlas.com.au'
  const { data: invited, error: inviteErr } = await sb.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/account` },
  })
  if (inviteErr || !invited?.user) {
    // generateLink(invite) does NOT error for an existing user, so a failure
    // here is genuine — treat as an auth user lacking a profile row and resolve.
    const { data: list } = await sb.auth.admin.listUsers({ perPage: 2000 })
    const match = list?.users?.find(u => u.email?.toLowerCase() === email)
    if (match) return { userId: match.id, provisioned: false, linkSent: false }
    throw new Error(`Could not resolve or provision user for ${email}: ${inviteErr?.message || 'unknown error'}`)
  }

  // Send the branded invite. Best-effort: a mail hiccup must never roll back a
  // granted claim — the operator is already provisioned, and the claim-recovery
  // nudge re-sends a fresh link.
  const linkSent = await mintAndSendInvite(sb, email, invited.properties?.hashed_token)

  return { userId: invited.user.id, provisioned: true, linkSent }
}

/** Shared validation for both halves. Throws on anything malformed. */
function assertGrantArgs({ listing_id, vertical, email, tier, stripe_subscription_id }) {
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
}

/**
 * HALF ONE — admin approves, nothing is owned yet.
 *
 * Resolves or provisions the identity (provisioning emails the invite), then
 * parks the claim at 'pending_verification'. Deliberately writes no ownership:
 * until the address answers, the listing stays unclaimed and claimable.
 *
 * @returns {Promise<{ ok, userId?, provisioned?, verified?, error? }>}
 *          verified=true means the address is ALREADY proven and the caller
 *          should go straight on to finalizeClaim.
 */
export async function beginClaim({
  listing_id,
  vertical,
  claimant_email,
  tier,
  stripe_subscription_id = null,
  source_review_id = null,
}) {
  const sb = getSupabaseAdmin()
  const email = (claimant_email || '').toLowerCase().trim()

  try {
    assertGrantArgs({ listing_id, vertical, email, tier, stripe_subscription_id })

    // Never re-point a listing someone else already owns, even at this stage —
    // provisioning an invite for a contested listing would be misleading mail.
    const { data: liveRows } = await sb
      .from('listing_claims')
      .select('id, claimed_by, status')
      .eq('listing_id', listing_id)
      .in('status', LIVE_CLAIM_STATUSES)
      .limit(1)
    const existingActive = liveRows?.[0] || null

    // Nor approve a second claimant onto a listing already promised to someone
    // else. A claim parked at 'pending_verification' owns nothing yet, so the
    // listing_claims probe above cannot see it — approving both would send two
    // operators the same "one step left" email, and whoever opened their link
    // first would silently take it from the other.
    if (source_review_id) {
      const { data: waiting } = await sb
        .from('claims_review')
        .select('id, claimant_email')
        .eq('listing_id', listing_id)
        .eq('status', 'pending_verification')
        .neq('id', source_review_id)
        .limit(1)
      const sibling = waiting?.[0]
      if (sibling && (sibling.claimant_email || '').toLowerCase() !== email) {
        throw new Error(`listing ${listing_id} already has an approved claim awaiting verification by ${sibling.claimant_email} — resolve that claim before approving this one`)
      }
    }

    const { userId, provisioned, linkSent } = await resolveOrProvisionUser(sb, email)

    if (existingActive?.claimed_by && existingActive.claimed_by !== userId) {
      throw new Error(`listing ${listing_id} already has a live (${existingActive.status}) claim owned by a different user`)
    }

    const verified = await isEmailVerified(sb, userId)

    // Park the moderation row. 'pending_verification' is its own status
    // precisely so claim-integrity's grant_fell_through check — approved with
    // no ownership row — does not read this normal waiting state as a failure.
    if (source_review_id && !verified) {
      await sb
        .from('claims_review')
        .update({ status: 'pending_verification' })
        .eq('id', source_review_id)
        .then(null, err => console.error('[beginClaim] claims_review status update failed:', err.message))

      const listing = await listingForLog(sb, listing_id)
      await logListingActivity(sb, listing, { role: 'admin' }, {
        action: ACTIVITY_ACTIONS.CLAIM_AWAITING_VERIFICATION,
        field: 'claim_status',
        summary: `Claim approved for ${email} — awaiting email verification`,
        details: { claimant_email: email, tier, source_review_id },
      })
    }

    return { ok: true, userId, provisioned, verified, linkSent }
  } catch (err) {
    await sb
      .from('failed_role_promotions')
      .insert({
        user_email: email || null,
        claim_id: source_review_id,
        target_role: 'vendor',
        vertical,
        error_message: (err.message || 'beginClaim failed').slice(0, 500),
      })
      .then(null, logErr => console.error('[beginClaim] failed_role_promotions insert error:', logErr.message))
    console.error('[beginClaim] error:', err.message)
    return { ok: false, error: err.message }
  }
}

/**
 * HALF TWO — the address is proven, so ownership may now exist.
 *
 * Idempotent and safe to re-run: every returning operator reaches this through
 * /auth/callback. Callers MUST have established that the claimed address is
 * verified; finalizeClaim re-checks rather than trusting them.
 *
 * @param {object} args
 * @param {string} args.listing_id
 * @param {string} args.vertical
 * @param {string} args.claimant_email
 * @param {'free'|'standard'} args.tier
 * @param {string} [args.stripe_subscription_id]
 * @param {string} [args.stripe_customer_id]
 * @param {string} [args.source_review_id]   claims_review.id this grant originated from
 * @param {boolean} [args.skipVerificationCheck]  only for the paid path, where
 *        the payment itself is the proof; still logged as such.
 * @returns {Promise<{ ok: boolean, userId?: string, claimId?: string|null, error?: string }>}
 */
export async function finalizeClaim({
  listing_id,
  vertical,
  claimant_email,
  tier,
  stripe_subscription_id = null,
  stripe_customer_id = null,
  source_review_id = null,
  skipVerificationCheck = false,
}) {
  const sb = getSupabaseAdmin()
  const email = (claimant_email || '').toLowerCase().trim()

  try {
    assertGrantArgs({ listing_id, vertical, email, tier, stripe_subscription_id })

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
    // linkSent is threaded out below: on the PAID path this may have emailed a
    // confirm-your-address link (the payer's account existed but was never
    // confirmed), and the webhook's receipt must not then tell them to "sign in
    // to your dashboard" — GoTrue refuses password sign-in until the address is
    // confirmed, so that instruction would be a dead end while the link that
    // actually works sat unmentioned in the same inbox.
    const { userId, provisioned, linkSent } = await resolveOrProvisionUser(sb, email)

    // Guard: never silently re-point a listing already owned by someone else.
    if (existingActive?.claimed_by && existingActive.claimed_by !== userId) {
      throw new Error(`listing ${listing_id} already has a live (${existingActive.status}) claim owned by a different user`)
    }

    // ── (a2) THE GATE. No proof, no ownership. ──
    // Re-checked here rather than trusted from the caller: this is the single
    // line that decides whether a listing can be marked owned, and it should
    // not be possible to skip it by calling the wrong function.
    if (!skipVerificationCheck && !(await isEmailVerified(sb, userId))) {
      throw new Error(`refusing to finalize: ${email} has never verified its address`)
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
      //
      // The comp fields MUST be cleared in the same write. Migration 261 has
      // CHECK (comp_expires_at IS NULL OR stripe_subscription_id IS NULL): a
      // comped row that keeps its expiry would make this update fail the
      // constraint, so an operator whose comp had lapsed could pay and never
      // be upgraded. And the error MUST be checked — swallowing it left the
      // subscription orphaned in Stripe while the gates still read unpaid.
      const { error: upgradeErr } = await sb
        .from('listing_claims')
        .update({
          tier,
          stripe_subscription_id,
          stripe_customer_id,
          status: 'active',
          comp_expires_at: null,
          comp_granted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingActive.id)
      if (upgradeErr) {
        throw new Error(`listing_claims paid upgrade failed: ${upgradeErr.message}`)
      }
    }

    // ── (d) Flip display state; this is the field that syncs to the vertical ──
    const upd = await updateListing(listing_id, { is_claimed: true }, { action: 'claim-grant' })
    if (!upd.success) throw new Error(`updateListing failed: ${upd.error}`)

    // ── (e) Close the moderation record. Only now is it truly 'approved'. ──
    if (source_review_id) {
      await sb
        .from('claims_review')
        .update({ status: 'approved', verified_at: new Date().toISOString() })
        .eq('id', source_review_id)
        .then(null, err => console.error('[finalizeClaim] claims_review close failed:', err.message))
    }

    const listing = await listingForLog(sb, listing_id)
    await logListingActivity(sb, listing, { id: userId, email, role: 'operator' }, {
      action: ACTIVITY_ACTIONS.LISTING_CLAIMED,
      field: 'is_claimed',
      summary: `${email} verified their address and now owns this listing`,
      details: {
        claimant_email: email,
        tier,
        source_review_id,
        proof: skipVerificationCheck ? 'stripe_payment' : 'email_verified',
      },
    })

    // ── (g) Share kit — congratulations, and how to tell people ──
    // Fired HERE, not on admin approval, because it says the listing is live
    // and points at the operator dashboard. Under the 265 gate an approved
    // claim owns nothing yet: the dashboard would 403 them ('Vendor role
    // required') and the congratulations would be for something that hadn't
    // happened. Tying it to ownership means it goes out exactly when it becomes
    // true, whichever way ownership was reached — verification or payment.
    //
    // Best-effort: a share kit is a nicety and must never fail a completed
    // claim. sendShareKit has its own share_kit_sent_at guard, so this cannot
    // double-send however many times finalizeClaim re-runs.
    try {
      let claimantName = null
      if (source_review_id) {
        const { data: review } = await sb
          .from('claims_review')
          .select('claimant_name')
          .eq('id', source_review_id)
          .maybeSingle()
        claimantName = review?.claimant_name || null
      }
      const { sendShareKit } = await import('@/lib/agents/operator-amplification-agent')
      sendShareKit(listing_id, email, claimantName)
        .catch(err => console.error('[finalizeClaim] share kit failed (claim stands):', err.message))
    } catch (err) {
      console.error('[finalizeClaim] share kit could not be dispatched (claim stands):', err.message)
    }

    // provisioned=true means the auth user is new; linkSent=true means an
    // address-confirmation email actually went out just now (for a new user OR
    // an existing unconfirmed one). Approval comms branch on linkSent so they
    // never promise a link that doesn't exist, nor point someone at a password
    // sign-in they cannot yet use.
    return { ok: true, userId, claimId, provisioned, linkSent }
  } catch (err) {
    // ── (f) Log failure for admin retry (real failed_role_promotions columns) ──
    await sb
      .from('failed_role_promotions')
      .insert({
        user_email: email || null,
        claim_id: source_review_id,
        target_role: 'vendor',
        vertical,
        error_message: (err.message || 'finalizeClaim failed').slice(0, 500),
      })
      .then(null, logErr => console.error('[finalizeClaim] failed_role_promotions insert error:', logErr.message))

    console.error('[finalizeClaim] error:', err.message)
    return { ok: false, error: err.message }
  }
}

/**
 * Both halves, for callers who may or may not already hold proof.
 *
 * Keeps the original name and return shape so existing call sites read the
 * same, but the outcome now depends on whether the address is verified:
 *   verified   → ownership is written, exactly as before
 *   unverified → invite sent, claim parked, `pendingVerification: true`, and
 *                the listing stays unclaimed
 *
 * Callers that treat `ok: true` as "the operator owns it now" must check
 * pendingVerification — the approval email copy branches on it.
 */
export async function grantClaim(args) {
  const begun = await beginClaim(args)
  if (!begun.ok) return begun

  if (!begun.verified) {
    return {
      ok: true,
      pendingVerification: true,
      userId: begun.userId,
      provisioned: begun.provisioned,
      linkSent: begun.linkSent,
      claimId: null,
    }
  }

  const done = await finalizeClaim(args)
  // Carry provisioned through: the approval email needs to know whether it can
  // promise a sign-in link that was actually just sent.
  return done.ok ? { ...done, provisioned: begun.provisioned || done.provisioned } : done
}

/**
 * The moment of proof: settle every claim waiting on this address.
 *
 * Called from /auth/callback after a successful verifyOtp — whichever link
 * type got them here — and again from the claim-integrity sweep as a backstop,
 * so a claim can never be stranded by a browser closed at the wrong moment.
 *
 * Fail-soft by contract. This runs inside a sign-in redirect; an operator who
 * has just proven their address must land on their destination whether or not
 * the bookkeeping behind them succeeded. Anything that fails here is retried by
 * the sweep on its next pass.
 *
 * @param {object} user  the freshly verified auth user ({ id, email })
 * @returns {Promise<{ finalized: number, failed: number }>}
 */
export async function finalizePendingClaimsForUser(user) {
  const email = (user?.email || '').toLowerCase().trim()
  if (!email) return { finalized: 0, failed: 0 }

  const sb = getSupabaseAdmin()
  let finalized = 0
  let failed = 0

  try {
    // Only rows genuinely waiting. A claim already 'approved' has its ownership
    // row and must not be touched — this is the path 25 verified operators
    // already took, and re-running must be a no-op for them.
    const { data: waiting, error } = await sb
      .from('claims_review')
      .select('id, listing_id, vertical, claimant_email, tier')
      .eq('status', 'pending_verification')
      .eq('claimant_email', email)
    if (error) throw error
    if (!waiting?.length) return { finalized: 0, failed: 0 }

    for (const claim of waiting) {
      // tier is forced to 'free' here: a 'standard' claim only becomes standard
      // through the Stripe webhook, which carries the subscription id that
      // assertGrantArgs demands. Finalizing on verification alone must never
      // hand out a paid tier.
      const res = await finalizeClaim({
        listing_id: claim.listing_id,
        vertical: claim.vertical,
        claimant_email: claim.claimant_email,
        tier: 'free',
        source_review_id: claim.id,
      })
      if (res.ok) finalized++
      else { failed++; console.error(`[finalizePendingClaims] ${claim.id} failed:`, res.error) }
    }
  } catch (err) {
    console.error('[finalizePendingClaims] swept with errors:', err.message)
  }

  return { finalized, failed }
}
