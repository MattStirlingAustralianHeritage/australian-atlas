-- Migration 162: search keywords feed the lexical search document + drift trigger.
--
-- Companion to migration 161 (which adds listings.search_keywords text[]).
-- Two pieces, both pure CREATE OR REPLACE (no table DDL):
--
--   1. search_listings_hybrid — the lexical arm's full-text document gains
--      coalesce(array_to_string(search_keywords,' '),'') so an exact term an
--      operator added ("witbier") is a full-text hit. Signature and return type
--      are UNCHANGED: every consumer (/api/search, vibe, similar, plan,
--      itinerary) picks this up with no code change. The semantic arm already
--      sees the keywords because lib/embeddings/sourceText.js folds them into the
--      embedding input text. Listings with the default empty '{}' produce a
--      tsvector byte-identical to today (array_to_string('{}',' ') = '' →
--      to_tsvector ignores the trailing space), so non-keyworded listings are
--      completely unaffected.
--   2. mark_listing_needs_embedding() — keyword edits now flag the row for
--      re-embedding too, so a non-dashboard write to search_keywords still
--      refreshes the vector on the next embedding cron. (The dashboard route
--      also sets needs_embedding + regenerates inline, so this is the
--      belt-and-suspenders path, mirroring how migration 159 handled
--      operator_highlights.)
--
-- Body of search_listings_hybrid is migration 159 verbatim except: base selects
-- l.search_keywords, and the two lexical to_tsvector() documents gain the
-- keyword term. Body of mark_listing_needs_embedding is migration 159 verbatim
-- plus the search_keywords comparison.
--
-- ── ROLLBACK ────────────────────────────────────────────────
--   Re-apply migration 159 (159_search_operator_highlights.sql) to restore both
--   function bodies to their previous (keyword-free) definitions. No data change.
-- ============================================================

-- ── 1. Lexical arm searches the keyword text ─────────────────────────────────
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
as $$
declare
  ql text := lower(btrim(coalesce(query_text, '')));
  ts tsquery := case when ql = '' then null else websearch_to_tsquery('english', query_text) end;
begin
  return query
  with base as (
    select l.id, l.name, l.slug, l.vertical, l.sub_type, l.description,
           l.region, l.state, l.suburb, l.address, l.lat, l.lng,
           l.hero_image_url, l.source_id, l.website,
           l.is_claimed, l.is_featured, l.editors_pick, l.quality_score,
           l.embedding, l.operator_highlights, l.search_keywords
    from listings l
    where l.status = 'active'
      and (filter_vertical is null or l.vertical = filter_vertical or filter_vertical = any(l.verticals))
      and (filter_state    is null or l.state = filter_state)
      and (filter_region   is null or coalesce(l.region_override_id, l.region_computed_id) = filter_region::uuid)
      and (filter_suburb   is null or l.suburb ilike filter_suburb)
      and (include_way or filter_vertical = 'way' or l.vertical <> 'way')
      and (exclude_vertical is null or l.vertical <> exclude_vertical)
      and (exclude_suburb is null or l.suburb is distinct from exclude_suburb)
      and (min_quality is null or l.quality_score >= min_quality)
      and (not require_trail_suitable or l.trail_suitable is true or l.trail_suitable is null)
      and (lat_min is null or (l.lat between lat_min and lat_max and l.lng between lng_min and lng_max))
  ),
  semantic as (
    select b.id,
           row_number() over (order by b.embedding <=> query_embedding) as rnk,
           1 - (b.embedding <=> query_embedding) as sim
    from base b
    where query_embedding is not null
      and b.embedding is not null
      and 1 - (b.embedding <=> query_embedding) > similarity_floor
    order by b.embedding <=> query_embedding
    limit greatest(match_count * 4, 100)
  ),
  lexical as (
    select b.id,
           row_number() over (
             order by
               (case when lower(b.name) = ql then 2
                     when ql <> '' and lower(b.name) like ql || '%' then 1
                     when ql <> '' and lower(b.name) like '%' || ql || '%' then 1
                     else 0 end)
               + coalesce(ts_rank(
                   to_tsvector('english',
                     b.name || ' ' || coalesce(b.description,'') || ' ' || coalesce(b.sub_type,'')
                     || ' ' || coalesce(operator_highlights_search_text(b.operator_highlights),'')
                     || ' ' || coalesce(array_to_string(b.search_keywords, ' '), '')),
                   ts), 0) desc
           ) as rnk
    from base b
    where ts is not null
      and (
        to_tsvector('english',
          b.name || ' ' || coalesce(b.description,'') || ' ' || coalesce(b.sub_type,'')
          || ' ' || coalesce(operator_highlights_search_text(b.operator_highlights),'')
          || ' ' || coalesce(array_to_string(b.search_keywords, ' '), '')) @@ ts
        or (ql <> '' and lower(b.name) like '%' || ql || '%')
      )
    order by rnk
    limit greatest(match_count * 4, 100)
  ),
  fused as (
    select coalesce(s.id, x.id) as id,
           (coalesce(1.0 / (60 + s.rnk), 0.0) + coalesce(1.0 / (60 + x.rnk), 0.0))::float8 as fused_score,
           s.sim::float8 as similarity
    from semantic s
    full outer join lexical x on x.id = s.id
  )
  select b.id, b.name, b.slug, b.vertical, b.sub_type, b.description,
         b.region, b.state, b.suburb, b.address, b.lat, b.lng,
         b.hero_image_url, b.source_id, b.website,
         b.is_claimed, b.is_featured, b.editors_pick, b.quality_score,
         f.similarity, f.fused_score
  from fused f
  join base b on b.id = f.id
  order by f.fused_score desc, b.name asc
  limit match_count;
end;
$$;

-- ── 2. Keyword edits flag the row for re-embedding ───────────────────────────
-- Body is migration 159 verbatim plus the search_keywords comparison.
create or replace function mark_listing_needs_embedding()
returns trigger as $$
begin
  if (new.name                is distinct from old.name
   or new.description         is distinct from old.description
   or new.sub_type            is distinct from old.sub_type
   or new.region_override_id  is distinct from old.region_override_id
   or new.region_computed_id  is distinct from old.region_computed_id
   or new.presence_type       is distinct from old.presence_type
   or new.visitable           is distinct from old.visitable
   or new.operator_highlights is distinct from old.operator_highlights
   or new.search_keywords     is distinct from old.search_keywords) then
    new.needs_embedding := true;
  end if;
  return new;
end;
$$ language plpgsql;

notify pgrst, 'reload schema';
