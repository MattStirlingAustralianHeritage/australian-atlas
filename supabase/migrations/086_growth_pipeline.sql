-- ============================================================
-- 086: Growth Pipeline — stage tracking for listing candidates
-- ============================================================

-- Add pipeline stage to listing_candidates
-- Maps the 5-stage pipeline: discover → verify → curate → prepare → queue
ALTER TABLE listing_candidates
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'discover'
  CHECK (pipeline_stage IN ('discover', 'verify', 'curate', 'prepare', 'queue'));

ALTER TABLE listing_candidates
  ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE listing_candidates
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

ALTER TABLE listing_candidates
  ADD COLUMN IF NOT EXISTS google_place_id TEXT;

ALTER TABLE listing_candidates
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE listing_candidates
  ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE listing_candidates
  ADD COLUMN IF NOT EXISTS lat FLOAT;

ALTER TABLE listing_candidates
  ADD COLUMN IF NOT EXISTS lng FLOAT;

ALTER TABLE listing_candidates
  ADD COLUMN IF NOT EXISTS state TEXT;

ALTER TABLE listing_candidates
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE listing_candidates
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT;

ALTER TABLE listing_candidates
  ADD COLUMN IF NOT EXISTS sub_type TEXT;

CREATE INDEX IF NOT EXISTS idx_candidates_pipeline_stage ON listing_candidates(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_candidates_priority ON listing_candidates(priority DESC);

-- Backfill: pending candidates with gate_results go to 'queue' stage,
-- those without go to 'discover'
UPDATE listing_candidates
SET pipeline_stage = CASE
  WHEN status = 'converted' THEN 'queue'
  WHEN status = 'rejected' THEN 'queue'
  WHEN gate_results IS NOT NULL AND confidence >= 0.5 THEN 'queue'
  WHEN gate_results IS NOT NULL THEN 'verify'
  ELSE 'discover'
END
WHERE pipeline_stage = 'discover' OR pipeline_stage IS NULL;
