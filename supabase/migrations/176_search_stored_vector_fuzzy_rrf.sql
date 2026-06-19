-- Migration 176: stored enriched FTS vector + trigram fuzzy arm + RRF tuning.
--
-- From the 2026-06-19 search audit. Three changes to search_listings_hybrid and
-- the document it ranks on, all free, all backward-compatible (signature +
-- return type unchanged — every consumer picks them up with no code change):
--
--   B1 — LATENCY. The old RPC rebuilt to_tsvector(name||description||sub_type||
--        highlights||keywords||synonyms) INLINE for every active listing per
--        query, plus a per-row LATERAL join into listing_category_synonyms, so
--        each search spilled to disk (~1.2s, ~1200 temp blocks) and used NONE of
--        the indexes that already exist. We instead maintain that enriched
--        document in the stored, GIN-indexed listings.search_vector (an existing
--        but previously bare + RPC-unused column) via the existing
--        trg_listings_search_vector trigger, and point the lexical arm at it
--        (@@ against the GIN index). The synonym LATERAL + inline build are gone
--        from the hot path.
--
--   B2 — TYPO TOLERANCE. pg_trgm + listings_name_trgm_idx exist but were unused
--        ("Breww" -> 0). Adds a third, low-weight RRF "fuzzy" arm: uq <% name
--        (word-similarity, GIN-accelerated), so a misspelt name still surfaces
--        when the lexical/semantic arms miss, without polluting good queries
--        (its RRF weight is a fraction of the real arms').
--
--   B7 — RANKING. RRF k lowered 60 -> 25 so a mediocre dual-arm match can no
--        longer outrank a strong single-arm match; final tie-break is now
--        is_claimed DESC, quality_score DESC NULLS LAST, name ASC (was name ASC
--        only — an A-Z bias).
--
--   B8 — RECALL. The document now folds in suburb (long-tail towns) and is
--        unaccented (café == cafe), and the query is unaccented to match.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   Re-apply migration 165 (165_search_or_recall_category_synonyms.sql) to
--   restore the previous search_listings_hybrid, and re-apply migration 061's
--   listings_search_vector_update() body if the weighted document is unwanted.
--   The stored search_vector and the unaccent extension can stay (harmless).
-- ============================================================================

create extension if not exists unaccent;

-- ── 1. Enriched, weighted, unaccented search_vector maintenance ──────────────
-- Replaces migration 061's body. Weights: A=name, B=sub_type+suburb,
-- C=description+operator highlights+operator keywords+category synonyms.
create or replace function listings_search_vector_update()
returns trigger language plpgsql as $$
declare
  syn text;
begin
  select string_agg(cs.terms, ' ') into syn
  from listing_category_synonyms cs
  where cs.vertical = new.vertical
    and (cs.sub_type = new.sub_type or cs.sub_type is null);

  new.search_vector :=
    setweight(to_tsvector('english', unaccent(coalesce(new.name, ''))), 'A') ||
    setweight(to_tsvector('english', unaccent(
      coalesce(replace(new.sub_type, '_', ' '), '') || ' ' || coalesce(new.suburb, ''))), 'B') ||
    setweight(to_tsvector('english', unaccent(
      coalesce(new.description, '') || ' ' ||
      coalesce(operator_highlights_search_text(new.operator_highlights), '') || ' ' ||
      coalesce(array_to_string(new.search_keywords, ' '), '') || ' ' ||
      coalesce(syn, ''))), 'C');
  return new;
end;
$$;

-- Widen the trigger so a sub_type / highlights / keywords / vertical edit also
-- refreshes the vector (061 only watched name/suburb/region/description).
drop trigger if exists trg_listings_search_vector on listings;
create trigger trg_listings_search_vector
  before insert or update of name, suburb, region, description, sub_type,
                             operator_highlights, search_keywords, vertical
  on listings for each row execute function listings_search_vector_update();

-- One-time backfill so every existing row carries the enriched document.
update listings l set search_vector =
  setweight(to_tsvector('english', unaccent(coalesce(l.name, ''))), 'A') ||
  setweight(to_tsvector('english', unaccent(
    coalesce(replace(l.sub_type, '_', ' '), '') || ' ' || coalesce(l.suburb, ''))), 'B') ||
  setweight(to_tsvector('english', unaccent(
    coalesce(l.description, '') || ' ' ||
    coalesce(operator_highlights_search_text(l.operator_highlights), '') || ' ' ||
    coalesce(array_to_string(l.search_keywords, ' '), '') || ' ' ||
    coalesce((select string_agg(cs.terms, ' ') from listing_category_synonyms cs
              where cs.vertical = l.vertical and (cs.sub_type = l.sub_type or cs.sub_type is null)), ''))), 'C');

-- ── 2. Hybrid RPC: lexical(stored vector) + semantic + fuzzy, RRF k=25 ───────
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
  uql text := lower(unaccent(coalesce(query_text, '')));   -- unaccented lowercased query (boost + fuzzy)
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
  return query
  with semantic as (
    select l.id,
           row_number() over (order by l.embedding <=> query_embedding) as rnk,
           1 - (l.embedding <=> query_embedding) as sim
    from listings l
    where l.status = 'active'
      and (filter_vertical is null or l.vertical = filter_vertical or filter_vertical = any(l.verticals))
      and (filter_state  is null or l.state = filter_state)
      and (filter_region is null or coalesce(l.region_override_id, l.region_computed_id) = filter_region::uuid)
      and (filter_suburb is null or l.suburb ilike filter_suburb)
      and (include_way or filter_vertical = 'way' or l.vertical <> 'way')
      and (exclude_vertical is null or l.vertical <> exclude_vertical)
      and (exclude_suburb is null or l.suburb is distinct from exclude_suburb)
      and (min_quality is null or l.quality_score >= min_quality)
      and (not require_trail_suitable or l.trail_suitable is true or l.trail_suitable is null)
      and (lat_min is null or (l.lat between lat_min and lat_max and l.lng between lng_min and lng_max))
      and query_embedding is not null
      and l.embedding is not null
      and 1 - (l.embedding <=> query_embedding) > similarity_floor
    order by l.embedding <=> query_embedding
    limit greatest(match_count * 4, 100)
  ),
  lexical as (
    select l.id,
           row_number() over (
             order by
               (case when lower(unaccent(l.name)) = uql then 2
                     when uql <> '' and lower(unaccent(l.name)) like uql || '%' then 1
                     when uql <> '' and lower(unaccent(l.name)) like '%' || uql || '%' then 1
                     else 0 end)
               + (case when ts_and is not null and l.search_vector @@ ts_and then 1.0 else 0 end)
               + coalesce(ts_rank(l.search_vector, ts_or), 0) desc
           ) as rnk
    from listings l
    where l.status = 'active'
      and (filter_vertical is null or l.vertical = filter_vertical or filter_vertical = any(l.verticals))
      and (filter_state  is null or l.state = filter_state)
      and (filter_region is null or coalesce(l.region_override_id, l.region_computed_id) = filter_region::uuid)
      and (filter_suburb is null or l.suburb ilike filter_suburb)
      and (include_way or filter_vertical = 'way' or l.vertical <> 'way')
      and (exclude_vertical is null or l.vertical <> exclude_vertical)
      and (exclude_suburb is null or l.suburb is distinct from exclude_suburb)
      and (min_quality is null or l.quality_score >= min_quality)
      and (not require_trail_suitable or l.trail_suitable is true or l.trail_suitable is null)
      and (lat_min is null or (l.lat between lat_min and lat_max and l.lng between lng_min and lng_max))
      and ts_or is not null
      and (l.search_vector @@ ts_or or (uql <> '' and lower(unaccent(l.name)) like '%' || uql || '%'))
    order by rnk
    limit greatest(match_count * 4, 100)
  ),
  fuzzy as (
    select l.id,
           row_number() over (order by word_similarity(uql, unaccent(l.name)) desc) as rnk
    from listings l
    where l.status = 'active'
      and (filter_vertical is null or l.vertical = filter_vertical or filter_vertical = any(l.verticals))
      and (filter_state  is null or l.state = filter_state)
      and (filter_region is null or coalesce(l.region_override_id, l.region_computed_id) = filter_region::uuid)
      and (filter_suburb is null or l.suburb ilike filter_suburb)
      and (include_way or filter_vertical = 'way' or l.vertical <> 'way')
      and (exclude_vertical is null or l.vertical <> exclude_vertical)
      and (exclude_suburb is null or l.suburb is distinct from exclude_suburb)
      and (min_quality is null or l.quality_score >= min_quality)
      and (not require_trail_suitable or l.trail_suitable is true or l.trail_suitable is null)
      and (lat_min is null or (l.lat between lat_min and lat_max and l.lng between lng_min and lng_max))
      and length(uql) between 3 and 40
      and uql <% unaccent(l.name)
    order by word_similarity(uql, unaccent(l.name)) desc
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

notify pgrst, 'reload schema';
