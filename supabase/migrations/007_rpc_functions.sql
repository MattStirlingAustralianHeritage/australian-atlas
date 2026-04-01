-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 007: RPC functions for search + spatial queries
-- ============================================================

-- Unified semantic search across listings
create or replace function search_listings(
  query_embedding vector(1536),
  filter_vertical text default null,
  filter_state    text default null,
  filter_region   text default null,
  match_threshold float default 0.7,
  match_count     int default 20
)
returns table (
  id              uuid,
  vertical        text,
  name            text,
  slug            text,
  description     text,
  region          text,
  state           text,
  lat             float8,
  lng             float8,
  hero_image_url  text,
  is_featured     boolean,
  similarity      float
)
language sql stable
as $$
  select
    l.id, l.vertical, l.name, l.slug, l.description,
    l.region, l.state, l.lat, l.lng, l.hero_image_url,
    l.is_featured,
    1 - (l.embedding <=> query_embedding) as similarity
  from listings l
  where
    l.status = 'active'
    and l.embedding is not null
    and (filter_vertical is null or l.vertical = filter_vertical)
    and (filter_state is null or l.state = filter_state)
    and (filter_region is null or l.region = filter_region)
    and 1 - (l.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;

-- Spatial query: all listings within a region polygon
create or replace function listings_in_region(region_slug text)
returns setof listings
language sql stable
as $$
  select l.*
  from listings l
  join regions r on r.slug = region_slug
  where
    l.status = 'active'
    and r.geojson is not null
    and l.lat is not null
    and l.lng is not null
    and st_contains(
      st_geomfromgeojson(r.geojson::text),
      st_point(l.lng, l.lat)
    );
$$;

-- Semantic search across articles
create or replace function search_articles(
  query_embedding vector(1536),
  filter_vertical text default null,
  filter_region   text default null,
  match_threshold float default 0.7,
  match_count     int default 10
)
returns table (
  id              uuid,
  vertical        text,
  title           text,
  slug            text,
  excerpt         text,
  hero_image_url  text,
  published_at    timestamptz,
  region_tags     text[],
  similarity      float
)
language sql stable
as $$
  select
    a.id, a.vertical, a.title, a.slug, a.excerpt,
    a.hero_image_url, a.published_at, a.region_tags,
    1 - (a.embedding <=> query_embedding) as similarity
  from articles a
  where
    a.status = 'published'
    and a.embedding is not null
    and (filter_vertical is null or a.vertical = filter_vertical)
    and (filter_region is null or filter_region = any(a.region_tags))
    and 1 - (a.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;

-- Nearby listings (radius query in km)
create or replace function nearby_listings(
  center_lat float8,
  center_lng float8,
  radius_km  float8 default 25,
  filter_vertical text default null,
  max_results int default 50
)
returns table (
  id              uuid,
  vertical        text,
  name            text,
  slug            text,
  description     text,
  region          text,
  state           text,
  lat             float8,
  lng             float8,
  hero_image_url  text,
  distance_km     float8
)
language sql stable
as $$
  select
    l.id, l.vertical, l.name, l.slug, l.description,
    l.region, l.state, l.lat, l.lng, l.hero_image_url,
    st_distancesphere(
      st_point(l.lng, l.lat),
      st_point(center_lng, center_lat)
    ) / 1000.0 as distance_km
  from listings l
  where
    l.status = 'active'
    and l.lat is not null
    and l.lng is not null
    and (filter_vertical is null or l.vertical = filter_vertical)
    and st_distancesphere(
      st_point(l.lng, l.lat),
      st_point(center_lng, center_lat)
    ) / 1000.0 <= radius_km
  order by distance_km asc
  limit max_results;
$$;

-- Region stats: listing counts by vertical for a given region
create or replace function region_stats(region_slug text)
returns table (
  vertical      text,
  listing_count bigint
)
language sql stable
as $$
  select l.vertical, count(*) as listing_count
  from listings l
  join regions r on r.slug = region_slug
  where
    l.status = 'active'
    and r.geojson is not null
    and l.lat is not null
    and l.lng is not null
    and st_contains(
      st_geomfromgeojson(r.geojson::text),
      st_point(l.lng, l.lat)
    )
  group by l.vertical
  order by listing_count desc;
$$;
