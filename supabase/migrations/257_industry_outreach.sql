-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 257: Industry outreach (industry bodies & partners)
-- ============================================================
-- Fourth outreach audience after operator (230/231/251), council (243),
-- press (253) and trade (244/254): a directory of INDUSTRY ORGANISATIONS —
-- peak bodies, associations, tourism organisations, government programs,
-- education providers — and named CONTACTS inside them, plus the funnel +
-- delivery state to introduce them to the Atlas (member visibility, regional
-- data, partnership).
--
-- Mirrors press_outreach (migration 253): industry contacts have no listings,
-- so industry_outreach is BOTH the directory (who they are, their org, their
-- sector focus, the Atlas region they cover) AND the funnel/delivery row.
-- Suppressions and campaign summaries are SHARED with the other audiences —
-- the do-not-email list is email-keyed and audience-blind by design (one
-- unsubscribe silences us everywhere), and campaigns already carry an
-- `audience` column (added in 243) which industry sends stamp 'industry'.
--
-- All additive / idempotent — safe to re-run.
-- ============================================================

-- 1. Industry directory + funnel + delivery state ----------------
CREATE TABLE IF NOT EXISTS industry_outreach (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL DEFAULT 'org',  -- 'org' | 'contact'
  org_name          text NOT NULL,               -- organisation, e.g. 'Tourism Industry Council Tasmania'
  contact_name      text,                        -- named person (NULL for a generic org row)
  role_title        text,                        -- e.g. 'CEO', 'Membership Manager', 'Secretariat'
  org_type          text,                        -- peak_body | association | tourism_org | government | education | other
  focus             text[] NOT NULL DEFAULT '{}', -- e.g. {wine, tourism, hospitality, craft}
  state             text,                        -- geographic focus (NSW|VIC|QLD|SA|WA|TAS|NT|ACT), NULL = national
  region_id         uuid REFERENCES regions(id) ON DELETE SET NULL,
  region_name       text,                        -- denormalised display name (kept when no FK match)
  website           text,                        -- org / contact-page URL (email discovery scrapes this)
  contact_email     text,
  linkedin          text,                        -- social handle / URL (informational, never emailed)
  email_source      text,                        -- provenance while email set ('manual'|'website'|'import'|'seed');
                                                 -- last check outcome while null ('dead'|'no_email'|'blocked')
  discovered_at     timestamptz,
  personal_note     text,                        -- AI/edited opener ({{personal_note}})
  personal_note_generated_at timestamptz,
  status            text NOT NULL DEFAULT 'not_contacted',  -- not_contacted | contacted | responded | partnered | declined
  send_status       text,                        -- NULL | sent | failed | bounced | complained | unsubscribed
  resend_message_id text,
  sent_at           timestamptz,
  delivered_at      timestamptz,                 -- resend webhook (delivery)
  opened_at         timestamptz,                 -- resend webhook (first open)
  open_count        integer NOT NULL DEFAULT 0,
  send_error        text,
  campaign_id       text,
  -- Single follow-up ("last note from me") N days after the first touch.
  followup_sent_at            timestamptz,
  followup_resend_message_id  text,
  followup_campaign_id        text,
  notes             text,
  last_contacted_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Import/manual-add dedup key (expression index: PostgREST upsert can't target
-- it, so writers read-then-write — fine for an admin tool). Keyed on the
-- identity triple so an org may hold several contacts that differ by name or
-- email, but never an exact duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_industry_outreach_identity
  ON industry_outreach (lower(org_name), lower(coalesce(contact_name, '')), lower(coalesce(contact_email, '')));

CREATE INDEX IF NOT EXISTS idx_industry_outreach_send_status ON industry_outreach (send_status);
CREATE INDEX IF NOT EXISTS idx_industry_outreach_campaign ON industry_outreach (campaign_id);
CREATE INDEX IF NOT EXISTS idx_industry_outreach_email_lower ON industry_outreach (lower(contact_email));
CREATE INDEX IF NOT EXISTS idx_industry_outreach_kind ON industry_outreach (kind);
CREATE INDEX IF NOT EXISTS idx_industry_outreach_state ON industry_outreach (state);
CREATE INDEX IF NOT EXISTS idx_industry_outreach_focus ON industry_outreach USING gin (focus);

-- Service-role only (same posture as press_outreach / council_outreach):
-- RLS on with no policies; the admin routes use getSupabaseAdmin which bypasses.
ALTER TABLE industry_outreach ENABLE ROW LEVEL SECURITY;

-- 2. Campaign audience already exists (migration 243, default 'operator').
-- Industry sends stamp audience 'industry'; no schema change needed here. This
-- is a no-op guard in case 243 has not run on the target DB.
ALTER TABLE outreach_campaigns ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'operator';

-- Reload PostgREST schema cache so the new relation is visible to the API.
NOTIFY pgrst, 'reload schema';
