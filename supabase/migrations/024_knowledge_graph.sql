-- Atlas Network Knowledge Graph
-- Stores relationships between listings across the network

-- Relationship types:
-- 'located_near'   — within 5km of each other
-- 'same_operator'  — same ABN, email, or website domain
-- 'produced_by'    — e.g. Table listing produces goods for Small Batch venue
-- 'featured_in'    — appears in a Journal article
-- 'producer_pick'  — recommended via Producer Picks mechanic
-- 'shares_region'  — in the same mapped region (lighter weight)

CREATE TABLE IF NOT EXISTS listing_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id_a uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  listing_id_b uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN (
    'located_near', 'same_operator', 'produced_by',
    'featured_in', 'producer_pick', 'shares_region'
  )),
  confidence float DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source text NOT NULL DEFAULT 'inferred',  -- 'inferred', 'manual', 'producer_pick', 'journal'
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(listing_id_a, listing_id_b, relationship_type)
);

-- Prevent self-relationships
ALTER TABLE listing_relationships ADD CONSTRAINT no_self_relationship
  CHECK (listing_id_a != listing_id_b);

CREATE INDEX idx_relationships_a ON listing_relationships(listing_id_a);
CREATE INDEX idx_relationships_b ON listing_relationships(listing_id_b);
CREATE INDEX idx_relationships_type ON listing_relationships(relationship_type);

-- Listing candidates for acquisition intelligence
CREATE TABLE IF NOT EXISTS listing_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website_url text,
  region text,
  vertical text,
  confidence float DEFAULT 0.5,
  source text NOT NULL DEFAULT 'web_search',  -- 'web_search', 'council_suggested', 'user_suggested'
  source_detail text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'rejected', 'converted')),
  notes text,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX idx_candidates_status ON listing_candidates(status);
CREATE INDEX idx_candidates_region ON listing_candidates(region);
CREATE INDEX idx_candidates_vertical ON listing_candidates(vertical);

-- Semantic deduplication report
CREATE TABLE IF NOT EXISTS dedup_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id_a uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  listing_id_b uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  similarity_score float NOT NULL,
  ai_assessment text,  -- 'duplicate', 'related', 'coincidental'
  ai_reasoning text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'related', 'dismissed')),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  UNIQUE(listing_id_a, listing_id_b)
);

CREATE INDEX idx_dedup_status ON dedup_flags(status);
