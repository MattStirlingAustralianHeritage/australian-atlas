-- ============================================================
-- Regions architecture — Phase 1.6 fix-up
-- Sync column defaults from listings to listings_quarantine
--
-- Discovered during Phase 1.6 V4 verification: migration 098's
-- LIKE clause omitted INCLUDING DEFAULTS, so listings_quarantine
-- inherited column types but not defaults.
--
-- Consequence: promote_from_quarantine() does INSERT ... SELECT,
-- which passes NULL explicitly for any column the quarantine row
-- didn't populate. listings defaults don't fire when NULL is
-- explicit, so NOT NULL + DEFAULT columns (community_reports,
-- verified, etc.) blow up on promote.
--
-- Fix: copy every listings column default onto the matching
-- listings_quarantine column. Quarantine auto-fills defaults on
-- insert; promote then copies the non-null values into listings.
--
-- Rollback:
--   For each col that had a default synced here:
--     ALTER TABLE listings_quarantine ALTER COLUMN col DROP DEFAULT;
--
-- Idempotent — the DO block only alters columns where the current
-- quarantine default differs from (or is missing relative to)
-- the listings default.
-- ============================================================

do $$
declare col record;
begin
  for col in
    select l.column_name, l.column_default
    from information_schema.columns l
    join information_schema.columns q
      on q.table_schema = 'public'
      and q.table_name = 'listings_quarantine'
      and q.column_name = l.column_name
    where l.table_schema = 'public'
      and l.table_name = 'listings'
      and l.column_default is not null
      and (q.column_default is null or q.column_default <> l.column_default)
  loop
    execute format(
      'alter table listings_quarantine alter column %I set default %s',
      col.column_name, col.column_default
    );
  end loop;
end $$;
