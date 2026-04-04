-- Public API key infrastructure

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  key_hash text NOT NULL UNIQUE,  -- SHA-256 hash of the API key
  key_prefix text NOT NULL,       -- First 8 chars for identification (e.g. "atlas_pk_")
  name text NOT NULL,             -- User-provided label
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'partner', 'enterprise')),
  rate_limit int NOT NULL DEFAULT 1000,  -- Requests per day
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  requests_today int DEFAULT 0,
  requests_reset_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

-- API request logs (lightweight, for rate limiting and analytics)
CREATE TABLE IF NOT EXISTS api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  status_code int,
  response_time_ms int,
  created_at timestamptz DEFAULT now()
);

-- Partition by time if volume grows — for now, simple index
CREATE INDEX idx_api_logs_key ON api_request_logs(api_key_id);
CREATE INDEX idx_api_logs_created ON api_request_logs(created_at);
