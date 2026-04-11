-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 042: Webhook idempotency guard
-- Prevents duplicate processing of Stripe webhook events
-- ============================================================

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id    TEXT        PRIMARY KEY,
  event_type  TEXT        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Purge old events periodically (retention query helper)
CREATE INDEX idx_processed_stripe_events_at
  ON processed_stripe_events (processed_at);
