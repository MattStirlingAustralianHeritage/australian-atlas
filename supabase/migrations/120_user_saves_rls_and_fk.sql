-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 120: user_saves FK constraint and RLS policies
-- ============================================================
-- The user_saves table (added in 025) shipped without RLS and
-- without a FK on user_id. Now that the portal listing detail
-- page has a save button, we need both:
--   - FK to auth.users so user deletions cascade saves
--   - RLS so the per-user-saves API can run as the user, not
--     as service role, and saves are isolated per user
-- ============================================================
-- Pre-migration check (verified): 0 rows where user_id is not
-- in auth.users. Safe to add the FK cleanly.
-- ============================================================

-- ── 1. Foreign key on user_id ───────────────────────────────
ALTER TABLE user_saves
  ADD CONSTRAINT user_saves_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 2. Enable RLS ───────────────────────────────────────────
ALTER TABLE user_saves ENABLE ROW LEVEL SECURITY;

-- ── 3. Per-user policies ────────────────────────────────────
CREATE POLICY "Users can view own saves"
  ON user_saves FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saves"
  ON user_saves FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saves"
  ON user_saves FOR DELETE
  USING (auth.uid() = user_id);

-- ── 4. Service role bypass ──────────────────────────────────
-- Supabase service key already bypasses RLS via JWT claim, but
-- explicit policy keeps intent clear and matches migration 051.
-- The vendor dashboard stats route reads aggregate save_count
-- per listing via service role; this policy supports that.
CREATE POLICY "Service role full access user_saves"
  ON user_saves FOR ALL
  USING (true)
  WITH CHECK (true);
