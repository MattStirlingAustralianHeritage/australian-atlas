-- Migration 270: search performance — index-driven arms, deeper semantic recall,
-- cheap suggest RPC, and synonym-change propagation.
--
-- From the 2026-08-01 search audit (production telemetry: p50 838ms, p90 3.1s,
-- p95 5.3s, outliers to 143s; EXPLAIN showed the lexical arm seq-scanning the
-- whole 256MB listings relation — 29,632 shared buffers per query).
--
--   P1 — LEXICAL ARM SEQ SCAN. `search_vector @@ ts_or OR lower(unaccent(name))
--        LIKE '%q%'` cannot BitmapOr (the LIKE side had no usable index), so
--        every text search read the entire table, TOAST included. Fix: an
--        IMMUTABLE unaccent wrapper (f_unaccent) + a trigram GIN expression
--        index on f_unaccent(lower(name)). Both OR branches are now
--        index-supported (GIN tsvector + GIN trgm) → BitmapOr. The LIKE branch
--        is additionally gated to length >= 3 (trigram extraction needs 3 chars;
--        shorter queries rely on the tsvector branch alone).
--
--   P2 — FUZZY ARM SEQ SCAN. `uql <% unaccent(name)` computed unaccent() +
--        word_similarity() for every active row. The same trigram index now
--        serves `<%` directly.
--
--   P3 — SEMANTIC RECALL CAP. The HNSW scan ran at the default ef_search=40
--        while the arm LIMIT asks for up to 480 — filtered queries (state /
--        region / bbox) could get near-zero semantic candidates (the arm is
--        recall for RRF, so this silently degraded ranking). pgvector is 0.8.0:
--        set ef_search=200 + iterative_scan=relaxed_order at function scope
--        (both verified settable on this instance) so filtered scans keep
--        digging until the LIMIT is satisfied.
--
--   P4 — nearby_listings FULL SCAN. st_distancesphere was computed twice per
--        row over every active listing. A btree (lat, lng) bounding-box
--        prefilter + single distance computation in a subquery.
--
--   P5 — SUGGEST RPC. /api/autocomplete fell back to the full three-arm hybrid
--        RPC per keystroke; the route-level "did you mean" (fuzzyNameMatch) did
--        the same. suggest_listings() is a single-index-scan name matcher
--        (prefix / substring / word-similarity) returning skinny rows.
--
--   Q1 — SYNONYM DRIFT (structural). Since 176 baked category synonyms into the
--        stored search_vector at WRITE time, editing listing_category_synonyms
--        no longer reaches search until each listing row happens to be touched
--        (migrations 196→241 only worked because unrelated sweeps updated every
--        row). A trigger on listing_category_synonyms now refreshes affected
--        listings' vectors immediately (via a no-op search_keywords self-assign,
--        which fires the vector trigger but — IS DISTINCT FROM guard in
--        mark_listing_needs_embedding — does NOT queue re-embeds).
--
--   Q2 — CROSS-LISTED SYNONYMS. The vector trigger only looked at the primary
--        vertical; a venue cross-listed via verticals[] now also gets the other
--        verticals' synonym bags.
--
-- Signature and return type of search_listings_hybrid are UNCHANGED — every
-- consumer picks the new body up with no code change. nearby_listings signature
-- and return type likewise unchanged.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   Re-apply migration 176's search_listings_hybrid + listings_search_vector_
--   update, migration 166's nearby_listings. drop function suggest_listings;
--   drop trigger trg_synonyms_refresh_listings on listing_category_synonyms;
--   drop index listings_name_unaccent_trgm_idx, listings_lat_lng_active_idx,
--   listings_suburb_lower_idx. f_unaccent can stay (harmless).
-- ============================================================================

