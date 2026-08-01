-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 272: crawler analytics — dimensions + aggregation
-- ============================================================
-- Builds on migration 156 (site_crawler_hits). Two jobs:
--
--   1. Widen the row. 156 captured bot_name/user_agent/path/host/ip.
--      That answers "how many hits" and nothing else. This adds the
--      dimensions the admin dashboard actually reports on: who operates
--      the bot, what kind of bot it is, where it came from, what it
--      asked for, and whether the claimed identity was ever verified.
--
--   2. Move aggregation into SQL. The table is ~182k rows after seven
--      weeks and grows ~1.2k/day. PostgREST caps a select at 1000 rows,
--      so any client-side aggregation silently reports on a sliver of
--      the window (this is exactly the bug migration 141 was written to
--      fix for `pageviews`). Every number on the crawler dashboard comes
--      from a function here, computed over the full window in the
--      database.
--
-- All new columns are nullable with no default, so the existing
-- middleware keeps inserting successfully during the deploy window;
-- rows written before the code lands simply carry NULLs in the new
-- dimensions and are backfilled below where derivable.
-- ============================================================

-- ── 1. Path classification helpers ──────────────────────────────────────
-- Declared IMMUTABLE so they can back a STORED generated column, which is
-- what makes path_kind indexable and free to group by.
--
-- NOTE: because path_kind is a stored generated column, redefining these
-- functions does NOT rewrite existing rows. After any change to the
-- CASE arms, rebuild with:
--   ALTER TABLE site_crawler_hits ALTER COLUMN path_kind DROP EXPRESSION;
--   (then re-add the column definition from this migration)

-- Crawlers request locale-prefixed URLs (/zh/place/x, /ko/regions/y) that
-- the portal does not serve. Stripping the prefix keeps the section
-- breakdown honest, and crawler_path_locale() surfaces the prefix itself
-- so wasted crawl budget stays visible rather than being smoothed away.
CREATE OR REPLACE FUNCTION crawler_path_locale(p_path text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT NULLIF((regexp_match(COALESCE(p_path, ''), '^/([a-z]{2}(?:-[A-Za-z]{2})?)(?:/|$)'))[1], '')
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
      (regexp_match(COALESCE(p_path, ''), '^/[a-z]{2}(?:-[A-Za-z]{2})?/(.*)$'))[1],
      ltrim(COALESCE(p_path, ''), '/')
    ) AS p
  ) s
$$;

-- robots.txt for australianatlas.com.au disallows these prefixes for every
-- user-agent (see app/robots.js). A hit here from a bot that claims to
-- honour robots.txt is a compliance violation worth naming.
CREATE OR REPLACE FUNCTION crawler_path_disallowed(p_path text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(p_path, '') LIKE '/admin/%'
      OR COALESCE(p_path, '') LIKE '/api/%'
      OR COALESCE(p_path, '') LIKE '/dashboard/%'
      OR COALESCE(p_path, '') LIKE '/vendor/%'
      OR COALESCE(p_path, '') LIKE '/account/%'
$$;

-- ── 2. Widen site_crawler_hits ──────────────────────────────────────────
ALTER TABLE site_crawler_hits
  ADD COLUMN IF NOT EXISTS bot_category text,   -- ai_assistant | ai_search | ai_training | search_engine | seo_tool | social | archive | monitoring | security | other
  ADD COLUMN IF NOT EXISTS bot_operator text,   -- OpenAI, Anthropic, Google, …
  ADD COLUMN IF NOT EXISTS bot_known   boolean, -- false = matched the generic fallback, not the catalogue
  ADD COLUMN IF NOT EXISTS method      text,
  ADD COLUMN IF NOT EXISTS referer     text,
  ADD COLUMN IF NOT EXISTS country     text,    -- x-vercel-ip-country
  ADD COLUMN IF NOT EXISTS city        text,    -- x-vercel-ip-city
  ADD COLUMN IF NOT EXISTS verified    boolean, -- NULL = never checked; false = claimed identity failed IP verification
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Stored + generated: written once at insert, indexable, always consistent
-- with `path`. Added separately from the block above because ADD COLUMN IF
-- NOT EXISTS does not accept a GENERATED clause on older PG versions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_crawler_hits' AND column_name = 'path_kind'
  ) THEN
    ALTER TABLE site_crawler_hits
      ADD COLUMN path_kind text GENERATED ALWAYS AS (crawler_path_kind(path)) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_crawler_hits' AND column_name = 'path_locale'
  ) THEN
    ALTER TABLE site_crawler_hits
      ADD COLUMN path_locale text GENERATED ALWAYS AS (crawler_path_locale(path)) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'site_crawler_hits' AND column_name = 'disallowed'
  ) THEN
    ALTER TABLE site_crawler_hits
      ADD COLUMN disallowed boolean GENERATED ALWAYS AS (crawler_path_disallowed(path)) STORED;
  END IF;
