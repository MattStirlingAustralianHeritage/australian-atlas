-- 166_map_pins_rpc.sql
--
-- Single-round-trip pin fetch for /api/map (and the homepage living-atlas map).
--
-- Before this, /api/map paginated the listings table 1000 rows at a time —
-- ~7 SEQUENTIAL PostgREST round-trips for ~6.9k rows — and pulled the FULL
-- `description` for every row only to trim it to 160 chars in JS afterwards.
-- The uncached origin path measured 8–12s, so any CDN cache miss left the map
-- stuck on "Loading the atlas…" for that long.
--
-- map_pins() does the identical public-visibility filter in a single query,
-- aggregates to one JSON scalar (bypassing PostgREST's 1000-row cap), and
-- trims description to 160 chars in SQL so full editorial bodies never leave
-- the database. The filter MUST stay in lock-step with the route's fallback
-- path (lib/listings/publicFilter.js + the /api/map paginated fallback):
--   status = 'active'
--   vertical ∈ public verticals            (passed in — JS stays the SoT)
--   needs_review IS NULL OR = false        (excludeNeedsReview)
--   slug NOT ILIKE '<test-prefix>%'        (excludeTestListings)
--   lat/lng NOT NULL
--   address_on_request = false OR NULL     (exact coords never leak)

create or replace function public.map_pins(
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
      vertical,
      verticals,
      name,
      slug,
      left(description, 160) as description,
      region,
      state,
      lat,
      lng,
      is_featured,
      sub_type,
      trail_suitable
    from public.listings
    where status = 'active'
      and vertical = any(p_verticals)
      and (needs_review is null or needs_review = false)
      and not (slug ilike (p_test_prefix || '%'))
      and lat is not null
      and lng is not null
      and (address_on_request = false or address_on_request is null)
  ) t;
$$;

-- The route calls this with the service role; keep it off the public/anon
-- surface so it can't be used as an unthrottled full-table dump.
revoke all on function public.map_pins(text[], text) from public;
grant execute on function public.map_pins(text[], text) to service_role;

-- Expose the new function through PostgREST immediately.
notify pgrst, 'reload schema';
