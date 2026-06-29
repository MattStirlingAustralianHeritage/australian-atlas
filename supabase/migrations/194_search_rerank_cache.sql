-- Migration 194: cross-encoder rerank cache + search_events.reranked flag.
--
-- /api/search gained a precision stage (lib/search/rerank.js): the fused recall
-- pool is reranked by Voyage rerank-2.5 (a cross-encoder), which reads query and
-- document together and is phrasing-robust — so paraphrases of one intent ("a
-- brewery that uses ovens with wood" / "wood fired oven brewery") converge.
--
-- This migration backs two best-effort consumers of that stage:
--   1. search_rerank_cache — per-listing relevance scores keyed by the normalized
--      query, so a repeated/partial search costs no rerank API call. Read/written
--      only by the service-role route; the code tolerates the table's absence
--      (every access is wrapped), so deploy order is not load-bearing.
--   2. search_events.reranked — did a given search get the rerank pass? (null for
--      browse / pre-feature rows) so coverage is observable in analytics.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop table if exists search_rerank_cache;
--   alter table search_events drop column if exists reranked;
-- ============================================================================

create table if not exists search_rerank_cache (
  query_hash text primary key,
  model      text not null,
  scores     jsonb not null,            -- { "<listing_id>": <relevance_score>, ... }
  created_at timestamptz not null default now()
);

-- Used to expire stale entries (the route filters reads by created_at).
create index if not exists search_rerank_cache_created_idx
  on search_rerank_cache (created_at);

-- Service-role only (the route uses the admin client, which bypasses RLS). RLS on
-- with no policy => anon/auth get nothing; nothing here is user-facing.
alter table search_rerank_cache enable row level security;

-- Did this search get the cross-encoder rerank pass? null = browse / pre-feature.
alter table search_events add column if not exists reranked boolean;

notify pgrst, 'reload schema';
