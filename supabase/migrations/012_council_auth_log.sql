-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 012: Council auth log + approval flag
-- ============================================================

-- Add approved flag to council_accounts (default false — manual approval required)
ALTER TABLE council_accounts ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

-- Auth attempt log
CREATE TABLE IF NOT EXISTS council_auth_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  failure_reason text,
  ip_address text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

-- Index for lookups by email and time
CREATE INDEX idx_council_auth_log_email ON council_auth_log(email);
CREATE INDEX idx_council_auth_log_time ON council_auth_log(attempted_at DESC);

-- RLS
ALTER TABLE council_auth_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on council_auth_log" ON council_auth_log FOR ALL USING (true) WITH CHECK (true);
