-- Bring table_meta.food_type CHECK in line with VERTICAL_CATEGORIES.table
-- (lib/sync/pushToVertical.js). Adds 'tea_shop' — independent tea merchants and
-- tea houses (loose-leaf blenders, single-estate leaf, teaware retail, and
-- sit-down tea rooms); a broad category distinct from cafe and specialty_retail.
-- table_meta is empty, so widening the constraint cannot violate existing rows.

ALTER TABLE table_meta DROP CONSTRAINT IF EXISTS table_meta_food_type_check;
ALTER TABLE table_meta ADD CONSTRAINT table_meta_food_type_check
  CHECK (food_type IN (
    'restaurant', 'bakery', 'market', 'farm_gate',
    'artisan_producer', 'specialty_retail', 'destination',
    'cooking_school', 'providore', 'food_trail', 'cafe',
    'creamery', 'chocolatier', 'confectioner', 'tea_shop'
  ));

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
