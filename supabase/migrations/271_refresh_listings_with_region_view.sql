-- Migration 271: recreate listings_with_region so it exposes the columns added
-- since the view was last built.
--
-- The view is `select l.*` — PostgreSQL snapshots a view's column list at
-- CREATE time, so columns added to listings afterwards are invisible through
-- it. Migration 269 added listings.closure_status and the search route began
-- selecting it via the view; the stale view made every /api/search BROWSE
-- request (no ?q=) return 500 "column listings_with_region.closure_status does
-- not exist" — a live production incident found during the 2026-08-01 search
-- audit. Same recreate-to-refresh pattern as migrations 142 and 146.
--
-- The whole file runs in one implicit transaction (single client.query in
-- scripts/run-migration.mjs), so the drop/create swap is atomic.

drop view if exists listings_with_region;

create view listings_with_region
with (security_invoker = on)
as
select
  l.*,
  coalesce(l.region_override_id, l.region_computed_id) as region_id,
  case
    when l.region_override_id is not null then 'override'
    when l.region_computed_id  is not null then 'computed'
    else null
  end as region_resolution_source
from listings l;

comment on view listings_with_region is
  'Override-wins region resolution per docs/regions.md. Use for filter-by-region reads. Writes must target the listings table. NOTE: `select l.*` snapshots columns at CREATE — recreate this view whenever a migration adds a listings column that read paths need (the closure_status omission 500''d /api/search browse).';

grant select on listings_with_region to anon, authenticated, service_role;

notify pgrst, 'reload schema';
