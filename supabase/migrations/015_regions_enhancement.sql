-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 015: Regions enhancement — hero images, editorial, new regions
-- ============================================================

-- Add hero image credit for Unsplash attribution
ALTER TABLE regions ADD COLUMN IF NOT EXISTS hero_image_credit text;

-- Add long-form editorial description (separate from the short tagline)
ALTER TABLE regions ADD COLUMN IF NOT EXISTS long_description text;

-- Add hero image dominant colour for design (fallback bg while image loads)
ALTER TABLE regions ADD COLUMN IF NOT EXISTS hero_color text DEFAULT '#2D2A26';

-- ============================================================
-- New regions — identified by listing density across the network
-- ============================================================
INSERT INTO regions (name, slug, state, description) VALUES
  -- Tasmania additions
  ('East Coast Tasmania', 'east-coast-tasmania', 'TAS',
   'Freycinet, Bicheno, and the Bay of Fires — Tasmania''s dramatic east coast, with oyster farms, boutique stays, and pristine beaches.'),
  ('Launceston & Tamar Valley', 'launceston-tamar-valley', 'TAS',
   'Northern Tasmania''s food and wine capital, where the Tamar River meets cool-climate vineyards, craft breweries, and heritage architecture.'),

  -- NT additions
  ('Darwin & Top End', 'darwin-top-end', 'NT',
   'Australia''s tropical frontier — Darwin''s Mindil Beach markets, independent breweries, and the gateway to Kakadu and Litchfield.'),
  ('Alice Springs & Red Centre', 'alice-springs-red-centre', 'NT',
   'The heart of Australia — a desert arts town with Aboriginal-owned galleries, outback stays, and the road to Uluru.'),

  -- NSW additions
  ('Central Coast', 'central-coast', 'NSW',
   'Between Sydney and the Hunter, a coastal stretch with craft breweries, Japanese gardens, and emerging farm-gate producers.'),
  ('Orange & Central West', 'orange-central-west', 'NSW',
   'A cool-climate food and wine destination west of the Blue Mountains, with award-winning restaurants, wineries, and cider houses.'),
  ('South Coast NSW', 'south-coast-nsw', 'NSW',
   'From Wollongong to Eden — a long, uncrowded coastline with oyster bars, craft breweries, and independent stays.'),

  -- VIC additions
  ('Gippsland', 'gippsland', 'VIC',
   'Victoria''s south-east — from Phillip Island to Wilsons Promontory, with artisan cheesemakers, craft breweries, and coastal walks.'),
  ('Murray River', 'murray-river', 'VIC',
   'Echuca, Mildura, and the Victorian side of the Murray — houseboats, wineries, and heritage paddle-steamer towns.'),

  -- QLD additions
  ('Cairns & Tropical North', 'cairns-tropical-north', 'QLD',
   'Where the rainforest meets the reef — craft breweries, tropical distilleries, and independent stays on the Atherton Tablelands.'),
  ('Scenic Rim', 'scenic-rim', 'QLD',
   'A green arc of mountain ranges south-west of Brisbane, with farm stays, boutique wineries, and national park lodges.'),
  ('Toowoomba & Darling Downs', 'toowoomba-darling-downs', 'QLD',
   'Queensland''s garden city, with heritage architecture, craft producers, and a growing specialty coffee scene.'),

  -- SA additions
  ('Limestone Coast', 'limestone-coast', 'SA',
   'The Coonawarra wine region and beyond — underground caves, volcanic craters, and Cabernet Sauvignon producers.'),
  ('Riverland', 'riverland', 'SA',
   'South Australia''s Murray River country — citrus groves, boutique wineries, and Australia''s largest dark sky reserve.'),

  -- WA additions
  ('Great Southern', 'great-southern', 'WA',
   'Albany, Denmark, and Mount Barker — Western Australia''s cool-climate wine frontier, with coastal wilderness and artisan producers.'),
  ('Broome & Kimberley', 'broome-kimberley', 'WA',
   'Australia''s remote north-west — pearling history, Aboriginal art, and luxury wilderness lodges along the Gibb River Road.')

ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description;

-- Set all regions with listings to 'live' status
UPDATE regions SET status = 'live' WHERE listing_count > 0;
