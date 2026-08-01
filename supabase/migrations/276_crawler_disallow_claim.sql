-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 276: align the robots.txt mirror with app/robots.js
-- ============================================================
-- crawler_path_disallowed() was written against an older app/robots.js.
-- The live rules disallow `/claim/` as well, so claim-flow fetches were
-- being reported as compliant when they are not.
--
-- This function is the SQL mirror of a rule set that lives in application
-- code, which means it can drift again. If app/robots.js gains or loses a
-- Disallow rule, this function and the `disallowed` generated column must
-- be updated in the same change.
--
-- `disallowed` is a STORED generated column, so replacing the function
-- does not recompute existing rows — the column is dropped and re-added to
-- force a rebuild, along with the partial index that depends on it.
-- ============================================================

DROP INDEX IF EXISTS site_crawler_hits_disallowed_idx;
ALTER TABLE site_crawler_hits DROP COLUMN IF EXISTS disallowed;

CREATE OR REPLACE FUNCTION crawler_path_disallowed(p_path text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(p_path, '') LIKE '/admin/%'
      OR COALESCE(p_path, '') LIKE '/api/%'
      OR COALESCE(p_path, '') LIKE '/dashboard/%'
      OR COALESCE(p_path, '') LIKE '/vendor/%'
      OR COALESCE(p_path, '') LIKE '/account/%'
      OR COALESCE(p_path, '') LIKE '/claim/%'
$$;

ALTER TABLE site_crawler_hits
  ADD COLUMN disallowed boolean GENERATED ALWAYS AS (crawler_path_disallowed(path)) STORED;

CREATE INDEX IF NOT EXISTS site_crawler_hits_disallowed_idx
  ON site_crawler_hits (fetched_at DESC) WHERE disallowed;
