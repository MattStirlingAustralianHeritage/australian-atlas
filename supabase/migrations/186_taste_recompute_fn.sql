-- ============================================================
-- 186 — recompute_taste_profile(user) + repair_all_taste_profiles()
--
-- ONE idempotent compute path shared by the write-through triggers (187) and
-- the backfill/repair script. Always rebuilds from the user's FULL CURRENT
-- positive set — never incremental — so a missed run self-heals on the next.
--
-- FAIL LOUD: recompute_taste_profile RAISEs on any unexpected error and never
-- silently writes an empty/stale vector. The legitimate "no positives" case
-- deletes the cached row (clean); "positives exist but none embedded" writes
-- shares + taste_vector = NULL (explicit, not a fake vector).
--
-- Math mirrors the existing stateless code, positives-only:
--   taste_vector    = l2_normalize(avg(embedding))     [System A, no skips]
--   category_shares = per-field count / distinct-positive-count   [System B]
-- ============================================================

begin;

create or replace function public.recompute_taste_profile(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n         int;
  v_with_emb  int;
  v_saves     int;
  v_stops     int;
  v_vector    vector(1024);
  v_verticals jsonb;
  v_subtypes  jsonb;
  v_regions   jsonb;
begin
  if p_user is null then
    raise exception 'recompute_taste_profile: p_user is null';
  end if;

  -- Distinct POSITIVE listing set (saves UNION owned trail-stops), joined to
  -- listings, with all aggregates computed in one pass (no temp tables — must be
  -- safe to call many times within a single statement-level trigger firing).
  with pos as (
    select listing_id from public.user_saves where user_id = p_user
    union
    select ts.listing_id
      from public.trail_stops ts
      join public.trails t on t.id = ts.trail_id
      where t.created_by = p_user and ts.listing_id is not null
  ),
  j as (
    select l.vertical,
           l.sub_type,
           nullif(btrim(coalesce(l.region, '')), '') as region,
           l.embedding
      from pos
      join public.listings l on l.id = pos.listing_id
  ),
  agg as (
    select count(*)::int                                         as n,
           count(*) filter (where embedding is not null)::int    as with_emb,
           case when count(*) filter (where embedding is not null) > 0
                then l2_normalize(avg(embedding))
                else null end                                    as vec
      from j
  ),
  vw as (
    select coalesce(jsonb_object_agg(vertical, cnt::float8 / (select n from agg)), '{}'::jsonb) as v
      from (select vertical, count(*) cnt from j where vertical is not null group by vertical) s
  ),
  sw as (
    select coalesce(jsonb_object_agg(sub_type, cnt::float8 / (select n from agg)), '{}'::jsonb) as v
      from (select sub_type, count(*) cnt from j where sub_type is not null group by sub_type) s
  ),
  rw as (
    select coalesce(jsonb_object_agg(region, cnt::float8 / (select n from agg)), '{}'::jsonb) as v
      from (select region, count(*) cnt from j where region is not null group by region) s
  )
  select agg.n, agg.with_emb, agg.vec, vw.v, sw.v, rw.v
    into v_n, v_with_emb, v_vector, v_verticals, v_subtypes, v_regions
    from agg, vw, sw, rw;

  -- No positive signal → remove any cached row and stop (never a zero vector).
  if coalesce(v_n, 0) = 0 then
    delete from public.taste_profiles where profile_id = p_user;
    return;
  end if;

  -- Raw (pre-dedup) source contributions, for transparency in source_breakdown.
  select count(*)::int into v_saves
    from public.user_saves where user_id = p_user;
  select count(*)::int into v_stops
    from public.trail_stops ts
    join public.trails t on t.id = ts.trail_id
    where t.created_by = p_user and ts.listing_id is not null;

  insert into public.taste_profiles
    (profile_id, taste_vector, category_shares, source_count, source_breakdown, updated_at)
  values (
    p_user,
    v_vector,
    jsonb_build_object(
      'savedCount',      v_n,
      'verticalWeights', v_verticals,
      'subTypeWeights',  v_subtypes,
      'regionWeights',   v_regions
    ),
    v_n,
    jsonb_build_object(
      'user_saves',     v_saves,
      'trail_stops',    v_stops,
      'distinct',       v_n,
      'with_embedding', v_with_emb
    ),
    now()
  )
  on conflict (profile_id) do update set
    taste_vector     = excluded.taste_vector,
    category_shares  = excluded.category_shares,
    source_count     = excluded.source_count,
    source_breakdown = excluded.source_breakdown,
    updated_at       = now();
end;
$$;

comment on function public.recompute_taste_profile(uuid) is
  'Idempotent full rebuild of one user''s taste_profiles row from their saves + owned trail_stops. Raises on error; never writes an empty/stale vector.';

-- Backfill / repair: rebuild every profile that has any positive signal.
-- All-or-nothing and FAIL LOUD by design — any per-user error propagates and
-- rolls the whole run back for a clean retry (operator-run, not a trigger).
create or replace function public.repair_all_taste_profiles()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r   record;
  cnt int := 0;
begin
  for r in
    select user_id as uid from public.user_saves
    union
    select t.created_by as uid
      from public.trails t
      join public.trail_stops ts on ts.trail_id = t.id
      where t.created_by is not null and ts.listing_id is not null
  loop
    perform public.recompute_taste_profile(r.uid);
    cnt := cnt + 1;
  end loop;
  raise notice 'repair_all_taste_profiles: recomputed % profile(s)', cnt;
  return cnt;
end;
$$;

comment on function public.repair_all_taste_profiles() is
  'Rebuild every taste_profiles row from saves + owned trail_stops. Idempotent, all-or-nothing, fail-loud. Run via scripts/backfill-taste-profiles.sql.';

commit;
