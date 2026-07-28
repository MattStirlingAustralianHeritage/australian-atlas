-- 261: time-boxed comped Standard grants.
--
-- An admin can grant Standard without a Stripe subscription (the side door in
-- app/api/admin/claims/route.js → handleSetTier — payment taken by invoice or
-- phone, or a genuine comp). Until now every such grant was PERPETUAL: nothing
-- recorded an end date and nothing ever took it back, so "have a free year on
-- us" quietly became "free forever".
--
-- These columns let a comp carry a term. The semantics, on a row with
-- tier='standard' AND stripe_subscription_id IS NULL:
--
--   comp_expires_at IS NULL      → in perpetuity (the old behaviour, still the
--                                  explicit choice for a permanent partner comp)
--   comp_expires_at > now()      → comp running; Standard benefits live
--   comp_expires_at <= now()     → comp LAPSED; the listing is Free again
--
-- Enforcement is deliberately two-layered, read-time first:
--   1. filterPaidListingIds (lib/listing-gallery.js) treats a lapsed comp as
--      unpaid. This is the authority — benefits stop the moment the term ends,
--      whether or not any sweep has run.
--   2. sweepExpiredComps (lib/claims/comp.js), called by the claim-integrity
--      cron every 6h, writes tier back to 'free' so the stored row matches what
--      the gates already believe, and emails the admin that the term ran out.
--
-- Deliberately NOT modelled as a status: 'active'/'past_due' are ownership
-- states and a lapsed comp does not end ownership. The operator keeps the
-- listing, they just drop to Free — exactly what a Stripe cancellation does to
-- tier, minus the cancellation.

ALTER TABLE listing_claims
  ADD COLUMN IF NOT EXISTS comp_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comp_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comp_note        TEXT;

COMMENT ON COLUMN listing_claims.comp_expires_at IS
  'End of a comped Standard term. NULL on a comped row = in perpetuity. Always NULL on Stripe-billed rows (they expire through Stripe).';
COMMENT ON COLUMN listing_claims.comp_granted_at IS
  'When the current comped Standard term was granted. NULL = never comped (distinguishes a perpetual comp from a row that was never comped at all).';
COMMENT ON COLUMN listing_claims.comp_note IS
  'Why this comp was granted — free text for the admin (e.g. "paid by invoice INV-0042", "founding operator").';

-- A comp is by definition unpaid. A Stripe-billed row must never carry a comp
-- term: its lifecycle belongs to Stripe, and a stray expiry here would silently
-- downgrade a paying operator.
ALTER TABLE listing_claims DROP CONSTRAINT IF EXISTS listing_claims_comp_not_stripe;
ALTER TABLE listing_claims
  ADD CONSTRAINT listing_claims_comp_not_stripe
  CHECK (comp_expires_at IS NULL OR stripe_subscription_id IS NULL);

-- The sweep's working set: comped Standard rows with a term, soonest first.
CREATE INDEX IF NOT EXISTS idx_listing_claims_comp_expiry
  ON listing_claims (comp_expires_at)
  WHERE comp_expires_at IS NOT NULL AND tier = 'standard';
