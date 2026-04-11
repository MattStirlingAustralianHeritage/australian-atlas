-- Trail error logging table for diagnostics and monitoring
-- Captures every failure in the trail builder API route

CREATE TABLE IF NOT EXISTS trail_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination text,
  preferences jsonb,
  error_message text,
  error_type text CHECK (error_type IN ('timeout', 'parse_error', 'api_error', 'no_listings', 'config_error', 'fatal', 'unknown')),
  raw_response text,
  created_at timestamptz DEFAULT now()
);

-- Index for querying recent errors
CREATE INDEX IF NOT EXISTS idx_trail_errors_created_at ON trail_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trail_errors_error_type ON trail_errors (error_type);

-- Auto-cleanup: errors older than 30 days (run via cron or manual cleanup)
COMMENT ON TABLE trail_errors IS 'Trail builder error log. Auto-purge entries older than 30 days.';
