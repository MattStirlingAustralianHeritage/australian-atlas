-- Add humanised tracking to listings
ALTER TABLE public.listings
ADD COLUMN IF NOT EXISTS humanised boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS humanised_at timestamptz;

-- Index for fast random selection weighted toward un-humanised
CREATE INDEX IF NOT EXISTS idx_listings_humanised ON public.listings (humanised) WHERE humanised = false;
