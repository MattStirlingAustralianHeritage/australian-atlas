-- 166: Harden the nearby_listings RPC so it can power the place-page
--      "Nearby on Australian Atlas" map + list and the /api/nearby endpoint.
--
-- The original RPC (007) returned true distance-ordered neighbours but
-- (a) omitted the privacy / visitability guards every other public location
-- surface applies, and (b) returned too few columns for the map (no sub_type,
-- is_featured, is_claimed, editors_pick, verticals). The place page and
-- /api/nearby therefore did their own bounding-box query capped at 120/200
-- rows with NO distance ordering — in dense origins that truncates the
-- candidate set before "nearest" is computed, so genuinely-close venues can
-- silently drop off the map. This RPC returns the real nearest N with all the
-- fields the UI needs, removing the truncation entirely.
--
-- Return-type change requires a DROP first (Postgres can't REPLACE a function
-- whose OUT columns differ).

DROP FUNCTION IF EXISTS nearby_listings(float8, float8, float8, text, int);

CREATE OR REPLACE FUNCTION nearby_listings(
  center_lat      float8,
  center_lng      float8,
  radius_km       float8 DEFAULT 25,
  filter_vertical text   DEFAULT NULL,
  max_results     int    DEFAULT 60
)
RETURNS TABLE (
  id              uuid,
  vertical        text,
  verticals       text[],
  name            text,
  slug            text,
  description     text,
  region          text,
  state           text,
  lat             float8,
  lng             float8,
  hero_image_url  text,
  sub_type        text,
  is_featured     boolean,
  is_claimed      boolean,
  editors_pick    boolean,
  distance_km     float8
)
LANGUAGE sql STABLE
AS $$
  SELECT
    l.id, l.vertical, l.verticals, l.name, l.slug, l.description,
    l.region, l.state, l.lat, l.lng, l.hero_image_url, l.sub_type,
    l.is_featured, l.is_claimed, l.editors_pick,
    st_distancesphere(
      st_point(l.lng, l.lat),
      st_point(center_lng, center_lat)
    ) / 1000.0 AS distance_km
  FROM listings l
  WHERE
    l.status = 'active'
    AND l.lat IS NOT NULL
    AND l.lng IS NOT NULL
    -- CLAUDE.md hard rule: needs_review=true venues never surface publicly.
    AND (l.needs_review IS NULL OR l.needs_review = false)
    -- Privacy: never surface exact coordinates of address-hidden venues.
    AND (l.address_on_request IS NULL OR l.address_on_request = false)
    -- Visitability: physical / by-appointment venues only — online,
    -- market-only and mobile makers have no fixed pin to show.
    AND (l.visitable IS NULL OR l.visitable = true OR l.presence_type = 'by_appointment')
    AND (filter_vertical IS NULL OR l.vertical = filter_vertical OR l.verticals @> ARRAY[filter_vertical])
    AND st_distancesphere(
          st_point(l.lng, l.lat),
          st_point(center_lng, center_lat)
        ) / 1000.0 <= radius_km
  ORDER BY distance_km ASC
  LIMIT max_results;
$$;

-- Reload PostgREST so the new signature is callable via the data API.
NOTIFY pgrst, 'reload schema';
