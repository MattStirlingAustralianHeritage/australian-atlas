-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 015: Pageviews table (analytics rebuild)
-- ============================================================
-- Simple, flat pageview tracking table. Replaces the site_analytics
-- approach that was never successfully deployed.
-- ============================================================

CREATE TABLE IF NOT EXISTS pageviews (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  vertical    text not null default 'portal',
  path        text not null,
  referrer    text,
  device      text,
  country     text,
  region      text,
  city        text,
  lat         double precision,
  lng         double precision
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS pageviews_ts_idx ON pageviews (ts);
CREATE INDEX IF NOT EXISTS pageviews_vertical_ts_idx ON pageviews (vertical, ts);

-- RLS: service role needs full access, public can insert
ALTER TABLE pageviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow inserts from service role"
  ON pageviews FOR ALL
  USING (true)
  WITH CHECK (true);
