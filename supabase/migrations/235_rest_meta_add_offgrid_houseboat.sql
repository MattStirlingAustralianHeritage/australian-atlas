-- 235_rest_meta_add_offgrid_houseboat.sql
-- Bring rest_meta.accommodation_type CHECK in line with VERTICAL_CATEGORIES.rest
-- (lib/sync/pushToVertical.js). Adds:
--   • off_grid_cabin — architectural off-grid cabins & tiny houses in remote /
--     solitude settings (Unyoked, CABN, In2thewild-style stays). Distinct from
--     'glamping' (tented / safari) and 'self_contained' (generic).
--   • houseboat     — hireable houseboats (Murray River, Hawkesbury, Coorong).
--     A distinct stay type: the accommodation moves.
--
-- NOTE: the Rest Atlas SOURCE DB has a parallel properties.type CHECK that must
-- be widened in lockstep (its own migration) before a published listing of
-- either type syncs to the vertical — see 113_rest_heritage_types header.
--
-- rest_meta CHECK was last set to 11 values in 113_rest_heritage_types. Drop and
-- recreate with the full 13-value allowlist. Idempotent; widening cannot violate
-- existing rows.

alter table rest_meta drop constraint if exists rest_meta_accommodation_type_check;

alter table rest_meta add constraint rest_meta_accommodation_type_check
  check (accommodation_type in (
    'boutique_hotel','farm_stay','glamping',
    'self_contained','bnb','guesthouse','cottage','eco_resort',
    'heritage_hotel','national_park_stay','heritage_lighthouse',
    'off_grid_cabin','houseboat'
  ));

-- Search recall synonym bags (see 165_search_or_recall_category_synonyms.sql).
insert into listing_category_synonyms (vertical, sub_type, terms) values
  ('rest', 'off_grid_cabin', 'off grid cabin off-grid tiny house tiny home eco cabin remote cabin solar cabin nature retreat wilderness cabin unyoked cabn hut secluded stay bush cabin off the grid'),
  ('rest', 'houseboat',      'houseboat house boat boat stay murray river houseboat hawkesbury houseboat floating accommodation river cruiser self drive houseboat coorong')
on conflict (vertical, sub_type) do update set terms = excluded.terms;

notify pgrst, 'reload schema';
