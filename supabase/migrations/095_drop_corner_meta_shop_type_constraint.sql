-- ============================================================
-- Drop CHECK constraint on corner_meta.shop_type
-- ============================================================
-- Migration 003 restricted shop_type to a fixed allow-list that
-- included 'art_supplies'. Art supplies is being removed from the
-- Atlas Network category set. Rather than maintain a curated
-- allow-list on this one column (every other vertical's type
-- column is freeform — see listings.sub_type, migration 038), we
-- drop the constraint entirely.
-- ============================================================

ALTER TABLE corner_meta DROP CONSTRAINT IF EXISTS corner_meta_shop_type_check;
