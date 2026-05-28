-- Plan-a-Stay v2: Share support
-- Adds fingerprint for idempotent sharing and stays_only for accommodation-only trips.
-- Makes retrieval nullable (share endpoint stores lean rows).

ALTER TABLE plan_a_stay_trips
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS stays_only  JSONB;

ALTER TABLE plan_a_stay_trips
  ALTER COLUMN retrieval DROP NOT NULL;

ALTER TABLE plan_a_stay_trips
  ALTER COLUMN trip DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_a_stay_trips_fingerprint
  ON plan_a_stay_trips(fingerprint)
  WHERE fingerprint IS NOT NULL;
