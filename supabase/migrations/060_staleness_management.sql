-- ============================================================
-- Migration 060: Staleness management system
-- Adds community reporting, staleness flags, and extends listing
-- status to support closure states and verification tracking.
-- ============================================================

-- 1. Add staleness_flags (JSONB) for structured flag storage
--    e.g. { "url_dead": true, "google_status": "CLOSED_PERMANENTLY",
--           "community_reports": [{ "type": "permanently_closed", "submitted_at": "..." }] }
ALTER TABLE listings ADD COLUMN IF NOT EXISTS staleness_flags jsonb;

-- 2. Add community_reports counter
ALTER TABLE listings ADD COLUMN IF NOT EXISTS community_reports integer NOT NULL DEFAULT 0;

-- 3. last_verified_at already exists (nullable timestamp) — no change needed

-- 4. status column already exists as text. Current values: 'active', 'hidden', 'inactive'.
--    New values: 'temporarily_closed', 'permanently_closed', 'unverified'.
--    No CHECK constraint exists on status, so no ALTER needed — new values work immediately.

-- 5. Index for the staleness review queue — find flagged listings fast
CREATE INDEX IF NOT EXISTS idx_listings_staleness_review
  ON listings (status, community_reports)
  WHERE status IN ('unverified', 'temporarily_closed', 'permanently_closed')
     OR community_reports > 0
     OR staleness_flags IS NOT NULL;

-- 6. Index for the URL-check cron job — find stale listings efficiently
CREATE INDEX IF NOT EXISTS idx_listings_verification_due
  ON listings (last_verified_at NULLS FIRST)
  WHERE status = 'active' AND website IS NOT NULL;
