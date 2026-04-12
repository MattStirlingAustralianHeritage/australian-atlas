-- Add 'duplicate' to the allowed listing statuses and add merged_into column
-- Required by the admin duplicates review page merge action

-- Add merged_into column to track which listing a duplicate was merged into
ALTER TABLE listings ADD COLUMN IF NOT EXISTS merged_into bigint REFERENCES listings(id);

-- Expand status constraint to include 'duplicate'
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('active', 'inactive', 'pending', 'hidden', 'duplicate'));

-- Index for quick lookup of merged listings
CREATE INDEX IF NOT EXISTS idx_listings_merged_into ON listings (merged_into) WHERE merged_into IS NOT NULL;
