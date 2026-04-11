-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 050: Add visitor_id to pageviews for unique visitor tracking
-- ============================================================
-- Adds a client-generated anonymous visitor ID (UUID stored in localStorage).
-- No PII, no cookies — just a stable random identifier per browser.
-- ============================================================

ALTER TABLE pageviews ADD COLUMN IF NOT EXISTS visitor_id text;

-- Index for efficient COUNT(DISTINCT visitor_id) queries
CREATE INDEX IF NOT EXISTS pageviews_visitor_id_idx ON pageviews (visitor_id) WHERE visitor_id IS NOT NULL;
