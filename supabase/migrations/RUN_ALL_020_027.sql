-- ============================================================
-- Australian Atlas Portal — Combined Migration 020–027
-- Run this once in the Supabase SQL Editor
-- Safe to re-run (all statements use IF NOT EXISTS)
-- ============================================================


-- ── 020: Search & Trail Intent Logging ───────────────────────

CREATE TABLE IF NOT EXISTS search_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text  text        NOT NULL,
  vertical_filter text,
  result_count int,
  session_id  text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_logs_created_at ON search_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_search_logs_session_id ON search_logs (session_id);

ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'search_logs' AND policyname = 'Service role insert only'
  ) THEN
    CREATE POLICY "Service role insert only" ON search_logs FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS trail_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_text       text        NOT NULL,
  region_detected   text,
  verticals_included text[],
  days_generated    int,
  session_id        text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trail_logs_created_at ON trail_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_trail_logs_session_id ON trail_logs (session_id);

ALTER TABLE trail_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trail_logs' AND policyname = 'Service role insert only'
  ) THEN
    CREATE POLICY "Service role insert only" ON trail_logs FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END $$;


-- ── 021: Staleness Detection Columns ─────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'last_verified_at'
  ) THEN
    ALTER TABLE listings ADD COLUMN last_verified_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'website_status'
  ) THEN
    ALTER TABLE listings ADD COLUMN website_status text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'website_checked_at'
  ) THEN
    ALTER TABLE listings ADD COLUMN website_checked_at timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS listings_last_verified_at_idx ON listings (last_verified_at);
CREATE INDEX IF NOT EXISTS listings_website_status_idx ON listings (website_status);


-- ── 022: Listing Completeness Scores ─────────────────────────

CREATE TABLE IF NOT EXISTS listing_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  vertical text NOT NULL,
  score int NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  missing_fields text[] DEFAULT '{}',
  improvement_note text,
  calculated_at timestamptz DEFAULT now(),
  UNIQUE(listing_id)
);

CREATE INDEX IF NOT EXISTS idx_listing_scores_score ON listing_scores(score);
CREATE INDEX IF NOT EXISTS idx_listing_scores_vertical ON listing_scores(vertical);


-- ── 023: Region Narratives ───────────────────────────────────

CREATE TABLE IF NOT EXISTS region_narratives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  editorial_overview text,
  best_time_to_visit text,
  what_makes_distinct text,
  vertical_highlights jsonb DEFAULT '[]',
  listing_count_at_generation int,
  content_hash text,
  generated_at timestamptz DEFAULT now(),
  UNIQUE(region_id)
);

CREATE INDEX IF NOT EXISTS idx_region_narratives_region ON region_narratives(region_id);


-- ── 024: Knowledge Graph + Candidates + Dedup ────────────────

CREATE TABLE IF NOT EXISTS listing_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id_a uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  listing_id_b uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN (
    'located_near', 'same_operator', 'produced_by',
    'featured_in', 'producer_pick', 'shares_region'
  )),
  confidence float DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source text NOT NULL DEFAULT 'inferred',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(listing_id_a, listing_id_b, relationship_type)
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_self_relationship'
  ) THEN
    ALTER TABLE listing_relationships ADD CONSTRAINT no_self_relationship
      CHECK (listing_id_a != listing_id_b);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_relationships_a ON listing_relationships(listing_id_a);
CREATE INDEX IF NOT EXISTS idx_relationships_b ON listing_relationships(listing_id_b);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON listing_relationships(relationship_type);

CREATE TABLE IF NOT EXISTS listing_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website_url text,
  region text,
  vertical text,
  confidence float DEFAULT 0.5,
  source text NOT NULL DEFAULT 'web_search',
  source_detail text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'rejected', 'converted')),
  notes text,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_candidates_status ON listing_candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_region ON listing_candidates(region);
