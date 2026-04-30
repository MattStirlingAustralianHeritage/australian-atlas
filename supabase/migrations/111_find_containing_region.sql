-- ============================================================
-- 111_find_containing_region.sql
--
-- Postgres helper for spatial-containment region lookup against
-- listing candidates (which don't have a trigger like listings).
-- Used by /api/admin/candidates/[id]/geocode to suggest a region
-- when the reviewer enters or edits a candidate's address.
--
-- Mirrors the logic of listings_recompute_region() (the trigger
-- function that fires on listings.lat/lng changes), so admin tool
-- behaviour stays consistent with how region_computed_id is
-- populated automatically on the listings table.
--
-- Returns the smallest containing polygon, ties broken by id, or
-- NULL when no live/draft region with a populated polygon contains
-- the point. (13 of 66 regions are status='draft' with NULL
-- polygons as of 2026-04-30 — those produce no match, which the
-- caller surfaces as "Region not auto-detected" in the UI.)
--
-- STABLE so consumers can safely call from triggers, RLS
-- expressions, or other functions if needed later.
-- ============================================================

create or replace function find_containing_region(
  p_lat double precision,
  p_lng double precision
)
returns table (id uuid, name text, slug text, state text)
language sql
stable
as $$
  select r.id, r.name, r.slug, r.state
  from regions r
  where r.status in ('live', 'draft')
    and r.polygon is not null
    and st_contains(
          r.polygon,
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)
        )
  order by st_area(r.polygon) asc, r.id asc
  limit 1;
$$;
