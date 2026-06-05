-- 140: listing_claims — commercial ownership / billing record for claimed venues.
--
-- One row per GRANTED claim. This is DISTINCT from claims_review (the intake /
-- moderation queue): claims_review holds every submitted claim request; this
-- table holds only claims that have been granted (free concierge grant, or
-- standard paid). Billing/subscription state lives HERE, never on listings.
--
-- INVARIANT (enforced in application code — see lib/claims/grantClaim.js and
-- app/api/stripe/webhook/route.js, guaranteed at-most-one by the partial unique
-- index below):
--     listings.is_claimed = true  <=>  exactly one listing_claims row with
--                                       status = 'active' for that listing.
-- listings.is_claimed remains the ONLY claim-related field that syncs down to
-- the vertical source DBs (it is display state: drives the claimed badge and
-- operator hero-image source). Commercial state never leaves this table.
--
-- Named listing_claims (not claims) deliberately: a portal `claims` table is
-- referenced by two cron agents (revenue-signal, monday-briefing) with an
-- intake-pipeline contract (status='pending' = awaiting payment) that differs
-- from this granted-ownership model; reusing the name would feed them wrong
-- data. See migration history / repair notes.

CREATE TABLE IF NOT EXISTS listing_claims (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id             UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  vertical               TEXT NOT NULL,                          -- denormalised, mirrors claims_review.vertical
  claimed_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- owning auth user (profiles.id == auth.users.id)
  claimant_email         TEXT NOT NULL,
  tier                   TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'standard')),
  stripe_subscription_id TEXT,
  stripe_customer_id     TEXT,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  source_review_id       UUID REFERENCES claims_review(id) ON DELETE SET NULL,
  claimed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one ACTIVE owner per listing (the half of the invariant the DB can enforce).
CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_claims_one_active
  ON listing_claims (listing_id) WHERE status = 'active';

-- Dashboard ownership lookups (later: "my listings" by owner).
CREATE INDEX IF NOT EXISTS idx_listing_claims_claimed_by
  ON listing_claims (claimed_by);

-- Webhook cancellation lookup by Stripe subscription.
CREATE INDEX IF NOT EXISTS idx_listing_claims_stripe_sub
  ON listing_claims (stripe_subscription_id);

-- RLS: an authenticated user may read only their own claims. All writes are
-- service-role only (service role bypasses RLS; no write policy is defined).
ALTER TABLE listing_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads own claims" ON listing_claims;
CREATE POLICY "owner reads own claims"
  ON listing_claims
  FOR SELECT
  TO authenticated
  USING (claimed_by = auth.uid());
