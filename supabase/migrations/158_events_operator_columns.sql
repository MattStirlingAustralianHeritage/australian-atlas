-- 158: operator (listing-hosted) events on the canonical events table.
--
-- WHY: the operator-events module (lib/events.js, dashboard editor "Events"
-- perk) was written against the OLD minimal 061 events schema. Migration 155
-- renamed that table away and rebuilt `events` verbatim from 009 (the
-- community-submission pipeline), which has none of the operator columns —
-- so every operator read/write 400s ("Could not find the 'created_by' column
-- of 'events' in the schema cache"), and the public /events index, which reads
-- through the same module, renders empty.
--
-- FIX: additive columns only. Community-pipeline rows and their constraints
-- are untouched. Operator rows satisfy 009's NOT NULLs by deriving values
-- from the hosting listing (location_name = listing name, image_url falls
-- back to the listing hero, end_date = start_date for single-day events) and
-- from the authenticated session (submitter_*). Operator rows are
-- auto-approved (status='approved'); their visibility is governed by the new
-- `published` boolean. Community rows keep published = NULL (status governs).
--
--   published IS NOT FALSE  AND  status = 'approved'   → publicly visible
--
-- Apply via the Supabase SQL editor (portal project nyhkcmvhwbydsqsyvizs).

ALTER TABLE events ADD COLUMN IF NOT EXISTS listing_id uuid REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE events ADD COLUMN IF NOT EXISTS published boolean;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_free boolean;
ALTER TABLE events ADD COLUMN IF NOT EXISTS category_label text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMENT ON COLUMN events.listing_id IS 'Hosting listing for operator-authored events (paid perk); NULL for community submissions.';
COMMENT ON COLUMN events.created_by IS 'auth.users id of the operator who authored the event; NULL for community submissions.';
COMMENT ON COLUMN events.published IS 'Operator visibility toggle: true = live, false = draft. NULL for community rows (status governs).';
COMMENT ON COLUMN events.is_free IS 'Operator-declared free-to-attend flag; NULL for community rows.';
COMMENT ON COLUMN events.category_label IS 'Operator''s free-text category label (e.g. "Tasting"); `category` holds the nearest constrained key for filtering.';

-- Owner editor + place-page lookups.
CREATE INDEX IF NOT EXISTS events_listing_idx ON events(listing_id, start_date);

-- ── Verification (run after) ─────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'events'
--     AND column_name IN ('listing_id','created_by','published','is_free','category_label','updated_at');
-- Expect 6 rows. Community rows unaffected:
-- SELECT count(*) FROM events WHERE listing_id IS NULL; -- unchanged count
