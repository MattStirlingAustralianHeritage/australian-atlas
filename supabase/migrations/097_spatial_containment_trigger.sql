-- ============================================================
-- Regions architecture — Phase 1.5
-- Spatial containment trigger for listings.region_computed_id
-- See docs/architecture/regions.md, Implementation Plan §1.5
--
-- Edge Cases: 2 (smallest polygon wins), 3 (no match → NULL),
-- 4 (draft regions included), 11 (missing coords → NULL).
-- Sync Behaviour §2 (sync writes lat/lng, trigger handles region),
-- §3 (trigger NEVER writes region_override_id).
--
-- Spec-vs-reality adjustments (flagged at time of writing):
--   - Status enum: matches 'live' AND 'draft'. The doc's
--     'draft_activating' value doesn't exist in the data;
--     doc is being updated to match reality in a follow-up.
--   - Column names: uses lat/lng. The doc says latitude/longitude
--     but the listings table defines lat and lng (migration 002).
--
-- Rollback:
--   DROP TRIGGER IF EXISTS listings_region_computed_trigger ON listings;
--   DROP FUNCTION IF EXISTS listings_recompute_region();
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.
-- Safe to re-run with no data impact.
-- ============================================================

create or replace function listings_recompute_region()
returns trigger
language plpgsql
as $$
begin
  -- Edge Case 11: missing coords → no region.
  if new.lat is null or new.lng is null then
    new.region_computed_id := null;
    return new;
  end if;

  -- Spatial containment:
  --   Edge Case 2: smallest polygon by area wins on overlap.
  --   Secondary ORDER BY id for deterministic tiebreak on equal areas.
  --   Edge Case 4: match 'live' + 'draft' (see doc — draft regions
  --                get correct listings before public activation).
  --   Edge Case 3: no polygon contains the point → SELECT INTO
  --                sets NEW.region_computed_id to NULL automatically
  --                (PL/pgSQL zero-row behaviour).
  --   polygon IS NOT NULL skips regions without polygons yet
  --   (explicit, redundant with ST_Contains but cheaper than
  --   evaluating ST_Contains on NULL).
  select id
    into new.region_computed_id
  from regions
  where status in ('live', 'draft')
    and polygon is not null
    and st_contains(
          polygon,
          st_setsrid(st_makepoint(new.lng, new.lat), 4326)
        )
  order by st_area(polygon) asc, id asc
  limit 1;

  return new;
end;
$$;

drop trigger if exists listings_region_computed_trigger on listings;

create trigger listings_region_computed_trigger
  before insert or update of lat, lng
  on listings
  for each row
  execute function listings_recompute_region();
