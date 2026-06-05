-- ============================================================
-- 144_way_meta_whale_watching.sql
--
-- Portal master DB. Adds 'whale_watching' to the
-- way_meta.primary_type CHECK constraint. Vocabulary-only.
--
-- Companion to Way vertical migration 006_whale_watching.sql
-- (operators.primary_type + experiences.experience_type).
-- Full cumulative list (21 types) — supersedes 143.
-- ============================================================

alter table way_meta
  drop constraint way_meta_primary_type_check;

alter table way_meta
  add constraint way_meta_primary_type_check check (primary_type in (
    'guided_walk_multiday','guided_walk_day','cultural_tour',
    'scenic_flight','helicopter_tour',
    'sailing_charter','sea_kayak_tour','dive_operator',
    'fishing_guide','photography_expedition',
    'specialist_natural_history','foraging_bushfood',
    'heritage_tour','workshop_intensive',
    'river_canoe_tour','horseback_expedition',
    'four_wheel_drive_expedition',
    'marine_touring',
    'hot_air_balloon','marine_wildlife_swim',
    'whale_watching'
  ));
