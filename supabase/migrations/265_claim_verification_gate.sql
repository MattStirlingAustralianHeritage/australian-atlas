-- 265_claim_verification_gate.sql
--
-- Ownership must not exist before the claimed mailbox is proven.
--
-- Until now, admin approval called grantClaim, which in one pass created the
-- auth user, promoted the profile to role='vendor', inserted the ACTIVE
-- listing_claims ownership row, and set listings.is_claimed=true — all before
-- anyone had demonstrated control of the address being claimed. Verification
-- was a thing that might happen afterwards, if the invite link ever got
-- clicked. On 2026-07-29, 33 of 58 live claims had never had that click: real
-- listings marked owned, with vendor accounts provisioned, for addresses
-- nobody had ever proven.
--
-- Two columns support the corrected flow:
--
--   claimed_by  — the AUTHENTICATED submitter. The claim form now requires a
--                 signed-in Atlas account, so a portal claim arrives already
--                 tied to a real identity instead of a free-text string. NULL
--                 for legacy rows and for vertical-originated claims arriving
--                 via /api/internal/sync-claim, which have no portal session.
--
--   verified_at — when control of the claimed address was actually proven.
--                 This is the gate ownership now waits on.
--
-- And one new status. The lifecycle becomes:
--
--   pending → (admin approves) → pending_verification → (address proven) → approved
--
-- 'pending_verification' is deliberately NOT 'approved': claim-integrity's
-- grant_fell_through check reads approved-with-no-ownership-row as a failed
-- grant, and under the new flow that state is the normal, correct resting
-- place between approval and the operator's first sign-in. Giving it its own
-- name keeps that alarm meaningful.
--
-- Additive and nullable; no backfill. Existing 'approved' rows keep their
-- meaning (granted, ownership row exists) and are untouched.

ALTER TABLE claims_review
  ADD COLUMN IF NOT EXISTS claimed_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

COMMENT ON COLUMN claims_review.claimed_by IS
  'Authenticated Atlas user who submitted this claim (auth.users.id). Set by POST /api/claim, which now requires a session. NULL for legacy rows and vertical-originated claims synced via /api/internal/sync-claim.';

COMMENT ON COLUMN claims_review.verified_at IS
  'When control of claimant_email was proven (the address confirmed a sign-in). Ownership — listing_claims + listings.is_claimed + profiles.role=vendor — is only written once this is set.';

-- Extend the status vocabulary. Migration 046 last set this list; keep every
-- existing value so no stored row is invalidated.
ALTER TABLE claims_review
  DROP CONSTRAINT IF EXISTS claims_review_status_check;

ALTER TABLE claims_review
  ADD CONSTRAINT claims_review_status_check
  CHECK (status IN ('pending', 'pending_verification', 'approved', 'rejected', 'transfer_pending'));

-- The finalize step looks up "claims awaiting proof for this address", so the
-- lookup is by email among rows still waiting.
CREATE INDEX IF NOT EXISTS idx_claims_review_awaiting_verification
  ON claims_review (claimant_email)
  WHERE status = 'pending_verification';
