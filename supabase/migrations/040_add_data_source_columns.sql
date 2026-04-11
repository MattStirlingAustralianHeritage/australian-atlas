-- Add data_source and needs_review columns to the listings table.
-- These track provenance and flag AI-generated content for human review.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'manually_curated',
  ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false;

-- Constrain data_source to known values
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_data_source_check;
ALTER TABLE listings ADD CONSTRAINT listings_data_source_check
  CHECK (data_source IN ('ai_generated', 'google_places', 'operator_verified', 'manually_curated'));

-- Index for quick filtering of items needing review
CREATE INDEX IF NOT EXISTS idx_listings_needs_review ON listings (needs_review) WHERE needs_review = true;
