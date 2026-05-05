-- ============================================================
-- 116_cultural_authority_review.sql
--
-- Cultural authority review queue for Way Atlas Gate 4
-- evaluation. Per Way Atlas Specification Section VI (May 2026)
-- and the architectural clarifications: queue lives on the
-- portal DB (not the Way project) so admin tooling can read
-- without cross-project joins.
--
-- Workflow:
--   1. A Way candidate enters Candidate Review with
--      primary_type = 'cultural_tour'. The queue trigger
--      (way_meta_cultural_authority_queue) inserts a pending
--      row into this table on way_meta INSERT or UPDATE where
--      the listing meets the gate criteria and is not yet
--      verified.
--   2. Admin reviews evidence (operator's stated authority,
--      community endorsement, ROC accreditation, etc.) and
--      sets review_status to 'verified', 'rejected', or
--      'needs_more_info'.
--   3. On 'verified', the resolution trigger flips
--      way_meta.cultural_authority_verified = true and
--      records reviewer + timestamp.
--   4. The publication gate (118_way_cultural_authority_gate.sql)
--      prevents promotion of a cultural_tour listing to
--      status='active' until verification lands.
--
-- The queue is editorial infrastructure, not commercial. No
-- automated process resolves entries. Admin review only.
-- ============================================================

create table cultural_authority_review (
  id                  uuid primary key default gen_random_uuid(),
  listing_id          uuid not null references listings(id) on delete cascade,

  submitted_at        timestamptz not null default now(),
  submission_source   text check (submission_source in ('discovery','claim','admin','sync')),

  authority_claim     text,                    -- The operator's claim of authorisation, as stated.
  evidence_urls       jsonb not null default '[]'::jsonb,
  source_excerpts     jsonb not null default '[]'::jsonb,   -- Source-bound excerpts from discovery pipeline.

  review_status       text not null check (review_status in (
                        'pending','verified','rejected','needs_more_info'
                      )) default 'pending',
  reviewed_by         uuid references auth.users(id) on delete set null,
  reviewed_at         timestamptz,
  review_notes        text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index cultural_authority_review_listing_idx     on cultural_authority_review (listing_id);
create index cultural_authority_review_status_idx      on cultural_authority_review (review_status);
create index cultural_authority_review_pending_idx     on cultural_authority_review (submitted_at)
                                                        where review_status = 'pending';

create trigger cultural_authority_review_updated_at
  before update on cultural_authority_review
  for each row execute function update_updated_at();


-- ─── Queue trigger: enqueue on way_meta insert/update ─────────────────
-- Fires when a Way listing is tagged cultural_tour and not yet
-- verified. Idempotent — only enqueues if no pending review row
-- already exists for this listing.

create or replace function way_meta_cultural_authority_queue()
returns trigger as $$
begin
  -- Gate 4 fires only for cultural_tour listings (Spec §VI).
  if new.primary_type <> 'cultural_tour' then
    return new;
  end if;

  -- Skip if already verified.
  if new.cultural_authority_verified = true then
    return new;
  end if;

  -- Skip if a pending review already exists for this listing.
  if exists (
    select 1 from cultural_authority_review
     where listing_id = new.listing_id
       and review_status in ('pending','needs_more_info')
  ) then
    return new;
  end if;

  insert into cultural_authority_review (
    listing_id,
    submission_source,
    review_status
  ) values (
    new.listing_id,
    case when tg_op = 'INSERT' then 'sync' else 'admin' end,
    'pending'
  );

  return new;
end;
$$ language plpgsql;

drop trigger if exists way_meta_cultural_authority_queue_trg on way_meta;
create trigger way_meta_cultural_authority_queue_trg
  after insert or update of primary_type, cultural_authority_verified
  on way_meta
  for each row execute function way_meta_cultural_authority_queue();


-- ─── Resolution trigger: flip way_meta on review_status='verified' ────
-- Fires when a review row resolves. Writes the verification
-- state back to way_meta so the publication gate can read it.

create or replace function cultural_authority_review_resolve()
returns trigger as $$
begin
  -- Only act on transitions to a terminal state.
  if new.review_status = old.review_status then
    return new;
  end if;

  if new.review_status = 'verified' then
    update way_meta
       set cultural_authority_verified    = true,
           cultural_authority_verified_at = now(),
           cultural_authority_verified_by = new.reviewed_by,
           cultural_authority_source      = coalesce(new.review_notes, way_meta.cultural_authority_source),
           cultural_authority_notes       = new.review_notes
     where listing_id = new.listing_id;
  elsif new.review_status = 'rejected' then
    -- Explicit rejection — clear any previously-set verification
    -- and record the rejection. The publication gate will block
    -- this listing from going active.
    update way_meta
       set cultural_authority_verified    = false,
           cultural_authority_verified_at = null,
           cultural_authority_verified_by = null,
           cultural_authority_notes       = new.review_notes
     where listing_id = new.listing_id;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists cultural_authority_review_resolve_trg on cultural_authority_review;
create trigger cultural_authority_review_resolve_trg
  after update of review_status
  on cultural_authority_review
  for each row execute function cultural_authority_review_resolve();
