-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 251: Outreach engine — event funnel, follow-ups, autopilot
-- ============================================================
-- Upgrades the batch-email outreach (migs 230/231) into a full engine:
--   * delivery/open/click stamps on operator_outreach (fed by the Resend
--     webhook) so campaigns report engagement, not just sends
--   * follow-up (second touch) delivery state — one follow-up max per row
--   * claim attribution (claimed_at, stamped by the autopilot claim-sync)
--   * outreach_events — raw append-only webhook event log
--   * outreach_settings — autopilot configuration (single jsonb row)
--   * read-side RPCs so the admin page aggregates in one round trip
-- All additive / idempotent — safe to re-run.

-- 1. Engagement + follow-up columns on the funnel table -------
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS followup_resend_message_id text;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS followup_campaign_id text;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- The webhook resolves events by message id — both touches.
CREATE INDEX IF NOT EXISTS idx_outreach_resend_msg ON operator_outreach (resend_message_id);
CREATE INDEX IF NOT EXISTS idx_outreach_followup_msg ON operator_outreach (followup_resend_message_id);

-- 2. Campaign kind (manual | autopilot | followup) ------------
ALTER TABLE outreach_campaigns ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'manual';

-- 3. Raw webhook event log ------------------------------------
CREATE TABLE IF NOT EXISTS outreach_events (
  id          bigserial PRIMARY KEY,
  message_id  text,
  email       text,
  event       text NOT NULL,          -- delivered | opened | clicked | bounced | complained
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outreach_events_msg ON outreach_events (message_id);
CREATE INDEX IF NOT EXISTS idx_outreach_events_created ON outreach_events (created_at DESC);

ALTER TABLE outreach_events ENABLE ROW LEVEL SECURITY;
-- service-role only; no anon/authenticated policies on purpose.

-- 4. Autopilot settings (key/value, one 'autopilot' row) ------
CREATE TABLE IF NOT EXISTS outreach_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE outreach_settings ENABLE ROW LEVEL SECURITY;

-- 5. Read-side aggregates -------------------------------------
-- Whole-funnel overview for the admin header. SECURITY DEFINER is not needed:
-- the admin page reads with the service-role client, which bypasses RLS; we
-- revoke public execute so anon PostgREST callers can't enumerate counts.
CREATE OR REPLACE FUNCTION outreach_overview()
RETURNS TABLE (
  with_email bigint,
  discovery_checked bigint,
  contacted bigint,
  delivered bigint,
  opened bigint,
  clicked bigint,
  followed_up bigint,
  claimed bigint,
  replied bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    count(*) FILTER (WHERE contact_email IS NOT NULL),
    count(*) FILTER (WHERE discovered_at IS NOT NULL),
    count(*) FILTER (WHERE send_status IN ('sent','bounced','complained','unsubscribed')),
    count(*) FILTER (WHERE delivered_at IS NOT NULL),
    count(*) FILTER (WHERE opened_at IS NOT NULL),
    count(*) FILTER (WHERE clicked_at IS NOT NULL),
    count(*) FILTER (WHERE followup_sent_at IS NOT NULL),
    count(*) FILTER (WHERE status = 'claimed'),
    count(*) FILTER (WHERE status = 'replied')
  FROM operator_outreach
$$;

-- Per-campaign engagement funnel (covers first-touch and follow-up sends).
CREATE OR REPLACE FUNCTION outreach_campaign_funnel()
RETURNS TABLE (
  campaign_id text,
  delivered bigint,
  opened bigint,
  clicked bigint,
  claims bigint
)
LANGUAGE sql STABLE AS $$
  SELECT c.cid,
    count(*) FILTER (WHERE oo.delivered_at IS NOT NULL),
    count(*) FILTER (WHERE oo.opened_at IS NOT NULL),
    count(*) FILTER (WHERE oo.clicked_at IS NOT NULL),
    count(*) FILTER (WHERE oo.status = 'claimed')
  FROM operator_outreach oo
  CROSS JOIN LATERAL (
    VALUES (oo.campaign_id), (oo.followup_campaign_id)
  ) AS c(cid)
  WHERE c.cid IS NOT NULL
  GROUP BY c.cid
$$;

REVOKE EXECUTE ON FUNCTION outreach_overview() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION outreach_campaign_funnel() FROM PUBLIC, anon, authenticated;
