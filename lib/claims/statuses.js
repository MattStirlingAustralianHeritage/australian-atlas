// Single source of truth for which listing_claims statuses count as LIVE
// ownership. 'past_due' is Stripe's dunning window — the card is being
// retried, the operator still owns the listing (migration 256's triggers
// treat it as live), and their dashboard must keep working.
//
// Cancelling a subscription does NOT end ownership: the cancel webhook drops
// the claim to tier 'free' and leaves it live, because the operator held a
// free claim before they ever upgraded and cancelling a paid add-on must not
// take that away. 'inactive' is now written only by a deliberate act — an
// admin revoke, or releasing the outgoing owner during a transfer.
//
// Owner-facing gates must use .in('status', LIVE_CLAIM_STATUSES), never a
// bare .eq('status', 'active') — an operator whose card bounced once should
// never wake up to an empty dashboard. That surprise is a lockout, and
// lockouts are the incident class this repo has sworn off twice.
export const LIVE_CLAIM_STATUSES = ['active', 'past_due']
