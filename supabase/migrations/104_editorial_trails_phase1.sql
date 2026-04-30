-- ============================================================
-- 104_editorial_trails_phase1.sql
--
-- Editorial Trails Phase 1 — extend trails + trail_stops in place
-- (Option A from the Phase 1 spec discussion), add trail_pitches and
-- trail_revisions, backfill existing rows so they keep working.
--
-- Decisions baked in:
--   - Existing user-curated trails (type='user') keep functioning. Their
--     `status` column stays NULL — they aren't part of the editorial
--     workflow. Anything querying by status should filter
--     `status IS NOT NULL` for editorial trails specifically.
--   - Existing editorial trails (type='editorial') get backfilled to
--     status='published' if `published=true`, else 'draft'.
--   - cover_image_url renamed to hero_image_url; old reads break — admin
--     UI is being replaced this phase, so this is intended.
--   - order_index renamed to position; notes renamed to editorial_copy.
--   - region (text) stays for now alongside region_id (uuid FK); old
--     editorial trails have free-text regions that need manual mapping.
--   - author_id and editor_id reference auth.users directly per spec
--     (Phase 2 will introduce admin_users + partner_orgs).
--   - Partner Phase 2 prep: partner_org_id, partner_credit_line on trails
--     and submitted_by_partner_id on trail_pitches are present as nullable
--     uuid columns, with no FK target yet.
--
-- Rollback (in reverse order):
--   drop table if exists trail_revisions;
--   drop table if exists trail_pitches;
--   alter table trail_stops rename column position to order_index;
--   alter table trail_stops rename column editorial_copy to notes;
--   alter table trail_stops drop column if exists arrival_note;
--   alter table trail_stops drop column if exists day_number;
--   alter table trail_stops drop column if exists is_overnight;
--   alter table trail_stops drop column if exists distance_from_previous_km;
--   alter table trail_stops drop column if exists duration_from_previous_minutes;
--   alter table trails drop column if exists subtitle, intro, outro,
--     hero_image_alt, hero_image_credit, region_id, secondary_region_ids,
--     total_distance_km, total_duration_minutes, day_count, season_window,
--     mood_tags, vertical_mix, author_id, editor_id, status, published_at,
--     last_edited_at, thesis, og_title, og_description, meta_description,
--     partner_org_id, partner_credit_line;
--   alter table trails rename column hero_image_url to cover_image_url;
--
-- Idempotent: safe to re-run.
-- ============================================================

-- ─── trails: rename, add columns, backfill ─────────────────────────────

-- Rename cover_image_url → hero_image_url (idempotent)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='trails' and column_name='cover_image_url')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='trails' and column_name='hero_image_url') then
    execute 'alter table trails rename column cover_image_url to hero_image_url';
  end if;
end $$;

alter table trails
  add column if not exists subtitle text,
  add column if not exists intro text,
  add column if not exists outro text,
  add column if not exists hero_image_alt text,
  add column if not exists hero_image_credit text,
  add column if not exists region_id uuid references regions(id),
  add column if not exists secondary_region_ids uuid[] default '{}'::uuid[],
  add column if not exists total_distance_km numeric(8,2),
  add column if not exists total_duration_minutes integer,
  add column if not exists day_count integer check (day_count is null or (day_count between 1 and 7)),
  add column if not exists season_window text,
  add column if not exists mood_tags text[] default '{}'::text[],
  add column if not exists vertical_mix text[] default '{}'::text[],
  add column if not exists author_id uuid references auth.users(id) on delete set null,
  add column if not exists editor_id uuid references auth.users(id) on delete set null,
  add column if not exists status text,
  add column if not exists published_at timestamptz,
  add column if not exists last_edited_at timestamptz,
  add column if not exists thesis text,
  add column if not exists og_title text,
  add column if not exists og_description text,
  add column if not exists meta_description text,
  add column if not exists partner_org_id uuid,
  add column if not exists partner_credit_line text;

-- Status check constraint — allow null for legacy user trails not in editorial workflow.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trails_status_check') then
    execute 'alter table trails add constraint trails_status_check check (status is null or status in (''pitch'', ''draft'', ''in_review'', ''published'', ''archived''))';
  end if;
end $$;

-- Backfill status for existing editorial trails. user trails stay NULL.
update trails
   set status = case when published = true then 'published' else 'draft' end
 where type = 'editorial'
   and status is null;

