-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 022: Listing completeness scores
-- ============================================================

CREATE TABLE IF NOT EXISTS listing_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  vertical text NOT NULL,
  score int NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  missing_fields text[] DEFAULT '{}',
  improvement_note text,
  calculated_at timestamptz DEFAULT now(),
  UNIQUE(listing_id)
);

CREATE INDEX idx_listing_scores_score ON listing_scores(score);
CREATE INDEX idx_listing_scores_vertical ON listing_scores(vertical);
