-- 205_search_result_impressions.sql
--
-- Per-search RESULT-IMPRESSION log: which listings a search actually returned,
-- and at what position. Today search_events (148 + 194) records query/surface/
-- result_count but NOT the returned listings, and listing_search_appearances
-- (082) records listing_id+appeared_at but not the query or position. This
-- table closes that gap so "queries you appeared for" intelligence accrues
-- from the day it ships.
--
-- Written fire-and-forget from the search APIs (top N sent to the client,
-- capped at 20 rows per search). search_event_id links back to the owning
-- search_events row (uuid pk, see 148) when the telemetry helper captured it
-- cheaply; null otherwise. listing_id is deliberately NOT a FK to listings —
-- this is an append-only telemetry log and a dropped listing should not
-- cascade into (or block) it.
--
-- NOTE: pay-to-win guard — this table is observability only. Nothing may read
-- it to influence search/map/discover ranking or any visitor-facing ordering.

create table if not exists public.search_result_impressions (
  id               bigint generated always as identity primary key,
  -- uuid: matches search_events.id (migration 148)
  search_event_id  uuid references public.search_events(id) on delete set null,
  query_text       text not null,
  surface          text not null,          -- front_door | ask
  listing_id       uuid not null,
  position         int  not null,          -- 1-based rank as sent to the client
  created_at       timestamptz not null default now()
);

-- "Queries listing X appeared for, most recent first" — the primary read.
create index if not exists idx_sri_listing_created
  on public.search_result_impressions (listing_id, created_at desc);
-- Retention sweeps / recent-window scans.
create index if not exists idx_sri_created
  on public.search_result_impressions (created_at);

-- RLS: locked down. No policies — reads and writes go through the service
-- role only (search telemetry writes, dashboard intelligence reads).
alter table public.search_result_impressions enable row level security;

-- Make PostgREST pick up the new table immediately.
notify pgrst, 'reload schema';
