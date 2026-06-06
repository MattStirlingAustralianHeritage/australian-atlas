-- Migration 146: standardise embedding columns on vector(1024) for Voyage 3.5.
-- The Tokyo DB still had vector(1536) (the OpenAI-era size); voyage-3.5 emits
-- 1024 and no Voyage model emits 1536. All embeddings are currently NULL so the
-- type change is a no-op cast. listings_with_region is a `select l.*` view over
-- listings.embedding, so it is dropped and recreated around the change (nothing
-- else depends on it). Also constrains match_similar_listings to vector(1024)
-- (live param was an unconstrained `vector`; source migration 070 said 1536).

drop view if exists listings_with_region;

alter table listings alter column embedding type vector(1024) using embedding::vector(1024);
alter table articles alter column embedding type vector(1024) using embedding::vector(1024);

create view listings_with_region with (security_invoker = on) as
  select l.*,
    coalesce(l.region_override_id, l.region_computed_id) as region_id,
    case when l.region_override_id is not null then 'override'
         when l.region_computed_id  is not null then 'computed'
         else null end as region_resolution_source
  from listings l;

comment on view listings_with_region is
  'Override-wins region resolution per docs/regions.md. Use for filter-by-region reads. Writes must target the listings table.';

drop function if exists match_similar_listings(vector, text, text, integer);
create function match_similar_listings(
  query_embedding vector(1024),
  exclude_vertical text,
  exclude_suburb text default null,
  match_count integer default 6
)
returns table (
  id uuid, name text, slug text, vertical text, region text, state text,
  suburb text, hero_image_url text, quality_score integer, similarity double precision
) as $$
begin
  return query
  select l.id, l.name, l.slug, l.vertical, l.region, l.state, l.suburb,
         l.hero_image_url, l.quality_score, 1 - (l.embedding <=> query_embedding)
  from listings l
  where l.status = 'active'
    and l.vertical <> exclude_vertical
    and (exclude_suburb is null or l.suburb is distinct from exclude_suburb)
    and l.quality_score >= 60
    and l.embedding is not null
  order by l.embedding <=> query_embedding
  limit match_count;
end;
$$ language plpgsql stable;