CREATE INDEX IF NOT EXISTS idx_candidates_vertical ON listing_candidates(vertical);

CREATE TABLE IF NOT EXISTS dedup_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id_a uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  listing_id_b uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  similarity_score float NOT NULL,
  ai_assessment text,
  ai_reasoning text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'related', 'dismissed')),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  UNIQUE(listing_id_a, listing_id_b)
);

CREATE INDEX IF NOT EXISTS idx_dedup_status ON dedup_flags(status);


-- ── 025: User Passport + Digests + Story Ideas ──────────────

CREATE TABLE IF NOT EXISTS user_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  visited_at timestamptz DEFAULT now(),
  UNIQUE(user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_visits_user ON user_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_visits_listing ON user_visits(listing_id);

CREATE TABLE IF NOT EXISTS user_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  saved_at timestamptz DEFAULT now(),
  UNIQUE(user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_saves_user ON user_saves(user_id);
CREATE INDEX IF NOT EXISTS idx_saves_listing ON user_saves(listing_id);

CREATE TABLE IF NOT EXISTS user_trails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  summary text,
  prompt text,
  region text,
  days jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trails_user ON user_trails(user_id);

CREATE TABLE IF NOT EXISTS digest_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text NOT NULL,
  region_slug text NOT NULL,
  frequency text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly', 'monthly')),
  subscribed_at timestamptz DEFAULT now(),
  unsubscribed_at timestamptz,
  UNIQUE(email, region_slug)
);

CREATE INDEX IF NOT EXISTS idx_digest_region ON digest_subscriptions(region_slug);
CREATE INDEX IF NOT EXISTS idx_digest_active ON digest_subscriptions(unsubscribed_at) WHERE unsubscribed_at IS NULL;

CREATE TABLE IF NOT EXISTS story_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_name text,
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  vertical text,
  region text,
  story_angle text,
  contact_details text,
  source text DEFAULT 'manual',
  status text NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'pitched', 'confirmed', 'in_progress', 'published')),
  notes text,
  target_publish_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_ideas_status ON story_ideas(status);
CREATE INDEX IF NOT EXISTS idx_story_ideas_vertical ON story_ideas(vertical);

-- Seed the Turkey Flat interview (skip if already exists)
INSERT INTO story_ideas (venue_name, vertical, region, story_angle, status, notes)
SELECT
  'Turkey Flat Vineyards', 'sba', 'Barossa Valley',
  'Producer profile — multi-generational Barossa winery, one of the oldest Shiraz vineyards in Australia',
  'confirmed',
  'Interview scheduled at Turkey Flat. Cover: the family history, the approach to old-vine Shiraz, the relationship between terroir and the Barossa community.'
WHERE NOT EXISTS (
  SELECT 1 FROM story_ideas WHERE venue_name = 'Turkey Flat Vineyards'
);


-- ── 026: Public API Keys ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  name text NOT NULL,
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'partner', 'enterprise')),
  rate_limit int NOT NULL DEFAULT 1000,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  requests_today int DEFAULT 0,
  requests_reset_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  status_code int,
  response_time_ms int,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_logs_key ON api_request_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_request_logs(created_at);


-- ── 027: Claims Review ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS claims_review (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       uuid REFERENCES listings(id) ON DELETE CASCADE,
  vertical         text NOT NULL,
  source_claim_id  text,
  claimant_name    text,
  claimant_email   text NOT NULL,
  tier             text DEFAULT 'free',
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes      text,
  created_at       timestamptz DEFAULT now(),
  reviewed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_claims_review_status ON claims_review(status);
CREATE INDEX IF NOT EXISTS idx_claims_review_vertical ON claims_review(vertical);
CREATE INDEX IF NOT EXISTS idx_claims_review_created ON claims_review(created_at DESC);


-- ============================================================
-- Done. Creates 14 tables, adds 3 columns to listings.
-- All idempotent — safe to re-run.
-- ============================================================
