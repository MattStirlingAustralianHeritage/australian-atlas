-- ============================================================
-- 128_backfill_sub_type_from_meta.sql
--
-- Partial backfill — covers ~918 of ~4,994 null sub_type listings
-- (the subset with a populated category value in their vertical's
-- meta table). The remaining ~4,076 require source data not
-- currently on the portal and will be addressed separately.
--
-- Source of truth per vertical:
--   sba_meta.producer_type, collection_meta.institution_type,
--   craft_meta.discipline, fine_grounds_meta.entity_type,
--   rest_meta.accommodation_type, field_meta.feature_type,
--   corner_meta.shop_type, found_meta.shop_type,
--   table_meta.food_type
--
-- Rules:
--   - Only updates rows where sub_type IS NULL AND status = 'active'
--   - Idempotent (safe to re-run; skips already-populated rows)
--   - Logs every change to backfill_log for audit trail
--   - Wrapped in a transaction (partial failure rolls back cleanly)
--
-- DO NOT RUN AUTOMATICALLY. Apply via Supabase SQL editor after
-- reviewing the preview.
-- ============================================================

begin;

-- Helper: backfill one vertical's sub_type from its meta table.
-- Uses a CTE to capture the updated rows for logging.
-- Each block is independent and idempotent.

-- ── sba (producer_type) ──────────────────────────────────────
with updated as (
  update listings l
  set sub_type = m.producer_type,
      updated_at = now()
  from sba_meta m
  where l.id = m.listing_id
    and l.vertical = 'sba'
    and l.status = 'active'
    and l.sub_type is null
    and m.producer_type is not null
  returning l.id, 'sub_type' as column_name, null::text as old_value, m.producer_type as new_value
)
insert into backfill_log (listing_id, column_name, old_value, new_value, heuristic_used, recorded_by)
select id, column_name, old_value, new_value,
       'meta_table_lookup:sba_meta.producer_type',
       '128_backfill_sub_type_from_meta.sql'
from updated;

-- ── collection (institution_type) ────────────────────────────
with updated as (
  update listings l
  set sub_type = m.institution_type,
      updated_at = now()
  from collection_meta m
  where l.id = m.listing_id
    and l.vertical = 'collection'
    and l.status = 'active'
    and l.sub_type is null
    and m.institution_type is not null
  returning l.id, 'sub_type' as column_name, null::text as old_value, m.institution_type as new_value
)
insert into backfill_log (listing_id, column_name, old_value, new_value, heuristic_used, recorded_by)
select id, column_name, old_value, new_value,
       'meta_table_lookup:collection_meta.institution_type',
       '128_backfill_sub_type_from_meta.sql'
from updated;

-- ── craft (discipline) ───────────────────────────────────────
with updated as (
  update listings l
  set sub_type = m.discipline,
      updated_at = now()
  from craft_meta m
  where l.id = m.listing_id
    and l.vertical = 'craft'
    and l.status = 'active'
    and l.sub_type is null
    and m.discipline is not null
  returning l.id, 'sub_type' as column_name, null::text as old_value, m.discipline as new_value
)
insert into backfill_log (listing_id, column_name, old_value, new_value, heuristic_used, recorded_by)
select id, column_name, old_value, new_value,
       'meta_table_lookup:craft_meta.discipline',
       '128_backfill_sub_type_from_meta.sql'
from updated;

-- ── fine_grounds (entity_type) ───────────────────────────────
with updated as (
  update listings l
  set sub_type = m.entity_type,
      updated_at = now()
  from fine_grounds_meta m
  where l.id = m.listing_id
    and l.vertical = 'fine_grounds'
    and l.status = 'active'
    and l.sub_type is null
    and m.entity_type is not null
  returning l.id, 'sub_type' as column_name, null::text as old_value, m.entity_type as new_value
)
insert into backfill_log (listing_id, column_name, old_value, new_value, heuristic_used, recorded_by)
select id, column_name, old_value, new_value,
       'meta_table_lookup:fine_grounds_meta.entity_type',
       '128_backfill_sub_type_from_meta.sql'
from updated;

-- ── rest (accommodation_type) ────────────────────────────────
with updated as (
  update listings l
  set sub_type = m.accommodation_type,
      updated_at = now()
  from rest_meta m
  where l.id = m.listing_id
    and l.vertical = 'rest'
    and l.status = 'active'
    and l.sub_type is null
    and m.accommodation_type is not null
  returning l.id, 'sub_type' as column_name, null::text as old_value, m.accommodation_type as new_value
)
insert into backfill_log (listing_id, column_name, old_value, new_value, heuristic_used, recorded_by)
select id, column_name, old_value, new_value,
       'meta_table_lookup:rest_meta.accommodation_type',
       '128_backfill_sub_type_from_meta.sql'
from updated;

-- ── field (feature_type) ─────────────────────────────────────
with updated as (
  update listings l
  set sub_type = m.feature_type,
      updated_at = now()
  from field_meta m
  where l.id = m.listing_id
    and l.vertical = 'field'
    and l.status = 'active'
    and l.sub_type is null
    and m.feature_type is not null
  returning l.id, 'sub_type' as column_name, null::text as old_value, m.feature_type as new_value
)
insert into backfill_log (listing_id, column_name, old_value, new_value, heuristic_used, recorded_by)
select id, column_name, old_value, new_value,
       'meta_table_lookup:field_meta.feature_type',
       '128_backfill_sub_type_from_meta.sql'
from updated;

-- ── corner (shop_type) ───────────────────────────────────────
with updated as (
  update listings l
  set sub_type = m.shop_type,
      updated_at = now()
  from corner_meta m
  where l.id = m.listing_id
    and l.vertical = 'corner'
    and l.status = 'active'
    and l.sub_type is null
    and m.shop_type is not null
  returning l.id, 'sub_type' as column_name, null::text as old_value, m.shop_type as new_value
)
insert into backfill_log (listing_id, column_name, old_value, new_value, heuristic_used, recorded_by)
select id, column_name, old_value, new_value,
       'meta_table_lookup:corner_meta.shop_type',
       '128_backfill_sub_type_from_meta.sql'
from updated;

-- ── found (shop_type) ────────────────────────────────────────
with updated as (
  update listings l
  set sub_type = m.shop_type,
      updated_at = now()
  from found_meta m
  where l.id = m.listing_id
    and l.vertical = 'found'
    and l.status = 'active'
    and l.sub_type is null
    and m.shop_type is not null
  returning l.id, 'sub_type' as column_name, null::text as old_value, m.shop_type as new_value
)
insert into backfill_log (listing_id, column_name, old_value, new_value, heuristic_used, recorded_by)
select id, column_name, old_value, new_value,
       'meta_table_lookup:found_meta.shop_type',
       '128_backfill_sub_type_from_meta.sql'
from updated;

-- ── table (food_type) ────────────────────────────────────────
-- Note: table_meta currently has 0 rows, so this is a no-op today.
-- Included for completeness and future-proofing.
with updated as (
  update listings l
  set sub_type = m.food_type,
      updated_at = now()
  from table_meta m
  where l.id = m.listing_id
    and l.vertical = 'table'
    and l.status = 'active'
    and l.sub_type is null
    and m.food_type is not null
  returning l.id, 'sub_type' as column_name, null::text as old_value, m.food_type as new_value
)
insert into backfill_log (listing_id, column_name, old_value, new_value, heuristic_used, recorded_by)
select id, column_name, old_value, new_value,
       'meta_table_lookup:table_meta.food_type',
       '128_backfill_sub_type_from_meta.sql'
from updated;

commit;
