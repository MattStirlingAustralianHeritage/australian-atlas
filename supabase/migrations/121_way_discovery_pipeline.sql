-- ============================================================
-- 121_way_discovery_pipeline.sql
--
-- Phase 2B schema: Way Atlas discovery pipeline.
--
-- Two tables:
--   way_candidates          one row per operator under evaluation
--   way_candidate_signals   one row per piece of source-bound evidence
--
-- Architecture (per spec §X build sequence + master prompt + sign-off
-- 2026-05-02):
--   • Discovery runs in 6 stages: first-party sources, editorial press
--     (whitelist), institutional/accreditation, Atlas internal,
--     cross-reference detection, silence signal.
--   • Each stage extracts structured signals into way_candidate_signals.
--     Every signal is source-bound: claim_text + source_url +
--     source_excerpt + source_label + raw_data.
--   • Phase 2C (separate commit) wires the 4-gate scoring (Independence,
--     Character, Destination Quality, Cultural Authority) on top of the
--     accumulated signals.
--
-- Confidence bands on signals (per Q2 sign-off):
--   • high   — well-structured authoritative source (Australian Tourism
--              Awards listing, Ecotourism Australia certification page,
--              first-party operator website with named guides)
--   • medium — structured but variable (institutional member listings,
--              regional tourism body pages)
--   • low    — loose match (forum mentions on advocacy sites, cross-
--              referenced mentions in non-editorial sources)
--   The scoring layer in 2C reads confidence_band and weights
--   accordingly. No bespoke per-body parsers in 2B; structural
--   acknowledgement that signal reliability varies.
--
-- URL validation (per Q1 sign-off):
--   Every returned URL from web_search MUST be validated via polite-
--   fetch before the signal persists. The url_resolved boolean records
--   whether the URL responded with a 2xx; url_validation_status records
--   the HTTP code or 'unreachable'/'invalid'. Signals with
--   url_resolved=false are stored for audit but not surfaced to the
--   scoring layer (filtered at query time).
--
-- Lifecycle:
--   way_candidates.status:
--     'discovering' — pipeline is running or just ran; signals fresh
--     'scored'      — Phase 2C scoring has been applied
--     'listed'      — promoted to operators table on Way project
--                     (Phase 5+ when activation runs)
--     'rejected'    — failed at one of the four gates
--   Status transitions are application-managed, not trigger-managed.
-- ============================================================

create table way_candidates (
  id                       uuid primary key default gen_random_uuid(),

  -- Identity. name + website_url are the canonical de-dupe key; an
  -- operator without a website hasn't passed the editorial bar yet so
  -- website_url is required. Matches the prospector pipeline's hard
  -- editorial gate (every Way listing needs a verified website).
  name                     text not null,
  slug                     text not null,
  website_url              text not null,

  -- Discovery hints. Populated by the seed (CLI input or Places
  -- discovery) and refined by Stage 1 first-party fetches.
  primary_type_guess       text,                      -- one of the 17 Way primary_types
  region_hints             text[] not null default '{}'::text[],
  state                    char(3) check (state is null or state in ('VIC','NSW','QLD','SA','WA','TAS','ACT','NT')),

  -- Lifecycle.
  status                   text not null default 'discovering' check (status in (
                             'discovering','scored','listed','rejected'
                           )),
  rejection_reason         text,
  rejection_gate           int check (rejection_gate is null or rejection_gate between 1 and 4),

  -- Discovery seed metadata.
  discovery_source         text not null default 'cli_seed' check (discovery_source in (
                             'cli_seed','places_auto','manual_admin','cross_reference'
                           )),
  discovery_seeded_by      uuid references auth.users(id) on delete set null,

  -- Run tracking.
  last_run_at              timestamptz,
  run_count                integer not null default 0,

  -- Scoring (populated in Phase 2C).
  gate_1_independence      text check (gate_1_independence is null or gate_1_independence in ('pass','fail')),
  gate_2_character_score   int  check (gate_2_character_score is null or gate_2_character_score between 0 and 30),
  gate_3_destination_score int  check (gate_3_destination_score is null or gate_3_destination_score between 0 and 30),
  gate_4_cultural_authority text check (gate_4_cultural_authority is null or gate_4_cultural_authority in ('pass','fail','not_applicable')),
  total_score              int  check (total_score is null or total_score between 0 and 60),
  scored_at                timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  unique (slug),
  unique (website_url)
);

create index way_candidates_status_idx           on way_candidates (status);
create index way_candidates_discovery_source_idx on way_candidates (discovery_source);
create index way_candidates_total_score_idx      on way_candidates (total_score desc nulls last)
                                                   where status = 'scored';
