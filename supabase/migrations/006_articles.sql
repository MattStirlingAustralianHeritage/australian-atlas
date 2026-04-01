-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 006: Articles table + search function
-- ============================================================

create table articles (
  id                uuid primary key default uuid_generate_v4(),
  cms_id            text not null unique,
  vertical          text check (vertical in (
                      'sba','collection','craft','fine_grounds',
                      'rest','field','corner','found','table','atlas'
                    )),
  title             text not null,
  slug              text not null unique,
  excerpt           text,
  body              text,
  hero_image_url    text,
  author            text,
  status            text default 'draft' check (status in ('draft','published')),
  published_at      timestamptz,
  region_tags       text[],
  listing_tags      uuid[],
  category          text,
  embedding         vector(1536),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  synced_at         timestamptz
);

create index articles_vertical_idx on articles(vertical);
create index articles_status_idx on articles(status);
create index articles_published_at_idx on articles(published_at desc);
create index articles_region_tags_idx on articles using gin(region_tags);
create index articles_listing_tags_idx on articles using gin(listing_tags);
create index articles_slug_idx on articles(slug);

create index articles_embedding_idx on articles
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

create trigger articles_updated_at
  before update on articles
  for each row execute function update_updated_at();

-- Add FK from regions to articles now that articles table exists
alter table regions
  add constraint regions_featured_article_fk
  foreign key (featured_article_id) references articles(id) on delete set null;
