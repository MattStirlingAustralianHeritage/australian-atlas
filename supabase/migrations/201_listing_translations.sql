-- 201_listing_translations.sql
-- Korean launch (feat/ko-launch): per-locale translations for listing content.
--
-- ADDITIVE ONLY. This migration creates a new table and does NOT alter the
-- `listings` table in any way. Translations live beside the source; the English
-- columns on `listings` remain the single source of truth and the render layer
-- falls back to them whenever a translated field is missing.

create table if not exists public.listing_translations (
  listing_id  uuid        not null references public.listings(id) on delete cascade,
  locale      text        not null,
  name        text,
  description text,
  source_hash text,
  model       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (listing_id, locale)
);

comment on table public.listing_translations is
  'Per-locale translations of listing content (name, description). Additive to listings; render layer falls back to listings.* when a field is null/missing. feat/ko-launch.';
comment on column public.listing_translations.source_hash is
  'sha256 of the source English content (name + \0 + description) at translation time; used for idempotent re-runs.';

-- Fast lookups by locale for the render/overlay path.
create index if not exists listing_translations_locale_idx
  on public.listing_translations (locale);

-- Keep updated_at fresh on upsert.
create or replace function public.listing_translations_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_listing_translations_touch on public.listing_translations;
create trigger trg_listing_translations_touch
  before update on public.listing_translations
  for each row execute function public.listing_translations_touch_updated_at();

-- RLS: public content is world-readable; writes are service-role only.
-- (The render path uses the service-role admin client which bypasses RLS; this
-- policy is defence-in-depth and lets the anon key read translations too.)
alter table public.listing_translations enable row level security;

drop policy if exists listing_translations_public_read on public.listing_translations;
create policy listing_translations_public_read
  on public.listing_translations
  for select
  using (true);

-- Reload PostgREST schema cache so the new table is queryable immediately.
notify pgrst, 'reload schema';
