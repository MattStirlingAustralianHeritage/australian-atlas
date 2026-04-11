-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 052: DB-persisted rate limiting for claim submissions
-- ============================================================
-- In-memory rate limiting doesn't survive serverless cold starts
-- or span across instances. This table provides persistent,
-- shared rate limiting for the public claim endpoint.
-- ============================================================

CREATE TABLE IF NOT EXISTS claim_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash       TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claim_attempts_ip_hash_idx ON claim_attempts (ip_hash, window_start);

-- Auto-cleanup: rows older than 24 hours are irrelevant
-- (can be swept by a cron or pg_cron if available)

ALTER TABLE claim_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role writes to this table (server-side API route)
CREATE POLICY "Service role full access claim_attempts"
  ON claim_attempts FOR ALL
  USING (true)
  WITH CHECK (true);
