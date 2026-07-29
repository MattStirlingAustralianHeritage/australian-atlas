-- 264_claim_activation_nudge.sql
--
-- Idempotency stamp for the granted-but-never-activated nudge
-- (app/api/cron/claim-recovery, phase 2).
--
-- Context (2026-07-29 audit): access to a granted claim is delivered as a
-- single-use Supabase invite link, and grantClaim provisions those accounts
-- with no password. Of the operators who ever signed in, 20 of 22 did so
-- within two hours of the grant; 24 who missed that window had never come
-- back, including two paying Standard subscribers. Nothing chased them —
-- claim-recovery only covered abandoned Stripe checkouts, which are
-- claims_review rows still 'pending', a disjoint population from these.
--
-- The nudge needs a per-claim "already emailed once" mark. claims_review
-- .nudge_sent_at is taken by phase 1 and, worse, a row that was nudged while
-- pending and later approved would look already-nudged here and be skipped
-- forever. So this is its own column on the ownership row itself, which is
-- also the row that actually knows the grant happened.
--
-- Additive and nullable: no rename, no type change, no backfill, no consumer
-- reads it until the phase-2 code ships. Safe to apply ahead of the deploy.

ALTER TABLE listing_claims
  ADD COLUMN IF NOT EXISTS activation_nudge_sent_at timestamptz;

COMMENT ON COLUMN listing_claims.activation_nudge_sent_at IS
  'When the granted-but-never-activated sign-in nudge was emailed for this claim. Set once by app/api/cron/claim-recovery phase 2; NULL means never nudged. Distinct from claims_review.nudge_sent_at, which marks the abandoned-checkout nudge.';

-- Partial index: phase 2 only ever scans live claims that have not been
-- nudged, which is a shrinking minority of the table.
CREATE INDEX IF NOT EXISTS idx_listing_claims_activation_pending
  ON listing_claims (claimed_at)
  WHERE activation_nudge_sent_at IS NULL AND status IN ('active', 'past_due');
