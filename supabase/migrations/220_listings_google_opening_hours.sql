-- 166_listings_google_opening_hours.sql
-- Additive, nullable columns on the canonical listings (SSOT) table for Google
-- Places opening hours. Purely additive: no existing column altered, no data
-- mutated. Distinct from the existing `listings.hours` jsonb and from the
-- operator-sourced `*_meta.opening_hours`.
--
-- Source of these columns is Google Places Place Details ONLY. Never fabricated.
-- opening_hours holds the raw legacy Place Details `opening_hours` object
-- (weekday_text = human weekday descriptions, periods = machine ranges).

ALTER TABLE listings ADD COLUMN IF NOT EXISTS opening_hours jsonb;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS opening_hours_status text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS opening_hours_fetched_at timestamptz;

-- Enum guard for opening_hours_status. Added as a NOT VALID-safe named check so
-- re-runs are idempotent and no existing row (all NULL) can violate it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listings_opening_hours_status_check'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_opening_hours_status_check
      CHECK (opening_hours_status IS NULL OR opening_hours_status IN ('published','by_appointment','unavailable'));
  END IF;
END $$;

COMMENT ON COLUMN listings.opening_hours IS 'Google Places Place Details opening_hours object (legacy: weekday_text + periods). Source: Google Places ONLY. Never fabricated. Additive/nullable.';
COMMENT ON COLUMN listings.opening_hours_status IS 'published | by_appointment | unavailable — derived from Google business_status + presence of regular hours. NULL = not yet fetched.';
COMMENT ON COLUMN listings.opening_hours_fetched_at IS 'When Google opening hours were last fetched. Drives ~30-day staleness re-fetch (Google ToS cache cap).';
