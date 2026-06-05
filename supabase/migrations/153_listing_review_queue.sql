-- 153: listing_review_queue — gate-review flagging queue.
--
-- The gate-review system scans canonical listings for ones that don't fit the
-- Atlas proposition (wrong-category junk like a window glazier, plus reserved
-- character / destination / independence gates) and surfaces them in
-- /admin/gate-review for a human to approve / hide / delete in bulk.
--
-- HARD INVARIANTS:
--   • The scanner (/api/admin/scan-gates) writes ONLY to this table. It never
--     mutates listings. Every listing-status change is a manual admin action.
--   • Portal-canonical: this table lives only in the portal project
--     (nyhkcmvhwbydsqsyvizs). Vertical source DBs are never touched.
--   • No hard deletes. "Delete" is the reversible soft-delete listing status
--     'deleted' added below; rows are restorable from the Trash view.
--
-- One row per flagged listing. reviewed_at / reviewed_by record the manual
-- action; status tracks the lifecycle (pending -> approved | hidden | deleted).

CREATE TABLE IF NOT EXISTS listing_review_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  flagged_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- How the flag was raised.
  flag_source       TEXT NOT NULL DEFAULT 'deterministic_scan'
                      CHECK (flag_source IN ('deterministic_scan', 'llm_classifier', 'manual')),
  -- Specific, human-readable reason, e.g.
  --   'Name contains "Glaziers" — matches service-trade disqualifier (glazier/glazing)'
  flag_reason       TEXT NOT NULL,
  -- Which gate the listing failed.
  gate_flagged      TEXT NOT NULL
                      CHECK (gate_flagged IN ('wrong_category', 'character', 'destination', 'independence')),
  -- 0–100. Deterministic name matches use a fixed high band; description-only a low band.
  confidence        INT NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),
  suggested_action  TEXT NOT NULL DEFAULT 'review'
                      CHECK (suggested_action IN ('hide', 'delete', 'review')),
  -- Lifecycle. 'pending' = awaiting review; the others mirror the action taken.
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'hidden', 'deleted')),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT
);

-- Queue view: pending first, highest confidence first.
CREATE INDEX IF NOT EXISTS listing_review_queue_status_conf_idx
  ON listing_review_queue (status, confidence DESC);

-- Lookups by listing.
CREATE INDEX IF NOT EXISTS listing_review_queue_listing_idx
  ON listing_review_queue (listing_id);

-- Idempotency: at most one PENDING row per listing, so re-running the scanner
-- can never create duplicate pending flags (belt-and-suspenders on top of the
-- application-level skip in /api/admin/scan-gates).
CREATE UNIQUE INDEX IF NOT EXISTS listing_review_queue_one_pending_idx
  ON listing_review_queue (listing_id) WHERE status = 'pending';

-- ── Soft-delete listing status ──────────────────────────────────────────────
-- Add 'deleted' as a reversible soft-delete state. Public surfaces use a strict
-- allowlist (status='active'), so 'deleted' — like 'hidden'/'inactive' — is
-- excluded from every public surface, the map, and the sitemap. No hard delete
-- is ever performed; 'deleted' rows are restorable from the gate-review Trash.
-- (Original constraint: migration 002; 'hidden' added in migration 037.)
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('active', 'inactive', 'pending', 'hidden', 'deleted'));
