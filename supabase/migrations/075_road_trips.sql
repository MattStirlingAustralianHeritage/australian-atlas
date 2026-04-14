-- ============================================================
-- 075: Road Trips — shareable On This Road itineraries
-- ============================================================

CREATE TABLE IF NOT EXISTS road_trips (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  TEXT UNIQUE NOT NULL,
  short_code            TEXT UNIQUE NOT NULL,
  title                 TEXT NOT NULL,
  start_name            TEXT,
  end_name              TEXT,
  start_coords          JSONB,
  end_coords            JSONB,
  route_geometry        JSONB,
  return_route_geometry JSONB,
  departure_timing      TEXT,
  trip_length           TEXT,
  detour_tolerance      TEXT,
  preferences           TEXT[] DEFAULT '{}',
  is_surprise_me        BOOLEAN DEFAULT FALSE,
  is_return_different   BOOLEAN DEFAULT FALSE,
  intro                 TEXT,
  days                  JSONB NOT NULL DEFAULT '[]',
  route_distance_km     INTEGER,
  route_duration_minutes INTEGER,
  total_listings_found  INTEGER,
  coverage_gaps         JSONB,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id            TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  og_image_url          TEXT
);

CREATE INDEX IF NOT EXISTS idx_road_trips_slug ON road_trips (slug);
CREATE INDEX IF NOT EXISTS idx_road_trips_short_code ON road_trips (short_code);
CREATE INDEX IF NOT EXISTS idx_road_trips_created_at ON road_trips (created_at DESC);

-- Also add best_season as text array if it doesn't exist as one.
-- Migration 061 added best_season as TEXT; we keep it as-is since it's
-- already populated. Seasonal awareness reads it directly.
