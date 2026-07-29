-- 266_verification_nudge_stamp.sql
--
-- Idempotency stamp for the pending-verification chaser
-- (app/api/cron/claim-recovery, phase 3).
--
-- Migration 265 moved ownership behind proof: an approved claim now rests at
-- claims_review.status='pending_verification' with NO listing_claims row until
-- the claimed address answers. That fixed the original fault — listings marked
-- owned by unproven addresses — but it relocated the silent-stranding failure
-- rather than removing it. The activation nudge added in 264 reads
-- listing_claims, so a claim with no ownership row is invisible to it. A
-- claimant who never opens their invite would sit unchased and unreported,
-- exactly as the original 33 did, just one table over.
--
-- Phase 3 chases those claims. It needs its own "already asked once" mark, and
-- it cannot borrow either existing one:
--
--   claims_review.nudge_sent_at        belongs to phase 1 (abandoned Stripe
--                                      checkout, status='pending'). A claim
--                                      nudged while pending and later approved
--                                      would arrive here already stamped and
--                                      be skipped forever — the same
--                                      cross-purpose collision 264 avoided.
--   listing_claims.activation_...      lives on a row that by definition does
--                                      not exist yet for these claims.
--
-- Additive and nullable; no backfill. Rows already in pending_verification
-- start NULL and are therefore eligible, which is what we want.

ALTER TABLE claims_review
  ADD COLUMN IF NOT EXISTS verification_nudge_sent_at timestamptz;

COMMENT ON COLUMN claims_review.verification_nudge_sent_at IS
  'When the "your claim is approved but unconfirmed" chaser was emailed for this claim. Set once by app/api/cron/claim-recovery phase 3; NULL means never chased. Distinct from nudge_sent_at (abandoned-checkout nudge, status=pending) and from listing_claims.activation_nudge_sent_at (granted-but-never-signed-in nudge, which needs an ownership row this claim does not have).';

-- Phase 3 scans claims still waiting and not yet chased — a small, shrinking set.
CREATE INDEX IF NOT EXISTS idx_claims_review_verification_unchased
  ON claims_review (reviewed_at)
  WHERE status = 'pending_verification' AND verification_nudge_sent_at IS NULL;
