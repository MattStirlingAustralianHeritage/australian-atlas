-- 224: Plan-a-Stay funnel events
-- Captures the planner's outcome funnel (generated → edited → shared/saved)
-- plus recommendation usage, so user-outcome quality becomes measurable.
--
-- APPLY MANUALLY (pooler :5432) AFTER the 2026-07-06 portal DB password
-- rotation — the previous password leaked into a session transcript via
-- run-migrations.mjs and must not be reused.
--
-- Consumers: app/api/plan-a-stay/events/route.js (insert, service-role).
-- No read surfaces yet; admin analytics can aggregate later.

create table if not exists planner_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  region text,
  intent text[],
  duration int,
  meta jsonb,
  user_agent text,
  is_bot boolean not null default false
);

create index if not exists planner_events_created_idx on planner_events (created_at desc);
create index if not exists planner_events_type_idx on planner_events (event_type);

-- Service-role writes only: RLS on with no policies denies anon/authenticated;
-- the service key bypasses RLS. Matches the trips/PII lockdown convention.
alter table planner_events enable row level security;

notify pgrst, 'reload schema';
