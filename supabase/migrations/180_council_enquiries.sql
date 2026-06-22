-- Council portal enquiry leads (free founding beta).
--
-- Until now /api/council/enquire only emailed councils@ via Resend — leads were
-- never persisted, so any missed/blocked email was an unrecoverable lost lead.
-- This table captures every enquiry. The route inserts on a best-effort basis
-- (wrapped in try/catch, same as the Resend send), so a not-yet-applied
-- migration never blocks an enquiry — the email still goes out and the user
-- still sees success; persistence simply activates once this is applied.
--
-- RLS is enabled with NO policies: writes/reads happen through the service-role
-- client (getSupabaseAdmin), which bypasses RLS. Anon/auth roles get nothing.

create table if not exists public.council_enquiries (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  organisation  text not null,
  email         text not null,
  region        text not null,
  role          text,
  plan          text,
  message       text,
  source        text not null default 'for-councils-beta',
  status        text not null default 'new',
  created_at    timestamptz not null default now()
);

alter table public.council_enquiries enable row level security;

create index if not exists idx_council_enquiries_created_at
  on public.council_enquiries (created_at desc);

-- Reload PostgREST schema cache so the new relation is visible to the API.
notify pgrst, 'reload schema';
