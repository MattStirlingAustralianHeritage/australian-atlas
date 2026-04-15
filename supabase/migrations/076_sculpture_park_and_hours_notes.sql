-- Add sculpture_park to collection_meta institution_type CHECK constraint
-- Add hours_notes (TEXT) and by_appointment (BOOLEAN) to meta tables for irregular hours

-- ── 1. Sculpture Park subcategory ────────────────────────────────────────────
-- Drop and recreate the CHECK constraint to include sculpture_park
ALTER TABLE collection_meta DROP CONSTRAINT IF EXISTS collection_meta_institution_type_check;
ALTER TABLE collection_meta ADD CONSTRAINT collection_meta_institution_type_check
  CHECK (institution_type IN ('museum','gallery','heritage_site','botanical_garden','cultural_centre','sculpture_park'));

-- ── 2. hours_notes — free-text fallback for irregular hours ──────────────────
-- Covers: "First Sunday of each month", "Seasonal Oct–Apr", "Closed public holidays",
-- "By appointment preferred", "Call ahead", etc.
-- Does NOT replace existing JSONB opening_hours — this is additive.

ALTER TABLE sba_meta ADD COLUMN IF NOT EXISTS hours_notes TEXT;
ALTER TABLE collection_meta ADD COLUMN IF NOT EXISTS hours_notes TEXT;
ALTER TABLE craft_meta ADD COLUMN IF NOT EXISTS hours_notes TEXT;
ALTER TABLE fine_grounds_meta ADD COLUMN IF NOT EXISTS hours_notes TEXT;
ALTER TABLE rest_meta ADD COLUMN IF NOT EXISTS hours_notes TEXT;
ALTER TABLE corner_meta ADD COLUMN IF NOT EXISTS hours_notes TEXT;
ALTER TABLE found_meta ADD COLUMN IF NOT EXISTS hours_notes TEXT;
ALTER TABLE table_meta ADD COLUMN IF NOT EXISTS hours_notes TEXT;
-- field_meta excluded — natural places don't have operating hours

COMMENT ON COLUMN sba_meta.hours_notes IS 'Free-text for irregular hours the JSONB schema cannot express (seasonal, by-appointment, first-Sunday-of-month, etc.)';
COMMENT ON COLUMN collection_meta.hours_notes IS 'Free-text for irregular hours the JSONB schema cannot express (seasonal, by-appointment, first-Sunday-of-month, etc.)';
COMMENT ON COLUMN craft_meta.hours_notes IS 'Free-text for irregular hours the JSONB schema cannot express (seasonal, by-appointment, first-Sunday-of-month, etc.)';
COMMENT ON COLUMN fine_grounds_meta.hours_notes IS 'Free-text for irregular hours the JSONB schema cannot express (seasonal, by-appointment, first-Sunday-of-month, etc.)';
COMMENT ON COLUMN rest_meta.hours_notes IS 'Free-text for irregular hours the JSONB schema cannot express (seasonal, by-appointment, first-Sunday-of-month, etc.)';
COMMENT ON COLUMN corner_meta.hours_notes IS 'Free-text for irregular hours the JSONB schema cannot express (seasonal, by-appointment, first-Sunday-of-month, etc.)';
COMMENT ON COLUMN found_meta.hours_notes IS 'Free-text for irregular hours the JSONB schema cannot express (seasonal, by-appointment, first-Sunday-of-month, etc.)';
COMMENT ON COLUMN table_meta.hours_notes IS 'Free-text for irregular hours the JSONB schema cannot express (seasonal, by-appointment, first-Sunday-of-month, etc.)';

-- ── 3. by_appointment — structured boolean flag, network-wide ────────────────
-- craft_meta already has by_appointment (migration 003) — skip it.
-- Common across heritage sites, maker studios, small galleries, cellar doors.

ALTER TABLE sba_meta ADD COLUMN IF NOT EXISTS by_appointment BOOLEAN DEFAULT FALSE;
ALTER TABLE collection_meta ADD COLUMN IF NOT EXISTS by_appointment BOOLEAN DEFAULT FALSE;
ALTER TABLE fine_grounds_meta ADD COLUMN IF NOT EXISTS by_appointment BOOLEAN DEFAULT FALSE;
ALTER TABLE rest_meta ADD COLUMN IF NOT EXISTS by_appointment BOOLEAN DEFAULT FALSE;
ALTER TABLE corner_meta ADD COLUMN IF NOT EXISTS by_appointment BOOLEAN DEFAULT FALSE;
ALTER TABLE found_meta ADD COLUMN IF NOT EXISTS by_appointment BOOLEAN DEFAULT FALSE;
ALTER TABLE table_meta ADD COLUMN IF NOT EXISTS by_appointment BOOLEAN DEFAULT FALSE;
-- craft_meta: already has by_appointment
-- field_meta: natural places — not applicable

COMMENT ON COLUMN sba_meta.by_appointment IS 'Venue operates by appointment only or primarily';
COMMENT ON COLUMN collection_meta.by_appointment IS 'Venue operates by appointment only or primarily';
COMMENT ON COLUMN fine_grounds_meta.by_appointment IS 'Venue operates by appointment only or primarily';
COMMENT ON COLUMN rest_meta.by_appointment IS 'Venue operates by appointment only or primarily';
COMMENT ON COLUMN corner_meta.by_appointment IS 'Venue operates by appointment only or primarily';
COMMENT ON COLUMN found_meta.by_appointment IS 'Venue operates by appointment only or primarily';
COMMENT ON COLUMN table_meta.by_appointment IS 'Venue operates by appointment only or primarily';
