-- ============================================================
-- 106_pitch_system_listings_columns.sql
--
-- Pitch System Phase 1 — add the four signal columns the Phase 1
-- candidate scoring needs that don't exist on listings yet.
--
-- Per editorial decision 2026-04-30:
--   NULL on is_owner_operator and independence_confirmed must be
--   treated by the scoring code as "no signal" (no positive weight
--   applied), NOT as "negative signal." Only an explicit `true`
--   triggers the positive scoring weight; `false` and NULL both
--   contribute zero.
--
-- This semantic is enforced in scripts/pitch-candidates.mjs and
-- restated in column comments below for any future consumer.
-- ============================================================

alter table listings
  add column if not exists is_owner_operator bool,
  add column if not exists independence_confirmed bool,
  add column if not exists single_location bool,
  add column if not exists awards text[] default '{}'::text[];

comment on column listings.is_owner_operator is
  'NULL = no signal (do not score positively). TRUE = confirmed owner-operator (positive score weight). FALSE = explicitly not owner-operated.';
comment on column listings.independence_confirmed is
  'NULL = no signal (do not score positively). TRUE = independence confirmed via curation. FALSE = explicitly part of a group.';
comment on column listings.single_location is
  'NULL = unknown. TRUE = single location only. FALSE = multi-location operator.';
comment on column listings.awards is
  'Array of award strings. Empty array = no awards documented.';
