-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 073: Add sub_types TEXT[] array column to listings
--
-- Enables primary/secondary subcategory system:
--   sub_types[1] = primary subcategory (drives filtering, shown on cards)
--   sub_types[2+] = secondary subcategories (shown on detail pages)
--
-- Backward compatibility:
--   sub_type (TEXT) is kept and auto-synced via trigger from sub_types[1]
-- ============================================================

-- 1. Add sub_types array column
ALTER TABLE listings ADD COLUMN IF NOT EXISTS sub_types TEXT[] DEFAULT '{}';

-- 2. Migrate existing sub_type values into the array
UPDATE listings
SET sub_types = ARRAY[sub_type]
WHERE sub_type IS NOT NULL
  AND sub_type != ''
  AND (sub_types IS NULL OR sub_types = '{}');

-- 3. Index for array containment queries (e.g. WHERE 'brewery' = ANY(sub_types))
CREATE INDEX IF NOT EXISTS listings_sub_types_gin_idx
  ON listings USING GIN (sub_types)
  WHERE sub_types != '{}';

-- 4. Trigger: keep sub_type in sync with sub_types[1] (primary)
-- Whenever sub_types is updated, sub_type is set to the first element.
-- This ensures all existing queries that read sub_type continue to work.
CREATE OR REPLACE FUNCTION sync_sub_type_from_array()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if sub_types was actually changed
  IF NEW.sub_types IS DISTINCT FROM OLD.sub_types THEN
    NEW.sub_type := CASE
      WHEN NEW.sub_types IS NOT NULL AND array_length(NEW.sub_types, 1) > 0
      THEN NEW.sub_types[1]
      ELSE NULL
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_sub_type_from_array ON listings;
CREATE TRIGGER trg_sync_sub_type_from_array
  BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION sync_sub_type_from_array();
