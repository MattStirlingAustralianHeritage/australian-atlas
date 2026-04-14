-- Add visit_type and trail_suitable columns for Discovery Trail filtering.
-- Listings that are retail-only or maker workshops shouldn't appear on
-- road-trip itineraries alongside cellar doors and museums.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS visit_type   TEXT,
  ADD COLUMN IF NOT EXISTS trail_suitable BOOLEAN;

-- Index for the most common query pattern: active + trail-suitable
CREATE INDEX IF NOT EXISTS idx_listings_trail_suitable
  ON listings (trail_suitable)
  WHERE status = 'active' AND trail_suitable = true;

COMMENT ON COLUMN listings.visit_type IS 'Classification: experiential | venue | retail | workshop | attraction';
COMMENT ON COLUMN listings.trail_suitable IS 'Whether this listing is suitable as a stop on a Discovery Trail / road-trip itinerary';

-- Update the geo-filtered semantic search RPC used by the itinerary builder.
-- Excludes listings explicitly marked trail_suitable = false.
-- NULL (not yet classified) listings are still included.
CREATE OR REPLACE FUNCTION search_listings_geo(
  query_embedding vector(1024),
  lat_min         float8,
  lat_max         float8,
  lng_min         float8,
  lng_max         float8,
  match_threshold float DEFAULT 0.6,
  match_count     int DEFAULT 30
)
RETURNS TABLE (
  id              uuid,
  name            text,
  vertical        text,
  slug            text,
  description     text,
  region          text,
  state           text,
  lat             float8,
  lng             float8,
  hero_image_url  text,
  source_id       text,
  is_claimed      boolean,
  is_featured     boolean,
  editors_pick    boolean,
  similarity      float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    l.id, l.name, l.vertical, l.slug, l.description,
    l.region, l.state, l.lat, l.lng, l.hero_image_url,
    l.source_id, l.is_claimed, l.is_featured, l.editors_pick,
    1 - (l.embedding <=> query_embedding) AS similarity
  FROM listings l
  WHERE
    l.status = 'active'
    AND l.embedding IS NOT NULL
    AND l.lat IS NOT NULL
    AND l.lng IS NOT NULL
    AND l.lat BETWEEN lat_min AND lat_max
    AND l.lng BETWEEN lng_min AND lng_max
    AND (l.trail_suitable IS TRUE OR l.trail_suitable IS NULL)
    AND 1 - (l.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
