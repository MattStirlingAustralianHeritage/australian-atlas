-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 045: Failed role promotions tracker
-- Allows admin retry of promote-role calls that failed
-- ============================================================

CREATE TABLE IF NOT EXISTS failed_role_promotions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        UUID        REFERENCES claims_review(id) ON DELETE SET NULL,
  user_email      TEXT        NOT NULL,
  target_role     TEXT        NOT NULL DEFAULT 'vendor',
  vertical        TEXT,
  error_message   TEXT,
  retry_count     INT         NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup for unresolved failures (admin retry queue)
CREATE INDEX idx_failed_promotions_unresolved
  ON failed_role_promotions (created_at DESC)
  WHERE resolved_at IS NULL;
