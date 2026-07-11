-- Migration 247: make listings hard-deletable — fix FK ON DELETE rules.
--
-- The admin editor's DELETE was failing (masked as a generic "Delete failed")
-- for any listing referenced by one of seven NO ACTION foreign keys. In
-- production that blocked ~300 listings: 240 dedupe merge TARGETS
-- (listings.merged_into self-FK), 60 with description_evaluations rows, 11
-- with wikipedia_opportunities rows, 2 in editorial_pitches_deprecated.
--
-- Rules chosen per table:
--   • listings.merged_into → SET NULL. Deleting the master a duplicate was
--     merged into should not be blocked; the hidden duplicate simply loses its
--     pointer (it stays hidden — no public change). CASCADE would silently
--     delete the hidden duplicates too, which is surprising and destructive.
--   • fine_grounds_meta.roaster_master_id → SET NULL. A cafe meta row's
--     SECONDARY reference to a roaster listing — the row belongs to a
--     different listing and must survive; only the pointer clears.
--   • description_evaluations / wikipedia_opportunities /
--     editorial_pitches_deprecated / heritage_crosslinks / press_mentions
--     → CASCADE. Derivative logs/opportunities with no standalone value once
--     the listing is gone.
--
-- All seven columns verified nullable in prod (information_schema) before
-- choosing SET NULL rules.

alter table listings
  drop constraint listings_merged_into_fkey,
  add constraint listings_merged_into_fkey
    foreign key (merged_into) references listings(id) on delete set null;

alter table fine_grounds_meta
  drop constraint fine_grounds_meta_roaster_master_id_fkey,
  add constraint fine_grounds_meta_roaster_master_id_fkey
    foreign key (roaster_master_id) references listings(id) on delete set null;

alter table description_evaluations
  drop constraint description_evaluations_listing_id_fkey,
  add constraint description_evaluations_listing_id_fkey
    foreign key (listing_id) references listings(id) on delete cascade;

alter table wikipedia_opportunities
  drop constraint wikipedia_opportunities_listing_id_fkey,
  add constraint wikipedia_opportunities_listing_id_fkey
    foreign key (listing_id) references listings(id) on delete cascade;

alter table editorial_pitches_deprecated
  drop constraint editorial_pitches_listing_id_fkey,
  add constraint editorial_pitches_listing_id_fkey
    foreign key (listing_id) references listings(id) on delete cascade;

alter table heritage_crosslinks
  drop constraint heritage_crosslinks_listing_id_fkey,
  add constraint heritage_crosslinks_listing_id_fkey
    foreign key (listing_id) references listings(id) on delete cascade;

alter table press_mentions
  drop constraint press_mentions_listing_id_fkey,
  add constraint press_mentions_listing_id_fkey
    foreign key (listing_id) references listings(id) on delete cascade;

notify pgrst, 'reload schema';
