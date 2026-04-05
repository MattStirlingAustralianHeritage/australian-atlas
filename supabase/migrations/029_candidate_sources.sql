-- Expand listing_candidates source values and add description column
-- Adds: 'coverage_gap', 'map_coverage_audit', 'automated_discovery'

-- Drop existing source constraint if it exists
ALTER TABLE listing_candidates DROP CONSTRAINT IF EXISTS listing_candidates_source_check;

-- Add expanded source constraint
ALTER TABLE listing_candidates ADD CONSTRAINT listing_candidates_source_check
  CHECK (source IN (
    'web_search',
    'council_suggested',
    'user_suggested',
    'coverage_gap',
    'map_coverage_audit',
    'automated_discovery'
  ));

-- Add description column for candidate review enrichment
ALTER TABLE listing_candidates ADD COLUMN IF NOT EXISTS description text;
