-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 169: infringement_reports (notice-and-takedown intake + workflow)
-- ============================================================
--
-- The documented notice-and-takedown channel. A rights-holder submits a report
-- via /report-infringement (or the place-page "Report an issue" → copyright
-- option); it persists here, emails the team, and starts at status 'received'.
-- Admins triage it through the status workflow and can trigger an asset takedown
-- (asset_provenance.takedown_status = 'removed', migration 168).
--
-- Soft-archive convention (matches the repo: no hard deletes). Reports are never
-- deleted — archived_at is stamped to hide a report from the active queue while
-- retaining it. status tracks the workflow; archived_at tracks visibility.
--
-- ── ROLLBACK (full) ─────────────────────────────────────────
--   drop table if exists infringement_reports;
-- ============================================================

create table if not exists infringement_reports (
  id                     uuid primary key default gen_random_uuid(),
  listing_slug           text,                                            -- listing the report is about (if any)
  asset_id               uuid references asset_provenance(id) on delete set null,  -- the specific asset (if identified)
  reporter_name          text,
  reporter_email         text,
  rights_basis           text,            -- what right the reporter claims (owner, exclusive licensee, agent, ...)
  allegedly_infringing_url text,
  description            text,
  good_faith_statement   boolean not null default false,  -- "I have a good-faith belief..." — required by the form
  -- Workflow:
  status                 text not null default 'received'
                           check (status in ('received', 'under_review', 'actioned', 'rejected')),
  status_changed_at      timestamptz,
  handled_by             text,            -- admin actor
  internal_notes         text,
  -- Soft-archive (no hard deletes):
  archived_at            timestamptz,
  created_at             timestamptz not null default now()
);

-- Active-queue lookups (most recent first, un-archived only).
create index if not exists infringement_reports_active_idx
  on infringement_reports (created_at desc)
  where archived_at is null;
create index if not exists infringement_reports_status_idx
  on infringement_reports (status)
  where archived_at is null;
create index if not exists infringement_reports_listing_slug_idx
  on infringement_reports (listing_slug);

-- RLS: reports carry reporter PII + internal notes — service-role only.
alter table infringement_reports enable row level security;

comment on table infringement_reports is
  'Notice-and-takedown intake + workflow. Submitted via /report-infringement, emailed to the team, triaged via status (received->under_review->actioned|rejected). Soft-archive via archived_at (no hard deletes). Service-role only (RLS, no policy).';
comment on column infringement_reports.archived_at is
  'Soft-archive marker (no hard deletes). Non-null = hidden from the active admin queue but retained.';

notify pgrst, 'reload schema';
