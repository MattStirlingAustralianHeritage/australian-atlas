-- 214: listing billing lifecycle — renewal + grace-period (dunning) state for
-- paid listing claims.
--
-- The Stripe webhook (app/api/stripe/webhook/route.js) already handles
-- invoice.payment_failed / invoice.payment_succeeded for councils and
-- operators (their accounts carry status='past_due' + billing_cycle_end), but
-- LISTING subscriptions only logged. This migration gives listing_claims the
-- same lifecycle columns, mirroring council_accounts / operator_accounts:
--
--   billing_cycle_end — end of the current paid year. Stamped at checkout and
--                       refreshed to now()+1yr on each successful renewal
--                       invoice. Read by renewal-reminder tooling.
--   past_due_since    — set when Stripe first reports a failed payment for the
--                       subscription; preserved across Stripe's retry attempts
--                       (the webhook keeps the FIRST failure time); cleared
--                       when a retry succeeds.
--
-- Status model widens from ('active','inactive') to include 'past_due'.
-- 'past_due' is a GRACE state, not a cut-off: paid perks keep working
-- (lib/listing-gallery.js counts it as paid) and listings.is_claimed stays
-- true, but /admin/claims surfaces it with an amber badge and the operator is
-- emailed to update their card. Stripe's retry schedule drives transitions:
--   invoice.payment_failed          → 'past_due' (past_due_since stamped once)
--   invoice.payment_succeeded       → 'active'   (past_due_since cleared,
--                                                 billing_cycle_end refreshed)
--   customer.subscription.deleted   → 'inactive' (retries exhausted/cancelled)
--
-- NOTE: idx_listing_claims_one_active (migration 140) keeps its
-- WHERE status = 'active' predicate unchanged. A past_due row therefore falls
-- outside the at-most-one-owner uniqueness guarantee; the webhook and
-- grantClaim treat 'past_due' as still-owned, and prefer the 'active' row
-- wherever both could exist.

ALTER TABLE listing_claims
  ADD COLUMN IF NOT EXISTS billing_cycle_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS past_due_since   TIMESTAMPTZ;

-- Widen the status CHECK. Migration 140 defined status inline
-- (status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))),
-- so Postgres auto-named the constraint listing_claims_status_check.
ALTER TABLE listing_claims
  DROP CONSTRAINT IF EXISTS listing_claims_status_check;

ALTER TABLE listing_claims
  ADD CONSTRAINT listing_claims_status_check
  CHECK (status IN ('active', 'inactive', 'past_due'));

-- Renewal-reminder scans ("which paid claims renew in the next N days") read
-- billing_cycle_end across the whole table; keep that cheap.
CREATE INDEX IF NOT EXISTS idx_listing_claims_billing_cycle_end
  ON listing_claims (billing_cycle_end)
  WHERE billing_cycle_end IS NOT NULL;

-- RLS: unchanged. Migration 140 already enables RLS with owner-read-own and
-- service-role-only writes; the new columns inherit that posture.
