-- 200: Multi-value presence for non-visitable listings
--
-- A non-visitable maker can genuinely operate in more than one way at once —
-- e.g. sells at markets AND takes online orders AND welcomes visits by
-- appointment. The scalar `listings.presence_type` (migration 087) can only
-- hold one CHECK-constrained value and is wired deep into search, place pages,
-- discover, trail-eligibility filters and embeddings, so it stays the single
-- authoritative "primary" presence for all of those consumers.
--
-- This migration adds `presence_types text[]` to capture the FULL set the
-- reviewer selected in /admin/candidates. `presence_type` remains the primary
-- (the review UI derives it from the array by priority: by_appointment >
-- markets > online > seasonal), so nothing downstream changes behaviour.
-- The array is additive, nullable, and only populated for non-visitable
-- listings (permanent / mobile carry their meaning in the scalar).
--
-- Portal (master) DB only. Vertical DBs continue to receive just the scalar
-- presence_type via lib/sync/pushToVertical.js and are untouched.

ALTER TABLE listings ADD COLUMN IF NOT EXISTS presence_types TEXT[];

-- Backfill: existing non-visitable rows get a single-element array mirroring
-- their current scalar, so the new column is consistent from day one. Rows
-- that are permanent / mobile (visitable) stay NULL.
UPDATE listings
SET presence_types = ARRAY[presence_type]
WHERE presence_type IN ('by_appointment', 'markets', 'online', 'seasonal')
  AND presence_types IS NULL;

-- GIN index for future array-membership queries (e.g. trail eligibility that
-- wants "any listing that can be visited by appointment" regardless of primary).
CREATE INDEX IF NOT EXISTS idx_listings_presence_types
  ON listings USING GIN (presence_types);

NOTIFY pgrst, 'reload schema';
