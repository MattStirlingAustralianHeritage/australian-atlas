-- Migration 148: search observability. One row per search across every
-- instrumented surface so a silent 0% (or a Voyage outage) is visible.

create table if not exists search_events (
  id               uuid primary key default gen_random_uuid(),
  query_text       text,
  surface          text,        -- front_door | vibe | plan | itinerary | similar
  result_count     integer,
  latency_ms       integer,
  vector_arm_fired boolean,
  fell_back        boolean,
  voyage_error     text,
  zero_result      boolean,
  created_at       timestamptz not null default now()
);

create index if not exists idx_search_events_created on search_events (created_at desc);
create index if not exists idx_search_events_surface on search_events (surface, created_at desc);
create index if not exists idx_search_events_zero on search_events (created_at desc) where zero_result;
create index if not exists idx_search_events_voyage_err on search_events (created_at desc) where voyage_error is not null;
