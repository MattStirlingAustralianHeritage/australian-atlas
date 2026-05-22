-- Migration 129: Expand discovery_source check constraint on way_candidates
--
-- The original constraint (migration 122) only allowed:
--   cli_seed, places_auto, manual_admin, cross_reference
--
-- The shadow discovery run introduces scraper-sourced candidates that
-- need their provenance recorded accurately:
--   eco_certified             — ECO Certified directory scrape
--   australian_tourism_awards — Australian Tourism Awards scrape
--   eco_certified+australian_tourism_awards — candidate found in both
--   shadow_scrape             — generic shadow run source (future use)

ALTER TABLE way_candidates DROP CONSTRAINT IF EXISTS way_candidates_discovery_source_check;
ALTER TABLE way_candidates ADD CONSTRAINT way_candidates_discovery_source_check
  CHECK (discovery_source IN (
    'cli_seed', 'places_auto', 'manual_admin', 'cross_reference',
    'eco_certified', 'australian_tourism_awards',
    'eco_certified+australian_tourism_awards',
    'shadow_scrape'
  ));
