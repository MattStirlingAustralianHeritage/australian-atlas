-- ============================================================
-- Migration 066: Listing Clusters — The Independent Australia Corpus
--
-- Semantic clustering of listings via k-means on embedding vectors.
-- Each cluster represents a natural grouping of similar independent
-- businesses across the Atlas network.
-- ============================================================

-- ── Cluster definitions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS listing_clusters (
  id serial PRIMARY KEY,
  cluster_index integer NOT NULL UNIQUE,
  label text,                          -- Claude-generated editorial label
  description text,                    -- Longer editorial description
  member_count integer DEFAULT 0,
  geographic_summary jsonb,            -- { states: {NSW: 12, VIC: 8}, regions: [...] }
  vertical_distribution jsonb,         -- { sba: 5, table: 3, ... }
  representative_listings jsonb,       -- top 10 most central listing IDs + names
  is_editorially_interesting boolean DEFAULT false,
  collection_id bigint,                -- FK to collections when surfaced
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Cluster assignment on listings ────────────────────────────
ALTER TABLE listings ADD COLUMN IF NOT EXISTS cluster_id integer;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS cluster_distance float;

CREATE INDEX IF NOT EXISTS idx_listings_cluster ON listings (cluster_id)
  WHERE cluster_id IS NOT NULL;

-- ── Insight reports ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS corpus_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at timestamptz DEFAULT now(),
  cluster_count integer,
  listing_count integer,
  insight_text text,                   -- Claude-generated 500-word editorial insight
  raw_data jsonb                       -- All cluster labels + stats used for generation
);
