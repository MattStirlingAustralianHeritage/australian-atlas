-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 230: Outreach batch email
-- ============================================================
-- Turns the manual outreach tracker into a real batch-email system.
-- All additive / idempotent — safe to re-run.
--
-- Design notes:
--   * operator_outreach already exists (mig 061) as the per-listing funnel
--     row (status: not_contacted / contacted / claimed / declined). We layer
--     email-delivery state onto it rather than forking a second table.
--   * outreach_suppressions is the do-not-email list (unsubscribes, bounces,
--     complaints). Checked before every send — legally required (Spam Act 2003
--     functional unsubscribe) and protects sender reputation.
--   * outreach_campaigns is a lightweight batch-summary row for history.
-- ============================================================

-- 1. Email-delivery columns on the existing funnel table -----
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS email_source text;        -- 'manual' | 'website' | 'vertical'
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS send_status text;         -- NULL | 'sent' | 'failed' | 'bounced' | 'complained' | 'unsubscribed'
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS resend_message_id text;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS send_error text;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS campaign_id text;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS discovered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_outreach_send_status ON operator_outreach (send_status);
CREATE INDEX IF NOT EXISTS idx_outreach_campaign ON operator_outreach (campaign_id);
-- Case-insensitive email lookups (suppression joins, dedup).
CREATE INDEX IF NOT EXISTS idx_outreach_contact_email_lower ON operator_outreach (lower(contact_email));

-- 2. Suppression list (do-not-email) -------------------------
CREATE TABLE IF NOT EXISTS outreach_suppressions (
  email       text PRIMARY KEY,                 -- always stored lower-cased
  reason      text NOT NULL DEFAULT 'unsubscribed', -- 'unsubscribed' | 'bounced' | 'complained' | 'manual'
  listing_id  uuid REFERENCES listings(id) ON DELETE SET NULL,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppressions_reason ON outreach_suppressions (reason);

-- 3. Campaign summaries --------------------------------------
CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id          text PRIMARY KEY,                 -- e.g. 'cmp_2026-07-07_a1b2'
  name        text,
  subject     text,
  body        text,
  segment     jsonb,                            -- the filter snapshot used
  total       integer NOT NULL DEFAULT 0,
  sent        integer NOT NULL DEFAULT 0,
  failed      integer NOT NULL DEFAULT 0,
  skipped     integer NOT NULL DEFAULT 0,
  test_mode   boolean NOT NULL DEFAULT false,
  status      text NOT NULL DEFAULT 'sent',     -- 'draft' | 'sending' | 'sent'
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_created ON outreach_campaigns (created_at DESC);
