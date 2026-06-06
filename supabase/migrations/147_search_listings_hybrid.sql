-- Migration 147: unified hybrid retrieval (lexical + semantic, RRF fusion).
-- Ranks in Postgres. The semantic arm is skipped when query_embedding is null,
-- so the function degrades to lexical-only (and returns lexical-only until the
-- embedding backfill + HNSW index land). An exact-name query lands at lexical
-- rank 1 via the name boost; an off-topic query clears neither arm -> few/empty.
-- Region filtering resolves via coalesce(region_override_id, region_computed_id)
-- (override-wins, not OR). 'way' is excluded unless include_way or filter=way.

drop function if exists search_listings_hybrid(vector, text, text, text, text, integer, double precision, boolean);
create or replace function search_listings_hybrid(
  query_embedding vector(1024) default null,
  query_text text default null,
  filter_vertical text default null,
  filter_state text default null,
  filter_region text default null,
  match_count int default 24,
  similarity_floor float default 0.48,  -- calibrated Phase 7: off-topic noise tops out ~0.42, relevant >=~0.57
  include_way boolean default false
)
returns table (
  id uuid, name text, slug text, vertical text, sub_type text, description text,
  region text, state text, hero_image_url text,
  is_claimed boolean, is_featured boolean, editors_pick boolean,
  similarity float, fused_score float
)
language plpgsql stable
-- ef_search is left at pgvector's default of 40 (the recall target for this
-- corpus). Raising it is an admin session/role setting; the pooled role here
-- isn't permitted to set the GUC at function-definition time.
as $$
declare
  ql text := lower(btrim(coalesce(query_text, '')));
  ts tsquery := case when ql = '' then null else websearch_to_tsquery('english', query_text) end;
begin
  return query
  with base as (
    select l.id, l.name, l.slug, l.vertical, l.sub_type, l.description,
           l.region, l.state, l.hero_image_url, l.is_claimed, l.is_featured, l.editors_pick,
           l.embedding
    from listings l
    where l.status = 'active'
      and (filter_vertical is null or l.vertical = filter_vertical)
      and (filter_state    is null or l.state = filter_state)
      and (filter_region   is null or coalesce(l.region_override_id, l.region_computed_id) = filter_region::uuid)
      and (include_way or filter_vertical = 'way' or l.vertical <> 'way')
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
                   to_tsvector('english', b.name || ' ' || coalesce(b.description,'') || ' ' || coalesce(b.sub_type,'')),
                   ts), 0) desc
           ) as rnk
    from base b
    where ts is not null
      and (
        to_tsvector('english', b.name || ' ' || coalesce(b.description,'') || ' ' || coalesce(b.sub_type,'')) @@ ts
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
         b.region, b.state, b.hero_image_url, b.is_claimed, b.is_featured, b.editors_pick,
         f.similarity, f.fused_score
  from fused f
  join base b on b.id = f.id
  order by f.fused_score desc, b.name asc
  limit match_count;
end;
$$;
