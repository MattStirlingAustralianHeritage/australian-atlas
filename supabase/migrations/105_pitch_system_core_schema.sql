-- ============================================================
-- 105_pitch_system_core_schema.sql
--
-- Pitch System Phase 1 — drop the seven orphaned exploratory
-- tables and create the core schema per docs/pitch-system-design.md.
--
-- Drops (preserved as JSON snapshots at
-- scripts/data/orphaned-pitch-tables-snapshot-2026-04-30/ before
-- this migration runs):
--   pitch_sources, pitch_characters, pitch_character_attributes,
--   pitch_signals, pitches, pitch_score_weights,
--   vertical_noun_mappings.
--
-- Creates the seven tables specified in the design doc's Schema
-- section:
--   pitches, pitch_slots, approved_pitches, rejected_pitches,
--   media_coverage_log, pitch_generation_failures,
--   pitch_score_weights.
--
-- vertical_noun_mappings is recreated separately in migration 108
-- with its 72 rows reseeded from snapshot (the design doc
-- undercounted; the table held substantive seed data).
--
-- Articles → listings linkage for the "recent journal coverage"
-- disqualifier uses articles.listing_tags as a JSONB array of
-- listing UUIDs. Per editor decision 2026-04-30: UUID is the
-- canonical match key, not slug (slugs change with editorial
-- revision; UUIDs are stable). This convention is documented in
-- scripts/pitch-candidates.mjs.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- ─── Drops ────────────────────────────────────────────────────────────

drop table if exists pitch_sources cascade;
drop table if exists pitch_characters cascade;
drop table if exists pitch_character_attributes cascade;
drop table if exists pitch_signals cascade;
drop table if exists pitches cascade;
drop table if exists pitch_score_weights cascade;
drop table if exists vertical_noun_mappings cascade;

-- ─── Enums ────────────────────────────────────────────────────────────

do $$ begin
  if not exists (select 1 from pg_type where typname = 'pitch_slot_type') then
    create type pitch_slot_type as enum ('general', 'new_producer');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'pitch_status') then
    create type pitch_status as enum ('active', 'approved', 'rejected');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'pitch_slot_status') then
    create type pitch_slot_status as enum ('active', 'empty_no_candidates');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'media_publication_tier') then
    create type media_publication_tier as enum ('major_national', 'regional', 'trade', 'blog');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'media_record_source') then
    create type media_record_source as enum ('manual', 'automated_seed', 'automated_refresh');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'pitch_failure_mode') then
    create type pitch_failure_mode as enum ('fact_check_failed', 'insufficient_data_returned', 'llm_error');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'pitch_score_weight_slot_type') then
    create type pitch_score_weight_slot_type as enum ('general', 'new_producer', 'both');
  end if;
end $$;

-- ─── pitch_slots (created first; pitches references it) ───────────────

create table pitch_slots (
  id uuid primary key default gen_random_uuid(),
  vertical text not null,
  slot_index int not null check (slot_index between 1 and 3),
  slot_type pitch_slot_type not null,
  current_pitch_id uuid,
  last_filled_at timestamptz,
  status pitch_slot_status not null default 'active',
  unique (vertical, slot_index, slot_type)
);

create index pitch_slots_vertical_idx on pitch_slots (vertical);
create index pitch_slots_status_idx on pitch_slots (status);

-- ─── pitches ──────────────────────────────────────────────────────────

