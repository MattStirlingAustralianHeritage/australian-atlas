-- Add unique constraint on listing_candidates for upsert deduplication
-- Prevents the same business being recommended twice for the same vertical
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_name_vertical
  ON listing_candidates (lower(trim(name)), vertical);
