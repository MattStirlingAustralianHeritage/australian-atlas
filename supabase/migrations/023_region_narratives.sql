-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 023: AI-generated region narrative content
-- ============================================================

CREATE TABLE IF NOT EXISTS region_narratives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  editorial_overview text,
  best_time_to_visit text,
  what_makes_distinct text,
  vertical_highlights jsonb DEFAULT '[]',
  listing_count_at_generation int,
  content_hash text,
  generated_at timestamptz DEFAULT now(),
  UNIQUE(region_id)
);

CREATE INDEX idx_region_narratives_region ON region_narratives(region_id);
