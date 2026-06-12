-- 159: search_events — respect operator drafts + return display fields.
--
-- WHY: 155's search_events predates the operator-events columns (158), so it
-- would surface UNPUBLISHED operator drafts (it only checks status='approved';
-- operator rows are always approved with visibility on the `published` bool).
-- It also can't return category_label / is_free / listing_id, which the
-- search-page event cards need. The function was dormant until now (main
-- search integration, 2026-06-12), so the signature change is zero-risk.
--
-- DROP first: CREATE OR REPLACE cannot change a function's RETURNS TABLE.

DROP FUNCTION IF EXISTS search_events(text, text, text, text, int, int);

CREATE FUNCTION search_events(
  query text DEFAULT NULL,
  state_filter text DEFAULT NULL,
  category_filter text DEFAULT NULL,
  vertical_filter text DEFAULT NULL,
  result_limit int DEFAULT 20,
  result_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  description text,
  start_date date,
  end_date date,
  location_name text,
  suburb text,
  state text,
  lat float8,
  lng float8,
  website_url text,
  ticket_url text,
  image_url text,
  category text,
  category_label text,
  is_free boolean,
  listing_id uuid,
  verticals text[],
  region_id uuid,
  rank real
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.name, e.slug, e.description,
    e.start_date, e.end_date, e.location_name,
    e.suburb, e.state, e.lat, e.lng,
    e.website_url, e.ticket_url, e.image_url,
    e.category, e.category_label, e.is_free, e.listing_id,
    e.verticals, e.region_id,
    CASE
      WHEN query IS NULL OR query = '' THEN 0.0::real
      ELSE ts_rank(
        to_tsvector('english',
          coalesce(e.name, '') || ' ' ||
          coalesce(e.description, '') || ' ' ||
          coalesce(e.suburb, '') || ' ' ||
          coalesce(e.state, '') || ' ' ||
          coalesce(e.category, '') || ' ' ||
          coalesce(e.location_name, '')
        ),
        websearch_to_tsquery('english', query)
      )
    END AS rank
  FROM events e
  WHERE e.status = 'approved'
  -- Operator drafts stay out of search; community rows have published = NULL.
  AND e.published IS DISTINCT FROM false
  AND e.end_date >= CURRENT_DATE
  AND (
    query IS NULL OR query = '' OR
    to_tsvector('english',
      coalesce(e.name, '') || ' ' ||
      coalesce(e.description, '') || ' ' ||
      coalesce(e.suburb, '') || ' ' ||
      coalesce(e.state, '') || ' ' ||
      coalesce(e.category, '') || ' ' ||
      coalesce(e.location_name, '')
    ) @@ websearch_to_tsquery('english', query)
  )
  AND (state_filter IS NULL OR e.state = state_filter)
  AND (category_filter IS NULL OR e.category = category_filter)
  AND (vertical_filter IS NULL OR vertical_filter = ANY(e.verticals))
  ORDER BY
    CASE WHEN query IS NULL OR query = '' THEN 0 ELSE 1 END DESC,
    rank DESC,
    e.start_date ASC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- ── Verification ──
-- SELECT proname, pg_get_function_result(oid) FROM pg_proc WHERE proname = 'search_events';
-- Expect the new 21-column RETURNS TABLE incl. category_label/is_free/listing_id.
