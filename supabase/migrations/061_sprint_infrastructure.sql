-- ============================================================
-- Migration 061: Sprint infrastructure
-- Comprehensive schema additions for quality scoring, address
-- parsing, full-text search, trust layer, collections, memories,
-- duplicate detection, editorial tools, and analytics.
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- 1. LISTING ENRICHMENT COLUMNS
-- ═══════════════════════════════════════════════════════════

-- Address component extraction (1.2)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS street_address text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS suburb text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS postcode text;

-- Quality scoring (1.4)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS quality_score integer DEFAULT 0;

-- Trust layer (1.9)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS verification_source text; -- operator_claimed, editorial_review, automated_high_confidence, community_confirmed

-- Completeness (1.10)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS completeness_score integer DEFAULT 0;

-- Editorial rank (2.3)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS editorial_rank integer; -- nullable, lower = higher priority

-- Seasonal awareness (3.5)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS best_season text; -- Summer, Autumn, Winter, Spring, Year-round

-- Heritage significance (3.10)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS heritage_significance boolean DEFAULT false;

-- Night economy (7.7)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS night_friendly boolean DEFAULT false;

-- Anniversary engine (7.6)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS founded_year integer;

-- Opening hours (4.2)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS hours jsonb;
-- Format: { "monday": { "open": "09:00", "close": "17:00" }, ... }

-- AI-generated description (1.7)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ai_description text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ai_description_approved boolean DEFAULT false;

-- ═══════════════════════════════════════════════════════════
-- 2. FULL-TEXT SEARCH (2.1)
-- ═══════════════════════════════════════════════════════════

-- Add tsvector column for full-text search
ALTER TABLE listings ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate tsvector from existing data
UPDATE listings SET search_vector =
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(suburb, coalesce(region, ''))), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'C');

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_listings_search_vector ON listings USING gin(search_vector);

-- Trigger to auto-update tsvector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION listings_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.suburb, coalesce(NEW.region, ''))), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_listings_search_vector ON listings;
CREATE TRIGGER trg_listings_search_vector
  BEFORE INSERT OR UPDATE OF name, suburb, region, description ON listings
  FOR EACH ROW EXECUTE FUNCTION listings_search_vector_update();

-- ═══════════════════════════════════════════════════════════
-- 3. INDEXES FOR PERFORMANCE (5.1)
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_listings_quality_score ON listings (quality_score DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_editorial_rank ON listings (editorial_rank ASC NULLS LAST) WHERE editorial_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_verified ON listings (verified) WHERE verified = true;
CREATE INDEX IF NOT EXISTS idx_listings_vertical_state ON listings (vertical, state) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_vertical_region ON listings (vertical, region) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_suburb ON listings (suburb) WHERE suburb IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_postcode ON listings (postcode) WHERE postcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_slug ON listings (slug) WHERE slug IS NOT NULL;

-- ═══════════════════════════════════════════════════════════
-- 4. COLLECTIONS (3.3)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS collections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  hero_image_url text,
  author text DEFAULT 'Australian Atlas Editorial',
  listing_ids bigint[] NOT NULL DEFAULT '{}',
  vertical text, -- optional: themed collection for one vertical
  region text,   -- optional: region-scoped collection
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_slug ON collections (slug);
CREATE INDEX IF NOT EXISTS idx_collections_published ON collections (published) WHERE published = true;

-- ═══════════════════════════════════════════════════════════
-- 5. PLACE MEMORIES (3.8)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS place_memories (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id bigint NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  author_name text, -- nullable for anonymous submissions
  memory text NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  flagged_for_pullquote boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_place_memories_listing ON place_memories (listing_id) WHERE approved = true;

-- ═══════════════════════════════════════════════════════════
-- 6. DUPLICATE DETECTION (1.6)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS duplicate_pairs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_a_id bigint NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  listing_b_id bigint NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  confidence text NOT NULL DEFAULT 'medium', -- high, medium
  match_reason text NOT NULL, -- same_name_suburb, same_website, trigram_match
  status text NOT NULL DEFAULT 'pending', -- pending, merged, dismissed
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_a_id, listing_b_id)
);

