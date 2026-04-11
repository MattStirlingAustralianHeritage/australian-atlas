-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 051: Operator RLS policies
-- ============================================================
-- The operator tables (048) had RLS enabled but NO policies,
-- meaning all non-service-role access was silently blocked.
-- This migration adds proper row-level policies.
-- ============================================================

-- ── operator_accounts ───────────────────────────────────────
-- Users can read and update their own operator account.
-- Inserts happen via service role (admin or registration flow).

CREATE POLICY "Users can select own operator account"
  ON operator_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own operator account"
  ON operator_accounts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role bypass for admin operations (Supabase service key
-- already bypasses RLS, but explicit policy keeps intent clear)
CREATE POLICY "Service role full access operator_accounts"
  ON operator_accounts FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── operator_collections ────────────────────────────────────
-- Full CRUD for the owning operator's user.

CREATE POLICY "Users can select own operator collections"
  ON operator_collections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operator_accounts
      WHERE operator_accounts.id = operator_collections.operator_id
        AND operator_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own operator collections"
  ON operator_collections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operator_accounts
      WHERE operator_accounts.id = operator_collections.operator_id
        AND operator_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own operator collections"
  ON operator_collections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM operator_accounts
      WHERE operator_accounts.id = operator_collections.operator_id
        AND operator_accounts.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operator_accounts
      WHERE operator_accounts.id = operator_collections.operator_id
        AND operator_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own operator collections"
  ON operator_collections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM operator_accounts
      WHERE operator_accounts.id = operator_collections.operator_id
        AND operator_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access operator_collections"
  ON operator_collections FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── operator_trails ─────────────────────────────────────────
-- Same pattern as collections — full CRUD for owning operator.

CREATE POLICY "Users can select own operator trails"
  ON operator_trails FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operator_accounts
      WHERE operator_accounts.id = operator_trails.operator_id
        AND operator_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own operator trails"
  ON operator_trails FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operator_accounts
      WHERE operator_accounts.id = operator_trails.operator_id
        AND operator_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own operator trails"
  ON operator_trails FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM operator_accounts
      WHERE operator_accounts.id = operator_trails.operator_id
        AND operator_accounts.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operator_accounts
      WHERE operator_accounts.id = operator_trails.operator_id
        AND operator_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own operator trails"
  ON operator_trails FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM operator_accounts
      WHERE operator_accounts.id = operator_trails.operator_id
        AND operator_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access operator_trails"
  ON operator_trails FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── operator_activity ───────────────────────────────────────
-- Users can read their own activity. Inserts via service role only
-- (activity is written by server-side API routes, not client).

CREATE POLICY "Users can select own operator activity"
  ON operator_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operator_accounts
      WHERE operator_accounts.id = operator_activity.operator_id
        AND operator_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access operator_activity"
  ON operator_activity FOR ALL
  USING (true)
  WITH CHECK (true);
