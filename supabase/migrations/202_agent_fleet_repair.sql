-- ============================================================
-- Migration 202: Agent Fleet Repair
--
-- The 2026-04-14 agent batch (e22008e) shipped 14 agents whose
-- backing tables/columns were never migrated to prod (migrations
-- 065 and 068 exist in-repo but were never applied). This
-- migration applies the missing schema with corrections found in
-- the 2026-06-18 fleet liveness audit (docs/audits/
-- agent-liveness-2026-06-18.md):
--   * revenue_snapshots gains created_at (both revenue-signal and
--     monday-briefing SELECT/ORDER BY it; 065's shape lacked it)
--   * press_mentions.published_date is text, not date (value is
--     free-text from a Claude response; a date column would
--     reject non-ISO strings and fail the whole insert)
--   * listing_analytics (010/014 shape) gains user_id, which
--     user-reactivation filters on
--   * listing_suggestions gains source/source_url, which
--     competitor-intelligence inserts
--   * profiles.last_sign_in_at mirrors auth.users via trigger
-- All new tables get RLS enabled with no policies: agents use the
-- service role, nothing here is for anon/authenticated reads.
-- ============================================================

-- ── press_mentions (competitor-intelligence) ─────────────────
CREATE TABLE IF NOT EXISTS press_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id),
  source text,
  source_url text,
  published_date text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_press_mentions_listing ON press_mentions (listing_id);
CREATE INDEX IF NOT EXISTS idx_press_mentions_created ON press_mentions (created_at DESC);

-- ── description_evaluations (voice-consistency) ──────────────
CREATE TABLE IF NOT EXISTS description_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id),
  evaluated_at timestamptz DEFAULT now(),
  score integer,
  issues jsonb,
  rewrite_priority text,  -- 'high', 'medium', 'low'
  suggested_rewrite text,
  actioned boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_desc_evals_listing ON description_evaluations (listing_id);
CREATE INDEX IF NOT EXISTS idx_desc_evals_priority ON description_evaluations (rewrite_priority)
  WHERE actioned = false;

-- ── revenue_snapshots (revenue-signal; read by monday-briefing) ─
CREATE TABLE IF NOT EXISTS revenue_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date DEFAULT current_date,
  active_subscribers integer,
  arr numeric,
  new_this_week integer,
  churned_this_week integer,
  expiring_30_days integer,
  raw_data jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_snapshots_date ON revenue_snapshots (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_snapshots_created ON revenue_snapshots (created_at DESC);

-- ── seo_pages (seo-content) ──────────────────────────────────
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

-- ── wikipedia_opportunities + heritage_crosslinks (backlink-builder) ─
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

-- ── content_recycling (content-recycling) ────────────────────
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

-- ── listing_analytics (user-reactivation engagement gate) ────
-- 010_analytics.sql shape + 014 geo columns + user_id (the agent
-- filters .eq('user_id', ...); anonymous rows leave it NULL).
CREATE TABLE IF NOT EXISTS listing_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  vertical text NOT NULL,
  event_type text CHECK (event_type IN ('view', 'click', 'search_appearance')),
  region_slug text,
  country text,
  region text,
  city text,
  lat double precision,
  lng double precision,
  user_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_analytics_listing ON listing_analytics (listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_analytics_user ON listing_analytics (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ── listings columns (dead-image, voice-consistency, operator-amplification) ─
ALTER TABLE listings ADD COLUMN IF NOT EXISTS hero_image_verified_at timestamptz;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS hero_image_candidate_url text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS last_voice_evaluated_at timestamptz;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS share_kit_sent_at timestamptz;

-- ── articles columns (content-recycling: meta-only writes per
--    the Article Body Protection rule) ─────────────────────────
ALTER TABLE articles ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS recycled_at timestamptz;

-- ── listing_suggestions columns (competitor-intelligence) ────
ALTER TABLE listing_suggestions ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE listing_suggestions ADD COLUMN IF NOT EXISTS source_url text;

-- ── profiles columns (user-reactivation) ─────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reactivation_email_sent_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_state text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

-- Mirror auth.users.last_sign_in_at into profiles so the agent's
-- .lt('last_sign_in_at', ...) filter sees live data.
CREATE OR REPLACE FUNCTION public.sync_profile_last_sign_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET last_sign_in_at = NEW.last_sign_in_at
   WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_sign_in ON auth.users;
CREATE TRIGGER on_auth_user_sign_in
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_last_sign_in();

-- Backfill from auth.users
UPDATE public.profiles p
   SET last_sign_in_at = u.last_sign_in_at
  FROM auth.users u
 WHERE u.id = p.id
   AND u.last_sign_in_at IS NOT NULL
   AND p.last_sign_in_at IS NULL;

-- ── RLS: service-role-only on all new tables ─────────────────
ALTER TABLE press_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE description_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wikipedia_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE heritage_crosslinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_recycling ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_analytics ENABLE ROW LEVEL SECURITY;
