-- 269_closure_sweep.sql
--
-- Monthly closure sweep: a deep, budget-governed pass over every active
-- listing looking for permanently closed and temporarily shut venues
-- (/api/cron/closure-sweep, reviewed at /admin/closures).
--
-- Why a review table and not automatic hiding: the 2026-07 liveness audit
-- measured Google Places CLOSED_PERMANENTLY at ~60% false positives on this
-- dataset (rebrands, wrong matches, stale Google data). The sweep therefore
-- writes ONLY to closure_signals; every listing-state change (hide, mark
-- temporarily closed, clear) is a manual admin action taken in the console.
-- This mirrors listing_gate_check's contract.
--
--   closure_signals — one OPEN row per listing awaiting a human verdict.
--     signal      what the evidence suggests:
--                   closed_permanently  venue looks gone for good
--                   closed_temporarily  venue looks paused (season/renos)
--                   possibly_closed     weak evidence (dead site, no
--                                       corroboration) — low confidence
--                   reopened            a venue we marked temporarily closed
--                                       now reports OPERATIONAL again
--     confidence  high | medium | low — how strongly the evidence agrees.
--     reasons     jsonb array of human-readable one-liners.
--     evidence    jsonb blob: Places status/name/name-match, website probe
--                 classification + HTTP code, closure phrases found on the
--                 venue's own site, community reports count.
--     status      open → actioned | dismissed. A dismissed signal suppresses
--                 re-flagging the same signal type for 90 days (the sweep
--                 checks resolved_at), so a false positive doesn't nag monthly.
--     resolution  what the admin chose: hidden_permanent | marked_temporary |
--                 cleared_temporary | dismissed.
--
-- New listings columns (all master-only; the source→master sync never reads
-- or writes them, like website_status):
--   closure_checked_at — when the sweep last deep-checked this listing. The
--                        monthly sweep is self-draining: it processes active
--                        listings whose stamp predates the current Melbourne
--                        month, oldest first, across daily continuation runs,
--                        and stops touching anything once the month is covered.
--   closure_status     — 'temporarily_closed' or NULL. Deliberately NOT a
--                        listings.status value: migration 153's CHECK
--                        constraint allowlist would reject it, and a
--                        temporarily closed venue should stay publicly
--                        visible (with a badge) rather than vanish.
--   closure_noted_at   — when the admin marked it temporarily closed.
--   google_place_id    — cached Places match so next month's sweep can skip
--                        the Text Search and go straight to Place Details
--                        (less than half the per-listing cost). Only cached on
--                        a confident (>= 0.62) name match.

CREATE TABLE IF NOT EXISTS closure_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  agent_run_id uuid REFERENCES agent_runs(id),
  signal text NOT NULL CHECK (signal IN ('closed_permanently', 'closed_temporarily', 'possibly_closed', 'reopened')),
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  reasons jsonb NOT NULL DEFAULT '[]',
  evidence jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  resolution text CHECK (resolution IS NULL OR resolution IN ('hidden_permanent', 'marked_temporary', 'cleared_temporary', 'dismissed')),
  resolved_at timestamptz,
  resolved_by text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Service-role only (cron + admin console). No policies on purpose: RLS with
-- zero policies denies anon/authenticated, and service_role bypasses RLS.
ALTER TABLE closure_signals ENABLE ROW LEVEL SECURITY;

-- One live question per venue — a re-sweep refreshes the open row in place.
CREATE UNIQUE INDEX IF NOT EXISTS idx_closure_signals_one_open
  ON closure_signals (listing_id)
  WHERE status = 'open';

-- The console's main read: open signals, newest first.
CREATE INDEX IF NOT EXISTS idx_closure_signals_review
  ON closure_signals (status, detected_at DESC);

-- The sweep's dismissed-recently suppression lookup.
CREATE INDEX IF NOT EXISTS idx_closure_signals_listing
  ON closure_signals (listing_id, resolved_at DESC);

ALTER TABLE listings ADD COLUMN IF NOT EXISTS closure_checked_at timestamptz;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS closure_status text
  CHECK (closure_status IS NULL OR closure_status IN ('temporarily_closed'));
ALTER TABLE listings ADD COLUMN IF NOT EXISTS closure_noted_at timestamptz;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS google_place_id text;

COMMENT ON COLUMN listings.closure_checked_at IS
  'When the monthly closure sweep last deep-checked this listing. NULL = never. Master-only; drives the self-draining monthly filter.';
COMMENT ON COLUMN listings.closure_status IS
  'temporarily_closed = venue is paused but stays publicly visible with a badge. NULL = trading normally. Master-only display metadata, set/cleared by an admin in /admin/closures — never by the sweep itself.';
COMMENT ON COLUMN listings.google_place_id IS
  'Cached Google Places place_id from a confident closure-sweep name match. Cost cache only — never treated as identity truth.';

-- The sweep's work queue: active listings not yet checked this month,
-- oldest stamp first (NULLs, i.e. never checked, come first).
CREATE INDEX IF NOT EXISTS idx_listings_closure_sweep
  ON listings (closure_checked_at ASC NULLS FIRST)
  WHERE status = 'active';

-- Badge reads are tiny: only rows actually flagged.
CREATE INDEX IF NOT EXISTS idx_listings_closure_status
  ON listings (closure_status)
  WHERE closure_status IS NOT NULL;

-- Refresh PostgREST's schema cache so the new table/columns are visible
-- without a manual reload (see _MANUAL_RUNS.md).
NOTIFY pgrst, 'reload schema';
