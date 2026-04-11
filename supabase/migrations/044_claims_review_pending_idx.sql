-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 044: Partial unique index on pending claims
-- DB-level guard: only one pending claim per listing at a time
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS claims_review_listing_pending_idx
  ON claims_review (listing_id)
  WHERE status = 'pending';
