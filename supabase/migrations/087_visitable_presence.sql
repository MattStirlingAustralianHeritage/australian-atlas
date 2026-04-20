-- 087: Add visitable flag and presence_type to listings
-- Distinguishes venues with a physical location from online-only / market-only makers

ALTER TABLE listings ADD COLUMN IF NOT EXISTS
  visitable BOOLEAN DEFAULT TRUE;

ALTER TABLE listings ADD COLUMN IF NOT EXISTS
  presence_type TEXT DEFAULT 'permanent'
  CHECK (presence_type IN (
    'permanent',
    'by_appointment',
    'markets',
    'online',
    'seasonal',
    'mobile'
  ));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS
  market_appearances JSONB;

CREATE INDEX IF NOT EXISTS idx_listings_visitable ON listings (visitable);
CREATE INDEX IF NOT EXISTS idx_listings_presence_type ON listings (presence_type);
