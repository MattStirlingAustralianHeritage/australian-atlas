-- Migration 017: Region Mapbox static images and coordinates
-- Adds center coordinates, map zoom, and image source tracking

ALTER TABLE regions ADD COLUMN IF NOT EXISTS center_lat double precision;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS center_lng double precision;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS map_zoom integer DEFAULT 9;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS hero_image_source text;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS hero_image_card_url text;
