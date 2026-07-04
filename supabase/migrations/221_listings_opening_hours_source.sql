-- 221: provenance for listings.opening_hours.
-- Priority: operator_dashboard > operator_website > google. Additive/nullable.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS opening_hours_source text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='listings_opening_hours_source_check') THEN
    ALTER TABLE listings ADD CONSTRAINT listings_opening_hours_source_check
      CHECK (opening_hours_source IS NULL OR opening_hours_source IN ('google','operator_dashboard','operator_website'));
  END IF;
END $$;
COMMENT ON COLUMN listings.opening_hours_source IS 'Provenance of opening_hours: operator_dashboard > operator_website > google (priority). NULL = none.';
-- Backfill: rows already fetched came from Google.
UPDATE listings SET opening_hours_source='google'
  WHERE opening_hours_fetched_at IS NOT NULL AND opening_hours_source IS NULL;
