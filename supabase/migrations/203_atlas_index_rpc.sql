-- 203_atlas_index_rpc.sql
--
-- Single-round-trip directory fetch for /atlas-index (the A–Z index).
--
-- Before this, the page paginated the listings table 1000 rows at a time —
-- ~7 SEQUENTIAL PostgREST round-trips for ~6.9k rows — on EVERY request
-- (the page was force-dynamic, so no render was ever reused). Measured
-- 5.7–8.5s TTFB on prod while the rest of the site answered in under 1s.
--
-- atlas_index_rows() does the same public-visibility filter in a single
-- query and aggregates to one JSON scalar (bypassing PostgREST's 1000-row
-- cap). Rows come back name-ordered because IndexClient's A–Z sections
-- preserve input order within each letter group.
--
-- The filter matches the network's public-surface rules (same shape as
-- map_pins in 199_map_pins_rpc.sql, minus the coordinate conditions that
-- only matter for pins) and MUST stay in lock-step with the page's
-- paginated fallback (lib/listings/publicFilter.js):
--   status = 'active'
--   vertical ∈ public verticals            (passed in — JS stays the SoT)
--   needs_review IS NULL OR = false        (excludeNeedsReview)
--   slug NOT ILIKE '<test-prefix>%'        (excludeTestListings)

create or replace function public.atlas_index_rows(
  p_verticals text[],
  p_test_prefix text default 'admin'
)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  from (
    select
      id,
      name,
      slug,
      vertical,
      suburb,
      state,
      region
    from public.listings
    where status = 'active'
      and vertical = any(p_verticals)
      and (needs_review is null or needs_review = false)
      and not (slug ilike (p_test_prefix || '%'))
    order by name asc, id asc
  ) t;
$$;

-- The page calls this with the service role; keep it off the public/anon
-- surface so it can't be used as an unthrottled full-table dump.
--
-- NOTE: `revoke ... from public` alone is NOT enough on Supabase — default
-- privileges grant EXECUTE on new functions to anon and authenticated
-- DIRECTLY (not just via PUBLIC), so each role must be revoked by name.
-- Verified 2026-07-02: after 199's public-only revoke, anon could still call
-- map_pins(); the same would have applied here.
revoke all on function public.atlas_index_rows(text[], text) from public, anon, authenticated;
grant execute on function public.atlas_index_rows(text[], text) to service_role;

-- Retroactive hardening for 199_map_pins_rpc.sql, which intended the same
-- service_role-only surface but only revoked PUBLIC (leaving the direct
-- anon/authenticated default-privilege grants in place).
revoke all on function public.map_pins(text[], text) from public, anon, authenticated;
grant execute on function public.map_pins(text[], text) to service_role;

-- Expose the new function through PostgREST immediately.
notify pgrst, 'reload schema';
