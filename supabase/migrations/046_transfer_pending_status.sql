-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 046: Add transfer_pending to claims_review status
-- Supports ownership transfer flow (re-claim after rejection)
-- ============================================================

-- Drop existing CHECK constraint and re-create with new status
ALTER TABLE claims_review
  DROP CONSTRAINT IF EXISTS claims_review_status_check;

ALTER TABLE claims_review
  ADD CONSTRAINT claims_review_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'transfer_pending'));
