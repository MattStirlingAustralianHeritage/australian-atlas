-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 031: Additional staleness management columns
-- ============================================================

-- HTTP status code from last URL check (e.g. 200, 301, 404, 500)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS website_status_code integer;

-- Flag for listings marked for removal review
ALTER TABLE listings ADD COLUMN IF NOT EXISTS removal_flagged boolean DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS removal_flagged_at timestamptz;

-- is_claimed may already exist from 002_core_listings — add defensively
ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_claimed boolean DEFAULT false;