-- ── 1. IMMUTABLE unaccent wrapper (required for expression indexes) ──────────
-- unaccent() is only STABLE (dictionary lookup); the two-argument form with an
-- explicit dictionary is safe to wrap as IMMUTABLE. The extension may live in
-- any schema (Supabase often installs into "extensions"), so resolve it.
do $$
declare ext_schema text;
begin
  select n.nspname into ext_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'unaccent';
  if ext_schema is null then
    raise exception 'unaccent extension not installed';
  end if;
  execute format(
    'create or replace function public.f_unaccent(text) returns text
     language sql immutable parallel safe strict
     as $f$ select %I.unaccent(%L::regdictionary, $1) $f$',
    ext_schema, ext_schema || '.unaccent');
end $$;

-- ── 2. Indexes ───────────────────────────────────────────────────────────────
-- Serves: LIKE '%q%' (substring + prefix), <% (word similarity), % (similarity).
create index if not exists listings_name_unaccent_trgm_idx
  on listings using gin (public.f_unaccent(lower(name)) gin_trgm_ops);

-- Serves the bbox prefilter in nearby_listings and the hybrid RPC's box.
create index if not exists listings_lat_lng_active_idx
  on listings (lat, lng) where status = 'active';

-- Serves the suburb filter (rewritten from `ilike` to lower() equality).
create index if not exists listings_suburb_lower_idx
  on listings (lower(suburb)) where suburb is not null;

-- ── 3. Enriched search_vector maintenance (Q2: verticals[] synonyms) ─────────
create or replace function listings_search_vector_update()
returns trigger language plpgsql as $$
declare
  syn text;
begin
  select string_agg(cs.terms, ' ') into syn
  from listing_category_synonyms cs
  where (cs.vertical = new.vertical or cs.vertical = any(coalesce(new.verticals, '{}')))
    and (cs.sub_type = new.sub_type or cs.sub_type is null);

  new.search_vector :=
    setweight(to_tsvector('english', public.f_unaccent(coalesce(new.name, ''))), 'A') ||
    setweight(to_tsvector('english', public.f_unaccent(
      coalesce(replace(new.sub_type, '_', ' '), '') || ' ' || coalesce(new.suburb, ''))), 'B') ||
    setweight(to_tsvector('english', public.f_unaccent(
      coalesce(new.description, '') || ' ' ||
      coalesce(operator_highlights_search_text(new.operator_highlights), '') || ' ' ||
      coalesce(array_to_string(new.search_keywords, ' '), '') || ' ' ||
      coalesce(syn, ''))), 'C');
  return new;
end;
$$;

-- Also watch verticals so a cross-listing edit refreshes the vector.
drop trigger if exists trg_listings_search_vector on listings;
create trigger trg_listings_search_vector
  before insert or update of name, suburb, region, description, sub_type,
                             operator_highlights, search_keywords, vertical, verticals
  on listings for each row execute function listings_search_vector_update();

-- Backfill ONLY cross-listed rows (single-vertical rows already carry their
-- synonyms — verified 2026-08-01 on tea_shop/wine_bar/bottle_shop/nursery).
update listings l set search_keywords = l.search_keywords
where coalesce(array_length(l.verticals, 1), 0) > 1;

-- ── 4. Q1: synonym edits propagate to affected listings immediately ──────────
-- The no-op self-assign fires trg_listings_search_vector (column-list triggers
-- fire on the column being ASSIGNED, not changed) and rebuilds the vector with
-- the fresh synonym bag. mark_listing_needs_embedding's IS DISTINCT FROM guard
-- means no re-embed is queued (synonyms are lexical-only signal by design).
create or replace function refresh_listings_for_synonym_change()
returns trigger language plpgsql as $$
begin
  update listings l set search_keywords = l.search_keywords
  where (l.vertical = new.vertical or new.vertical = any(coalesce(l.verticals, '{}')))
    and (new.sub_type is null or l.sub_type = new.sub_type);
  return null;
end;
$$;

drop trigger if exists trg_synonyms_refresh_listings on listing_category_synonyms;
create trigger trg_synonyms_refresh_listings
  after insert or update on listing_category_synonyms
  for each row execute function refresh_listings_for_synonym_change();

