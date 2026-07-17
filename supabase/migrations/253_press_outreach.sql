-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 253: Press outreach (outbound media relations)
-- ============================================================
-- Outbound counterpart of the Newsroom (migration 252 is INBOUND — journalists
-- subscribe to receive story leads). This is the reverse: a directory of press
-- DESKS (a masthead's newsdesk/tips line) and named JOURNALISTS (with a beat),
-- plus the funnel + delivery state to proactively pitch them the Atlas — the
-- newsroom, the data room, and story intros.
--
-- Mirrors council_outreach (migration 243): press contacts have no listings, so
-- press_outreach is BOTH the directory (who they are, their outlet, beat, the
-- Atlas region they cover) AND the funnel/delivery row. Suppressions and
-- campaign summaries are SHARED with operator/council outreach — the
-- do-not-email list is email-keyed and audience-blind by design (one
-- unsubscribe silences us everywhere), and campaigns already carry an
-- `audience` column (added in 243) which press sends stamp 'press'.
--
-- All additive / idempotent — safe to re-run.
-- ============================================================

-- 1. Press directory + funnel + delivery state ----------------
CREATE TABLE IF NOT EXISTS press_outreach (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL DEFAULT 'journalist',  -- 'desk' | 'journalist'
  outlet_name       text NOT NULL,               -- masthead / publication, e.g. 'The Sydney Morning Herald'
  journalist_name   text,                        -- named reporter (NULL for a desk row)
  role_title        text,                        -- e.g. 'Travel Editor', 'Newsdesk', 'Food writer'
  beat              text[] NOT NULL DEFAULT '{}', -- e.g. {travel, food, regional, tourism, lifestyle}
  state             text,                        -- geographic focus (NSW|VIC|QLD|SA|WA|TAS|NT|ACT), NULL = national
  region_id         uuid REFERENCES regions(id) ON DELETE SET NULL,
  region_name       text,                        -- denormalised display name (kept when no FK match)
  website           text,                        -- outlet / staff-page URL (email discovery scrapes this)
  contact_email     text,
  twitter           text,                        -- social handle (informational, never emailed)
  email_source      text,                        -- provenance while email set ('manual'|'website'|'import'|'seed');
                                                 -- last check outcome while null ('dead'|'no_email'|'blocked')
  discovered_at     timestamptz,
  personal_note     text,                        -- AI/edited opener ({{personal_note}})
  personal_note_generated_at timestamptz,
  status            text NOT NULL DEFAULT 'not_contacted',  -- not_contacted | contacted | responded | featured | declined
  send_status       text,                        -- NULL | sent | failed | bounced | complained | unsubscribed
  resend_message_id text,
  sent_at           timestamptz,
  delivered_at      timestamptz,                 -- resend webhook (delivery)
  opened_at         timestamptz,                 -- resend webhook (first open) — the key press KPI
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
-- identity triple so an outlet may hold several desks/journalists that differ
-- by name or email, but never an exact duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_press_outreach_identity
  ON press_outreach (lower(outlet_name), lower(coalesce(journalist_name, '')), lower(coalesce(contact_email, '')));

CREATE INDEX IF NOT EXISTS idx_press_outreach_send_status ON press_outreach (send_status);
CREATE INDEX IF NOT EXISTS idx_press_outreach_campaign ON press_outreach (campaign_id);
CREATE INDEX IF NOT EXISTS idx_press_outreach_email_lower ON press_outreach (lower(contact_email));
CREATE INDEX IF NOT EXISTS idx_press_outreach_kind ON press_outreach (kind);
CREATE INDEX IF NOT EXISTS idx_press_outreach_state ON press_outreach (state);
CREATE INDEX IF NOT EXISTS idx_press_outreach_beat ON press_outreach USING gin (beat);

-- Service-role only (same posture as council_outreach / press_* tables):
-- RLS on with no policies; the admin routes use getSupabaseAdmin which bypasses.
ALTER TABLE press_outreach ENABLE ROW LEVEL SECURITY;

-- 2. Campaign audience already exists (migration 243, default 'operator').
-- Press sends stamp audience 'press'; no schema change needed here. This is a
-- no-op guard in case 243 has not run on the target DB.
ALTER TABLE outreach_campaigns ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'operator';

-- Reload PostgREST schema cache so the new relation is visible to the API.
NOTIFY pgrst, 'reload schema';
