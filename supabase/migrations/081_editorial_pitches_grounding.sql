-- Add grounding columns to editorial_pitches for the two-phase pipeline.
-- Every pitch is now anchored to a real listing with verified data.

ALTER TABLE editorial_pitches
  ADD COLUMN IF NOT EXISTS listing_id uuid REFERENCES listings(id),
  ADD COLUMN IF NOT EXISTS confidence text CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  ADD COLUMN IF NOT EXISTS verified_facts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS research_needed text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cross_vertical_connections jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS data_richness_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS listing_data_snapshot jsonb;

-- Add brief column if missing (was added ad-hoc, not in original migration)
ALTER TABLE editorial_pitches
  ADD COLUMN IF NOT EXISTS brief jsonb;

CREATE INDEX IF NOT EXISTS idx_editorial_pitches_listing_id ON editorial_pitches(listing_id);
