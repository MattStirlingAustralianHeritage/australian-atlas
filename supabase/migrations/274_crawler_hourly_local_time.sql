-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 274: report crawl pressure in Melbourne local time
-- ============================================================
-- crawler_hourly() bucketed by UTC hour. The dashboard reads it as a
-- "when do bots hit us" heatmap, and a UTC grid is off by 10-11 hours from
-- the operating day everyone reading the dashboard actually lives in —
-- an overnight crawl surge lands in the middle of the working day.
--
-- `AT TIME ZONE 'Australia/Melbourne'` shifts to local wall-clock time and
-- handles daylight saving per-row, so a window spanning an AEST/AEDT change
-- stays correct rather than being uniformly offset.
-- ============================================================

CREATE OR REPLACE FUNCTION crawler_hourly(p_since timestamptz)
RETURNS TABLE (dow int, hour int, hits bigint)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT EXTRACT(dow FROM h.fetched_at AT TIME ZONE 'Australia/Melbourne')::int,
         EXTRACT(hour FROM h.fetched_at AT TIME ZONE 'Australia/Melbourne')::int,
         count(*)::bigint
  FROM site_crawler_hits h
  WHERE h.fetched_at >= p_since
  GROUP BY 1, 2
$$;

REVOKE ALL ON FUNCTION crawler_hourly(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crawler_hourly(timestamptz) TO service_role;
