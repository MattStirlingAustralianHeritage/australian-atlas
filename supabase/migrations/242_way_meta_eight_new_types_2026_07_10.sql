-- ============================================================
-- 242_way_meta_eight_new_types_2026_07_10.sql
--
-- Portal companion to Way vertical migration 008. Adds 8 new
-- Way experience types to way_meta.primary_type CHECK so
-- publishing a candidate of these types succeeds (the approve
-- RPC writes primary_type into way_meta).
--
-- New: rock_climbing, mountain_biking, stargazing, paragliding,
--      whitewater_rafting, camel_trek, gold_prospecting, canyoning.
--
-- Cumulative list = 31 types (supersedes 237_way_meta_add_surf_school).
-- Vocabulary-only. Display labels: lib/wayLabels.js (portal + Way),
-- admin dropdowns: reviewMeta.js SUBCATEGORY_OPTIONS.way +
-- ListingEditor.js.
-- ============================================================

alter table way_meta
  drop constraint if exists way_meta_primary_type_check;

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
    'whale_watching','snorkelling','surf_school',
    'rock_climbing','mountain_biking','stargazing','paragliding',
    'whitewater_rafting','camel_trek','gold_prospecting','canyoning'
  ));
