-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 018: User interests / preferences
-- ============================================================
-- Adds an interests JSONB column to profiles for personalised
-- trail recommendations and content weighting.
--
-- Schema:
-- {
--   "verticals": ["sba", "field", "craft"],
--   "activities": ["wine_tasting", "hiking", "markets"],
--   "regions": ["VIC", "TAS"],
--   "dietary": ["vegetarian"]
-- }
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS interests jsonb DEFAULT '{}';

-- Index for querying users by interest (e.g. newsletter segmentation)
CREATE INDEX IF NOT EXISTS profiles_interests_idx
  ON profiles USING gin(interests);
