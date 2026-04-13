-- Similar listings RPC — finds semantically similar listings via pgvector
-- Used by the "In the Same Spirit" section on listing detail pages.
-- Returns listings from DIFFERENT verticals and DIFFERENT suburbs.

CREATE OR REPLACE FUNCTION match_similar_listings(
  query_embedding vector(1536),
  exclude_vertical text,
  exclude_suburb text DEFAULT NULL,
  match_count integer DEFAULT 6
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  vertical text,
  region text,
  state text,
  suburb text,
  hero_image_url text,
  quality_score integer,
  similarity double precision
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.name,
    l.slug,
    l.vertical,
    l.region,
    l.state,
    l.suburb,
    l.hero_image_url,
    l.quality_score,
    1 - (l.embedding <=> query_embedding) as similarity
  FROM listings l
  WHERE l.status = 'active'
    AND l.vertical != exclude_vertical
    AND (exclude_suburb IS NULL OR l.suburb IS DISTINCT FROM exclude_suburb)
    AND l.quality_score >= 60
    AND l.embedding IS NOT NULL
  ORDER BY l.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;
