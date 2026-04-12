-- ============================================================
-- Migration 059: Trigram fuzzy search for listings
-- Enables pg_trgm for fuzzy name matching ("Ripponlea" → "Rippon Lea")
-- and adds address to the searchable fields.
-- ============================================================

-- 1. Enable pg_trgm extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN trigram index on name (fuzzy name search)
CREATE INDEX IF NOT EXISTS listings_name_trgm_idx
  ON listings USING gin(name gin_trgm_ops);

-- 3. GIN trigram index on address (suburb search via address field)
CREATE INDEX IF NOT EXISTS listings_address_trgm_idx
  ON listings USING gin(address gin_trgm_ops);

-- 4. Fuzzy search RPC: combines trigram similarity with ILIKE fallback
-- Returns listings matching a query by fuzzy name, address, region, or description
CREATE OR REPLACE FUNCTION fuzzy_search_listings(
  query text,
  vertical_filter text DEFAULT NULL,
  state_filter text DEFAULT NULL,
  region_filter text DEFAULT NULL,
  similarity_threshold real DEFAULT 0.15,
  result_limit int DEFAULT 100
)
RETURNS TABLE(
  id uuid,
  vertical text,
  name text,
  slug text,
  description text,
  region text,
  state text,
  lat float8,
  lng float8,
  hero_image_url text,
  is_featured boolean,
  is_claimed boolean,
  editors_pick boolean,
  website text,
  address text,
  relevance real
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id, l.vertical, l.name, l.slug, l.description,
    l.region, l.state, l.lat, l.lng, l.hero_image_url,
    l.is_featured, l.is_claimed, l.editors_pick,
    l.website, l.address,
    GREATEST(
      similarity(lower(l.name), lower(query)),
      similarity(lower(coalesce(l.address, '')), lower(query))
    ) AS relevance
  FROM listings l
  WHERE l.status = 'active'
    AND (vertical_filter IS NULL OR l.vertical = vertical_filter)
    AND (state_filter IS NULL OR l.state = state_filter)
    AND (region_filter IS NULL OR l.region ILIKE '%' || region_filter || '%')
    AND (
      -- Trigram similarity on name
      similarity(lower(l.name), lower(query)) >= similarity_threshold
      -- Trigram similarity on address (catches suburb searches)
      OR similarity(lower(coalesce(l.address, '')), lower(query)) >= similarity_threshold
      -- Fallback: ILIKE substring match on name, description, region, address
      OR l.name ILIKE '%' || query || '%'
      OR l.description ILIKE '%' || query || '%'
      OR l.region ILIKE '%' || query || '%'
      OR coalesce(l.address, '') ILIKE '%' || query || '%'
    )
  ORDER BY
    -- Exact name match first
    CASE WHEN lower(l.name) = lower(query) THEN 0 ELSE 1 END,
    -- Then by combined relevance
    relevance DESC,
    l.is_claimed DESC,
    l.is_featured DESC,
    l.name ASC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;
