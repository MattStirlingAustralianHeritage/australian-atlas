// The decision rules that guard ownership and payment, in one testable place.
//
// Each of these was previously an inline condition in a route, and each one had
// a hole that cost something real:
//
//   isClaimPayable        a rejected claim's durable pay link could still be
//                         paid, and the webhook force-writes 'approved' — so a
//                         claim we had refused could be bought after the fact.
//   isConfirmationProof   /api/auth/signup confirms an account server-side when
//                         Resend is down. email_confirmed_at is what the claim
//                         gate treats as proof of the mailbox, so an outage was
//                         a window to claim someone else's venue.
//   landsOnPasswordSetup  invite links used to drop the operator on /account
//                         with no password and no prompt to set one — the
//                         "provisioned but never returned" cohort.
//
// .mjs so it is importable by node --test without the Next.js '@/' resolver.

/**
 * Claim statuses a Stripe checkout may be started or completed for.
 *
 * Deliberately an allowlist. 'rejected' and 'transfer_pending' are refusals we
 * have already made about who owns a listing, and taking money against them
 * would reverse that decision without anyone deciding to.
 */
export const PAYABLE_CLAIM_STATUSES = ['pending', 'pending_verification', 'approved']

/** @param {string|null|undefined} status claims_review.status */
export function isClaimPayable(status) {
  return PAYABLE_CLAIM_STATUSES.includes(status)
}

/**
 * Marker written to app_metadata when signup confirms an address WITHOUT the
 * mailbox ever answering (Resend outage fallback). Anything that treats
 * email_confirmed_at as proof must check for this.
 */
export const UNPROVEN_CONFIRM_SOURCE = 'resend_outage_fallback'

/**
 * Did this account's confirmation actually prove control of the mailbox?
 *
 * @param {{ email_confirmed_at?: string|null, app_metadata?: { email_confirm_source?: string } }|null} user
 */
export function isConfirmationProof(user) {
  if (!user?.email_confirmed_at) return false
  if (user.app_metadata?.email_confirm_source === UNPROVEN_CONFIRM_SOURCE) return false
  return true
}

/**
 * Email link types whose holder has no working password yet, and so must be
 * routed to the set-password screen rather than their final destination.
 *
 * 'recovery' — the password is being reset; the link only mints a session, so
 *   landing anywhere else silently turns a reset into a one-machine login.
 * 'invite'  — the account was provisioned for them and never had a password.
 *
 * 'signup' is NOT here: that account chose a password at signup.
 */
export const PASSWORD_SETUP_LINK_TYPES = ['recovery', 'invite']

/** @param {string|null|undefined} type the `type` param on /auth/callback */
export function landsOnPasswordSetup(type) {
  return PASSWORD_SETUP_LINK_TYPES.includes(type)
}
