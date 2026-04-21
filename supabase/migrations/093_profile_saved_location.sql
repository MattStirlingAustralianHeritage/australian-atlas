-- ============================================================
-- Migration 093: Add saved location columns to profiles
-- Allows logged-in users to persist their location preference
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS saved_latitude double precision,
  ADD COLUMN IF NOT EXISTS saved_longitude double precision,
  ADD COLUMN IF NOT EXISTS saved_location_name text;

COMMENT ON COLUMN profiles.saved_latitude IS 'User-saved latitude for "near me" features';
COMMENT ON COLUMN profiles.saved_longitude IS 'User-saved longitude for "near me" features';
COMMENT ON COLUMN profiles.saved_location_name IS 'Human-readable location name (e.g. "Fitzroy, Melbourne")';
