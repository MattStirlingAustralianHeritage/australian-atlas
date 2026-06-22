-- Council beta feedback channel.
--
-- Authenticated councils submit feedback from the dashboard
-- (/council/feedback → POST /api/council/feedback). The route persists here
-- (service-role) and notifies councils@ via Resend. Same best-effort pattern as
-- council_enquiries (migration 180): the insert is wrapped in try/catch, so a
-- not-yet-applied migration never blocks submission — the email still fires and
-- the council still sees success.
--
-- council_id is denormalised alongside council_name so feedback survives even if
-- the account is later removed (on delete set null, not cascade).
--
-- RLS is enabled with NO policies: writes/reads go through the service-role
-- client (getSupabaseAdmin), which bypasses RLS. Anon/auth roles get nothing.

create table if not exists public.council_feedback (
  id           uuid primary key default gen_random_uuid(),
  council_id   uuid references council_accounts(id) on delete set null,
  council_name text,
  category     text not null default 'general',
  message      text not null,
  page         text,
  status       text not null default 'new',
  created_at   timestamptz not null default now()
);

alter table public.council_feedback enable row level security;

create index if not exists idx_council_feedback_created_at
  on public.council_feedback (created_at desc);

-- Reload PostgREST schema cache so the new relation is visible to the API.
notify pgrst, 'reload schema';
