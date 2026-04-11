-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 054: Multi-vertical article publishing
-- ============================================================
-- Articles can now belong to multiple verticals simultaneously.
-- Adds a `verticals` text[] column alongside the existing `vertical`
-- column (kept for backward compatibility).
-- ============================================================

ALTER TABLE articles ADD COLUMN IF NOT EXISTS verticals text[];

-- Migrate existing single-vertical data into the array
UPDATE articles
  SET verticals = ARRAY[vertical]
  WHERE vertical IS NOT NULL
    AND (verticals IS NULL OR verticals = '{}');

-- Index for array containment queries (e.g. WHERE verticals @> ARRAY['sba'])
CREATE INDEX IF NOT EXISTS articles_verticals_idx ON articles USING gin(verticals);
