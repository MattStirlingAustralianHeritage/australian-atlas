-- Migration 016: Trails system
-- User-curated and editorial trails linking venues across verticals

-- ============================================================
-- trails table
-- ============================================================
create table trails (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  title            text not null,
  description      text,
  type             text not null default 'user'
                     check (type in ('editorial', 'user')),
  visibility       text not null default 'private'
                     check (visibility in ('private', 'link', 'public')),
  created_by       uuid references auth.users(id) on delete set null,
  cover_image_url  text,
  hero_intro       text,
  region           text,
  vertical_focus   text,
  stop_count       integer default 0,
  short_code       text unique,
  published        boolean default false,
  duration_hours   text,
  best_season      text,
  curator_name     text,
  curator_note     text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ============================================================
-- trail_stops table
-- ============================================================
create table trail_stops (
  id              uuid primary key default gen_random_uuid(),
  trail_id        uuid not null references trails(id) on delete cascade,
  listing_id      uuid references listings(id) on delete set null,
  vertical        text not null,
  venue_name      text not null,
  venue_lat       double precision,
  venue_lng       double precision,
  venue_image_url text,
  order_index     integer not null default 0,
  notes           text,
  created_at      timestamptz default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index trails_slug_idx        on trails(slug);
create index trails_short_code_idx  on trails(short_code);
create index trails_created_by_idx  on trails(created_by);
create index trails_type_vis_idx    on trails(type, visibility);
create index trail_stops_order_idx  on trail_stops(trail_id, order_index);

-- ============================================================
-- Auto-update updated_at (reuses function from 002_core_listings)
-- ============================================================
create trigger trails_updated_at
  before update on trails
  for each row execute function update_updated_at();
