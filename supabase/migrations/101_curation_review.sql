-- ============================================================
-- Curation review queue
--
-- Each legacy listing is run through a three-gate curation pass
-- (independence / character / destination) before any rewrite.
-- The model's verdict and the reasoning behind it land here.
-- Humans then work the queue in the Humanator.
--
-- Decision values:
--   YAY           — all three gates pass clearly
--   SOFT_YAY      — Gate 1 passes + at least one of Gates 2/3 convincingly
--   NAY           — Gate 1 fails (commercial group) OR Gate 2 hard fails
--                   (template / generic / no specifics)
--   VERIFY        — independence ambiguous and not extrapolatable
--   site_unusable — page is empty / placeholder / under construction
--   fetch_failed  — could not retrieve the page (after retry)
--
-- operator_type_detected values (audit only, free text — not constrained):
--   private              — single-operator, owner-managed
--   commercial_group     — chain / franchise / multi-property hospitality
--   trust                — public trust (e.g. Sydney Harbour Federation Trust)
--   public_heritage      — government / council operated venue
--   concessionaire       — single-operator on parks / public land
--   aboriginal_community — Indigenous community organisation
--   (null when not detectable)
--
-- Append-only: re-running curation on the same listing inserts a
-- fresh row. Latest by created_at is the current recommendation.
--
-- Rollback:
--   DROP TABLE IF EXISTS curation_review;
--
-- Idempotent: safe to re-run.
-- ============================================================

create table if not exists curation_review (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,

  -- Model verdict
  decision text not null check (decision in (
    'YAY', 'SOFT_YAY', 'NAY', 'VERIFY', 'site_unusable', 'fetch_failed'
  )),
  reasoning text,
  gate_1 text check (gate_1 in ('pass', 'fail', 'uncertain')),
  gate_2 text check (gate_2 in ('pass', 'fail', 'uncertain')),
  gate_3 text check (gate_3 in ('pass', 'fail', 'uncertain')),
  group_signal text,                -- name of commercial group if detected, else null
  operator_type_detected text,      -- audit data; see migration comment for expected values

  -- Source material the verdict was based on
  source_url text,
  source_text text,

  -- Human review state
  human_review_status text not null default 'pending'
    check (human_review_status in (
      'pending',
      'confirmed_remove',
      'kept',
      'needs_more_info',
      'recommended_remove'  -- mirror of NAY, used when initial write happens
    )),
  human_reviewer text,
  human_reviewed_at timestamptz,
  human_notes text,

  created_at timestamptz not null default now()
);

create index if not exists idx_curation_review_listing_id
  on curation_review (listing_id);

create index if not exists idx_curation_review_decision
  on curation_review (decision);

create index if not exists idx_curation_review_human_status
  on curation_review (human_review_status);

create index if not exists idx_curation_review_created_at
  on curation_review (created_at desc);
