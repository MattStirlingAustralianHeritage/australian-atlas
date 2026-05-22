-- ============================================================
-- 103_archive_editorial_pitches.sql
--
-- Archive the editorial_pitches table.
--
-- The editorial pitch generator produced fabricated narratives — invented
-- characters, events, and quotes presented as journalism — so the feature is
-- being disabled. The replacement is documented separately in project
-- knowledge (pitch-system-design.md) and will be a future build.
--
-- This migration:
--   - Renames editorial_pitches → editorial_pitches_deprecated (preserve all rows)
--   - Renames the supporting indexes to keep them consistent with the new table name
--
-- The rows themselves are preserved. Reading is still possible if needed for
-- audit; nothing in the codebase references the old name after this migration.
--
-- Rollback:
--   alter table editorial_pitches_deprecated rename to editorial_pitches;
--   alter index idx_editorial_pitches_deprecated_vertical_status
--     rename to idx_editorial_pitches_vertical_status;
--   alter index idx_editorial_pitches_deprecated_listing_id
--     rename to idx_editorial_pitches_listing_id;
--
-- Idempotent: safe to re-run.
-- ============================================================

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'editorial_pitches'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'editorial_pitches_deprecated'
  ) then
    execute 'alter table editorial_pitches rename to editorial_pitches_deprecated';
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_editorial_pitches_vertical_status') then
    execute 'alter index idx_editorial_pitches_vertical_status rename to idx_editorial_pitches_deprecated_vertical_status';
  end if;
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_editorial_pitches_listing_id') then
    execute 'alter index idx_editorial_pitches_listing_id rename to idx_editorial_pitches_deprecated_listing_id';
  end if;
end $$;
