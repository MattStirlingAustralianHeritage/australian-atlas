-- ============================================================
-- Migration 068: Growth Agent Infrastructure
-- Tables for Agents 10-15
-- ============================================================

-- Agent 10 — SEO Content Agent
CREATE TABLE IF NOT EXISTS seo_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  query text NOT NULL,
  location text,
  category text,
  content text NOT NULL,
  listing_ids uuid[],
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'rejected')),
  quality_score integer,
  created_at timestamptz DEFAULT now(),
  published_at timestamptz,
  last_updated_at timestamptz,
  meta_title text,
  meta_description text,
  agent_run_id uuid REFERENCES agent_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_seo_pages_status ON seo_pages(status);
CREATE INDEX IF NOT EXISTS idx_seo_pages_slug ON seo_pages(slug);

-- Agent 11 — Backlink Builder Agent
CREATE TABLE IF NOT EXISTS wikipedia_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id),
  wikipedia_url text,
  article_title text,
  suggested_citation text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'live', 'dismissed')),
  found_at timestamptz DEFAULT now(),
  submitted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wikipedia_opps_status ON wikipedia_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_wikipedia_opps_listing ON wikipedia_opportunities(listing_id);

CREATE TABLE IF NOT EXISTS heritage_crosslinks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  heritage_article_id text,
  heritage_article_title text,
  heritage_article_url text,
  listing_id uuid REFERENCES listings(id),
  confidence numeric,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
  found_at timestamptz DEFAULT now(),
  approved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_heritage_crosslinks_status ON heritage_crosslinks(status);
CREATE INDEX IF NOT EXISTS idx_heritage_crosslinks_listing ON heritage_crosslinks(listing_id);

-- Agent 12 — Content Recycling Agent
CREATE TABLE IF NOT EXISTS content_recycling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id text NOT NULL,
  article_title text,
  social_posts jsonb,
  newsletter_excerpt text,
  meta_description text,
  follow_up_angles jsonb,
  pull_quotes jsonb,
  status text DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'published')),
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_content_recycling_status ON content_recycling(status);
CREATE INDEX IF NOT EXISTS idx_content_recycling_article ON content_recycling(article_id);

-- Agent 13 — Operator Amplification Agent
-- Add share_kit_sent_at to listings to prevent duplicate sends
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='listings' AND column_name='share_kit_sent_at') THEN
    ALTER TABLE listings ADD COLUMN share_kit_sent_at timestamptz;
  END IF;
END $$;

-- Agent 14 — User Reactivation Agent
-- Add reactivation tracking to profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='reactivation_email_sent_at') THEN
    ALTER TABLE profiles ADD COLUMN reactivation_email_sent_at timestamptz;
  END IF;
END $$;

-- Agent 12 — Add recycled_at to articles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='recycled_at') THEN
    ALTER TABLE articles ADD COLUMN recycled_at timestamptz;
  END IF;
END $$;

-- Agent 15 — Listing Velocity Agent
CREATE TABLE IF NOT EXISTS listing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date DEFAULT current_date,
  vertical text,
  region text,
  state text,
  count integer,
  active_count integer,
  claimed_count integer,
  verified_count integer,
  avg_quality_score numeric
);

CREATE INDEX IF NOT EXISTS idx_listing_history_date ON listing_history(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_listing_history_vertical ON listing_history(vertical);
