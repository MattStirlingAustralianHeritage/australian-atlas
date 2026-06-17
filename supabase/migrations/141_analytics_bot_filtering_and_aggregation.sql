-- 141: Analytics — bot classification + DB-side aggregation
--
-- Root cause fixed here: GET /api/analytics/dashboard fetched pageviews with no
-- .limit()/.order()/count, so PostgREST capped the result at 1000 oldest-first
-- rows and every metric was computed in JS over that capped slice. Symptoms:
-- Total Pageviews stuck at exactly 1000 in every window; unique visitors
-- inverted as the window grew (511 -> 147 -> 21); vertical mix incoherent.
--
-- This migration moves all aggregation into Postgres (STABLE SQL functions) and
-- adds bot classification so datacenter/crawler traffic can be excluded.

-- 1) Bot classification columns ----------------------------------------------
ALTER TABLE pageviews ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE pageviews ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

-- The dashboard range scans always filter (ts >= since AND is_bot = false).
CREATE INDEX IF NOT EXISTS pageviews_ts_human_idx ON pageviews (ts) WHERE is_bot = false;
CREATE INDEX IF NOT EXISTS pageviews_is_bot_idx ON pageviews (is_bot);

-- 2) Conservative geo-only historical backfill -------------------------------
-- No historical user_agent exists, so flag ONLY clear datacenter / null-geo
-- origins: non-AU rows that either have no resolved city (null-geo — covers
-- null-country and cloud regions geo-IP resolves to a country only, e.g. AWS
-- Singapore as country=SG / city=null) or whose city is a well-known datacenter
-- origin. Australian human traffic is never touched (country = 'AU' excluded
-- outright, including AU rows with no city). FLAG, never delete: rows stay
-- queryable, just excluded from human-facing analytics.
UPDATE pageviews
SET is_bot = true
WHERE is_bot = false
  AND country IS DISTINCT FROM 'AU'
  AND (
    city IS NULL
    OR btrim(city) = ''
    OR btrim(city) IN (
      'Singapore', 'Ashburn', 'Council Bluffs', 'Dallas', 'Dublin',
      'The Dalles', 'Boardman'
    )
  );

-- 3) Aggregation functions (called server-side with the service-role key) -----

-- Overall unique visitors in window. COUNT DISTINCT ignores NULL visitor_id.
CREATE OR REPLACE FUNCTION analytics_unique_visitors(start_ts timestamptz)
RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT count(DISTINCT visitor_id)::bigint
  FROM pageviews
  WHERE ts >= start_ts AND is_bot = false AND visitor_id IS NOT NULL;
$$;

-- Pageviews + unique visitors per vertical.
CREATE OR REPLACE FUNCTION analytics_traffic_by_vertical(start_ts timestamptz)
RETURNS TABLE (vertical text, total_pageviews bigint, unique_visitors bigint)
LANGUAGE sql STABLE AS $$
  SELECT vertical,
         count(*)::bigint,
         count(DISTINCT visitor_id)::bigint
  FROM pageviews
  WHERE ts >= start_ts AND is_bot = false
  GROUP BY vertical
  ORDER BY count(*) DESC;
$$;

