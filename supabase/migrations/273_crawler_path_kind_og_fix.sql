-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 273: correct locale detection for the /og route
-- ============================================================
-- Migration 272's crawler_path_locale() treated any two-letter first path
-- segment as a language prefix. `/og/<slug>` — the portal's real OG-image
-- route — is two letters, so 9,784 legitimate OG-image fetches were being
-- reported as requests for a non-existent Occitan locale, and their
-- path_kind resolved to 'other' instead of 'og_image'.
--
-- `og` is the only two-letter top-level route in app/, so a targeted
-- exclusion is sufficient and keeps genuinely unknown locales visible.
--
-- path_kind / path_locale are STORED generated columns: replacing the
-- functions does not recompute existing rows, so the columns are dropped
-- and re-added to force a rebuild. That rewrites the table (~182k rows,
-- a few seconds) and is why this runs as its own migration.
-- ============================================================

ALTER TABLE site_crawler_hits DROP COLUMN IF EXISTS path_kind;
ALTER TABLE site_crawler_hits DROP COLUMN IF EXISTS path_locale;

CREATE OR REPLACE FUNCTION crawler_path_locale(p_path text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT NULLIF(
    (regexp_match(COALESCE(p_path, ''), '^/(?!og(?:/|$))([a-z]{2}(?:-[A-Za-z]{2})?)(?:/|$)'))[1],
    ''
  )
$$;

CREATE OR REPLACE FUNCTION crawler_path_kind(p_path text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN p IS NULL OR p = '' THEN 'other'
    WHEN p = '/' THEN 'home'
    WHEN p = '/robots.txt' THEN 'robots'
    WHEN p LIKE '/sitemap%' THEN 'sitemap'
    WHEN p LIKE '/place/%' THEN 'place'
    WHEN p LIKE '/regions%' THEN 'region'
    WHEN p LIKE '/trails%' OR p LIKE '/t/%' THEN 'trail'
    WHEN p LIKE '/journal%' OR p LIKE '/articles%' OR p LIKE '/press%' THEN 'editorial'
    WHEN p = '/map' OR p LIKE '/map?%' THEN 'map'
    WHEN p LIKE '/explore%' OR p LIKE '/search%' OR p LIKE '/discover%' OR p LIKE '/near-me%' THEN 'discovery'
    WHEN p LIKE '/collections%' OR p LIKE '/producer-picks%' OR p LIKE '/atlas-index%' THEN 'collection'
    WHEN p LIKE '/itinerary%' OR p LIKE '/plan%' OR p LIKE '/trip%' OR p LIKE '/day-trip%' OR p LIKE '/on-this-road%' THEN 'planning'
    WHEN p LIKE '/og/%' THEN 'og_image'
    WHEN p LIKE '/for-venues%' OR p LIKE '/for-councils%' OR p LIKE '/for-press%' OR p LIKE '/operators%'
         OR p LIKE '/pricing%' OR p LIKE '/claim%' OR p LIKE '/suggest%' THEN 'commercial'
    WHEN p LIKE '/about%' OR p LIKE '/how-we-choose%' OR p LIKE '/independence%' OR p LIKE '/network%'
         OR p LIKE '/developers%' THEN 'about'
    WHEN p LIKE '/api/%' THEN 'api'
    WHEN p LIKE '/admin%' OR p LIKE '/dashboard%' OR p LIKE '/account%' OR p LIKE '/vendor%'
         OR p LIKE '/council%' OR p LIKE '/login%' OR p LIKE '/auth%' THEN 'private'
    ELSE 'other'
  END
  FROM (
    SELECT '/' || COALESCE(
      (regexp_match(COALESCE(p_path, ''), '^/(?!og(?:/|$))[a-z]{2}(?:-[A-Za-z]{2})?/(.*)$'))[1],
      ltrim(COALESCE(p_path, ''), '/')
    ) AS p
  ) s
$$;

ALTER TABLE site_crawler_hits
  ADD COLUMN path_kind text GENERATED ALWAYS AS (crawler_path_kind(path)) STORED;
ALTER TABLE site_crawler_hits
  ADD COLUMN path_locale text GENERATED ALWAYS AS (crawler_path_locale(path)) STORED;

-- Dropping path_kind dropped the index that referenced it.
CREATE INDEX IF NOT EXISTS site_crawler_hits_kind_fetched_idx
  ON site_crawler_hits (path_kind, fetched_at DESC);
