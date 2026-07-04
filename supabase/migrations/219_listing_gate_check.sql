-- 219: listing_gate_check — retroactive quality-gate sweep queue.
--
-- The Gate Check sweep runs the prospector's *quality gates* (originally built to
-- vet NEW candidates at intake — lib/prospector/gates.js) retroactively against
-- every LIVE listing, and surfaces the ones that FAIL in /admin/gate-check so a
-- human can Pass / Hide / Delete them quickly.
--
-- Gates applied to a live listing (adapted from the intake pipeline):
--   • Gate 1 — Web Presence   : the listing's existing website is dead / parked /
--                               thin / points at an unrelated business.
--   • Gate 2 — Location       : coordinates fall outside Australia or in a
--                               different state than the listing claims.
--   • Gate 3 — Activity       : a reachable website shows no sign of an operating
--                               business (dormant).
--   • Gate 4 — Vertical Fit   : the name matches a service-trade disqualifier
--                               (glazier, plumber, …) — not a visitable place.
--                               (An on-demand LLM fit check is also available.)
--
-- HARD INVARIANTS (identical discipline to listing_review_queue / migration 153):
--   • The sweep writes ONLY to this table. It never mutates listings. Every
--     status change (Hide/Delete) is a manual admin action taken here.
--   • Portal-canonical: this table lives only in the portal project
--     (nyhkcmvhwbydsqsyvizs). Vertical source DBs are never touched.
--   • No hard deletes. "Delete" is the reversible soft-delete listing status
--     'deleted' (already added in migration 153); rows are restorable from Trash.
--
-- One row per flagged listing (UNIQUE listing_id) so re-sweeps upsert in place
-- and never duplicate. A listing that fails MULTIPLE gates gets one row whose
-- failed_gates / gate_details carry them all.

CREATE TABLE IF NOT EXISTS listing_gate_check (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  scanned_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Every gate this listing failed, e.g. {'gate1_web','gate2_location'}.
  failed_gates      TEXT[] NOT NULL DEFAULT '{}',
  -- Per-gate specifics: [{ gate, code, severity, reason }, ...] (JSON).
  gate_details      JSONB NOT NULL DEFAULT '[]',
  -- The single most-severe gate id (drives sorting / the badge).
  primary_gate      TEXT,
  -- Flat human-readable summary of every failure (for display + search).
  reason_summary    TEXT NOT NULL DEFAULT '',

  -- Overall severity + the recommended course of action for the admin.
  severity          TEXT NOT NULL DEFAULT 'low'
                      CHECK (severity IN ('high', 'medium', 'low')),
  suggested_action  TEXT NOT NULL DEFAULT 'pass'
                      CHECK (suggested_action IN ('pass', 'hide', 'delete')),

  -- Snapshots captured at scan time (display only).
  website           TEXT,
  http_status       INT,

  -- Lifecycle. 'pending' = awaiting review; the others mirror the action taken.
  --   pass  -> 'passed'  (listing kept active, flag cleared)
  --   hide  -> 'hidden'  (listing hidden)
  --   delete-> 'deleted' (listing soft-deleted; restorable from Trash)
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'passed', 'hidden', 'deleted')),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT,

  UNIQUE (listing_id)
);

-- Queue view: pending first, most-severe first.
CREATE INDEX IF NOT EXISTS listing_gate_check_status_sev_idx
  ON listing_gate_check (status, severity);

-- Filter by suggested action.
CREATE INDEX IF NOT EXISTS listing_gate_check_action_idx
  ON listing_gate_check (suggested_action);

-- Lookups by listing.
CREATE INDEX IF NOT EXISTS listing_gate_check_listing_idx
  ON listing_gate_check (listing_id);