CREATE INDEX IF NOT EXISTS idx_duplicate_pairs_status ON duplicate_pairs (status) WHERE status = 'pending';

-- ═══════════════════════════════════════════════════════════
-- 7. SEARCH ANALYTICS (2.8)
-- ═══════════════════════════════════════════════════════════

-- search_logs table may already exist. Ensure it has all needed columns.
CREATE TABLE IF NOT EXISTS search_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query_text text NOT NULL,
  vertical_filter text,
  state_filter text,
  region_filter text,
  result_count integer NOT NULL DEFAULT 0,
  session_id text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_logs_created ON search_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_logs_zero ON search_logs (result_count) WHERE result_count = 0;

-- ═══════════════════════════════════════════════════════════
-- 8. CLIENT ERROR TRACKING (5.2)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_errors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  route text NOT NULL,
  error_message text NOT NULL,
  error_stack text,
  user_agent text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors (created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 9. OPERATOR OUTREACH (4.3)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS operator_outreach (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id bigint NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  contact_email text,
  status text NOT NULL DEFAULT 'not_contacted', -- not_contacted, contacted, claimed, declined
  notes text,
  last_contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outreach_status ON operator_outreach (status);

-- ═══════════════════════════════════════════════════════════
-- 10. WISH LIST / SUGGESTIONS (7.2)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS listing_suggestions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  website text,
  suburb text,
  state text,
  vertical text,
  reason text, -- why they love it
  submitter_email text,
  status text NOT NULL DEFAULT 'pending', -- pending, promoted, dismissed
  promoted_candidate_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 11. EVENTS (3.13)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  listing_id bigint REFERENCES listings(id) ON DELETE SET NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz,
  ticket_url text,
  is_free boolean NOT NULL DEFAULT true,
  category text, -- market, exhibition, tasting, workshop, festival, other
  state text,
  region text,
  hero_image_url text,
  published boolean NOT NULL DEFAULT false,
  created_by uuid, -- operator or admin
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_dates ON events (start_date) WHERE published = true;
CREATE INDEX IF NOT EXISTS idx_events_listing ON events (listing_id) WHERE listing_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════
-- 12. INTERVIEWS (8.4)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS interviews (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject text NOT NULL,
  slug text UNIQUE NOT NULL,
  listing_id bigint REFERENCES listings(id) ON DELETE SET NULL,
  questions jsonb NOT NULL DEFAULT '[]',
  answers jsonb NOT NULL DEFAULT '[]',
  author text DEFAULT 'Matt Stirling',
  hero_image_url text,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 13. LISTING HISTORY / LOCAL ECONOMY (7.8)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS listing_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  month date NOT NULL, -- first day of month
  vertical text NOT NULL,
  region text,
  state text,
  listing_count integer NOT NULL DEFAULT 0,
  claimed_count integer NOT NULL DEFAULT 0,
  avg_quality_score numeric(5,1),
  UNIQUE(month, vertical, region)
);

-- ═══════════════════════════════════════════════════════════
-- 14. RPC: FULL-TEXT + TRIGRAM COMBINED SEARCH (2.1)
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_listings_combined(
  search_query text,
  vertical_filter text DEFAULT NULL,
  state_filter text DEFAULT NULL,
  region_filter text DEFAULT NULL,
  result_limit integer DEFAULT 30
)
RETURNS TABLE (
  id bigint,
  name text,
  slug text,
  vertical text,
  description text,
  region text,
  state text,
  suburb text,
  lat double precision,
  lng double precision,
  hero_image_url text,
  is_featured boolean,
  is_claimed boolean,
  editors_pick boolean,
  website text,
  address text,
  quality_score integer,
  editorial_rank integer,
  verified boolean,
  rank_score double precision
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id, l.name, l.slug, l.vertical, l.description,
    l.region, l.state, l.suburb, l.lat, l.lng,
    l.hero_image_url, l.is_featured, l.is_claimed, l.editors_pick,
    l.website, l.address, l.quality_score, l.editorial_rank, l.verified,
    (
      -- Signal 1: Full-text search rank (weighted tsvector)
      COALESCE(ts_rank_cd(l.search_vector, plainto_tsquery('english', search_query)), 0) * 10.0
      -- Signal 2: Trigram similarity on name
      + COALESCE(similarity(l.name, search_query), 0) * 8.0
      -- Signal 3: Quality score boost (0-100 scaled to 0-2)
      + COALESCE(l.quality_score, 0) * 0.02
      -- Signal 4: Editorial rank boost (if set)
      + CASE WHEN l.editorial_rank IS NOT NULL THEN 5.0 / l.editorial_rank ELSE 0 END
      -- Signal 5: Claimed/featured boost
      + CASE WHEN l.is_claimed THEN 1.0 ELSE 0 END
      + CASE WHEN l.is_featured THEN 0.5 ELSE 0 END
      + CASE WHEN l.editors_pick THEN 0.5 ELSE 0 END
      + CASE WHEN l.verified THEN 0.3 ELSE 0 END
    ) AS rank_score
  FROM listings l
  WHERE l.status = 'active'
    AND (vertical_filter IS NULL OR l.vertical = vertical_filter)
    AND (state_filter IS NULL OR l.state = state_filter)
    AND (region_filter IS NULL OR l.region ILIKE '%' || region_filter || '%')
    AND (
      l.search_vector @@ plainto_tsquery('english', search_query)
      OR similarity(l.name, search_query) > 0.2
      OR l.name ILIKE '%' || search_query || '%'
      OR l.suburb ILIKE '%' || search_query || '%'
      OR l.address ILIKE '%' || search_query || '%'
    )
  ORDER BY rank_score DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ═══════════════════════════════════════════════════════════
-- 15. RPC: AUTOCOMPLETE (2.5)
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION autocomplete_listings(
  search_prefix text,
  result_limit integer DEFAULT 8
)
RETURNS TABLE (
  id bigint,
  name text,
  slug text,
  vertical text,
  region text,
  state text,
  suburb text,
  match_type text -- 'name', 'suburb', 'region'
) AS $$
BEGIN
  RETURN QUERY
  (
    -- Name matches
    SELECT l.id, l.name, l.slug, l.vertical, l.region, l.state, l.suburb, 'name'::text
    FROM listings l
    WHERE l.status = 'active'
      AND (l.name ILIKE search_prefix || '%' OR l.name ILIKE '% ' || search_prefix || '%')
    ORDER BY l.quality_score DESC NULLS LAST, l.is_claimed DESC
    LIMIT result_limit
  )
  UNION ALL
  (
    -- Suburb matches
    SELECT DISTINCT ON (l.suburb)
      l.id, l.suburb, l.slug, l.vertical, l.region, l.state, l.suburb, 'suburb'::text
    FROM listings l
    WHERE l.status = 'active' AND l.suburb IS NOT NULL
      AND l.suburb ILIKE search_prefix || '%'
    ORDER BY l.suburb, l.quality_score DESC NULLS LAST
    LIMIT 3
  )
  UNION ALL
  (
    -- Region matches
    SELECT DISTINCT ON (l.region)
      l.id, l.region, l.slug, l.vertical, l.region, l.state, l.suburb, 'region'::text
    FROM listings l
    WHERE l.status = 'active' AND l.region IS NOT NULL
      AND l.region ILIKE search_prefix || '%'
    ORDER BY l.region, l.quality_score DESC NULLS LAST
    LIMIT 3
  )
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ═══════════════════════════════════════════════════════════
-- 16. RPC: SPATIAL REGION ASSIGNMENT (1.3)
-- ═══════════════════════════════════════════════════════════

-- Requires regions table to have center_lat, center_lng, and a radius concept.
-- This RPC finds the nearest region for given coordinates.
CREATE OR REPLACE FUNCTION find_nearest_region(
  p_lat double precision,
  p_lng double precision
)
RETURNS TABLE (
  region_name text,
  region_state text,
  distance_km double precision
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.name,
    r.state,
    (6371 * acos(
      cos(radians(p_lat)) * cos(radians(r.center_lat)) *
      cos(radians(r.center_lng) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(r.center_lat))
    )) AS dist_km
  FROM regions r
  WHERE r.center_lat IS NOT NULL AND r.center_lng IS NOT NULL
  ORDER BY dist_km ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;
