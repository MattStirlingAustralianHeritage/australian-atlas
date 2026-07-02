-- 203_map_pins_visitable.sql
--
-- Keep non-visitable listings off the map.
--
-- Online-only / markets-only makers (visitable = false) have no street address
-- — their lat/lng is a bare locality geocode, so every such maker in a city
-- lands on the SAME centroid point. On /map that renders as a phantom stack in
-- the middle of Melbourne/Sydney/Canberra: pins for places you cannot actually
-- visit, all at one coordinate. As of this migration none of the 31 affected
-- active listings has a street_address.
--
-- The fix is the `visitable` flag (087), NOT "address is null" — natural places
-- (waterfalls, national parks) and OSM coords-first venues legitimately carry
-- exact coordinates without a street address and must stay on the map.
--
-- Same function as 199 with one added predicate. The filter MUST stay in
-- lock-step with the route's fallback path (app/api/map/route.js +
-- lib/listings/publicFilter.js):
--   status = 'active'
--   vertical ∈ public verticals            (passed in — JS stays the SoT)
--   needs_review IS NULL OR = false        (excludeNeedsReview)
--   slug NOT ILIKE '<test-prefix>%'        (excludeTestListings)
--   lat/lng NOT NULL
--   address_on_request = false OR NULL     (exact coords never leak)
--   visitable = true OR NULL               (no physical location → no pin)

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
      and (visitable is null or visitable = true)
  ) t;
$$;

-- The route calls this with the service role; keep it off the public/anon
-- surface so it can't be used as an unthrottled full-table dump.
revoke all on function public.map_pins(text[], text) from public;
grant execute on function public.map_pins(text[], text) to service_role;

-- Expose the updated function through PostgREST immediately.
notify pgrst, 'reload schema';
