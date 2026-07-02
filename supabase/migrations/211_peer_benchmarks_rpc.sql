-- 211_peer_benchmarks_rpc.sql
--
-- Anonymised peer benchmarks for the operator dashboard.
--
-- listing_peer_benchmarks(p_listing_id) compares one listing against its peer
-- cohort — ACTIVE listings sharing the same vertical AND state (admin/QA
-- fixture slugs excluded, mirroring lib/listings/publicFilter.js). The output
-- is aggregate-only jsonb: cohort size plus median / p75 / percentile per
-- metric. No other listing's identity (id, name, slug — anything) ever appears
-- in the result, so an operator can see WHERE they sit but never WHO sits
-- around them.
--
-- Metrics — all from cheap, listing_id-keyed + indexed tables only:
--   search_appearances — listing_search_appearances rows in the last 30 days
--                        (idx_lsa_listing_appeared covers listing_id+window)
--   saves              — user_saves rows, all-time (idx_saves_listing; matches
--                        the all-time "Atlas Passport saves" number the
--                        operator already sees on /dashboard/analytics)
--   trail_inclusions   — trail_stops rows, all-time (matches the all-time
--                        "Trail Inclusions" number on /dashboard/analytics)
--
-- Percentile = share of the cohort whose count is <= yours (0–100; the target
-- is in its own cohort, so the floor is above zero).
--
-- Cohorts under 8 return {"cohort_too_small": true, "cohort_size": N} instead
-- of numbers — a median over a handful of venues is noise, and tiny cohorts
-- edge toward de-anonymisation.
--
-- NOTE: pay-to-win guard — this is REPORTING ONLY, private to the owner via
-- /api/dashboard/benchmarks. Nothing may read it to influence search, map or
-- discover ranking, or any visitor-facing ordering.

create or replace function public.listing_peer_benchmarks(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vertical    text;
  v_state       text;
  v_cohort      uuid[];
  v_cohort_size int;
  v_since       timestamptz := now() - interval '30 days';
  v_you         int;
  v_median      numeric;
  v_p75         numeric;
  v_pct         int;
  v_metrics     jsonb := '{}'::jsonb;
begin
  select vertical, state
    into v_vertical, v_state
  from listings
  where id = p_listing_id;

  if not found then
    return jsonb_build_object('error', 'listing_not_found');
  end if;

  -- Peer cohort: active listings in the same vertical + state (includes the
  -- target itself when it is active). `is not distinct from` keeps null-state
  -- listings comparable to each other instead of matching nothing. Fixture
  -- rows (slug prefix 'admin' — see lib/listings/publicFilter.js) are QA
  -- data, not peers.
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_cohort
  from listings
  where status = 'active'
    and vertical = v_vertical
    and state is not distinct from v_state
    and slug not ilike 'admin%';

  v_cohort_size := coalesce(array_length(v_cohort, 1), 0);

  if v_cohort_size < 8 then
    return jsonb_build_object('cohort_too_small', true, 'cohort_size', v_cohort_size);
  end if;

  -- ── Search appearances (last 30 days) ────────────────────────────────────
  select count(*) into v_you
  from listing_search_appearances
  where listing_id = p_listing_id
    and appeared_at >= v_since;

  select round((percentile_cont(0.5)  within group (order by n))::numeric, 1),
         round((percentile_cont(0.75) within group (order by n))::numeric, 1),
         round(100.0 * count(*) filter (where n <= v_you) / count(*))
    into v_median, v_p75, v_pct
  from (
    select count(a.listing_id) as n
    from unnest(v_cohort) as c(id)
    left join listing_search_appearances a
      on a.listing_id = c.id
     and a.appeared_at >= v_since
    group by c.id
  ) sa;

  v_metrics := v_metrics || jsonb_build_object(
    'search_appearances',
    jsonb_build_object('you', v_you, 'median', v_median, 'p75', v_p75, 'percentile', v_pct)
  );

  -- ── Atlas Passport saves (all-time) ──────────────────────────────────────
  select count(*) into v_you
  from user_saves
  where listing_id = p_listing_id;

  select round((percentile_cont(0.5)  within group (order by n))::numeric, 1),
         round((percentile_cont(0.75) within group (order by n))::numeric, 1),
         round(100.0 * count(*) filter (where n <= v_you) / count(*))
    into v_median, v_p75, v_pct
  from (
    select count(s.listing_id) as n
    from unnest(v_cohort) as c(id)
    left join user_saves s
      on s.listing_id = c.id
    group by c.id
  ) sv;

  v_metrics := v_metrics || jsonb_build_object(
    'saves',
    jsonb_build_object('you', v_you, 'median', v_median, 'p75', v_p75, 'percentile', v_pct)
  );

  -- ── Trail inclusions (all-time) ──────────────────────────────────────────
  select count(*) into v_you
  from trail_stops
  where listing_id = p_listing_id;

  select round((percentile_cont(0.5)  within group (order by n))::numeric, 1),
         round((percentile_cont(0.75) within group (order by n))::numeric, 1),
         round(100.0 * count(*) filter (where n <= v_you) / count(*))
    into v_median, v_p75, v_pct
  from (
    select count(ts.listing_id) as n
    from unnest(v_cohort) as c(id)
    left join trail_stops ts
      on ts.listing_id = c.id
    group by c.id
  ) ti;

  v_metrics := v_metrics || jsonb_build_object(
    'trail_inclusions',
    jsonb_build_object('you', v_you, 'median', v_median, 'p75', v_p75, 'percentile', v_pct)
  );

  return jsonb_build_object(
    'cohort_size', v_cohort_size,
    'vertical', v_vertical,
    'state', v_state,
    'metrics', v_metrics
  );
end;
$$;

-- The dashboard route calls this with the service role; keep it off the
-- public/anon surface so cohort aggregates can't be probed unauthenticated.
revoke all on function public.listing_peer_benchmarks(uuid) from public;
grant execute on function public.listing_peer_benchmarks(uuid) to service_role;

-- Expose the new function through PostgREST immediately.
notify pgrst, 'reload schema';
