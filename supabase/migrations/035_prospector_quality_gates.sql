-- Prospector Quality Gates — disqualified candidates and wrong-vertical reclassifications
-- Part of the gate-based candidate verification pipeline

-- Candidates that failed a quality gate during prospecting
CREATE TABLE IF NOT EXISTS candidates_disqualified (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vertical text,
  region text,
  gate_failed integer NOT NULL CHECK (gate_failed >= 0 AND gate_failed <= 4),
  reason text NOT NULL,
  data_at_failure jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_disqualified_vertical ON candidates_disqualified(vertical);
CREATE INDEX idx_disqualified_gate ON candidates_disqualified(gate_failed);
CREATE INDEX idx_disqualified_created ON candidates_disqualified(created_at DESC);

-- Candidates identified as belonging to a different vertical
CREATE TABLE IF NOT EXISTS candidates_wrong_vertical (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  detected_vertical text,
  suggested_vertical text NOT NULL,
  justification text,
  url text,
  region text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_wrong_vertical_suggested ON candidates_wrong_vertical(suggested_vertical);
CREATE INDEX idx_wrong_vertical_detected ON candidates_wrong_vertical(detected_vertical);

-- Add gate_results column to listing_candidates for display in review UI
ALTER TABLE listing_candidates ADD COLUMN IF NOT EXISTS gate_results jsonb;

-- Expand source constraint to include ai_prospector (used by daily cron)
ALTER TABLE listing_candidates DROP CONSTRAINT IF EXISTS listing_candidates_source_check;
ALTER TABLE listing_candidates ADD CONSTRAINT listing_candidates_source_check
  CHECK (source IN (
    'web_search',
    'council_suggested',
    'user_suggested',
    'coverage_gap',
    'map_coverage_audit',
    'automated_discovery',
    'ai_prospector'
  ));