END $$;

-- ── 3. Backfill the ~182k pre-existing rows ─────────────────────────────
-- Only the nine tokens migration 156 could match exist historically, so the
-- mapping is exact. Mirrors lib/bots/registry.js — if the two ever disagree,
-- the registry is authoritative and this backfill is the stale copy.
UPDATE site_crawler_hits SET
  bot_operator = CASE bot_name
    WHEN 'GPTBot' THEN 'OpenAI'
    WHEN 'OAI-SearchBot' THEN 'OpenAI'
    WHEN 'ChatGPT-User' THEN 'OpenAI'
    WHEN 'ClaudeBot' THEN 'Anthropic'
    WHEN 'Claude-SearchBot' THEN 'Anthropic'
    WHEN 'Claude-User' THEN 'Anthropic'
    WHEN 'PerplexityBot' THEN 'Perplexity'
    WHEN 'Perplexity-User' THEN 'Perplexity'
    WHEN 'Googlebot' THEN 'Google'
    ELSE 'Unidentified'
  END,
  bot_category = CASE bot_name
    WHEN 'GPTBot' THEN 'ai_training'
    WHEN 'ClaudeBot' THEN 'ai_training'
    WHEN 'OAI-SearchBot' THEN 'ai_search'
    WHEN 'Claude-SearchBot' THEN 'ai_search'
    WHEN 'PerplexityBot' THEN 'ai_search'
    WHEN 'ChatGPT-User' THEN 'ai_assistant'
    WHEN 'Claude-User' THEN 'ai_assistant'
    WHEN 'Perplexity-User' THEN 'ai_assistant'
    WHEN 'Googlebot' THEN 'search_engine'
    ELSE 'other'
  END,
  bot_known = (bot_name IN (
    'GPTBot','OAI-SearchBot','ChatGPT-User','ClaudeBot','Claude-SearchBot',
    'Claude-User','PerplexityBot','Perplexity-User','Googlebot'
  ))
WHERE bot_category IS NULL;

-- ── 4. Indexes for the dashboard's access patterns ──────────────────────
CREATE INDEX IF NOT EXISTS site_crawler_hits_cat_fetched_idx
  ON site_crawler_hits (bot_category, fetched_at DESC);
CREATE INDEX IF NOT EXISTS site_crawler_hits_operator_fetched_idx
  ON site_crawler_hits (bot_operator, fetched_at DESC);
CREATE INDEX IF NOT EXISTS site_crawler_hits_kind_fetched_idx
  ON site_crawler_hits (path_kind, fetched_at DESC);
CREATE INDEX IF NOT EXISTS site_crawler_hits_path_fetched_idx
  ON site_crawler_hits (path, fetched_at DESC);
-- Partial: violations are rare, so this index stays tiny and the
-- compliance panel is an index-only scan.
CREATE INDEX IF NOT EXISTS site_crawler_hits_disallowed_idx
  ON site_crawler_hits (fetched_at DESC) WHERE disallowed;

-- ── 5. Aggregation functions ────────────────────────────────────────────
-- Every one takes the window start so the dashboard's range selector maps
-- straight through. STABLE + PARALLEL SAFE: read-only, safe to parallelise
-- across the table.

-- Headline counters.
CREATE OR REPLACE FUNCTION crawler_overview(p_since timestamptz)
RETURNS TABLE (
  total_hits bigint, ai_hits bigint, assistant_hits bigint,
  distinct_bots bigint, distinct_operators bigint, distinct_paths bigint,
  distinct_ips bigint, disallowed_hits bigint, unknown_hits bigint,
  first_seen timestamptz, last_seen timestamptz
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE bot_category IN ('ai_training','ai_search','ai_assistant'))::bigint,
    count(*) FILTER (WHERE bot_category = 'ai_assistant')::bigint,
    count(DISTINCT bot_name)::bigint,
    count(DISTINCT bot_operator)::bigint,
    count(DISTINCT path)::bigint,
    count(DISTINCT ip)::bigint,
    count(*) FILTER (WHERE disallowed)::bigint,
    count(*) FILTER (WHERE bot_known IS FALSE)::bigint,
    min(fetched_at), max(fetched_at)
  FROM site_crawler_hits
  WHERE fetched_at >= p_since