create index way_candidates_region_hints_gin     on way_candidates using gin (region_hints);

create trigger way_candidates_updated_at
  before update on way_candidates
  for each row execute function update_updated_at();


-- ─── way_candidate_signals ───────────────────────────────────────────

create table way_candidate_signals (
  id                       uuid primary key default gen_random_uuid(),
  candidate_id             uuid not null references way_candidates(id) on delete cascade,

  -- Stage produced this signal. 1-6 per spec.
  stage                    int not null check (stage between 1 and 6),

  -- signal_type uses dotted notation for stage namespace + signal kind.
  -- Examples:
  --   stage 1: first_party.operator_name, first_party.guide_named,
  --            first_party.guide_qualification, first_party.duration,
  --            first_party.price, first_party.season,
  --            first_party.cultural_authority_claim,
  --            first_party.country_named, first_party.method_described,
  --            first_party.aboriginal_partnership
  --   stage 2: editorial_press.article
  --   stage 3: institutional.award, institutional.certification,
  --            institutional.member_listing
  --   stage 4: atlas_internal.article_mention,
  --            atlas_internal.field_trail_mention
  --   stage 5: cross_reference.operator_mention,
  --            cross_reference.trail_mention
  --   stage 6: silence.press_24mo, silence.awards_5yr,
  --            silence.institutional_certification
  -- The dotted strings are validated by application code, not a CHECK
  -- constraint — keeps the catalogue editable as new signal kinds
  -- emerge during calibration.
  signal_type              text not null,

  -- Source binding (the load-bearing rule from Pitch System Design §1).
  -- Every claim must be traceable. claim_text and source_url are both
  -- required. source_excerpt is the literal text fragment from the
  -- source that supports the claim.
  claim_text               text not null,
  source_url               text not null,
  source_excerpt           text,
  source_label             text,                      -- e.g. "Australian Tourism Awards 2024 winners — Aboriginal & Torres Strait Islander Tourism"

  -- Confidence band. Per Q2 sign-off — institutional signals especially
  -- vary in reliability. Scoring layer (2C) reads this to weight.
  confidence_band          text not null default 'medium' check (confidence_band in ('high','medium','low')),

  -- URL validation. Per Q1 sign-off — every web_search-returned URL is
  -- fetched via polite-fetch before persistence. Signals where the URL
  -- doesn't resolve are stored for audit but filtered out by the
  -- scoring layer's view (way_candidate_signals_validated below).
  url_resolved             boolean not null default false,
  url_validation_status    text,                      -- HTTP code as text, or 'unreachable'/'invalid'/'fetch_error'
  url_validated_at         timestamptz,

  -- Stage-specific structured fields. Examples by stage:
  --   stage 1: { url_path: '/about', extracted_field: 'guide_name', value: 'Brendan Maher' }
  --   stage 2: { publication: 'Australian Geographic', published_date: '2024-03-15',
  --              search_query: '...', raw_search_response: {...} }
  --   stage 3: { body: 'Australian Tourism Awards', year: 2023,
  --              award_category: 'Aboriginal & Torres Strait Islander Tourism' }
  --   stage 4: { atlas_entity_type: 'article'|'field_place', atlas_entity_id: <uuid> }
  --   stage 5: { referenced_entity_type: 'operator'|'trail', referenced_name: '...' }
  --   stage 6: { silence_type: 'press_24mo', threshold_period: '24 months', count_found: 0 }
  raw_data                 jsonb not null default '{}'::jsonb,

  -- Provenance for re-runs. The pipeline can re-run signal extraction;
  -- run_id groups signals from the same pipeline execution so older
  -- runs can be archived.
  run_id                   uuid not null,

  created_at               timestamptz not null default now()
);

create index way_candidate_signals_candidate_idx     on way_candidate_signals (candidate_id);
create index way_candidate_signals_stage_idx         on way_candidate_signals (candidate_id, stage);
create index way_candidate_signals_signal_type_idx   on way_candidate_signals (signal_type);
create index way_candidate_signals_run_idx           on way_candidate_signals (run_id);
create index way_candidate_signals_validated_idx     on way_candidate_signals (candidate_id, stage)
                                                      where url_resolved = true;


-- ─── View: validated signals for the scoring layer ───────────────────
-- Phase 2C's gate scoring queries this view, not the underlying table,
-- so URL-unresolved signals (failed validation) are auto-filtered.
-- Stage 6 silence signals have synthetic source_urls (the silence is
-- about absent evidence, not a fetched page) and are exempted by the
-- stage filter — silence signals are always "validated" since there's
-- no remote source to validate.

create or replace view way_candidate_signals_validated as
select *
  from way_candidate_signals
 where stage = 6
    or url_resolved = true;
