-- 183: Mobile listings infrastructure
--
-- A "mobile" venue (presence_type = 'mobile') is a real, in-person experience
-- with NO fixed street address — food trucks, coffee carts, pop-up traders.
-- Unlike a non-visitable / online-only maker, a mobile venue IS visitable and
-- should be discovered & featured like a permanent venue: it appears in search,
-- on region pages, and in card grids. But its EXACT location is never revealed —
-- no street address, no map pin, no "Get Directions" — because it doesn't have
-- one. Discovery is carried by its region (home base / service area).
--
-- The presence_type / visitable columns originated in migration 087; this
-- migration re-asserts them idempotently (so prod is guaranteed to have them
-- before the consumer code below ships) and adds the `service_area` free-text
-- field for the operator's "where to find them" line.

-- Re-assert presence/visitable columns (idempotent; originally migration 087).
ALTER TABLE listings ADD COLUMN IF NOT EXISTS visitable BOOLEAN DEFAULT TRUE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS presence_type TEXT DEFAULT 'permanent';

-- Guarantee the presence_type CHECK exists (and includes 'mobile') without
-- erroring when migration 087 already created it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_presence_type_check') THEN
    ALTER TABLE listings ADD CONSTRAINT listings_presence_type_check
      CHECK (presence_type IN (
        'permanent', 'by_appointment', 'markets', 'online', 'seasonal', 'mobile'
      ));
  END IF;
END $$;

-- Optional "where to find them" line for mobile / market venues, e.g.
-- "Weekends at Mornington & Red Hill markets — see socials for this week's spot".
-- Falls back to the region name in the UI when null.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS service_area TEXT;

-- Fast lookup of mobile / non-permanent venues.
CREATE INDEX IF NOT EXISTS idx_listings_presence_type ON listings (presence_type);

NOTIFY pgrst, 'reload schema';
