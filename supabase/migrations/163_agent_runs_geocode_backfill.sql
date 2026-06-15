-- ============================================================
-- Migration 163: Backfill missing Migration-064 objects
--
-- Migration 064 (Autonomous Agent Infrastructure) was never fully
-- applied to the portal prod DB: the `agent_runs` table and the
-- `geocode_confidence` / `geocode_warning` columns on `listings` are
-- absent, even though the enrichment columns from the same migration
-- exist (re-added via 071's index dependency).
--
-- The gap surfaced in the Monday Briefing agent as three recurring
-- "Data issues":
--   * Network health  -> column listings.geocode_confidence missing
--                        (threw, nulling networkHealth -> "Total
--                         listings: 0 across ten atlases")
--   * Editorial signals -> table public.agent_runs missing
--   * Staleness signals -> table public.agent_runs missing
--
-- It also silently broke run logging (lib/agents/logRun.js), the
-- /admin/agents history page, and the geocoding-watchdog agent
-- (lib/agents/geocoding-watchdog.js writes geocode_confidence).
--
-- This migration creates ONLY the genuinely-missing objects. All
-- statements are idempotent (IF NOT EXISTS), matching 064 verbatim.
-- ============================================================

-- Agent execution history (from 064)
CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text, -- 'success', 'partial', 'failed', 'running'
  summary jsonb,
  error text
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs (agent, started_at DESC);

-- Geocoding Watchdog columns (from 064)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS geocode_confidence text; -- 'high', 'low'
ALTER TABLE listings ADD COLUMN IF NOT EXISTS geocode_warning text;

CREATE INDEX IF NOT EXISTS idx_listings_geocode_low
  ON listings (geocode_confidence) WHERE geocode_confidence = 'low';

-- Reload PostgREST schema cache so the new table/columns are visible
-- to the service-role client immediately.
NOTIFY pgrst, 'reload schema';
