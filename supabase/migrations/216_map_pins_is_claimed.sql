-- 216_map_pins_is_claimed.sql
--
-- Add is_claimed to the map pin payload so the /map discovery panel can lead
-- with claimed listings (an operator tending their listing earns the top slot
-- in the left-hand list). Same function as 203 with one added column — the
-- WHERE clause is unchanged and MUST stay in lock-step with the route's
-- fallback path (app/api/map/route.js + lib/listings/publicFilter.js).

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
      is_claimed,
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

revoke all on function public.map_pins(text[], text) from public;
grant execute on function public.map_pins(text[], text) to service_role;

-- Expose the updated function through PostgREST immediately.
notify pgrst, 'reload schema';
