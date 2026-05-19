-- ============================================================
-- Migration 123: listings_with_region view
-- ============================================================
--
-- Why this exists:
--   regions.md §"Reads use the override if set, else the computed
--   value." App code was filtering with .or(computed.eq.X,
--   override.eq.X) which is a logical OR, not a coalesce — listings
--   whose computed=X but override=Y were rendering on BOTH region
--   pages. This view exposes a single resolved region_id so
--   filter-by-region queries stop double-counting.
--
-- security_invoker = on:
--   Without this, the view runs with the definer's privileges and
--   bypasses RLS on listings. With it, the view inherits the
--   caller's RLS context — same security posture as querying the
--   table directly. Required since this view fronts every public
--   region-listing query.
--
-- region_resolution_source:
--   'override' | 'computed' | NULL — useful for admin/debug surfaces
--   that want to know where the assignment came from without
--   re-deriving it from the two FK columns.

create or replace view listings_with_region
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
  'Override-wins region resolution per docs/regions.md. Use for filter-by-region reads. Writes must target the listings table.';

-- Functional index on the COALESCE expression. Without this the planner
-- ignores the per-column b-tree indexes (096) when filtering on
-- region_id, falling back to seq scan (~7ms on 6.6k rows; degrades as the
-- table grows). With this index the view query plan is index-scan and
-- runs in <1ms — at parity with the pre-fix OR pattern.
create index if not exists listings_resolved_region_idx
  on listings (coalesce(region_override_id, region_computed_id));