-- Backfill published_at for already-published editorial trails (best-effort: use updated_at).
update trails
   set published_at = updated_at
 where type = 'editorial'
   and status = 'published'
   and published_at is null;

-- Backfill last_edited_at from updated_at for any row that has it null
update trails set last_edited_at = updated_at where last_edited_at is null;

-- Backfill intro from existing description / hero_intro for editorial trails so the field isn't empty
update trails
   set intro = coalesce(intro, hero_intro, description)
 where type = 'editorial'
   and intro is null;

-- ─── trail_stops: rename, add columns ──────────────────────────────────

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='trail_stops' and column_name='order_index')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='trail_stops' and column_name='position') then
    execute 'alter table trail_stops rename column order_index to position';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='trail_stops' and column_name='notes')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='trail_stops' and column_name='editorial_copy') then
    execute 'alter table trail_stops rename column notes to editorial_copy';
  end if;
end $$;

alter table trail_stops
  add column if not exists arrival_note text,
  add column if not exists day_number integer,
  add column if not exists is_overnight boolean default false,
  add column if not exists distance_from_previous_km numeric(8,2),
  add column if not exists duration_from_previous_minutes integer;

-- Reindex position
drop index if exists trail_stops_order_idx;
create index if not exists trail_stops_position_idx on trail_stops (trail_id, position);
create index if not exists trail_stops_day_idx on trail_stops (trail_id, day_number);

-- ─── trail_pitches: NEW ────────────────────────────────────────────────

create table if not exists trail_pitches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  thesis text not null,
  region_id uuid references regions(id),
  secondary_region_ids uuid[] default '{}'::uuid[],
  day_count integer check (day_count is null or (day_count between 1 and 7)),

  -- vertical_weights: { sba: 0.8, craft: 1.0, ... }
  vertical_weights jsonb default '{}'::jsonb,

  must_include_listing_ids uuid[] default '{}'::uuid[],
  must_start_at_listing_id uuid references listings(id) on delete set null,
  must_end_at_listing_id uuid references listings(id) on delete set null,

  max_km_per_day integer default 200,
  season_window text,
  mood_tags text[] default '{}'::text[],
  mood_brief text,

  -- candidate_results: array of { listing_id, score, rationale, suggested_position, suggested_day, distance_from_previous_km, duration_from_previous_minutes }
  candidate_results jsonb,

  promoted_to_trail_id uuid references trails(id) on delete set null,

  -- Phase 2 prep: nullable now, no FK target yet.
  submitted_by_partner_id uuid
);

create index if not exists trail_pitches_created_by_idx on trail_pitches (created_by);
create index if not exists trail_pitches_region_idx on trail_pitches (region_id);
create index if not exists trail_pitches_promoted_idx on trail_pitches (promoted_to_trail_id);
create index if not exists trail_pitches_created_at_idx on trail_pitches (created_at desc);

drop trigger if exists trail_pitches_updated_at on trail_pitches;
create trigger trail_pitches_updated_at
  before update on trail_pitches
  for each row execute function update_updated_at();

-- ─── trail_revisions: NEW ──────────────────────────────────────────────

create table if not exists trail_revisions (
  id uuid primary key default gen_random_uuid(),
  trail_id uuid not null references trails(id) on delete cascade,
  revised_by uuid references auth.users(id) on delete set null,
  revised_at timestamptz not null default now(),

  -- Full snapshot at the moment of save: { trail: {...}, stops: [...] }
  snapshot jsonb not null,

  -- Phase-1 substitute for the comment system; freeform editorial notes
  -- attached to this revision (e.g. "returned to draft because intro reuses
  -- legacy phrasing"). Phase 2 introduces a proper comments table.
  notes text
);

create index if not exists trail_revisions_trail_idx on trail_revisions (trail_id, revised_at desc);
create index if not exists trail_revisions_revised_by_idx on trail_revisions (revised_by);

-- ─── trails indexes for new query patterns ─────────────────────────────

create index if not exists trails_status_idx on trails (status) where status is not null;
create index if not exists trails_region_id_idx on trails (region_id) where region_id is not null;
create index if not exists trails_author_id_idx on trails (author_id) where author_id is not null;
create index if not exists trails_published_at_idx on trails (published_at desc) where status = 'published';
