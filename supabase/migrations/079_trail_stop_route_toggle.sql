-- ============================================================
-- 079: Trail stop route toggle + saved_via field
-- Supports interactive route editing: users can toggle individual
-- stops in/out of the active driving route.
-- ============================================================

-- Per-stop toggle: false = stop is excluded from the driving route
-- but remains visible in the itinerary list as a "detour" option.
-- Defaults to true so all existing saved trails render unchanged.
ALTER TABLE trail_stops
  ADD COLUMN IF NOT EXISTS included_in_route BOOLEAN NOT NULL DEFAULT true;

-- Distinguish how a trail was created:
--   'explicit' — user clicked "Save trail"
--   'share'    — auto-saved when user clicked "Share" (may be anonymous)
-- Nullable for existing rows (treated as 'explicit').
ALTER TABLE trails
  ADD COLUMN IF NOT EXISTS saved_via TEXT;
