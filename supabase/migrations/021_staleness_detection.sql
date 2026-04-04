-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 021: Staleness detection columns
-- ============================================================

-- last_verified_at already exists (added in 010_analytics.sql)
-- Add it defensively in case it was missed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'last_verified_at'
  ) THEN
    ALTER TABLE listings ADD COLUMN last_verified_at timestamptz;
  END IF;
END $$;

-- website_status: tracks URL health — 'live', 'dead', 'redirect', 'timeout', 'unchecked'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'website_status'
  ) THEN
    ALTER TABLE listings ADD COLUMN website_status text;
  END IF;
END $$;

-- website_checked_at: when the URL was last tested
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'website_checked_at'
  ) THEN
    ALTER TABLE listings ADD COLUMN website_checked_at timestamptz;
  END IF;
END $$;

-- Index on last_verified_at for staleness queries
CREATE INDEX IF NOT EXISTS listings_last_verified_at_idx
  ON listings (last_verified_at);

-- Index on website_status for filtering dead/redirect URLs
CREATE INDEX IF NOT EXISTS listings_website_status_idx
  ON listings (website_status);
