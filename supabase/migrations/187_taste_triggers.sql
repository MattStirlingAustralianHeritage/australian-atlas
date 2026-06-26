-- ============================================================
-- 187 — write-through triggers (STATEMENT-LEVEL) on user_saves + trail_stops
--
-- Keep taste_profiles live, un-bypassably, whenever positive signal changes.
-- Catches every positive write path: the listing-detail save, the Discover
-- merge-session adoption (anon→user user_saves upsert), the trail builder's
-- trail_stops insert, and any admin/script write.
--
-- STATEMENT-LEVEL with transition tables (REFERENCING ... TABLE AS changed):
-- a bulk write (e.g. merge-session upserting many saves, the builder inserting
-- all stops at once) triggers ONE recompute per affected user, not one per row.
-- Each trigger names its transition table `changed`, so one function serves both
-- INSERT (new rows) and DELETE (old rows).
--
-- ISOLATE-AND-LOG: a recompute failure must NEVER roll back the user's save (the
-- profile is a derived cache; saves are the source of truth). Each per-user
-- recompute is wrapped so a failure RAISEs WARNING (loud in PG logs) and the
-- save proceeds. The fail-loud/surface guarantee is carried by recompute itself
-- + the operator backfill, which do not swallow.
-- ============================================================

begin;

-- user_saves: affected users come straight from the transition table.
create or replace function public.taste_user_saves_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  for r in select distinct user_id as uid from changed where user_id is not null loop
    begin
      perform public.recompute_taste_profile(r.uid);
    exception when others then
      raise warning 'taste recompute (user_saves) failed for user %: %', r.uid, sqlerrm;
    end;
  end loop;
  return null;
end;
$$;

-- trail_stops: resolve the owning user via trail_id → trails.created_by
-- (skip anonymous share trails where created_by is null).
create or replace function public.taste_trail_stops_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  for r in
    select distinct t.created_by as uid
      from changed c
      join public.trails t on t.id = c.trail_id
      where t.created_by is not null
  loop
    begin
      perform public.recompute_taste_profile(r.uid);
    exception when others then
      raise warning 'taste recompute (trail_stops) failed for user %: %', r.uid, sqlerrm;
    end;
  end loop;
  return null;
end;
$$;

drop trigger if exists taste_user_saves_ins on public.user_saves;
create trigger taste_user_saves_ins
  after insert on public.user_saves
  referencing new table as changed
  for each statement execute function public.taste_user_saves_changed();

drop trigger if exists taste_user_saves_del on public.user_saves;
create trigger taste_user_saves_del
  after delete on public.user_saves
  referencing old table as changed
  for each statement execute function public.taste_user_saves_changed();

drop trigger if exists taste_trail_stops_ins on public.trail_stops;
create trigger taste_trail_stops_ins
  after insert on public.trail_stops
  referencing new table as changed
  for each statement execute function public.taste_trail_stops_changed();

drop trigger if exists taste_trail_stops_del on public.trail_stops;
create trigger taste_trail_stops_del
  after delete on public.trail_stops
  referencing old table as changed
  for each statement execute function public.taste_trail_stops_changed();

commit;