-- ── 5. Hybrid RPC: index-driven arms, deeper HNSW recall ─────────────────────
-- Load pg_trgm into this backend first: CREATE FUNCTION ... SET validates
-- custom GUCs, and pg_trgm.word_similarity_threshold only passes validation for
-- a non-superuser once the extension is loaded (otherwise it is a placeholder
-- and the CREATE fails with "permission denied to set parameter").
select show_trgm('warm-up');

-- Signature + return type identical to 176.
create or replace function search_listings_hybrid(
  query_embedding vector(1024) default null,
  query_text text default null,
  filter_vertical text default null,
  filter_state text default null,
  filter_region text default null,
  match_count int default 24,
  similarity_floor float default 0.48,
  include_way boolean default false,
  lat_min float8 default null,
  lat_max float8 default null,
  lng_min float8 default null,
  lng_max float8 default null,
  exclude_vertical text default null,
  exclude_suburb text default null,
  min_quality int default null,
  require_trail_suitable boolean default false,
  filter_suburb text default null
)
returns table (
  id uuid, name text, slug text, vertical text, sub_type text, description text,
  region text, state text, suburb text, address text, lat float8, lng float8,
  hero_image_url text, source_id text, website text,
  is_claimed boolean, is_featured boolean, editors_pick boolean, quality_score int,
  similarity float, fused_score float
)
language plpgsql stable
set pg_trgm.word_similarity_threshold = 0.4   -- governs the fuzzy arm's <% operator
as $$
declare
  uql text := lower(public.f_unaccent(coalesce(query_text, '')));
  andtxt text := case when btrim(uql) = '' then null
                      else nullif(websearch_to_tsquery('english', uql)::text, '') end;
  ts_and tsquery := case when andtxt is null then null else andtxt::tsquery end;
  -- OR-recall: top-level & -> | so any significant term is a candidate; phrase
  -- (<->) and negation (!) keep strict semantics.
  ts_or tsquery := case
    when andtxt is null then null
    when position('!' in andtxt) > 0 then andtxt::tsquery
    else replace(andtxt, ' & ', ' | ')::tsquery
  end;
