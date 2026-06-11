-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 157: Operator highlights (operator-authored "right now" layer)
-- ============================================================
--
-- A single JSONB column holding the operator-owned, timely highlight layer:
-- what a place is doing right now (the beans on the roaster, the stout on tap,
-- the term enrolling, the exhibition on show) plus a universal hiring signal.
--
-- Shape (validated app-side in lib/operator-highlights/normalize.js):
--   {
--     "hiring": { "open": bool, "url": text|null, "note": text|null },
--     "fields": { "<fieldKey>": text | text[] },   -- typed per vertical/sub_type
--     "updated_at": timestamptz
--   }
--
-- MASTER-ONLY / SYNC-SAFE: this column is never written to a vertical source DB
-- and is never set by the inbound sync field maps (lib/sync/fieldMaps.js), so an
-- inbound sync can't clobber it — the same "safe by omission" contract as
-- listings.hours and the photo-gallery manifest. No vertical-DB DDL is required.

ALTER TABLE listings ADD COLUMN IF NOT EXISTS operator_highlights jsonb;

COMMENT ON COLUMN listings.operator_highlights IS
  'Operator-authored timely highlights + hiring signal. Master-only, never synced. See lib/operator-highlights/.';

-- Partial index over listings that are actively hiring — backs a future
-- network-wide "jobs across the Atlas" view without scanning every row.
CREATE INDEX IF NOT EXISTS listings_hiring_idx
  ON listings ((operator_highlights -> 'hiring' ->> 'open'))
  WHERE operator_highlights -> 'hiring' ->> 'open' = 'true';
