-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 027: Claims review table
-- Centralised claims review across all verticals
-- ============================================================

CREATE TABLE IF NOT EXISTS claims_review (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       uuid REFERENCES listings(id) ON DELETE CASCADE,
  vertical         text NOT NULL,
  source_claim_id  text,          -- ID from the vertical's own claims table
  claimant_name    text,
  claimant_email   text NOT NULL,
  tier             text DEFAULT 'free',
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes      text,
  created_at       timestamptz DEFAULT now(),
  reviewed_at      timestamptz
);

CREATE INDEX idx_claims_review_status ON claims_review(status);
CREATE INDEX idx_claims_review_vertical ON claims_review(vertical);
CREATE INDEX idx_claims_review_created ON claims_review(created_at DESC);
