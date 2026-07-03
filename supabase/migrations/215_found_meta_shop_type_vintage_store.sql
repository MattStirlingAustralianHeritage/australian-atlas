-- 215: Align found_meta_shop_type_check with VERTICAL_CATEGORIES.found
--
-- The found vertical's canonical category vocabulary (lib/sync/
-- pushToVertical.js VERTICAL_CATEGORIES.found) gained 'vintage_store', and
-- the source Found Atlas shops.category column emits it (12 rows). The
-- listing-level validator (validateListingRow Rule 6) already accepts it, so
-- those rows pass the listings upsert — but the found_meta.shop_type CHECK
-- constraint still listed the older 7 values, so every found_meta upsert for
-- a vintage_store shop failed with "violates check constraint
-- found_meta_shop_type_check" (11 errors in the 2026-07-02 sync run).
--
-- Re-create the constraint from the full canonical list so the meta-level
-- CHECK can never reject a category the listing-level validator admits.

ALTER TABLE found_meta DROP CONSTRAINT IF EXISTS found_meta_shop_type_check;

ALTER TABLE found_meta ADD CONSTRAINT found_meta_shop_type_check
  CHECK (shop_type = ANY (ARRAY[
    'vintage_clothing'::text,
    'vintage_furniture'::text,
    'vintage_store'::text,
    'antiques'::text,
    'op_shop'::text,
    'books_ephemera'::text,
    'art_objects'::text,
    'market'::text
  ]));

NOTIFY pgrst, 'reload schema';
