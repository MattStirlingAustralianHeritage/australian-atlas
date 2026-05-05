-- ============================================================
-- 114_way_vertical_check.sql
--
-- Add 'way' to the listings.vertical CHECK constraint as part of
-- the Way Atlas (tenth vertical) build. See:
--   • Way Atlas Specification (May 2026)
--   • Phase 1, Way Atlas master build prompt
--
-- The original CHECK constraint is defined inline on the listings
-- table in 002_core_listings.sql. ALTER TABLE drops the inline
-- constraint and recreates it with 'way' appended. Idempotent
-- via DO block — safe to re-run.
-- ============================================================

do $$
declare
  v_constraint_name text;
begin
  -- Find the existing CHECK constraint on listings.vertical.
  select conname
    into v_constraint_name
    from pg_constraint
   where conrelid = 'listings'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%vertical%in%';

  if v_constraint_name is not null then
    execute format('alter table listings drop constraint %I', v_constraint_name);
  end if;

  -- Recreate with 'way' included. Constraint name uses a stable
  -- convention so future migrations can target it directly.
  alter table listings
    add constraint listings_vertical_check
    check (vertical in (
      'sba','collection','craft','fine_grounds',
      'rest','field','corner','found','table',
      'way'
    ));
end $$;
