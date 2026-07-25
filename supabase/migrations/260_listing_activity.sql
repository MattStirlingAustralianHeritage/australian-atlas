-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 260: listing_activity
--
-- A durable record of what PEOPLE do to listings — an operator adding
-- photos, fixing their hours, swapping the hero image, submitting a
-- description; an admin editing on their behalf.
--
-- Until now none of this was recoverable. updateListing() takes an
-- `action` label but only ever writes it to console (lib/admin/updateListing.js),
-- and listings.updated_at is a single scalar that the sync cron, the
-- enrichment agents and the operator all overwrite in turn — so "did the
-- owner touch this?" was unanswerable. claim_audit_log covers the claim
-- lifecycle only (created/approved/payment), never the edits that follow.
--
-- Design notes:
--   * listing_id is ON DELETE SET NULL and the listing's name/slug/vertical
--     are SNAPSHOTTED at write time. Deleting a listing must not erase the
--     record of the work its owner put in — the same contract migration 258
--     established for outreach contact history.
--   * Service-role writes only. RLS is on with no policies, matching the
--     posture migration 171 set for the other internal tables.
--   * `action` is a free text verb, deliberately not a CHECK constraint: new
--     surfaces (offers, Q&A, trails) will add verbs, and a rejected INSERT
--     must never be able to fail an operator's save. The logger is fail-soft
--     for the same reason.
-- ============================================================

CREATE TABLE IF NOT EXISTS listing_activity (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target. SET NULL + snapshot columns: history outlives the listing.
  listing_id    UUID        REFERENCES listings(id) ON DELETE SET NULL,
  listing_name  TEXT,
  listing_slug  TEXT,
  vertical      TEXT,

  -- Actor. actor_id is the auth user (profiles.id); null for system/cron.
  actor_id      UUID,
  actor_email   TEXT,
  actor_role    TEXT        NOT NULL DEFAULT 'operator'
                            CHECK (actor_role IN ('operator', 'admin', 'system')),

  -- What happened. `action` is the verb the feed groups on
  -- ('photos_added', 'hero_image_replaced', 'hours_updated', …);
  -- `summary` is the human sentence rendered in the admin feed.
  action        TEXT        NOT NULL,
  field         TEXT,
  summary       TEXT        NOT NULL,
  details       JSONB       NOT NULL DEFAULT '{}',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The feed's default query: newest first, optionally filtered.
CREATE INDEX IF NOT EXISTS idx_listing_activity_created
  ON listing_activity (created_at DESC);

-- "Everything that happened to this listing" (listing drawer / audit trail).
CREATE INDEX IF NOT EXISTS idx_listing_activity_listing
  ON listing_activity (listing_id, created_at DESC);

-- "What has this operator been doing?"
CREATE INDEX IF NOT EXISTS idx_listing_activity_actor
  ON listing_activity (actor_id, created_at DESC);

-- Action + role filters on the feed, and the operator-only default view.
CREATE INDEX IF NOT EXISTS idx_listing_activity_action
  ON listing_activity (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_activity_role
  ON listing_activity (actor_role, created_at DESC);

-- Service-role only: no policy is defined, so anon/authenticated read nothing.
ALTER TABLE listing_activity ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE listing_activity IS
  'Human-attributed edit trail for listings (operator + admin). Written fail-soft by lib/activity/logListingActivity.js; read by /admin/activity.';
