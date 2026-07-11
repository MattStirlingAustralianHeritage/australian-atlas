-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 244: Trade outreach
-- ============================================================
-- Travel-trade counterpart of the operator (230/231) and council (243)
-- batch-email systems. The audience is trade buyers — inbound tour operators,
-- DMCs, wholesalers, travel agents, trip designers — being invited to the free
-- Atlas Trade founding beta (/for-trade). Like councils they have no listings,
-- so trade_outreach is BOTH the directory (which companies exist, their
-- official website, what they sell) AND the funnel/delivery row. Suppressions
-- stay shared and email-keyed (one unsubscribe silences us everywhere), and
-- campaign summaries reuse outreach_campaigns with audience = 'trade'
-- (column added by migration 243).
-- All additive / idempotent — safe to re-run.
-- ============================================================

-- 1. Trade directory + funnel + delivery state -----------------
CREATE TABLE IF NOT EXISTS trade_outreach (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name      text NOT NULL,               -- trading name, e.g. 'AAT Kings'
  org_type          text,                        -- tour_operator | inbound_operator | dmc | wholesaler | travel_agent | trip_designer | other
  state             text,                        -- HQ state: NSW | VIC | QLD | SA | WA | TAS | NT | ACT
  website           text,                        -- official site (email discovery scrapes this)
  region_id         uuid REFERENCES regions(id) ON DELETE SET NULL,
  region_name       text,                        -- denormalised focus-region name (kept when no FK match)
  focus             text,                        -- short phrase: what they sell, e.g. 'Small-group 4WD touring, outback SA/NT'
  contact_name      text,
  contact_role      text,                        -- e.g. 'Product Manager', 'Director'
  contact_email     text,
  email_source      text,                        -- provenance while email set ('manual'|'website'|'import');
                                                 -- last check outcome while null ('dead'|'no_email'|'blocked')
  discovered_at     timestamptz,
  personal_note     text,                        -- AI/edited opener ({{personal_note}})
  personal_note_generated_at timestamptz,
  status            text NOT NULL DEFAULT 'not_contacted',  -- not_contacted | contacted | responded | onboarded | declined
  send_status       text,                        -- NULL | sent | failed | bounced | complained | unsubscribed
  resend_message_id text,
  sent_at           timestamptz,
  send_error        text,
  campaign_id       text,
  notes             text,
  last_contacted_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Import/manual-add dedup key (expression index: PostgREST upsert can't target
-- it, so writers read-then-write — fine for an admin tool).
CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_outreach_name_state
  ON trade_outreach (lower(company_name), coalesce(state, ''));

CREATE INDEX IF NOT EXISTS idx_trade_outreach_send_status ON trade_outreach (send_status);
CREATE INDEX IF NOT EXISTS idx_trade_outreach_campaign ON trade_outreach (campaign_id);
CREATE INDEX IF NOT EXISTS idx_trade_outreach_email_lower ON trade_outreach (lower(contact_email));
CREATE INDEX IF NOT EXISTS idx_trade_outreach_region ON trade_outreach (region_id);
CREATE INDEX IF NOT EXISTS idx_trade_outreach_org_type ON trade_outreach (org_type);

-- Service-role only (same posture as council_outreach): RLS on with no
-- policies; the admin routes use getSupabaseAdmin which bypasses.
ALTER TABLE trade_outreach ENABLE ROW LEVEL SECURITY;

-- Reload PostgREST schema cache so the new relation is visible to the API.
NOTIFY pgrst, 'reload schema';
