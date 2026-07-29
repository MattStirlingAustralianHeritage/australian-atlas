-- 267_claim_remediation_outreach.sql
--
-- Per-recipient record for the claim remediation outreach
-- (/admin/claim-remediation).
--
-- Context: before migration 265, admin approval created ownership outright —
-- listings.is_claimed=true, an active listing_claims row, a vendor profile —
-- without ever confirming the claimed address belonged to the claimant. 33
-- listings are still in that state: marked owned by an address that has never
-- been proven. 265 stopped it happening again; this outreach is how the
-- existing 33 get resolved.
--
-- It is deliberately NOT another cron. These messages admit a fault to real
-- operators, some of whom may not be the rightful owner at all — precisely
-- because we never checked. That is a conversation to have one at a time, with
-- a person deciding, which is why the console is manual and this column records
-- what a human did rather than what a schedule did.
--
--   remediation_sent_at  — when the remediation email went to this claimant.
--                          NULL means never contacted. One send per claim; the
--                          console re-sends only on an explicit override.
--
-- Distinct from every other stamp on the claim:
--   claims_review.nudge_sent_at              abandoned Stripe checkout
--   listing_claims.activation_nudge_sent_at  granted, never signed in
--   claims_review.verification_nudge_sent_at approved, never verified (post-265)
-- Sharing any of them would conflate "we chased you" with "we apologised to
-- you", and the console needs to show those separately.
--
-- Additive and nullable; no backfill. Every existing row starts NULL, i.e.
-- not yet contacted, which is true.

ALTER TABLE listing_claims
  ADD COLUMN IF NOT EXISTS remediation_sent_at timestamptz;

COMMENT ON COLUMN listing_claims.remediation_sent_at IS
  'When the claim-remediation email was sent to this claimant from /admin/claim-remediation. NULL = never contacted. Records a human decision, not an automated send — distinct from activation_nudge_sent_at (automated chase).';

CREATE INDEX IF NOT EXISTS idx_listing_claims_remediation_pending
  ON listing_claims (claimed_at)
  WHERE remediation_sent_at IS NULL AND status IN ('active', 'past_due');