$$;

-- One row per bot: volume, breadth, recency. `paths` vs `hits` is the
-- signal that separates a bot indexing the catalogue from one hammering
-- a single URL.
CREATE OR REPLACE FUNCTION crawler_by_bot(p_since timestamptz)
RETURNS TABLE (
  bot_name text, bot_category text, bot_operator text, bot_known boolean,
  hits bigint, paths bigint, ips bigint, place_hits bigint,
  disallowed_hits bigint, first_seen timestamptz, last_seen timestamptz
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    h.bot_name, h.bot_category, h.bot_operator, bool_and(h.bot_known),
    count(*)::bigint,
    count(DISTINCT h.path)::bigint,
    count(DISTINCT h.ip)::bigint,
    count(*) FILTER (WHERE h.path_kind = 'place')::bigint,
    count(*) FILTER (WHERE h.disallowed)::bigint,
    min(h.fetched_at), max(h.fetched_at)
  FROM site_crawler_hits h
  WHERE h.fetched_at >= p_since
  GROUP BY h.bot_name, h.bot_category, h.bot_operator
  ORDER BY count(*) DESC
$$;

CREATE OR REPLACE FUNCTION crawler_by_category(p_since timestamptz)
RETURNS TABLE (bot_category text, hits bigint, bots bigint, paths bigint, ips bigint)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT h.bot_category, count(*)::bigint, count(DISTINCT h.bot_name)::bigint,
         count(DISTINCT h.path)::bigint, count(DISTINCT h.ip)::bigint
  FROM site_crawler_hits h
  WHERE h.fetched_at >= p_since
  GROUP BY h.bot_category
  ORDER BY count(*) DESC
$$;

CREATE OR REPLACE FUNCTION crawler_by_operator(p_since timestamptz)
RETURNS TABLE (bot_operator text, hits bigint, bots bigint, paths bigint, ai boolean)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT h.bot_operator, count(*)::bigint, count(DISTINCT h.bot_name)::bigint,
         count(DISTINCT h.path)::bigint,
         bool_or(h.bot_category IN ('ai_training','ai_search','ai_assistant'))
  FROM site_crawler_hits h
  WHERE h.fetched_at >= p_since
  GROUP BY h.bot_operator
  ORDER BY count(*) DESC
$$;

-- Stacked trend. p_bucket is passed to date_trunc: 'hour' | 'day' | 'week' | 'month'.
CREATE OR REPLACE FUNCTION crawler_timeline(p_since timestamptz, p_bucket text)
RETURNS TABLE (bucket timestamptz, bot_category text, hits bigint)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT date_trunc(p_bucket, h.fetched_at), h.bot_category, count(*)::bigint
  FROM site_crawler_hits h
  WHERE h.fetched_at >= p_since
  GROUP BY 1, 2
  ORDER BY 1, 2
$$;

-- Per-bot trend for the bot detail drill-down.
CREATE OR REPLACE FUNCTION crawler_bot_timeline(p_since timestamptz, p_bucket text, p_bot text)
RETURNS TABLE (bucket timestamptz, hits bigint)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT date_trunc(p_bucket, h.fetched_at), count(*)::bigint
  FROM site_crawler_hits h
  WHERE h.fetched_at >= p_since AND h.bot_name = p_bot
  GROUP BY 1 ORDER BY 1
$$;

-- What they are actually reading. p_category/p_bot are optional filters.
CREATE OR REPLACE FUNCTION crawler_top_paths(
  p_since timestamptz, p_limit int DEFAULT 25,
  p_category text DEFAULT NULL, p_bot text DEFAULT NULL
)
RETURNS TABLE (path text, path_kind text, hits bigint, bots bigint, last_seen timestamptz)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT h.path, h.path_kind, count(*)::bigint,
         count(DISTINCT h.bot_name)::bigint, max(h.fetched_at)
  FROM site_crawler_hits h
  WHERE h.fetched_at >= p_since
    AND (p_category IS NULL OR h.bot_category = p_category)
    AND (p_bot IS NULL OR h.bot_name = p_bot)
  GROUP BY h.path, h.path_kind
  ORDER BY count(*) DESC
  LIMIT p_limit
$$;

-- Which sections of the site absorb the crawl budget.
CREATE OR REPLACE FUNCTION crawler_path_kinds(p_since timestamptz)
RETURNS TABLE (path_kind text, hits bigint, ai_hits bigint, paths bigint)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT h.path_kind, count(*)::bigint,
         count(*) FILTER (WHERE h.bot_category IN ('ai_training','ai_search','ai_assistant'))::bigint,
         count(DISTINCT h.path)::bigint
  FROM site_crawler_hits h
  WHERE h.fetched_at >= p_since
  GROUP BY h.path_kind
  ORDER BY count(*) DESC
$$;

-- Locale-prefixed requests. The portal serves no localised routes, so
-- anything here is crawl budget spent on URLs that cannot resolve.
CREATE OR REPLACE FUNCTION crawler_locale_waste(p_since timestamptz)
RETURNS TABLE (path_locale text, hits bigint, bots bigint, paths bigint)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT h.path_locale, count(*)::bigint,
         count(DISTINCT h.bot_name)::bigint, count(DISTINCT h.path)::bigint
  FROM site_crawler_hits h
  WHERE h.fetched_at >= p_since AND h.path_locale IS NOT NULL
  GROUP BY h.path_locale
  ORDER BY count(*) DESC
$$;

-- Crawl pressure by hour of day (UTC) and weekday — reveals the scheduling
-- behaviour of each operator and any sustained hammering.
CREATE OR REPLACE FUNCTION crawler_hourly(p_since timestamptz)
RETURNS TABLE (dow int, hour int, hits bigint)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT EXTRACT(dow FROM h.fetched_at)::int,
         EXTRACT(hour FROM h.fetched_at)::int,
         count(*)::bigint
  FROM site_crawler_hits h
  WHERE h.fetched_at >= p_since
  GROUP BY 1, 2
$$;

-- robots.txt compliance. A bot appearing here fetched a path that
-- app/robots.js disallows for every user-agent.
CREATE OR REPLACE FUNCTION crawler_robots_violations(p_since timestamptz)
RETURNS TABLE (bot_name text, bot_operator text, hits bigint, paths bigint, sample_path text, last_seen timestamptz)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT h.bot_name, h.bot_operator, count(*)::bigint, count(DISTINCT h.path)::bigint,
         (array_agg(h.path ORDER BY h.fetched_at DESC))[1], max(h.fetched_at)
  FROM site_crawler_hits h
  WHERE h.fetched_at >= p_since AND h.disallowed
  GROUP BY h.bot_name, h.bot_operator
  ORDER BY count(*) DESC
$$;

-- Busiest source addresses. A single IP responsible for a large share of a
-- bot's traffic is the shape of both a well-behaved crawler pool and a
-- spoofer; pair with `verified` once IP verification runs.
CREATE OR REPLACE FUNCTION crawler_top_ips(p_since timestamptz, p_limit int DEFAULT 20)
RETURNS TABLE (ip text, bot_name text, hits bigint, paths bigint, verified boolean, last_seen timestamptz)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT h.ip, mode() WITHIN GROUP (ORDER BY h.bot_name), count(*)::bigint,
         count(DISTINCT h.path)::bigint, bool_or(h.verified), max(h.fetched_at)
  FROM site_crawler_hits h
  WHERE h.fetched_at >= p_since AND h.ip IS NOT NULL
  GROUP BY h.ip
  ORDER BY count(*) DESC
  LIMIT p_limit
$$;

-- ── AI visibility coverage ──────────────────────────────────────────────
-- The question the whole dashboard exists to answer: of the venues we
-- publish, how many has an AI system actually read? A listing no AI crawler
-- has fetched cannot be cited in an AI answer.
CREATE OR REPLACE FUNCTION crawler_ai_coverage(p_since timestamptz)
RETURNS TABLE (
  total_listings bigint, crawled_any bigint, crawled_ai bigint,
  crawled_ai_search bigint, crawled_assistant bigint, crawled_google bigint
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  WITH live AS (
    SELECT slug FROM listings
    WHERE status = 'active' AND slug IS NOT NULL
      AND COALESCE(needs_review, false) = false
  ),
  seen AS (
    SELECT
      -- Strip any locale prefix so /zh/place/x credits the same listing.
      regexp_replace(h.path, '^(?:/[a-z]{2}(?:-[A-Za-z]{2})?)?/place/', '') AS slug,
      bool_or(h.bot_category IN ('ai_training','ai_search','ai_assistant')) AS by_ai,
      bool_or(h.bot_category = 'ai_search') AS by_ai_search,
      bool_or(h.bot_category = 'ai_assistant') AS by_assistant,
      bool_or(h.bot_operator = 'Google') AS by_google
    FROM site_crawler_hits h
    WHERE h.fetched_at >= p_since AND h.path_kind = 'place'
    GROUP BY 1
  )
  SELECT
    count(*)::bigint,
    count(s.slug)::bigint,
    count(*) FILTER (WHERE s.by_ai)::bigint,
    count(*) FILTER (WHERE s.by_ai_search)::bigint,
    count(*) FILTER (WHERE s.by_assistant)::bigint,
    count(*) FILTER (WHERE s.by_google)::bigint
  FROM live l
  LEFT JOIN seen s ON s.slug = l.slug
$$;

-- The listings AI systems read most — and, inverted, the ones they never
-- touch. Both are actionable: the first tells you what AI thinks you are
-- about, the second is the backlog.
CREATE OR REPLACE FUNCTION crawler_top_listings(p_since timestamptz, p_limit int DEFAULT 20)
RETURNS TABLE (slug text, name text, vertical text, hits bigint, ai_hits bigint, bots bigint, last_seen timestamptz)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  WITH seen AS (
    SELECT regexp_replace(h.path, '^(?:/[a-z]{2}(?:-[A-Za-z]{2})?)?/place/', '') AS slug,
           count(*)::bigint AS hits,
           count(*) FILTER (WHERE h.bot_category IN ('ai_training','ai_search','ai_assistant'))::bigint AS ai_hits,
           count(DISTINCT h.bot_name)::bigint AS bots,
           max(h.fetched_at) AS last_seen
    FROM site_crawler_hits h
    WHERE h.fetched_at >= p_since AND h.path_kind = 'place'
    GROUP BY 1
  )
  SELECT s.slug, l.name, l.vertical, s.hits, s.ai_hits, s.bots, s.last_seen
  FROM seen s
  JOIN listings l ON l.slug = s.slug AND l.status = 'active'
  ORDER BY s.hits DESC
  LIMIT p_limit
$$;

-- Live tail for the dashboard's activity feed.
CREATE OR REPLACE FUNCTION crawler_recent(p_limit int DEFAULT 50)
RETURNS TABLE (
  bot_name text, bot_category text, bot_operator text, path text,
  path_kind text, ip text, country text, disallowed boolean, fetched_at timestamptz
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT h.bot_name, h.bot_category, h.bot_operator, h.path,
         h.path_kind, h.ip, h.country, h.disallowed, h.fetched_at
  FROM site_crawler_hits h
  ORDER BY h.fetched_at DESC
  LIMIT p_limit
$$;

-- ── 6. Lock the functions down ──────────────────────────────────────────
-- These read a table that is default-deny under RLS. They are SECURITY
-- INVOKER (the default), so only the service_role key used by the
-- admin-gated API route can execute them meaningfully — but revoke the
-- public grant anyway so anon/authenticated cannot even call them.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'crawler_overview(timestamptz)',
    'crawler_by_bot(timestamptz)',
    'crawler_by_category(timestamptz)',
    'crawler_by_operator(timestamptz)',
    'crawler_timeline(timestamptz,text)',
    'crawler_bot_timeline(timestamptz,text,text)',
    'crawler_top_paths(timestamptz,int,text,text)',
    'crawler_path_kinds(timestamptz)',
    'crawler_locale_waste(timestamptz)',
    'crawler_hourly(timestamptz)',
    'crawler_robots_violations(timestamptz)',
    'crawler_top_ips(timestamptz,int)',
    'crawler_ai_coverage(timestamptz)',
    'crawler_top_listings(timestamptz,int)',
    'crawler_recent(int)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
