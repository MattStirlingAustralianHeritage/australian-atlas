-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 156: AI crawler access log
-- ============================================================
-- Records one row per request whose User-Agent matches a known
-- AI search/training crawler (GPTBot, ClaudeBot, PerplexityBot,
-- Googlebot, et al). Written exclusively by middleware.js on the
-- Vercel Edge runtime, via the Supabase REST API using the
-- service_role key (fetch only — no pg, no node APIs).
--
-- This is the only choke point that observes non-JS bots: the
-- client-side analytics pipeline (site_analytics) cannot see
-- crawlers because they never execute the page JS.
--
-- RLS is enabled with NO policies (default-deny). The service_role
-- key bypasses RLS, so middleware inserts succeed; anon and
-- authenticated roles have no policy and therefore no access.
-- ============================================================

CREATE TABLE IF NOT EXISTS site_crawler_hits (
  id          bigint generated always as identity primary key,
  bot_name    text not null,            -- matched crawler token, e.g. 'ClaudeBot'
  user_agent  text not null,            -- full raw User-Agent header
  path        text not null,            -- request.nextUrl.pathname
  host        text,                     -- Host header
  ip          text,                     -- x-forwarded-for (first hop) / request.ip
  fetched_at  timestamptz not null default now()
);

-- Dashboard query patterns: "hits for bot X over time" and "recent hits".
CREATE INDEX IF NOT EXISTS site_crawler_hits_bot_idx
  ON site_crawler_hits (bot_name, fetched_at desc);

CREATE INDEX IF NOT EXISTS site_crawler_hits_fetched_idx
  ON site_crawler_hits (fetched_at desc);

-- Default-deny: enable RLS and intentionally add NO policies.
ALTER TABLE site_crawler_hits ENABLE ROW LEVEL SECURITY;
