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

-- 4) Restrict execution to the service role (the dashboard route's key) -------
REVOKE EXECUTE ON FUNCTION analytics_unique_visitors(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_traffic_by_vertical(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_timeline(timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_top_pages(timestamptz, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION analytics_top_locations(timestamptz, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics_unique_visitors(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_traffic_by_vertical(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_timeline(timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_top_pages(timestamptz, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_top_locations(timestamptz, text, integer) TO service_role;

-- Make the new functions visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