create table pitches (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references pitch_slots(id) on delete cascade,
  vertical text not null,
  slot_type pitch_slot_type not null,
  status pitch_status not null default 'active',
  anchor_listing_id uuid references listings(id) on delete set null,
  -- supporting_listing_ids: uuid[] without per-element FK (Postgres limitation).
  -- Application enforces these reference real listings.id values.
  supporting_listing_ids uuid[] not null default '{}'::uuid[],
  headline text,
  angle text,
  -- verified_facts: array of { claim, field, value } per design doc
  verified_facts jsonb not null default '[]'::jsonb,
  editorial_framing text,
  research_needed text[] not null default '{}'::text[],
  confidence_score int check (confidence_score is null or confidence_score between 0 and 100),
  candidate_score int check (candidate_score is null or candidate_score between 0 and 100),
  prompt_version text,
  generated_at timestamptz,
  generated_by text,
  fact_check_passed bool not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pitches_slot_idx on pitches (slot_id);
create index pitches_anchor_listing_idx on pitches (anchor_listing_id) where anchor_listing_id is not null;
create index pitches_status_idx on pitches (status);
create index pitches_vertical_status_idx on pitches (vertical, status);

-- Now wire pitch_slots.current_pitch_id → pitches.id (chicken-and-egg solved).
alter table pitch_slots
  add constraint pitch_slots_current_pitch_fk
  foreign key (current_pitch_id) references pitches(id) on delete set null;

-- ─── approved_pitches ─────────────────────────────────────────────────

create table approved_pitches (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references pitches(id) on delete cascade,
  approved_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  written_at timestamptz,
  article_id uuid references articles(id) on delete set null
);

create index approved_pitches_pitch_idx on approved_pitches (pitch_id);
create index approved_pitches_article_idx on approved_pitches (article_id) where article_id is not null;

-- ─── rejected_pitches (no FK on pitch_id; pitches row is deleted) ─────

create table rejected_pitches (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null,
  pitch_snapshot jsonb not null,
  rejected_at timestamptz not null default now(),
  rejected_by uuid references auth.users(id) on delete set null,
  rejection_reason text
);

create index rejected_pitches_pitch_idx on rejected_pitches (pitch_id);

-- ─── media_coverage_log ───────────────────────────────────────────────
-- Used by Phase 1's new-producer disqualifier (>4 entries OR any
-- major_national entry → exclude). Phase 5 of the build seeds it.

create table media_coverage_log (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  publication text not null,
  publication_tier media_publication_tier not null,
  url text,
  title text,
  published_date date,
  recorded_at timestamptz not null default now(),
  recorded_by media_record_source not null default 'manual'
);

create index media_coverage_log_listing_idx on media_coverage_log (listing_id);
create index media_coverage_log_tier_idx on media_coverage_log (publication_tier);
create index media_coverage_log_listing_tier_idx on media_coverage_log (listing_id, publication_tier);

-- ─── pitch_generation_failures ────────────────────────────────────────

create table pitch_generation_failures (
  id uuid primary key default gen_random_uuid(),
  candidate_listing_id uuid references listings(id) on delete set null,
  slot_id uuid references pitch_slots(id) on delete set null,
  failure_mode pitch_failure_mode not null,
  attempted_at timestamptz not null default now(),
  prompt_version text,
  raw_llm_output text,
  failed_claims jsonb
);

create index pitch_generation_failures_listing_idx on pitch_generation_failures (candidate_listing_id);
create index pitch_generation_failures_slot_idx on pitch_generation_failures (slot_id);

-- ─── pitch_score_weights ──────────────────────────────────────────────
-- Phase 1 scoring configuration. Tunable without code changes.
-- Seeded in migration 109.

create table pitch_score_weights (
  id uuid primary key default gen_random_uuid(),
  signal_name text not null,
  weight int not null,
  slot_type pitch_score_weight_slot_type not null,
  vertical text,
  active bool not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index pitch_score_weights_active_idx on pitch_score_weights (active) where active = true;
create index pitch_score_weights_lookup_idx on pitch_score_weights (signal_name, slot_type, vertical, active);

-- ─── updated_at triggers ──────────────────────────────────────────────
-- Reuse update_updated_at() function established in earlier migrations.

drop trigger if exists pitches_updated_at on pitches;
create trigger pitches_updated_at
  before update on pitches
  for each row execute function update_updated_at();

drop trigger if exists pitch_score_weights_updated_at on pitch_score_weights;
create trigger pitch_score_weights_updated_at
  before update on pitch_score_weights
  for each row execute function update_updated_at();
