-- Add 'cafe' to table_meta food_type CHECK constraint
-- For cafes where food/space/dining is the primary draw (distinct from Fine Grounds coffee-first)

ALTER TABLE table_meta DROP CONSTRAINT IF EXISTS table_meta_food_type_check;
ALTER TABLE table_meta ADD CONSTRAINT table_meta_food_type_check
  CHECK (food_type IN (
    'restaurant', 'bakery', 'market', 'farm_gate',
    'artisan_producer', 'specialty_retail', 'destination',
    'cooking_school', 'providore', 'food_trail', 'cafe'
  ));