-- Daily pageview counts per vertical, UTC day buckets (matches the prior ISO slice).
CREATE OR REPLACE FUNCTION analytics_timeline(start_ts timestamptz, filter_vertical text DEFAULT NULL)
RETURNS TABLE (date text, vertical text, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
         vertical,
         count(*)::bigint
  FROM pageviews
  WHERE ts >= start_ts AND is_bot = false
    AND (filter_vertical IS NULL OR vertical = filter_vertical)
  GROUP BY 1, vertical
  ORDER BY 1 ASC;
$$;

-- Top pages by pageviews.
CREATE OR REPLACE FUNCTION analytics_top_pages(start_ts timestamptz, filter_vertical text DEFAULT NULL, max_rows int DEFAULT 20)
RETURNS TABLE (vertical text, page_path text, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT vertical, path, count(*)::bigint
  FROM pageviews
  WHERE ts >= start_ts AND is_bot = false
    AND (filter_vertical IS NULL OR vertical = filter_vertical)
  GROUP BY vertical, path
  ORDER BY count(*) DESC
  LIMIT max_rows;
$$;

-- Top locations, normalised (case/whitespace-folded) so duplicate spellings
-- collapse (e.g. "Melbourne" / "melbourne "). Representative display casing via
-- mode(); centroid coordinates via avg() for the map.
CREATE OR REPLACE FUNCTION analytics_top_locations(start_ts timestamptz, filter_vertical text DEFAULT NULL, max_rows int DEFAULT 500)
RETURNS TABLE (city text, region text, country text, lat double precision, lng double precision, visit_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    mode() WITHIN GROUP (ORDER BY btrim(city)),
    mode() WITHIN GROUP (ORDER BY btrim(region)),
    mode() WITHIN GROUP (ORDER BY btrim(country)),
    avg(lat)::double precision,
    avg(lng)::double precision,
    count(*)::bigint
  FROM pageviews
  WHERE ts >= start_ts AND is_bot = false
    AND lat IS NOT NULL AND lng IS NOT NULL
    AND (filter_vertical IS NULL OR vertical = filter_vertical)
  GROUP BY lower(btrim(city)), lower(btrim(region)), lower(btrim(country))
  ORDER BY count(*) DESC
  LIMIT max_rows;
$$;

-- 3b) Region-scoped aggregation for the council product --------------------------
-- One round-trip per region returning every metric the council dashboard and the
-- white-label report need, as a single JSON object. Mirrors the interim JS path
-- in lib/analytics/regionMetrics.js exactly so the two are parity-checkable:
--   • bot exclusion via is_bot = false (backfilled above to the same geo rule)
--   • region attribution via COALESCE(region_override_id, region_computed_id)
--   • /place/{slug} click attribution, deduped so a cross-vertical venue's slug
--     counts each pageview once (the click CTE groups before joining listings)
--   • test fixtures (slug ILIKE 'admin%') and needs_review venues excluded
--   • search queries matched to the region's name tokens + suburbs (p_terms,
--     pre-cleaned by the caller) via whole-word regex
CREATE OR REPLACE FUNCTION analytics_region_metrics(
  p_region_id uuid,
  p_region_slug text,
  p_start_ts timestamptz,
  p_terms text[] DEFAULT '{}',
  p_max_rows int DEFAULT 10
)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
WITH region_listings AS (
  SELECT l.slug,
         min(l.name) AS name,
         array_agg(DISTINCT l.vertical) AS verticals,
         min(l.created_at) AS min_created
  FROM listings l
  WHERE COALESCE(l.region_override_id, l.region_computed_id) = p_region_id
    AND l.status = 'active'
    AND l.slug IS NOT NULL
    AND l.slug NOT ILIKE 'admin%'
    AND (l.needs_review IS NULL OR l.needs_review = false)
  GROUP BY l.slug
),
place_clicks AS (
  SELECT split_part(pv.path, '/', 3) AS slug, pv.city, pv.region AS area, pv.country
  FROM pageviews pv
  WHERE pv.path LIKE '/place/%' AND pv.is_bot = false AND pv.ts >= p_start_ts
),
region_clicks AS (
  SELECT pc.slug, pc.city, pc.area, pc.country
  FROM place_clicks pc
  JOIN region_listings rl ON rl.slug = pc.slug
),
region_views AS (
  SELECT pv.city, pv.region AS area, pv.country
  FROM pageviews pv
  WHERE pv.is_bot = false AND pv.ts >= p_start_ts
    AND (pv.path = '/regions/' || p_region_slug
         OR pv.path LIKE '/regions/' || p_region_slug || '/%')
),
top_listings AS (
  SELECT rc.slug, rl.name, rl.verticals, count(*) AS clicks
  FROM region_clicks rc JOIN region_listings rl ON rl.slug = rc.slug
  GROUP BY rc.slug, rl.name, rl.verticals
  ORDER BY clicks DESC, rc.slug ASC
  LIMIT p_max_rows
),
origin AS (
  SELECT mode() WITHIN GROUP (ORDER BY city) AS city,
         mode() WITHIN GROUP (ORDER BY area) AS area,
         mode() WITHIN GROUP (ORDER BY country) AS country,
         count(*) AS visit_count
  FROM (
    SELECT city, area, country FROM region_clicks
    UNION ALL
    SELECT city, area, country FROM region_views
  ) u
  WHERE city IS NOT NULL AND btrim(city) <> ''
  GROUP BY lower(btrim(city)), lower(btrim(coalesce(area, ''))), lower(btrim(coalesce(country, '')))
  ORDER BY visit_count DESC
  LIMIT p_max_rows
),
searches AS (
  SELECT query_text, count(*) AS n
  FROM search_logs
  WHERE created_at >= p_start_ts
    AND query_text IS NOT NULL
    AND array_length(p_terms, 1) IS NOT NULL
    AND lower(query_text) ~ ('\m(' || array_to_string(p_terms, '|') || ')\M')
  GROUP BY query_text
  ORDER BY n DESC, query_text ASC
  LIMIT p_max_rows
)
SELECT jsonb_build_object(
  'region_page_views', (SELECT count(*) FROM region_views),
  'total_clicks',      (SELECT count(*) FROM region_clicks),
  'total_listings',    (SELECT count(*) FROM region_listings),
  'new_listings',      (SELECT count(*) FROM region_listings WHERE min_created >= p_start_ts),
  'top_listings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'slug', slug, 'name', name, 'verticals', to_jsonb(verticals), 'clicks', clicks))
                    FROM top_listings), '[]'::jsonb),
  'visitor_origin', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'city', city, 'area', area, 'country', country, 'count', visit_count))
                    FROM origin), '[]'::jsonb),
  'top_searches', COALESCE((SELECT jsonb_agg(jsonb_build_object('query', query_text, 'count', n))
                    FROM searches), '[]'::jsonb)
);
$$;

-- 4) Restrict execution to the service role (the dashboard route's key) -------
REVOKE EXECUTE ON FUNCTION analytics_unique_visitors(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_traffic_by_vertical(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_timeline(timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_top_pages(timestamptz, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_top_locations(timestamptz, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_region_metrics(uuid, text, timestamptz, text[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics_unique_visitors(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_traffic_by_vertical(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_timeline(timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_top_pages(timestamptz, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_top_locations(timestamptz, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_region_metrics(uuid, text, timestamptz, text[], integer) TO service_role;

-- Make the new functions visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
