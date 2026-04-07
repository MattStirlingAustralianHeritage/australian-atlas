-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 038: Add sub_type denormalized column to listings
-- Used by map, nearby, and trails endpoints for filtering
-- ============================================================

-- Add the column (nullable, no constraint — values vary by vertical)
alter table listings add column if not exists sub_type text;

-- Index for filtering
create index if not exists listings_sub_type_idx on listings(sub_type) where sub_type is not null;
