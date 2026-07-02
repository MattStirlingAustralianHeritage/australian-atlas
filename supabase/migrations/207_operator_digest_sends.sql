-- 204_operator_digest_sends.sql
--
-- Idempotency + audit log for the "Your Atlas Week" weekly operator digest
-- (app/api/cron/operator-digest/route.js). One row per digest email actually
-- dispatched to a paid operator: which listing, which claim, which week, who
-- received it, and the metrics snapshot the email was composed from.
--
-- The unique (listing_id, week_start) pair is the idempotency key: the cron
-- inserts BEFORE sending, so a re-run in the same week (manual trigger,
-- platform retry, overlapping invocation) hits 23505 and skips rather than
-- double-emailing an operator.
--
-- metrics is the exact jsonb snapshot rendered into the email — an audit
-- trail for "what did we tell this operator that week".
--
-- NOTE: pay-to-win guard — this table is send bookkeeping only. Nothing may
-- read it to influence search/map/discover ranking or any visitor-facing
-- ordering.

create table if not exists public.operator_digest_sends (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid,
  claim_id   uuid,
  week_start date,
  sent_to    text,
  metrics    jsonb,
  sent_at    timestamptz default now(),
  unique (listing_id, week_start)
);

-- "Who got the digest this week" — the cron's skip-already-sent read.
create index if not exists idx_operator_digest_sends_week
  on public.operator_digest_sends (week_start);

-- RLS: locked down. No policies — reads and writes go through the service
-- role only (the cron writes, admin tooling reads).
alter table public.operator_digest_sends enable row level security;

-- Make PostgREST pick up the new table immediately.
notify pgrst, 'reload schema';
