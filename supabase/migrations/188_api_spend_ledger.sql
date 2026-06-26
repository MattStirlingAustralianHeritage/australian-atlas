-- Migration 188: API spend ledger + atomic reserve/reconcile RPCs.
--
-- Backs lib/budget/governor.js, which enforces a hard monthly ceiling on paid
-- third-party APIs (Anthropic, Voyage, Google Places) so total spend can't
-- exceed ~$20/month. One row per (month, api) holds the running estimated cost.
--
-- api_spend_reserve atomically reserves an estimated cost IF it stays under the
-- cap (row-level lock → safe under concurrent serverless invocations).
-- api_spend_add reconciles the reservation with the call's actual cost.
-- ============================================================================

create table if not exists api_spend_ledger (
  period_month  text not null,            -- 'YYYY-MM'
  api           text not null,            -- 'anthropic' | 'voyage' | 'google_places'
  est_cost_usd  numeric not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (period_month, api)
);

comment on table api_spend_ledger is
  'Monthly running estimated spend per paid API, enforced by lib/budget/governor.js to hold a ~$20/month ceiling. Service-role only.';

-- Service-role-only: enable RLS with no policies so anon/authed clients are
-- denied; the governor uses the service-role key which bypasses RLS.
alter table api_spend_ledger enable row level security;

-- Atomically reserve `p_est` against this month's spend for `p_api`, but only
-- if it keeps the total at/under `p_cap`. Returns true (reserved) or false.
create or replace function api_spend_reserve(p_month text, p_api text, p_est numeric, p_cap numeric)
returns boolean
language plpgsql
as $$
declare
  cur numeric;
begin
  insert into api_spend_ledger (period_month, api, est_cost_usd)
    values (p_month, p_api, 0)
    on conflict (period_month, api) do nothing;

  select est_cost_usd into cur
    from api_spend_ledger
    where period_month = p_month and api = p_api
    for update;

  if cur + p_est <= p_cap then
    update api_spend_ledger
      set est_cost_usd = est_cost_usd + p_est, updated_at = now()
      where period_month = p_month and api = p_api;
    return true;
  end if;
  return false;
end;
$$;

-- Reconcile a reservation with actual cost (p_delta may be negative). Floors at 0.
create or replace function api_spend_add(p_month text, p_api text, p_delta numeric)
returns void
language plpgsql
as $$
begin
  insert into api_spend_ledger (period_month, api, est_cost_usd)
    values (p_month, p_api, greatest(0, p_delta))
    on conflict (period_month, api) do update
      set est_cost_usd = greatest(0, api_spend_ledger.est_cost_usd + p_delta),
          updated_at = now();
end;
$$;

notify pgrst, 'reload schema';
