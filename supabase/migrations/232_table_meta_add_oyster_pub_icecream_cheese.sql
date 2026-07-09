-- 232_table_meta_add_oyster_pub_icecream_cheese.sql
-- Bring table_meta.food_type CHECK in line with VERTICAL_CATEGORIES.table
-- (lib/sync/pushToVertical.js). Adds four new destination-worthy Table Atlas
-- categories:
--   • oyster_farm   — visitable oyster leases / farm-gate shucking sheds &
--                     on-the-water tours (Coffin Bay, Sydney rock, Tasmania).
--                     A farm-gate producer, distinct from restaurant.
--   • historic_pub  — heritage / iconic country pubs as destinations (food +
--                     drink + heritage). Curated to landmark pubs, not every
--                     bistro. Distinct from restaurant (food-first) and from
--                     SBA breweries (producers).
--   • ice_creamery  — destination gelaterie & ice-cream makers. Distinct from
--                     'creamery' (dairy / cheese production).
--   • cheesemonger  — dedicated cheese shops / fromageries (retail, curated
--                     ranges). Distinct from 'creamery' (the maker).
--
-- table_meta CHECK was last widened to 16 values in 226_table_meta_add_wine_bar.
-- A CHECK can't be extended in place, so drop and recreate with the full
-- 20-value allowlist. Idempotent: DROP ... IF EXISTS, and re-adding the same
-- constraint name is safe to re-run. Widening a CHECK cannot violate existing
-- rows.

ALTER TABLE table_meta DROP CONSTRAINT IF EXISTS table_meta_food_type_check;
ALTER TABLE table_meta ADD CONSTRAINT table_meta_food_type_check
  CHECK (food_type IN (
    'restaurant', 'bakery', 'market', 'farm_gate',
    'artisan_producer', 'specialty_retail', 'destination',
    'cooking_school', 'providore', 'food_trail', 'cafe',
    'creamery', 'chocolatier', 'confectioner', 'tea_shop', 'wine_bar',
    'oyster_farm', 'historic_pub', 'ice_creamery', 'cheesemonger'
  ));

-- Search recall: synonym bags for the new categories, mirroring every other
-- Table sub_type in 165_search_or_recall_category_synonyms.sql. Folded into the
-- lexical search document by search_listings_hybrid; never rendered. Idempotent.
INSERT INTO listing_category_synonyms (vertical, sub_type, terms) VALUES
  ('table', 'oyster_farm',  'oyster oysters oyster farm oyster shed oyster bar oyster lease oyster shack shucking pacific oyster sydney rock oyster angasi native oyster aquaculture oyster tour farm gate seafood shellfish'),
  ('table', 'historic_pub', 'pub hotel historic pub country pub heritage pub public house tavern inn gastropub bistro ale house colonial pub old pub landmark pub freehouse'),
  ('table', 'ice_creamery', 'ice cream ice creamery gelato gelateria gelati sorbet soft serve scoop shop dairy dessert artisan ice cream frozen custard'),
  ('table', 'cheesemonger', 'cheese cheesemonger fromagerie cheese shop cheese room affineur curd fromage specialist cheese cheese counter deli cheese cave')
ON CONFLICT (vertical, sub_type) DO UPDATE SET terms = excluded.terms;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
