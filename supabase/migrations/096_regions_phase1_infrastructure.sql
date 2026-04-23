-- ============================================================
-- Regions architecture — Phase 1 infrastructure
-- See docs/architecture/regions.md
--
-- Covers Steps 1.1 through 1.4 of the Implementation Plan:
--   1.1 Enable PostGIS extension
--   1.2 Add regions.polygon column (MultiPolygon, SRID 4326) + GIST index
--   1.3 Add listings.region_computed_id + region_override_id FK columns
--       (both UUID NULL REFERENCES regions(id) ON DELETE SET NULL)
--       with B-tree indices
--   1.4 Verification — not in migration; see verify-phase1 script output
--
-- Notes:
--   - Legacy listings.region text column is preserved. Deprecation
--     happens in Phase 3 per the implementation plan.
--   - Polygons are populated in a separate task before Phase 2.
--   - The spatial containment trigger (Step 1.5) lands in a later
--     migration.
--   - FK uses ON DELETE SET NULL as defensive behaviour per Edge
--     Case 9; regions are never hard-deleted (status='archived').
-- ============================================================

-- 1.1 — PostGIS
create extension if not exists postgis;

-- 1.2 — regions.polygon + GIST index
alter table regions
  add column if not exists polygon geometry(MultiPolygon, 4326);

create index if not exists regions_polygon_gist on regions using gist (polygon);

-- 1.3 — listings region FK columns + B-tree indices
alter table listings
  add column if not exists region_computed_id uuid null references regions(id) on delete set null,
  add column if not exists region_override_id uuid null references regions(id) on delete set null;

create index if not exists listings_region_computed_id_idx on listings (region_computed_id);
create index if not exists listings_region_override_id_idx on listings (region_override_id);
