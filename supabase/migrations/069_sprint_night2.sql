-- ============================================================
-- Migration 069: Night 2 Sprint — Feature tables
-- user_views (For You feed + dashboard stats),
-- serendipity_saves (Serendipity Engine),
-- user_dismissals (For You negative signals)
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- 1. USER VIEWS — tracks every listing page view by logged-in users
-- Used by: For You feed (1.3), Operator dashboard stats (3.3),
--          User Reactivation Agent (14)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_views (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_views_user
  ON user_views (user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_views_listing
  ON user_views (listing_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_views_recent
  ON user_views (viewed_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 2. SERENDIPITY SAVES — "I'd visit this" saves from /discover
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS serendipity_saves (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  session_id text, -- for logged-out users
  saved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_serendipity_saves_user
  ON serendipity_saves (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_serendipity_saves_session
  ON serendipity_saves (session_id) WHERE session_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════
-- 3. USER DISMISSALS — negative signal for For You feed
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_dismissals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_user_dismissals_user
  ON user_dismissals (user_id);
