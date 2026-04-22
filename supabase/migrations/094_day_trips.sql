-- ============================================================
-- Migration 094: Day trip support for trails
-- Extends trails + trail_stops for "Stay Here, Explore From Here"
-- multi-day trip generation from accommodation base listings.
-- ============================================================

-- trip_id groups multiple trail rows (one per day) into a single trip
ALTER TABLE trails
  ADD COLUMN IF NOT EXISTS trip_id UUID,
  ADD COLUMN IF NOT EXISTS base_listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS day_number INTEGER,
  ADD COLUMN IF NOT EXISTS day_theme TEXT,
  ADD COLUMN IF NOT EXISTS total_distance_km DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS estimated_drive_minutes INTEGER;

-- Per-stop fields for day trip context
ALTER TABLE trail_stops
  ADD COLUMN IF NOT EXISTS distance_from_base_km DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS bearing_from_base_deg DOUBLE PRECISION;

-- Extend type check to include 'day_trip'
ALTER TABLE trails DROP CONSTRAINT IF EXISTS trails_type_check;
ALTER TABLE trails ADD CONSTRAINT trails_type_check
  CHECK (type IN ('editorial', 'user', 'day_trip'));

-- Indexes for trip lookups
CREATE INDEX IF NOT EXISTS idx_trails_trip_id ON trails(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trails_base_listing ON trails(base_listing_id) WHERE base_listing_id IS NOT NULL;
