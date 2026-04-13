-- ============================================================
-- Migration 064: Autonomous Agent Infrastructure
--
-- Adds agent_runs table for execution history, plus enrichment
-- and geocoding columns on listings for Agent 2 and Agent 4.
-- ============================================================

-- Agent execution history
CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text, -- 'success', 'partial', 'failed'
  summary jsonb,
  error text
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs (agent, started_at DESC);

-- Enrichment Agent columns
ALTER TABLE listings ADD COLUMN IF NOT EXISTS enrichment_attempted_at timestamptz;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS enrichment_status text; -- 'pending_review', 'approved', 'rejected'

CREATE INDEX IF NOT EXISTS idx_listings_enrichment ON listings (enrichment_status) WHERE enrichment_status = 'pending_review';

-- Geocoding Watchdog columns
ALTER TABLE listings ADD COLUMN IF NOT EXISTS geocode_confidence text; -- 'high', 'low'
ALTER TABLE listings ADD COLUMN IF NOT EXISTS geocode_warning text;

CREATE INDEX IF NOT EXISTS idx_listings_geocode_low ON listings (geocode_confidence) WHERE geocode_confidence = 'low';
