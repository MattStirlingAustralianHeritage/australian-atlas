-- 087: Visitable + presence_type — run on EACH vertical's Supabase project
-- Replace [TABLE] with the vertical's main entity table before running:
--
--   Small Batch:   venues
--   Collection:    venues
--   Craft:         venues
--   Fine Grounds:  roasters  (then run again for: cafes)
--   Rest:          properties
--   Field:         places
--   Corner:        shops
--   Found:         shops
--   Table:         listings

ALTER TABLE [TABLE] ADD COLUMN IF NOT EXISTS
  visitable BOOLEAN DEFAULT TRUE;

ALTER TABLE [TABLE] ADD COLUMN IF NOT EXISTS
  presence_type TEXT DEFAULT 'permanent'
  CHECK (presence_type IN (
    'permanent',
    'by_appointment',
    'markets',
    'online',
    'seasonal',
    'mobile'
  ));

ALTER TABLE [TABLE] ADD COLUMN IF NOT EXISTS
  market_appearances JSONB;
