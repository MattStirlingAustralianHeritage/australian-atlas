-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 168: asset_provenance (per-upload consent/warranty record)
-- ============================================================
--
-- One row per operator image upload, recording the warranty the operator gave
-- and where the file lives. This is the asset side of the consent chain that
-- (with legal_acceptances) substitutes for Australia's missing copyright safe
-- harbour: every hosted operator asset is traceable to a person + a warranty.
--
-- ⚠️  NO ASSETS TABLE (design note):
--     This portal has no per-row asset table. Operator images are storage
--     objects in the public 'listing-images' bucket, referenced as either
--     listings.hero_image_url (hero) or a JSON manifest (gallery). So instead of
--     an asset_id FK, provenance is keyed by listing_id + asset_kind +
--     storage_path (the object path within the bucket), with public_url kept for
--     convenience. infringement_reports.asset_id (migration 169) FKs THIS table.
--
-- Written by POST /api/dashboard/listing/upload AFTER the operator affirms the
-- upload warranty. The route rejects the upload if the warranty isn't affirmed,
-- and a DB CHECK enforces that every provenance row has warranty = true.
--
-- takedown_status is the fast-response lever: an admin can flip an asset to
-- 'removed' (reversible soft-archive — the public gate hides it; the row and the
-- storage object are retained). Follows the repo's no-hard-delete convention.
--
-- ── ROLLBACK (full) ─────────────────────────────────────────
--   drop table if exists asset_provenance cascade;   -- cascades to infringement_reports.asset_id (169)
-- ============================================================

create table if not exists asset_provenance (
  id                          uuid primary key default gen_random_uuid(),
  listing_id                  uuid not null references listings(id) on delete cascade,
  asset_kind                  text not null check (asset_kind in ('hero', 'gallery', 'event')),
  storage_path                text not null,   -- object path within the 'listing-images' bucket
  public_url                  text,
  uploaded_by                 uuid not null references profiles(id) on delete restrict,
  -- Warranty (the operator's affirmation at upload time):
  upload_warranty_accepted    boolean not null default false,
  upload_warranty_accepted_at timestamptz,
  upload_terms_version        integer,         -- which upload_terms version was affirmed
  source_declaration          text,            -- optional: operator's stated source / rights basis
  -- Takedown lifecycle (soft-archive, reversible, logged):
  takedown_status             text not null default 'active'
                                check (takedown_status in ('active', 'flagged', 'removed')),
  takedown_reason             text,
  takedown_changed_at         timestamptz,
  takedown_changed_by         text,            -- admin actor (handled_by-style)
  created_at                  timestamptz not null default now(),
  -- Provenance only ever exists for an affirmed upload.
  constraint asset_provenance_warranty_affirmed check (upload_warranty_accepted = true)
);

create index if not exists asset_provenance_listing_idx
  on asset_provenance (listing_id);
create index if not exists asset_provenance_uploaded_by_idx
  on asset_provenance (uploaded_by);
-- Find taken-down / flagged assets fast (admin queue).
create index if not exists asset_provenance_takedown_idx
  on asset_provenance (takedown_changed_at desc)
  where takedown_status in ('flagged', 'removed');
-- One provenance row per distinct object path.
create unique index if not exists asset_provenance_storage_path_uniq
  on asset_provenance (storage_path);

-- RLS: provenance carries uploader identity + declarations — service-role only.
alter table asset_provenance enable row level security;

comment on table asset_provenance is
  'Per-upload operator consent/warranty record. No assets table exists, so keyed by listing_id + asset_kind + storage_path. Written by /api/dashboard/listing/upload after warranty affirmation (CHECK enforces warranty=true). takedown_status is the reversible soft-archive takedown lever. Service-role only (RLS, no policy).';
comment on column asset_provenance.takedown_status is
  'active | flagged | removed. removed = reversible soft-archive (public gate hides it; row + storage retained). Set by the admin takedown action, logged via takedown_reason/_changed_at/_changed_by.';

notify pgrst, 'reload schema';
