-- Migration 177: search click-through logging.
--
-- From the 2026-06-19 search audit (B5). Until now nothing recorded WHICH result
-- a searcher clicked, so relevance / CTR-at-rank was unmeasurable — every ranking
-- change was un-A/B-testable. This table captures a click event (query + the
-- chosen result + its rank) so /admin/insights can show what people actually
-- pick. Analytics only: no FK to listings (keeps it decoupled + write-cheap).
--
-- Written exclusively by POST /api/search/click via the service-role client, so
-- RLS is enabled with NO policies (service role bypasses RLS; anon is blocked).
-- ============================================================================

create table if not exists search_click_events (
  id          uuid primary key default gen_random_uuid(),
  query_text  text,
  listing_id  uuid,
  slug        text,
  vertical    text,
  rank        int,
  surface     text default 'front_door',
  created_at  timestamptz not null default now()
);

create index if not exists search_click_events_created_idx on search_click_events (created_at desc);
create index if not exists search_click_events_slug_idx on search_click_events (slug);

alter table search_click_events enable row level security;

notify pgrst, 'reload schema';
