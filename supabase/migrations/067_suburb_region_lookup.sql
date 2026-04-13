-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 067: Create suburb-to-region lookup table
--
-- Provides a deterministic mapping from (suburb, state) pairs
-- to canonical Atlas region names. Used by the sync pipeline
-- and backfill scripts to assign correct regions to listings.
--
-- Populated by: scripts/build-suburb-lookup.mjs
-- ============================================================

CREATE TABLE IF NOT EXISTS suburb_region_lookup (
  suburb text NOT NULL,
  state text NOT NULL,
  region text NOT NULL,
  lat double precision,
  lng double precision,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (suburb, state)
);

-- Index for fast lookups by region (for auditing)
CREATE INDEX IF NOT EXISTS idx_suburb_region_lookup_region
  ON suburb_region_lookup (region);

COMMENT ON TABLE suburb_region_lookup IS
  'Deterministic mapping from Australian suburbs to Atlas regions. '
  'Built via Mapbox geocoding + metro bounding boxes + nearest-region logic.';
