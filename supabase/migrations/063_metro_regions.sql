-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 063: Add metro regions for capital city coverage
--
-- The existing 48 regions are all rural/regional areas.
-- Inner-city listings (Elsternwick, Fitzroy, Surry Hills, etc.)
-- have no correct region to be assigned to, causing mismatches
-- like Rippon Lea Estate showing "Yarra Valley" despite being
-- in inner Melbourne.
-- ============================================================

-- Add metro capital city regions
INSERT INTO regions (name, slug, state, description) VALUES
  ('Melbourne', 'melbourne', 'VIC',
   'Australia''s cultural capital — independent bookshops, galleries, specialty coffee, craft makers, and vintage stores across the inner suburbs from Fitzroy to Elsternwick.'),
  ('Sydney', 'sydney', 'NSW',
   'A harbour city of independent spirit — from Surry Hills coffee to Marrickville breweries, Paddington galleries to Newtown vintage shops.'),
  ('Brisbane', 'brisbane', 'QLD',
   'Queensland''s creative hub — craft breweries in Fortitude Valley, specialty coffee in West End, independent retail in James Street and beyond.'),
  ('Adelaide', 'adelaide', 'SA',
   'A city built for independent culture — East End bars, Central Market producers, Prospect coffee, and a thriving small-batch scene.'),
  ('Perth', 'perth', 'WA',
   'Western Australia''s independent heart — Leederville coffee, Northbridge galleries, Mount Lawley bookshops, and a booming craft beer scene.'),
  ('Hobart City', 'hobart-city', 'TAS',
   'The compact creative capital — Salamanca makers, Battery Point boutiques, waterfront dining, and some of Australia''s best specialty coffee.'),
  ('Newcastle', 'newcastle', 'NSW',
   'A harbour city reinventing itself — craft breweries, independent cafés, galleries, and a growing maker scene across Darby Street and beyond.'),
  ('Geelong', 'geelong-city', 'VIC',
   'The gateway to the Great Ocean Road — a revitalised waterfront with craft breweries, independent retail, and a growing specialty coffee scene.'),
  ('Wollongong', 'wollongong', 'NSW',
   'A coastal city south of Sydney, with an emerging independent food and coffee scene framed by escarpment and ocean.')
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description;

-- Set center coordinates for metro regions
-- These are city centers, not regional midpoints
UPDATE regions SET center_lat = -37.8136, center_lng = 144.9631, map_zoom = 12 WHERE slug = 'melbourne';
UPDATE regions SET center_lat = -33.8688, center_lng = 151.2093, map_zoom = 12 WHERE slug = 'sydney';
UPDATE regions SET center_lat = -27.4698, center_lng = 153.0251, map_zoom = 12 WHERE slug = 'brisbane';
UPDATE regions SET center_lat = -34.9285, center_lng = 138.6007, map_zoom = 12 WHERE slug = 'adelaide';
UPDATE regions SET center_lat = -31.9505, center_lng = 115.8605, map_zoom = 12 WHERE slug = 'perth';
UPDATE regions SET center_lat = -42.8821, center_lng = 147.3272, map_zoom = 13 WHERE slug = 'hobart-city';
UPDATE regions SET center_lat = -32.9283, center_lng = 151.7817, map_zoom = 12 WHERE slug = 'newcastle';
UPDATE regions SET center_lat = -38.1499, center_lng = 144.3617, map_zoom = 12 WHERE slug = 'geelong-city';
UPDATE regions SET center_lat = -34.4278, center_lng = 150.8931, map_zoom = 12 WHERE slug = 'wollongong';

-- Fix Rippon Lea Estate immediately
-- (This is the specific listing reported: Elsternwick, inner Melbourne)
UPDATE listings
SET region = 'Melbourne'
WHERE slug = 'rippon-lea-estate'
  AND vertical = 'collection';
