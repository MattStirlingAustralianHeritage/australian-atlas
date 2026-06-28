-- Migration 192: data-driven locality gazetteer for place-aware search.
--
-- WHY: searching a town/suburb that isn't in the hand-maintained maps
-- (lib/search/parseQuery.js PLACE_STATE / SUBURB_STATE) or the regions table
-- falls through to pure lexical+semantic ranking, which produces geographically
-- nonsensical results:
--   "apollo bay" -> Apollo Bay Distillery (correct) THEN Byron Bay Screenprinters
--                   (1,300km away) because the "bay" token matches.
--   "roma"       -> romance bookshops (semantic/fuzzy "roma"~"romance").
--
-- Our own listings are an excellent gazetteer: 5,944 active venues carry a
-- `suburb`, 6,852 carry lat/lng. This function aggregates them into a compact
-- (suburb, state) index with a venue centroid, dominant region and venue count,
-- so the search layer can recognise a query as a PLACE and pivot to a
-- proximity-ranked geographic browse rather than token matching.
--
-- Returned as a single jsonb array (one row) so the full ~2k-locality set comes
-- back in one request, sidestepping PostgREST's 1,000-row response cap. The
-- search layer caches it in-process (5 min TTL), mirroring resolveQueryRegion.
--
-- Additive + backward compatible: new function only, no schema or data changes.
-- Rollback: DROP FUNCTION atlas_locality_gazetteer().

create or replace function atlas_locality_gazetteer(min_count int default 1)
returns jsonb
language sql stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'suburb', suburb,
        'state',  state,
        'region', region,
        'lat',    round(lat::numeric, 5),
        'lng',    round(lng::numeric, 5),
        'n',      n
      )
      order by n desc, length(suburb) desc
    ),
    '[]'::jsonb
  )
  from (
    select
      l.suburb                                              as suburb,
      l.state                                               as state,
      mode() within group (order by l.region)               as region,
      avg(l.lat)                                            as lat,
      avg(l.lng)                                            as lng,
      count(*)::int                                         as n
    from listings l
    where l.status = 'active'
      and l.suburb is not null
      and length(btrim(l.suburb)) >= 3
      and l.lat is not null
      and l.lng is not null
      -- never let a hidden/under-review venue seed a public place centroid
      and (l.needs_review is null or l.needs_review = false)
      -- privacy: address-hidden venues don't contribute their coordinates
      and (l.address_on_request is null or l.address_on_request = false)
    group by l.suburb, l.state
    having count(*) >= greatest(min_count, 1)
  ) g;
$$;

comment on function atlas_locality_gazetteer(int) is
  'Compact (suburb,state)->{centroid,region,count} gazetteer built from active '
  'listings, returned as one jsonb array. Powers place-aware search '
  '(lib/search/resolveQueryPlace.js). Additive; see migration 190.';

notify pgrst, 'reload schema';