begin
  -- P3: deeper HNSW recall. The role cannot attach hnsw.* to proconfig
  -- ("permission denied to set parameter" at CREATE time — same wall migrations
  -- 147/152 hit), but transaction-local set_config IS allowed. ef_search=200
  -- because the arm LIMIT is up to 480 and the default 40 starved filtered
  -- queries; iterative_scan keeps digging until the LIMIT is satisfied.
  perform set_config('hnsw.ef_search', '200', true);
  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  -- Bound the iterative dig: when the similarity floor discards most of the
  -- index (a generic query like "coffee" clears ~2% of vectors), an unbounded
  -- iterative scan would walk all ~10k vectors trying to fill the LIMIT.
  perform set_config('hnsw.max_scan_tuples', '2000', true);
  return query
  with semantic as (
    -- The similarity floor is applied AFTER the LIMIT subquery, not inside the
    -- index scan's WHERE: iterative_scan treats every WHERE clause as a filter
    -- to keep digging for, and a floor that discards ~98% of vectors (generic
    -- queries like "coffee") would walk the whole index. This way the dig is
    -- bounded by the LIMIT and only real filters (state/region/bbox) extend it.
    select t.id,
           row_number() over (order by t.dist) as rnk,
           1 - t.dist as sim
    from (
      select l.id, l.embedding <=> query_embedding as dist
      from listings l
      where l.status = 'active'
        and (filter_vertical is null or l.vertical = filter_vertical or filter_vertical = any(l.verticals))
        and (filter_state  is null or l.state = filter_state)
        and (filter_region is null or coalesce(l.region_override_id, l.region_computed_id) = filter_region::uuid)
        and (filter_suburb is null or lower(l.suburb) = lower(filter_suburb))
        and (include_way or filter_vertical = 'way' or l.vertical <> 'way')
        and (exclude_vertical is null or l.vertical <> exclude_vertical)
        and (exclude_suburb is null or l.suburb is distinct from exclude_suburb)
        and (min_quality is null or l.quality_score >= min_quality)
        and (not require_trail_suitable or l.trail_suitable is true or l.trail_suitable is null)
        and (lat_min is null or (l.lat between lat_min and lat_max and l.lng between lng_min and lng_max))
        and query_embedding is not null
        and l.embedding is not null
      order by l.embedding <=> query_embedding
      limit greatest(match_count * 4, 100)
    ) t
    where 1 - t.dist > similarity_floor
  ),
  lexical as (
    select l.id,
           row_number() over (
             order by
               (case when public.f_unaccent(lower(l.name)) = uql then 2
                     when uql <> '' and public.f_unaccent(lower(l.name)) like uql || '%' then 1
                     when uql <> '' and public.f_unaccent(lower(l.name)) like '%' || uql || '%' then 1
                     else 0 end)
               + (case when ts_and is not null and l.search_vector @@ ts_and then 1.0 else 0 end)
               + coalesce(ts_rank(l.search_vector, ts_or), 0) desc
           ) as rnk
    from listings l
    where l.status = 'active'
      and (filter_vertical is null or l.vertical = filter_vertical or filter_vertical = any(l.verticals))
      and (filter_state  is null or l.state = filter_state)
      and (filter_region is null or coalesce(l.region_override_id, l.region_computed_id) = filter_region::uuid)
      and (filter_suburb is null or lower(l.suburb) = lower(filter_suburb))
      and (include_way or filter_vertical = 'way' or l.vertical <> 'way')
      and (exclude_vertical is null or l.vertical <> exclude_vertical)
      and (exclude_suburb is null or l.suburb is distinct from exclude_suburb)
      and (min_quality is null or l.quality_score >= min_quality)
      and (not require_trail_suitable or l.trail_suitable is true or l.trail_suitable is null)
      and (lat_min is null or (l.lat between lat_min and lat_max and l.lng between lng_min and lng_max))
      and ts_or is not null
      -- Both OR branches are index-supported (P1): GIN tsvector + trigram GIN.
      -- The LIKE branch needs >= 3 chars for trigram extraction; shorter
      -- queries ride the tsvector branch alone.
      and (l.search_vector @@ ts_or
           or (length(uql) >= 3 and public.f_unaccent(lower(l.name)) like '%' || uql || '%'))
    order by rnk
    limit greatest(match_count * 4, 100)
  ),
  fuzzy as (
    select l.id,
           row_number() over (order by word_similarity(uql, public.f_unaccent(lower(l.name))) desc) as rnk
    from listings l
    where l.status = 'active'
      and (filter_vertical is null or l.vertical = filter_vertical or filter_vertical = any(l.verticals))
      and (filter_state  is null or l.state = filter_state)
      and (filter_region is null or coalesce(l.region_override_id, l.region_computed_id) = filter_region::uuid)
      and (filter_suburb is null or lower(l.suburb) = lower(filter_suburb))
      and (include_way or filter_vertical = 'way' or l.vertical <> 'way')
      and (exclude_vertical is null or l.vertical <> exclude_vertical)
      and (exclude_suburb is null or l.suburb is distinct from exclude_suburb)
      and (min_quality is null or l.quality_score >= min_quality)
      and (not require_trail_suitable or l.trail_suitable is true or l.trail_suitable is null)
      and (lat_min is null or (l.lat between lat_min and lat_max and l.lng between lng_min and lng_max))
      and length(uql) between 3 and 40
      and uql <% public.f_unaccent(lower(l.name))   -- P2: served by listings_name_unaccent_trgm_idx
    order by word_similarity(uql, public.f_unaccent(lower(l.name))) desc
    limit greatest(match_count * 2, 50)
  ),
  fused as (
    select ids.id,
           ( coalesce(1.0 / (25 + s.rnk),  0.0)
           + coalesce(1.0 / (25 + x.rnk),  0.0)
           + coalesce(0.4 / (25 + fz.rnk), 0.0) )::float8 as fused_score,
           s.sim::float8 as similarity
    from (select semantic.id from semantic
          union select lexical.id from lexical
          union select fuzzy.id from fuzzy) ids
    left join semantic s  on s.id  = ids.id
    left join lexical  x  on x.id  = ids.id
    left join fuzzy    fz on fz.id = ids.id
  )
  select l.id, l.name, l.slug, l.vertical, l.sub_type, l.description,
         l.region, l.state, l.suburb, l.address, l.lat, l.lng,
         l.hero_image_url, l.source_id, l.website,
         l.is_claimed, l.is_featured, l.editors_pick, l.quality_score,
         f.similarity, f.fused_score
  from fused f
  join listings l on l.id = f.id
  order by f.fused_score desc, l.is_claimed desc, l.quality_score desc nulls last, l.name asc
  limit match_count;
