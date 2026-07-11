-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 243: Council outreach
-- ============================================================
-- Council counterpart of the operator batch-email system (migrations 230/231).
-- Operators are reached through operator_outreach rows hanging off listings;
-- councils have no listings, so council_outreach is BOTH the directory (which
-- councils exist, their official website, which Atlas region they cover) AND
-- the funnel/delivery row. Suppressions and campaign summaries are shared with
-- operator outreach — the do-not-email list is email-keyed and audience-blind
-- by design (one unsubscribe silences us everywhere), and campaigns gain an
-- `audience` column instead of a second table.
-- All additive / idempotent — safe to re-run.
-- ============================================================

-- 1. Council directory + funnel + delivery state ---------------
CREATE TABLE IF NOT EXISTS council_outreach (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_name      text NOT NULL,               -- official LGA name, e.g. 'Byron Shire Council'
  state             text,                        -- NSW | VIC | QLD | SA | WA | TAS | NT | ACT
  website           text,                        -- official council site (email discovery scrapes this)
  region_id         uuid REFERENCES regions(id) ON DELETE SET NULL,
  region_name       text,                        -- denormalised display name (kept when no FK match)
  covers            text,                        -- short phrase: main towns in the LGA
  contact_name      text,
  contact_role      text,                        -- e.g. 'Tourism Manager', 'Economic Development'
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_council_outreach_name_state
  ON council_outreach (lower(council_name), coalesce(state, ''));

CREATE INDEX IF NOT EXISTS idx_council_outreach_send_status ON council_outreach (send_status);
CREATE INDEX IF NOT EXISTS idx_council_outreach_campaign ON council_outreach (campaign_id);
CREATE INDEX IF NOT EXISTS idx_council_outreach_email_lower ON council_outreach (lower(contact_email));
CREATE INDEX IF NOT EXISTS idx_council_outreach_region ON council_outreach (region_id);

-- Service-role only (same posture as council_enquiries/council_feedback):
-- RLS on with no policies; the admin routes use getSupabaseAdmin which bypasses.
ALTER TABLE council_outreach ENABLE ROW LEVEL SECURITY;

-- 2. Campaign audience ----------------------------------------
-- Existing rows are all operator campaigns; new council sends stamp 'council'.
ALTER TABLE outreach_campaigns ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'operator';
CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_audience ON outreach_campaigns (audience);

-- Reload PostgREST schema cache so the new relation is visible to the API.
NOTIFY pgrst, 'reload schema';
