-- Address on Request: allow listings without a public street address
-- Master portal listings table

ALTER TABLE listings ADD COLUMN IF NOT EXISTS address_on_request BOOLEAN DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS suburb TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS postcode TEXT;

CREATE INDEX IF NOT EXISTS idx_listings_address_on_request ON listings(address_on_request);