end;
$$;

-- ── 6. P5: single-scan name suggester (autocomplete + "did you mean") ────────
-- Prefix / substring / word-similarity over the trigram index, skinny return.
-- The caller applies vertical-publication + test-listing gating (it already
-- does for the hybrid RPC results it replaces).
create or replace function suggest_listings(
  query text,
  max_results int default 8,
  include_way boolean default false
)
returns table (
  id uuid, name text, slug text, vertical text, sub_type text,
  suburb text, state text, hero_image_url text,
  is_claimed boolean, quality_score int, sim real
)
language plpgsql stable
set pg_trgm.word_similarity_threshold = 0.3   -- suggestions cast wider than search
as $$
declare
  -- Strip LIKE wildcards from user input; unaccent + lower to match the index.
  uq text := lower(public.f_unaccent(translate(btrim(coalesce(query, '')), '%_', '')));
begin
  if length(uq) < 2 then return; end if;
  return query
  select l.id, l.name, l.slug, l.vertical, l.sub_type,
         l.suburb, l.state, l.hero_image_url,
         l.is_claimed, l.quality_score,
         greatest(
           word_similarity(uq, public.f_unaccent(lower(l.name))),
           case when public.f_unaccent(lower(l.name)) like uq || '%' then 1.0
                when public.f_unaccent(lower(l.name)) like '%' || uq || '%' then 0.8
                else 0.0 end
         )::real as sim
  from listings l
  where l.status = 'active'
    and (l.needs_review is null or l.needs_review = false)
    and (include_way or l.vertical <> 'way')
    and (
      public.f_unaccent(lower(l.name)) like '%' || uq || '%'
      or (length(uq) >= 3 and uq <% public.f_unaccent(lower(l.name)))
    )
  order by sim desc, l.is_claimed desc, l.quality_score desc nulls last, l.name asc
  limit max_results;
end;
$$;

-- ── 7. P4: nearby_listings — bbox prefilter + single distance computation ────
-- Signature + return type identical to 166; adds a btree-served bounding box
-- so the spherical distance runs only over candidates, and only once per row.
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
  SELECT t.*
  FROM (
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
      -- btree (lat, lng) bounding box; the exact distance check below trims corners.
      AND l.lat BETWEEN center_lat - (radius_km / 111.0)
                    AND center_lat + (radius_km / 111.0)
      AND l.lng BETWEEN center_lng - (radius_km / (111.0 * greatest(cos(radians(center_lat)), 0.01)))
                    AND center_lng + (radius_km / (111.0 * greatest(cos(radians(center_lat)), 0.01)))
      -- CLAUDE.md hard rule: needs_review=true venues never surface publicly.
      AND (l.needs_review IS NULL OR l.needs_review = false)
      -- Privacy: never surface exact coordinates of address-hidden venues.
      AND (l.address_on_request IS NULL OR l.address_on_request = false)
      -- Visitability: physical / by-appointment venues only — online,
      -- market-only and mobile makers have no fixed pin to show.
      AND (l.visitable IS NULL OR l.visitable = true OR l.presence_type = 'by_appointment')
      AND (filter_vertical IS NULL OR l.vertical = filter_vertical OR l.verticals @> ARRAY[filter_vertical])
  ) t
  WHERE t.distance_km <= radius_km
  ORDER BY t.distance_km ASC
  LIMIT max_results;
$$;

-- Reload PostgREST so the new/changed signatures are callable via the data API.
notify pgrst, 'reload schema';
