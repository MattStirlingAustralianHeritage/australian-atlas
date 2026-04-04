-- Add editors_pick column to listings for two-tier curation hierarchy
-- editors_pick > is_featured: "Atlas Select" (editorial curation) vs "Featured" (claimed + featured)

ALTER TABLE listings ADD COLUMN IF NOT EXISTS editors_pick boolean DEFAULT false;

-- Conditional index for fast lookups
CREATE INDEX IF NOT EXISTS listings_editors_pick_idx ON listings(editors_pick) WHERE editors_pick = true;

-- Composite index for region page sorting: editors_pick first, then featured, then name
CREATE INDEX IF NOT EXISTS listings_curation_sort_idx ON listings(editors_pick DESC, is_featured DESC, name);

-- Update search_listings RPC to include editors_pick in results
CREATE OR REPLACE FUNCTION search_listings(
  query_embedding vector(1536),
  filter_vertical text default null,
  filter_state    text default null,
  filter_region   text default null,
  match_threshold float default 0.7,
  match_count     int default 20
)
RETURNS TABLE (
  id              uuid,
  vertical        text,
  name            text,
  slug            text,
  description     text,
  region          text,
  state           text,
  lat             float8,
  lng             float8,
  hero_image_url  text,
  is_featured     boolean,
  editors_pick    boolean,
  similarity      float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    l.id, l.vertical, l.name, l.slug, l.description,
    l.region, l.state, l.lat, l.lng, l.hero_image_url,
    l.is_featured, l.editors_pick,
    1 - (l.embedding <=> query_embedding) AS similarity
  FROM listings l
  WHERE
    l.status = 'active'
    AND l.embedding IS NOT NULL
    AND (filter_vertical IS NULL OR l.vertical = filter_vertical)
    AND (filter_state IS NULL OR l.state = filter_state)
    AND (filter_region IS NULL OR l.region = filter_region)
    AND 1 - (l.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
