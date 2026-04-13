-- ============================================================
-- Migration 065: Agent Expansion Infrastructure
--
-- New tables for agents 5–9: press mentions, description
-- evaluations, revenue snapshots. Additional columns on
-- listings for dead image detection and voice scoring.
-- ============================================================

-- ── Press mentions (Agent 8 — Competitor Intelligence) ────────
CREATE TABLE IF NOT EXISTS press_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id),
  source text,
  source_url text,
  published_date date,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_press_mentions_listing ON press_mentions (listing_id);
CREATE INDEX IF NOT EXISTS idx_press_mentions_created ON press_mentions (created_at DESC);

-- ── Description evaluations (Agent 7 — Voice Consistency) ────
CREATE TABLE IF NOT EXISTS description_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id),
  evaluated_at timestamptz DEFAULT now(),
  score integer,
  issues jsonb,
  rewrite_priority text,  -- 'high', 'medium', 'low'
  suggested_rewrite text,
  actioned boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_desc_evals_listing ON description_evaluations (listing_id);
CREATE INDEX IF NOT EXISTS idx_desc_evals_priority ON description_evaluations (rewrite_priority)
  WHERE actioned = false;

-- ── Revenue snapshots (Agent 9 — Revenue Signal) ─────────────
CREATE TABLE IF NOT EXISTS revenue_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date DEFAULT current_date,
  active_subscribers integer,
  arr numeric,
  new_this_week integer,
  churned_this_week integer,
  expiring_30_days integer,
  raw_data jsonb
);

CREATE INDEX IF NOT EXISTS idx_revenue_snapshots_date ON revenue_snapshots (snapshot_date DESC);

-- ── Dead image columns on listings (Agent 6) ─────────────────
ALTER TABLE listings ADD COLUMN IF NOT EXISTS hero_image_verified_at timestamptz;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS hero_image_candidate_url text;

-- ── Voice evaluation tracking on listings (Agent 7) ──────────
ALTER TABLE listings ADD COLUMN IF NOT EXISTS last_voice_evaluated_at timestamptz;
