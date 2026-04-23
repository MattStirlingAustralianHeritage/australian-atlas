-- ============================================================
-- Regions architecture — Phase 1.6
-- Listings quarantine table + promotion function
-- See docs/architecture/regions.md, Implementation Plan §1.6
--
-- Purpose: rows that would fail validation when written to the
-- listings table get routed to listings_quarantine with a
-- failure_reason. Admin reviews, fixes, promotes back via
-- promote_from_quarantine().
--
-- This is infrastructure only. The sync validation layer (§1.7)
-- wires into this table — 1.7 is a separate migration. The daily
-- alert (§1.8) emails on quarantine growth — also separate.
--
-- Design choices:
--   - LIKE listings inherits all column types (69 cols, self-
--     adjusting as listings schema evolves).
--   - NOT NULL dropped on all inherited columns — quarantine
--     accepts incomplete rows by design (Edge Case 10).
--   - No UNIQUE / FK constraints inherited — quarantine rows may
--     duplicate or reference bad ids (that's often why they failed).
--   - region_computed_id + region_override_id present as plain
--     UUIDs (no FK) — useful diagnostic when admin is trying to
--     understand the failure.
--   - Separate PK (quarantine_id) since listings.id may be NULL
--     or duplicated in quarantine.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS promote_from_quarantine(UUID);
--   DROP TABLE IF EXISTS listings_quarantine;
--
-- Idempotent: safe to re-run.
-- ============================================================

-- A. Table shell. LIKE copies every column with its type + NOT NULL.
--    EXCLUDING CONSTRAINTS drops PK, UNIQUE, FK, CHECK.
--    EXCLUDING INDEXES drops indexes. EXCLUDING STATISTICS for cleanliness.
create table if not exists listings_quarantine (
  like listings excluding constraints excluding indexes excluding statistics
);

-- B. Relax NOT NULL on all inherited columns. Quarantine captures
--    rows that failed listings' NOT NULL — it has to permit them.
do $$
declare col record;
begin
  for col in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings_quarantine'
      and is_nullable = 'NO'
  loop
    execute format(
      'alter table listings_quarantine alter column %I drop not null',
      col.column_name
    );
  end loop;
end $$;

-- C. Quarantine-specific columns. These are NOT NULL (we always
--    know the reason and time).
alter table listings_quarantine
  add column if not exists quarantine_id uuid primary key default gen_random_uuid();

alter table listings_quarantine
  add column if not exists failure_reason text not null;

alter table listings_quarantine
  add column if not exists quarantined_at timestamptz not null default now();

-- D. Indices: failure_reason for §1.8 daily alert grouping,
--    quarantined_at for time-ordered admin review.
create index if not exists idx_listings_quarantine_failure_reason
  on listings_quarantine (failure_reason);

create index if not exists idx_listings_quarantine_quarantined_at
  on listings_quarantine (quarantined_at);

-- E. Promotion function. Moves a row from listings_quarantine to
--    listings. If the INSERT into listings fails (FK / NOT NULL /
--    CHECK / UNIQUE violation), the function RAISEs and the
--    transaction rolls back — quarantine row stays, admin hasn't
--    actually fixed the problem.
--
--    Column list is built dynamically from information_schema so
--    this function doesn't need editing when listings gains a
--    column (as long as listings_quarantine has it too, which
--    LIKE ensures when future migrations use the same pattern).
create or replace function promote_from_quarantine(quarantine_id_arg uuid)
returns uuid
language plpgsql
as $$
declare
  col_list text;
  new_id uuid;
  row_exists boolean;
begin
  select exists (
    select 1 from listings_quarantine
    where quarantine_id = quarantine_id_arg
  ) into row_exists;

  if not row_exists then
    raise exception 'Quarantine row not found: %', quarantine_id_arg;
  end if;

  -- Intersection of listings columns and listings_quarantine
  -- columns, ordered by listings' ordinal_position. Excludes the
  -- three quarantine-specific columns (they don't exist on listings).
  select string_agg(quote_ident(l.column_name), ', ' order by l.ordinal_position)
    into col_list
  from information_schema.columns l
  where l.table_schema = 'public'
    and l.table_name = 'listings'
    and exists (
      select 1 from information_schema.columns q
      where q.table_schema = 'public'
        and q.table_name = 'listings_quarantine'
        and q.column_name = l.column_name
    );

  -- INSERT ... SELECT with matching column lists. FK / CHECK /
  -- NOT NULL / UNIQUE violations propagate up and abort the txn.
  execute format(
    'insert into listings (%s) select %s from listings_quarantine where quarantine_id = $1 returning id',
    col_list, col_list
  ) using quarantine_id_arg
  into new_id;

  -- INSERT succeeded — remove the quarantine row.
  delete from listings_quarantine where quarantine_id = quarantine_id_arg;

  return new_id;
end;
$$;
