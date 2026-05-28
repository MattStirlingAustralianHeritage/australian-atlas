-- Plan-a-Stay v2: RPC for simplified region polygons as GeoJSON.
-- Used by the region map selector in the planner UI.
-- Returns simplified MultiPolygon geometries to keep payload under 500KB.

CREATE OR REPLACE FUNCTION get_plan_a_stay_regions_geojson(
  region_names TEXT[],
  simplify_tolerance FLOAT DEFAULT 0.01
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  state TEXT,
  geojson TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.id,
    r.name,
    r.slug,
    r.state,
    ST_AsGeoJSON(
      ST_SimplifyPreserveTopology(r.polygon, simplify_tolerance)
    ) AS geojson
  FROM regions r
  WHERE r.name = ANY(region_names)
    AND r.polygon IS NOT NULL;
$$;
