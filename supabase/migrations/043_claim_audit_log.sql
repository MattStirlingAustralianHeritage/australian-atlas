-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 043: Claim audit log
-- Immutable audit trail for all claim lifecycle events
-- ============================================================

CREATE TABLE IF NOT EXISTS claim_audit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id   UUID        REFERENCES claims_review(id) ON DELETE SET NULL,
  action     TEXT        NOT NULL,
    -- Expected values: 'created', 'approved', 'rejected',
    -- 'auto_approved', 'transferred', 'linked', 'payment_received'
  actor      TEXT,
    -- 'admin', 'system', 'stripe_webhook', or an email address
  details    JSONB       DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_claim_audit_log_claim
  ON claim_audit_log (claim_id);

CREATE INDEX idx_claim_audit_log_action
  ON claim_audit_log (action);

CREATE INDEX idx_claim_audit_log_created
  ON claim_audit_log (created_at DESC);
