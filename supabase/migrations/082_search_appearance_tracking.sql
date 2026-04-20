-- Track real search appearances per listing (fire-and-forget from search API)
-- Only claimed listings are tracked to keep table manageable

CREATE TABLE IF NOT EXISTS listing_search_appearances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  appeared_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lsa_listing_appeared ON listing_search_appearances(listing_id, appeared_at);
