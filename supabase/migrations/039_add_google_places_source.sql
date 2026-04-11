-- Expand the source check constraint to allow 'google_places' as a candidate source.
-- The Google Places API discovery pipeline uses this value to track provenance.

ALTER TABLE listing_candidates DROP CONSTRAINT IF EXISTS listing_candidates_source_check;
ALTER TABLE listing_candidates ADD CONSTRAINT listing_candidates_source_check
  CHECK (source IN (
    'web_search',
    'council_suggested',
    'user_suggested',
    'coverage_gap',
    'map_coverage_audit',
    'automated_discovery',
    'ai_prospector',
    'google_places'
  ));
