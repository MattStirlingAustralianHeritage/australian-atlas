-- ============================================================
-- Migration 092: Add vintage_store to found_meta shop_type
-- ============================================================

ALTER TABLE found_meta
  DROP CONSTRAINT IF EXISTS found_meta_shop_type_check;

ALTER TABLE found_meta
  ADD CONSTRAINT found_meta_shop_type_check
  CHECK (shop_type IN (
    'vintage_clothing', 'vintage_furniture', 'vintage_store',
    'antiques', 'op_shop', 'books_ephemera', 'art_objects', 'market'
  ));
