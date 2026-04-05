-- Add hidden_reason column for tracking why listings are hidden
ALTER TABLE listings ADD COLUMN IF NOT EXISTS hidden_reason text;

-- Index for efficient filtering of hidden listings
CREATE INDEX IF NOT EXISTS idx_listings_hidden_reason ON listings (hidden_reason) WHERE hidden_reason IS NOT NULL;

-- Comment
COMMENT ON COLUMN listings.hidden_reason IS 'Reason listing was hidden from public view. Values: no_website, dead_url, manual. NULL = not hidden.';
