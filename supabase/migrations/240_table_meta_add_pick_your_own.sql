-- Bring table_meta.food_type CHECK in line with VERTICAL_CATEGORIES.table
-- (lib/sync/pushToVertical.js). Adds 'pick_your_own' — farms you harvest
-- yourself (strawberry fields, cherry & apple orchards, berry patches and
-- stone-fruit blocks open to the public in season). Distinct from farm_gate
-- (buy-direct roadside stalls / farm shops — you don't pick) and market.
--
-- Also folds in the eleven-launch categories (oyster_farm, historic_pub,
-- ice_creamery, cheesemonger) which are already in the Table vertical DB's
-- listings_category_check and in VERTICAL_CATEGORIES.table, but were never
-- added to this portal-side CHECK — bringing all three in sync. Superset-only
-- widening cannot violate existing rows.

ALTER TABLE table_meta DROP CONSTRAINT IF EXISTS table_meta_food_type_check;
ALTER TABLE table_meta ADD CONSTRAINT table_meta_food_type_check
  CHECK (food_type IN (
    'restaurant', 'bakery', 'market', 'farm_gate', 'pick_your_own',
    'artisan_producer', 'specialty_retail', 'destination',
    'cooking_school', 'providore', 'food_trail', 'cafe',
    'creamery', 'chocolatier', 'confectioner', 'tea_shop', 'wine_bar',
    'oyster_farm', 'historic_pub', 'ice_creamery', 'cheesemonger'
  ));

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
