-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 254: Trade outreach autopilot parity
-- ============================================================
-- Brings trade_outreach (migration 244) up to the same delivery + follow-up
-- shape as press_outreach (migration 253), so the trade engine can run the same
-- daily autopilot as operators (251) and press (253):
--   • delivered_at / opened_at / open_count — Resend webhook engagement stamps
--     (the funnel and the "who has read us" signal)
--   • followup_sent_at / followup_resend_message_id / followup_campaign_id —
--     the single "last note from me" second touch the autopilot sends N days
--     after the first, without disturbing the first-touch send_* columns.
--
-- All additive / idempotent — safe to re-run. No data backfill needed (all new
-- columns default null / 0 = "not yet delivered / opened / followed up").
-- ============================================================

ALTER TABLE trade_outreach
  ADD COLUMN IF NOT EXISTS delivered_at               timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS open_count                 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS followup_sent_at           timestamptz,
  ADD COLUMN IF NOT EXISTS followup_resend_message_id text,
  ADD COLUMN IF NOT EXISTS followup_campaign_id       text;

-- The Resend webhook looks a message id up against the follow-up column when the
-- first-touch id misses; index it so that lookup stays a single-row probe.
CREATE INDEX IF NOT EXISTS idx_trade_outreach_followup_msg
  ON trade_outreach (followup_resend_message_id);

-- Reload PostgREST schema cache so the new columns are visible to the API.
NOTIFY pgrst, 'reload schema';
