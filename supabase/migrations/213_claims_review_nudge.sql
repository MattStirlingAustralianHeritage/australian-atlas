-- 213_claims_review_nudge.sql
--
-- Abandoned paid-claim recovery. A claims_review row (tier='standard',
-- status='pending') is created BEFORE the operator is redirected to Stripe
-- checkout; if they never complete payment the lead sits pending forever and
-- nothing follows up — a captured, consented lead with demonstrated $295 intent
-- left on the floor.
--
-- nudge_sent_at is the idempotency stamp for the recovery cron
-- (app/api/cron/claim-recovery): the cron emails a pending claimant once,
-- 24h–30d after they abandoned, and stamps this so they are never emailed twice.
--
-- NOTE: pay-to-win guard — recovery is a funnel/billing feature; nothing here
-- touches search/map/discover ranking.

ALTER TABLE claims_review
  ADD COLUMN IF NOT EXISTS nudge_sent_at TIMESTAMPTZ;

-- The cron scans "pending standard claims not yet nudged"; keep it cheap.
CREATE INDEX IF NOT EXISTS idx_claims_review_pending_nudge
  ON claims_review (created_at)
  WHERE status = 'pending' AND nudge_sent_at IS NULL;

-- RLS: unchanged (service-role only, as elsewhere on claims_review).

NOTIFY pgrst, 'reload schema';
