-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 142: Cross-vertical listings
-- ============================================================
-- A listing (and a candidate) can now belong to MORE THAN ONE vertical.
-- Mirrors the multi-vertical pattern already used for articles (migration
-- 054): a `verticals text[]` column alongside the existing scalar `vertical`
-- (kept as the canonical "home"/sync key and verticals[1]).
--
-- Semantics:
--   * `vertical`  — unchanged. The primary/home vertical. Still part of the
--                   unique(vertical, source_id) identity and the sync key.
--   * `verticals` — the full set the listing appears under. ALWAYS contains
--                   `vertical`. Additional entries are admin-assigned during
--                   candidate review or in the listing editor.
--
-- Like `sub_type_secondary` (migration 077), the extra verticals are a
-- portal-owned, admin-curated field. The vertical→master sync (lib/sync/
-- syncVertical.js) never writes `verticals`, so a BEFORE trigger keeps the
-- invariant (primary always present) without the sync clobbering the array.
-- ============================================================

-- ── listings.verticals ──────────────────────────────────────
ALTER TABLE listings ADD COLUMN IF NOT EXISTS verticals text[];

COMMENT ON COLUMN listings.verticals IS
  'Cross-vertical display tags. Always contains the primary `vertical` (kept in sync by trigger listings_sync_verticals). Extra entries are admin-assigned during candidate review / listing edit and are NOT overwritten by the vertical→master sync.';

-- Backfill existing rows from the scalar column.
UPDATE listings
  SET verticals = ARRAY[vertical]
  WHERE vertical IS NOT NULL
    AND (verticals IS NULL OR verticals = '{}');

-- Containment queries (WHERE verticals @> ARRAY['sba']).
CREATE INDEX IF NOT EXISTS listings_verticals_idx ON listings USING gin(verticals);

-- ── Invariant trigger ───────────────────────────────────────
-- Guarantees `verticals` always contains the primary `vertical`:
--   * unset/empty           → verticals := [vertical]   (e.g. fresh sync inserts)
--   * primary not in array  → prepend it                (e.g. primary reassigned)
-- Admin-assigned secondary verticals are preserved untouched. Because the
-- sync upsert never lists `verticals` in its payload, an UPDATE carries the
-- existing array into NEW and this trigger leaves the secondaries intact.
CREATE OR REPLACE FUNCTION sync_listing_verticals()
RETURNS trigger AS $$
BEGIN
  IF NEW.verticals IS NULL OR array_length(NEW.verticals, 1) IS NULL THEN
    NEW.verticals := ARRAY[NEW.vertical];
  ELSIF NOT (NEW.vertical = ANY(NEW.verticals)) THEN
    NEW.verticals := ARRAY[NEW.vertical] || NEW.verticals;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS listings_sync_verticals ON listings;
CREATE TRIGGER listings_sync_verticals
  BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION sync_listing_verticals();

-- ── Recreate listings_with_region so the view exposes `verticals` ──
-- The view (migration 125) is `SELECT l.*, …region…`. Adding a column to
-- listings shifts the trailing region columns, so CREATE OR REPLACE can't be
-- used (it forbids reordering an existing view's columns) — drop and recreate
-- with the byte-identical body from 125. Verified no other object depends on
-- this view, so the drop is safe. Public region-listing reads go through it,
-- so it must continue to expose every listings column (now incl. verticals).
DROP VIEW IF EXISTS listings_with_region;
CREATE VIEW listings_with_region
WITH (security_invoker = on)
AS
SELECT
  l.*,
  coalesce(l.region_override_id, l.region_computed_id) AS region_id,
  CASE
    WHEN l.region_override_id IS NOT NULL THEN 'override'
    WHEN l.region_computed_id  IS NOT NULL THEN 'computed'
    ELSE NULL
  END AS region_resolution_source
FROM listings l;

COMMENT ON VIEW listings_with_region IS
  'Override-wins region resolution per docs/regions.md. Use for filter-by-region reads. Writes must target the listings table.';

-- Re-grant after the drop+recreate so PostgREST access is preserved regardless
-- of default-privilege settings (SSR uses the service role, but be explicit).
GRANT SELECT ON listings_with_region TO anon, authenticated, service_role;

-- ── listing_candidates.verticals ────────────────────────────
-- Carries the reviewer's vertical assignment(s) from the review queue to the
-- approve handler. No containment reads run on candidates, so no trigger here.
ALTER TABLE listing_candidates ADD COLUMN IF NOT EXISTS verticals text[];

COMMENT ON COLUMN listing_candidates.verticals IS
  'Vertical assignment(s) chosen during review. verticals[1] mirrors `vertical` (primary); extra entries become the published listing''s secondary verticals.';

UPDATE listing_candidates
  SET verticals = ARRAY[vertical]
  WHERE vertical IS NOT NULL
    AND (verticals IS NULL OR verticals = '{}');

CREATE INDEX IF NOT EXISTS candidates_verticals_idx ON listing_candidates USING gin(verticals);
