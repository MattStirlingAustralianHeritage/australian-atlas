-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 014: Enhanced analytics for admin dashboard
-- ============================================================
-- Extends listing_analytics with geographic data and adds
-- site-level analytics for the admin traffic dashboard.
-- ============================================================

-- Site-level page views (not listing-specific)
-- Captures overall traffic across the network
CREATE TABLE IF NOT EXISTS site_analytics (
  id              uuid primary key default gen_random_uuid(),
  vertical        text not null,                          -- 'sba', 'collection', 'craft', etc. or 'portal'
  page_path       text not null,                          -- e.g. '/venue/mclaren-vale-winery'
  event_type      text not null default 'pageview'
                  check (event_type in ('pageview', 'signup', 'claim_start', 'claim_complete', 'search')),
  -- Geographic data (resolved from IP on ingest)
  country         text,                                   -- ISO 3166-1 alpha-2 (e.g. 'AU')
  region          text,                                   -- State/province (e.g. 'Victoria')
  city            text,                                   -- e.g. 'Melbourne'
  lat             double precision,                       -- Approximate lat for map dot
  lng             double precision,                       -- Approximate lng for map dot
  -- Session context
  referrer        text,                                   -- Referring URL
  device_type     text check (device_type in ('desktop', 'mobile', 'tablet')),
  -- Timestamp
  created_at      timestamptz default now()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS site_analytics_vertical_idx ON site_analytics(vertical, created_at);
CREATE INDEX IF NOT EXISTS site_analytics_event_idx ON site_analytics(event_type, created_at);
CREATE INDEX IF NOT EXISTS site_analytics_geo_idx ON site_analytics(country, region, created_at);
CREATE INDEX IF NOT EXISTS site_analytics_created_idx ON site_analytics(created_at);

-- RLS
ALTER TABLE site_analytics ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (anonymous tracking from verticals)
CREATE POLICY "Public can insert site_analytics"
  ON site_analytics FOR INSERT
  WITH CHECK (true);

-- Service role full access (admin dashboard reads)
CREATE POLICY "Service role full access site_analytics"
  ON site_analytics FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================
-- Add geo columns to existing listing_analytics
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listing_analytics' AND column_name = 'country'
  ) THEN
    ALTER TABLE listing_analytics ADD COLUMN country text;
    ALTER TABLE listing_analytics ADD COLUMN region text;
    ALTER TABLE listing_analytics ADD COLUMN city text;
    ALTER TABLE listing_analytics ADD COLUMN lat double precision;
    ALTER TABLE listing_analytics ADD COLUMN lng double precision;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS analytics_geo_idx ON listing_analytics(country, region, created_at);

-- ============================================================
-- Aggregate views for dashboard performance
-- ============================================================

-- Daily traffic summary per vertical (materialised by cron, not a view — too slow)
CREATE TABLE IF NOT EXISTS analytics_daily_summary (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  vertical        text not null,
  pageviews       int default 0,
  unique_visitors int default 0,             -- Estimated (count distinct sessions)
  signups         int default 0,
  claims_started  int default 0,
  claims_completed int default 0,
  top_country     text,
  top_region      text,
  UNIQUE(date, vertical)
);

CREATE INDEX IF NOT EXISTS daily_summary_date_idx ON analytics_daily_summary(date, vertical);

ALTER TABLE analytics_daily_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access daily_summary"
  ON analytics_daily_summary FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================
-- RPC: Aggregate geographic data for map visualization
-- Returns lat/lng points with count for animated dot map (Ghost-style)
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_geo_heatmap(
  time_range interval DEFAULT '30 days',
  filter_vertical text DEFAULT NULL
)
RETURNS TABLE (
  city text,
  region text,
  country text,
  lat double precision,
  lng double precision,
  visit_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.city,
    sa.region,
    sa.country,
    sa.lat,
    sa.lng,
    count(*)::bigint AS visit_count
  FROM site_analytics sa
  WHERE sa.created_at > now() - time_range
    AND sa.lat IS NOT NULL
    AND sa.lng IS NOT NULL
    AND (filter_vertical IS NULL OR sa.vertical = filter_vertical)
  GROUP BY sa.city, sa.region, sa.country, sa.lat, sa.lng
  ORDER BY visit_count DESC
  LIMIT 500;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: Traffic summary for dashboard cards
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_traffic_summary(
  time_range interval DEFAULT '30 days'
)
RETURNS TABLE (
  vertical text,
  total_pageviews bigint,
  total_signups bigint,
  total_claims bigint,
  top_country text,
  top_city text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.vertical,
    count(*) FILTER (WHERE sa.event_type = 'pageview')::bigint AS total_pageviews,
    count(*) FILTER (WHERE sa.event_type = 'signup')::bigint AS total_signups,
    count(*) FILTER (WHERE sa.event_type = 'claim_complete')::bigint AS total_claims,
    mode() WITHIN GROUP (ORDER BY sa.country) AS top_country,
    mode() WITHIN GROUP (ORDER BY sa.city) AS top_city
  FROM site_analytics sa
  WHERE sa.created_at > now() - time_range
  GROUP BY sa.vertical
  ORDER BY total_pageviews DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
