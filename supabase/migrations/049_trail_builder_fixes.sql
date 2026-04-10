-- Migration 049: Trail builder fixes
-- 1. Geo-filtered semantic search RPC for itinerary candidate selection
-- 2. Response caching columns on user_trails
-- 3. Fix embedding dimension mismatch (1536 → 1024 for Voyage-3)

-- ============================================================
-- Fix embedding column dimensions (Voyage-3 outputs 1024, not 1536)
-- ============================================================

-- Listings embedding column
ALTER TABLE listings
  ALTER COLUMN embedding TYPE vector(1024)
  USING embedding::vector(1024);

-- Articles embedding column
ALTER TABLE articles
  ALTER COLUMN embedding TYPE vector(1024)
  USING embedding::vector(1024);

-- Recreate IVFFlat indexes with correct dimension
DROP INDEX IF EXISTS listings_embedding_idx;
CREATE INDEX listings_embedding_idx
  ON listings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

DROP INDEX IF EXISTS articles_embedding_idx;
CREATE INDEX articles_embedding_idx
  ON articles USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================
-- Geo-filtered semantic search RPC for trail builder
-- ============================================================
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
    AND 1 - (l.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Update existing search_listings RPC to use correct dimension
CREATE OR REPLACE FUNCTION search_listings(
  query_embedding vector(1024),
  filter_vertical text DEFAULT NULL,
  filter_state    text DEFAULT NULL,
  filter_region   text DEFAULT NULL,
  match_threshold float DEFAULT 0.7,
  match_count     int DEFAULT 20
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
  similarity      float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    l.id, l.vertical, l.name, l.slug, l.description,
    l.region, l.state, l.lat, l.lng, l.hero_image_url,
    l.is_featured,
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

-- Update search_articles RPC to use correct dimension
CREATE OR REPLACE FUNCTION search_articles(
  query_embedding vector(1024),
  filter_vertical text DEFAULT NULL,
  filter_region   text DEFAULT NULL,
  match_threshold float DEFAULT 0.7,
  match_count     int DEFAULT 10
)
RETURNS TABLE (
  id              uuid,
  vertical        text,
  title           text,
  slug            text,
  excerpt         text,
  hero_image_url  text,
  published_at    timestamptz,
  region_tags     text[],
  similarity      float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    a.id, a.vertical, a.title, a.slug, a.excerpt,
    a.hero_image_url, a.published_at, a.region_tags,
    1 - (a.embedding <=> query_embedding) AS similarity
  FROM articles a
  WHERE
    a.status = 'published'
    AND a.embedding IS NOT NULL
    AND (filter_vertical IS NULL OR a.vertical = filter_vertical)
    AND (filter_region IS NULL OR filter_region = ANY(a.region_tags))
    AND 1 - (a.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- ============================================================
-- Response caching columns on user_trails
-- ============================================================
ALTER TABLE user_trails ADD COLUMN IF NOT EXISTS cache_key text;
ALTER TABLE user_trails ADD COLUMN IF NOT EXISTS source text DEFAULT 'saved'
  CHECK (source IN ('saved', 'cache'));
ALTER TABLE user_trails ADD COLUMN IF NOT EXISTS cached_response jsonb;

-- Allow anonymous cache entries (user_id was NOT NULL)
ALTER TABLE user_trails ALTER COLUMN user_id DROP NOT NULL;

-- Partial index for fast cache lookups
CREATE INDEX IF NOT EXISTS idx_trails_cache_key
  ON user_trails(cache_key)
  WHERE source = 'cache';

-- Index for cache TTL cleanup
CREATE INDEX IF NOT EXISTS idx_trails_cache_created
  ON user_trails(created_at)
  WHERE source = 'cache';
