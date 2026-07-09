-- 237_way_meta_add_surf_school.sql
-- Add a new Way Atlas primary type: surf_school (label "Surf school") — surf
-- schools and learn-to-surf / guided-surf operators running lessons and coaching
-- on Australian breaks. A bookable experience operator; distinct from Field
-- coastal features and from dive/snorkelling marine operators.
--
-- way_meta.primary_type CHECK was last widened to 21 values in
-- 164_way_meta_snorkelling. Drop and recreate with the full 22-value allowlist,
-- matching WAY_PRIMARY_TYPES (lib/wayLabels.js). Idempotent; widening cannot
-- violate existing rows.

alter table way_meta drop constraint if exists way_meta_primary_type_check;
alter table way_meta add constraint way_meta_primary_type_check check (primary_type in (
  'guided_walk_multiday','guided_walk_day','cultural_tour',
  'scenic_flight','helicopter_tour',
  'sailing_charter','sea_kayak_tour','dive_operator',
  'fishing_guide','photography_expedition',
  'specialist_natural_history','foraging_bushfood',
  'heritage_tour','workshop_intensive',
  'river_canoe_tour','horseback_expedition',
  'four_wheel_drive_expedition','hot_air_balloon',
  'marine_wildlife_swim','whale_watching','snorkelling',
  'surf_school'
));

-- Search recall synonym bag (see 165_search_or_recall_category_synonyms.sql).
insert into listing_category_synonyms (vertical, sub_type, terms) values
  ('way', 'surf_school', 'surf school surf lesson learn to surf surfing lessons surf coaching surf camp surf guide surfboard beginner surf surf instructor board hire surf tour')
on conflict (vertical, sub_type) do update set terms = excluded.terms;

notify pgrst, 'reload schema';
