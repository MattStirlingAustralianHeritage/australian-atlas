-- Search intent logging tables
-- Tracks search queries and trail generation prompts for editorial insights

-- ── search_logs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS search_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text  text        NOT NULL,
  vertical_filter text,
  result_count int,
  session_id  text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_search_logs_created_at ON search_logs (created_at);
CREATE INDEX idx_search_logs_session_id ON search_logs (session_id);

ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;

-- Service-role only insert (no anon/authenticated access)
CREATE POLICY "Service role insert only"
  ON search_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ── trail_logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trail_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_text       text        NOT NULL,
  region_detected   text,
  verticals_included text[],
  days_generated    int,
  session_id        text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_trail_logs_created_at ON trail_logs (created_at);
CREATE INDEX idx_trail_logs_session_id ON trail_logs (session_id);

ALTER TABLE trail_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role insert only"
  ON trail_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);
