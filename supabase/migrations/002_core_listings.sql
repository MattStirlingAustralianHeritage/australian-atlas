-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 002: Core listings table
-- ============================================================

create table listings (
  id                uuid primary key default uuid_generate_v4(),
  vertical          text not null check (vertical in (
                      'sba','collection','craft','fine_grounds',
                      'rest','field','corner','found','table'
                    )),
  source_id         text not null,
  name              text not null,
  slug              text not null,
  description       text,
  region            text,
  state             text check (state in ('VIC','NSW','QLD','SA','WA','TAS','ACT','NT')),
  lat               float8,
  lng               float8,
  website           text,
  phone             text,
  address           text,
  hero_image_url    text,
  is_claimed        boolean default false,
  is_featured       boolean default false,
  is_market         boolean default false,
  status            text default 'active' check (status in ('active','inactive','pending')),
  embedding         vector(1536),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz,
  unique(vertical, source_id)
);

-- Spatial index for regional queries
create index listings_location_idx on listings using gist (
  st_point(lng, lat)
);

-- Vector index for semantic search
create index listings_embedding_idx on listings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Standard indexes
create index listings_vertical_idx on listings(vertical);
create index listings_state_idx on listings(state);
create index listings_region_idx on listings(region);
create index listings_status_idx on listings(status);
create index listings_slug_idx on listings(slug);
create index listings_featured_idx on listings(is_featured) where is_featured = true;
create index listings_market_idx on listings(is_market) where is_market = true;

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger listings_updated_at
  before update on listings
  for each row execute function update_updated_at();
