-- ============================================================
-- Australian Atlas — Migration 252: For Press / the Newsroom (beta).
--
-- A free press programme for journalists and media of every size — from a
-- one-person regional newsletter to a national masthead. Mirrors the council
-- beta's account model: an admin-approved account row IS the login identity
-- (passwordless OTP by email, HMAC cookie session, no Supabase Auth user),
-- and every read/write goes through the service-role client. RLS is enabled
-- with no policies on all press tables — nothing here is anon-readable.
--
-- Tables:
--   press_accounts     — one row per approved press member (the login)
--   press_follows      — member ↔ region follows (drives notifications)
--   press_enquiries    — beta access requests from /newsroom/enquire
--   press_leads        — story leads / releases / data notes published by
--                        the editorial desk to the newsroom (with optional
--                        embargo)
--   press_requests     — interview / data / comment requests from members
--   press_feedback     — beta feedback (mirrors council_feedback)
--   press_activity     — lightweight audit trail (mirrors council_activity)
--   press_auth_log     — login attempt log (mirrors council auth logging)
--   press_event_sends  — idempotency ledger: one row per (member, event)
--                        notification, inserted BEFORE sending
--   press_lead_sends   — same ledger for published leads
--
-- Purely additive: no existing table, view, policy or trigger is touched.
-- Rollback: DROP TABLE press_lead_sends, press_event_sends, press_auth_log,
--   press_activity, press_feedback, press_requests, press_leads,
--   press_enquiries, press_follows, press_accounts;  (in that order)
-- ============================================================

BEGIN;

-- ── The login identity: one approved account per press member ─────────────
create table if not exists press_accounts (
  id uuid primary key default gen_random_uuid(),

  -- Who they are
  name text not null,                       -- the person
  outlet text not null,                     -- the publication / channel
  slug text not null unique,
  outlet_type text not null default 'other' check (outlet_type in (
    'national', 'metro', 'regional', 'local', 'newsletter', 'magazine',
    'broadcast', 'podcast', 'online', 'freelance', 'other'
  )),
  contact_email text not null unique,
  role_title text,                          -- e.g. "Food editor"
  website text,

  -- Access
  approved boolean not null default false,  -- admin flips; gate for OTP login
  status text not null default 'active' check (status in ('active', 'suspended', 'cancelled')),

  -- Notification preferences
  -- cadence: how fast event news reaches them. 'instant' = next hourly run.
  cadence text not null default 'instant' check (cadence in ('instant', 'daily', 'weekly', 'off')),
  notify_events boolean not null default true,    -- new events in followed regions
  notify_listings boolean not null default true,  -- new-places roundup in digests
  notify_leads boolean not null default true,     -- story leads from the desk
  beat_verticals text[] not null default '{}',    -- optional beat filter (vertical keys; empty = all)

  -- OTP login state (same shape as council_accounts)
  magic_link_token text,
  magic_link_expires_at timestamptz,
  magic_link_attempts int not null default 0,
  last_login_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table press_accounts enable row level security;

-- ── Region follows — the beat map that drives everything ──────────────────
create table if not exists press_follows (
  id uuid primary key default gen_random_uuid(),
  press_id uuid not null references press_accounts(id) on delete cascade,
  region_id uuid not null references regions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (press_id, region_id)
);

create index if not exists press_follows_press_idx on press_follows(press_id);
create index if not exists press_follows_region_idx on press_follows(region_id);

alter table press_follows enable row level security;

-- ── Beta access requests (public form; an admin provisions the account) ───
create table if not exists press_enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  outlet text,
  outlet_type text,
  email text not null,
  regions text,                             -- free text: what they cover
  message text,
  source text not null default 'for-press-beta',
  status text not null default 'new' check (status in ('new', 'approved', 'declined', 'archived')),
  created_at timestamptz not null default now()
);

alter table press_enquiries enable row level security;

-- ── Story leads / releases published by the editorial desk ────────────────
create table if not exists press_leads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,                    -- the one-paragraph pitch
  body text,                                -- optional fuller notes
  lead_type text not null default 'story_lead' check (lead_type in (
    'story_lead', 'release', 'data_note', 'milestone'
  )),
  region_id uuid references regions(id) on delete set null,  -- NULL = network-wide
  vertical text,                            -- optional vertical key
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  embargo_until timestamptz,                -- shown with an embargo badge; not emailed before this
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists press_leads_status_idx on press_leads(status, published_at desc);
create index if not exists press_leads_region_idx on press_leads(region_id);

alter table press_leads enable row level security;

-- ── Requests from members: interviews, data pulls, comment, images ────────
create table if not exists press_requests (
  id uuid primary key default gen_random_uuid(),
  press_id uuid references press_accounts(id) on delete set null,
  -- Denormalised so a request survives account deletion (erasure keeps the
  -- work item, not the identity — these are cleared on erasure).
  press_name text,
  outlet text,
  contact_email text,
  request_type text not null default 'other' check (request_type in (
    'interview', 'data', 'comment', 'images', 'other'
  )),
  listing_id uuid references listings(id) on delete set null,
  region_id uuid references regions(id) on delete set null,
  subject text not null,
  message text not null,
  deadline date,
  status text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists press_requests_press_idx on press_requests(press_id, created_at desc);
create index if not exists press_requests_status_idx on press_requests(status);

alter table press_requests enable row level security;

-- ── Beta feedback (mirrors council_feedback) ──────────────────────────────
create table if not exists press_feedback (
  id uuid primary key default gen_random_uuid(),
  press_id uuid references press_accounts(id) on delete set null,
  press_name text,
  category text,
  message text not null,
  page text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table press_feedback enable row level security;

-- ── Audit trail (mirrors council_activity) ────────────────────────────────
create table if not exists press_activity (
  id uuid primary key default gen_random_uuid(),
  press_id uuid not null references press_accounts(id) on delete cascade,
  action text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists press_activity_press_idx on press_activity(press_id, created_at desc);

alter table press_activity enable row level security;

-- ── Login attempt log ──────────────────────────────────────────────────────
create table if not exists press_auth_log (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  success boolean not null,
  failure_reason text,
  ip_address text,
  created_at timestamptz not null default now()
);

alter table press_auth_log enable row level security;

-- ── Notification ledgers — insert BEFORE send, unique key = never twice ───
-- A press member hears about a given event exactly once, whatever their
-- cadence. Re-runs and concurrent runs hit the unique constraint (23505)
-- and skip.
create table if not exists press_event_sends (
  id uuid primary key default gen_random_uuid(),
  press_id uuid not null references press_accounts(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  cadence text not null,                    -- which lane sent it
  sent_to text,
  sent_at timestamptz not null default now(),
  unique (press_id, event_id)
);

create index if not exists press_event_sends_event_idx on press_event_sends(event_id);

alter table press_event_sends enable row level security;

create table if not exists press_lead_sends (
  id uuid primary key default gen_random_uuid(),
  press_id uuid not null references press_accounts(id) on delete cascade,
  lead_id uuid not null references press_leads(id) on delete cascade,
  sent_to text,
  sent_at timestamptz not null default now(),
  unique (press_id, lead_id)
);

alter table press_lead_sends enable row level security;

COMMIT;

-- ── Verification (run after) ─────────────────────────────────────────────
-- SELECT table_name FROM information_schema.tables WHERE table_schema='public'
--   AND table_name LIKE 'press_%' ORDER BY 1;
-- Expect: press_accounts, press_activity, press_auth_log, press_enquiries,
--   press_event_sends, press_feedback, press_follows, press_lead_sends,
--   press_leads, press_requests
