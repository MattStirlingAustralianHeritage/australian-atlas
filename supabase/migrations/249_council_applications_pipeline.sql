-- Council applications pipeline — turn enquiries into a real join/approval funnel.
--
-- Before this, /council/enquire only captured a lead (name/org/email + a FREE-TEXT
-- region) into council_enquiries and emailed councils@. There was no way to tie a
-- lead to an official region, no admin surface to act on it, and provisioning a
-- real council_account was manual retyping. Result: 94 outreach emails, 102 enquire
-- pageviews, 0 real signups.
--
-- This migration:
--   1. Anchors each enquiry to a real regions row (region_id) plus a denormalised
--      region_name, so admin knows exactly which region is being joined.
--   2. Links an enquiry to the council_account it becomes (council_account_id) and
--      records when it was reviewed / provisioned, so the funnel has state.
--   3. Adds a one-click magic-link login token to council_accounts so a freshly
--      provisioned council can go from "approved" to "inside their region" in one
--      click from the welcome email — no code typing.
--
-- council_enquiries stays RLS-locked with no policies (service-role only), same as
-- migration 180. Every column is nullable/back-compatible; the enquire route and
-- admin surfaces degrade gracefully if this is not yet applied.

-- ── 1. Enquiry → application funnel columns ─────────────────────────────────
alter table public.council_enquiries
  add column if not exists region_id           uuid references public.regions(id) on delete set null,
  add column if not exists region_name         text,
  add column if not exists council_account_id  uuid references public.council_accounts(id) on delete set null,
  add column if not exists reviewed_at          timestamptz,
  add column if not exists provisioned_at       timestamptz,
  add column if not exists notes                text;

-- status vocabulary: 'new' (default) | 'provisioned' | 'declined' | 'test'
-- (kept as free text — no CHECK — so the code owns the vocabulary and old rows
--  such as 'test' remain valid.)

-- Inbox query hits status heavily; index it (created_at index already exists).
create index if not exists idx_council_enquiries_status
  on public.council_enquiries (status, created_at desc);

-- ── 2. One-click magic-link login for freshly provisioned councils ──────────
-- Distinct from the 6-digit OTP (magic_link_token): this is a long, single-use,
-- URL-embedded token issued at provisioning time so the very first email a
-- council receives logs them straight into their region dashboard on click.
alter table public.council_accounts
  add column if not exists login_link_token       text,
  add column if not exists login_link_expires_at  timestamptz;

create index if not exists idx_council_accounts_login_link_token
  on public.council_accounts (login_link_token)
  where login_link_token is not null;

-- Reload PostgREST schema cache so the new columns are visible to the API.
notify pgrst, 'reload schema';
