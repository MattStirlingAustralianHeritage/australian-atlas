-- 191_listing_story_pitches.sql
--
-- Operator-submitted story pitches. A claimed listing applies, from its
-- dashboard Editorial page, to have a story written about it in the Atlas
-- Journal: it gives a brief pitch (the "angle") and that lands in the admin
-- "Listing Pitches" queue (/admin/listing-pitches).
--
-- Deliberately SEPARATE from the AI-generated `pitches` table (which feeds
-- Pitch Triage). This is human, operator-originated, low-volume, and reviewed
-- by hand — it should not touch the generation pipeline.

create table if not exists public.listing_story_pitches (
  id                 uuid primary key default gen_random_uuid(),
  -- the venue the story is about (snapshot name/vertical kept too, so the
  -- queue still reads sensibly if the listing is later removed)
  listing_id         uuid references public.listings(id) on delete set null,
  listing_name       text,
  vertical           text,
  -- who submitted it
  submitted_by       uuid references auth.users(id) on delete set null,
  submitted_by_email text,
  contact_email      text,
  -- the pitch itself
  angle              text not null,
  -- editorial workflow
  status             text not null default 'new'
                       check (status in ('new','reviewing','accepted','declined','published')),
  admin_notes        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_lsp_status     on public.listing_story_pitches (status, created_at desc);
create index if not exists idx_lsp_listing    on public.listing_story_pitches (listing_id);
create index if not exists idx_lsp_submitter  on public.listing_story_pitches (submitted_by);

-- keep updated_at fresh on every edit
create or replace function public.touch_listing_story_pitches_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_lsp_touch on public.listing_story_pitches;
create trigger trg_lsp_touch
  before update on public.listing_story_pitches
  for each row execute function public.touch_listing_story_pitches_updated_at();

-- RLS: locked down. All writes go through the service role (the operator
-- submission API and the admin queue API). Authenticated operators may read
-- their OWN submissions defensively; no anon access, no client-side writes.
alter table public.listing_story_pitches enable row level security;

drop policy if exists lsp_owner_select on public.listing_story_pitches;
create policy lsp_owner_select on public.listing_story_pitches
  for select to authenticated
  using (submitted_by = auth.uid());

-- Make PostgREST pick up the new table immediately.
notify pgrst, 'reload schema';
