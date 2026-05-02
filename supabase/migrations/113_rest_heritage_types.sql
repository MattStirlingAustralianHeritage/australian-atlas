-- ============================================================
-- 113: Activate heritage_hotel, national_park_stay, and
-- heritage_lighthouse on rest_meta.accommodation_type
--
-- Mirrors the Rest Atlas source-DB migration 009 that expands
-- the properties.type CHECK constraint. Both constraints must
-- be kept in lockstep; a value allowed in the source but
-- rejected by the portal extension table breaks the sync.
--
-- Noun mappings for all three types already exist in
-- vertical_noun_mappings (migration 108, rows for rest).
-- ============================================================

alter table rest_meta
  drop constraint if exists rest_meta_accommodation_type_check;

alter table rest_meta
  add constraint rest_meta_accommodation_type_check
  check (accommodation_type in (
    'boutique_hotel','farm_stay','glamping',
    'self_contained','bnb','guesthouse','cottage','eco_resort',
    'heritage_hotel','national_park_stay','heritage_lighthouse'
  ));
