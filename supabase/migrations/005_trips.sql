-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 005: Trips table
-- ============================================================

-- Phase 1: Anonymous trips with shareable URLs only.
-- Phase 2 (future): User accounts, saved listings, trip ownership.

create table trips (
  id                    uuid primary key default uuid_generate_v4(),
  title                 text,
  slug                  text unique,
  listing_ids           uuid[] not null,
  region                text,
  generated_narrative   text,
  generated_order       jsonb,
  share_count           int default 0,
  created_at            timestamptz default now()
);

create index trips_slug_idx on trips(slug);
create index trips_region_idx on trips(region);
