-- 223: Security hardening — close RLS gaps + council OTP brute-force cap.
--
-- Part A — RLS on three public tables that were created without it.
--   Migration 171 enabled RLS across the public schema via an EXPLICIT table
--   list, so any table added before-but-unlisted (listing_category_synonyms)
--   or after 171 (search_rerank_cache, listing_gate_check) was left with RLS
--   OFF. In this project the anon/authenticated roles reach public tables via
--   PostgREST, so RLS-OFF = world read/write. All three are written and read
--   ONLY through the service-role key (getSupabaseAdmin), which bypasses RLS —
--   so enabling RLS with NO policy locks out anon/authenticated while leaving
--   every server-side code path working. ENABLE is idempotent (safe re-run).
--
--     • listing_category_synonyms — search reference data (autocomplete).
--     • search_rerank_cache       — server-side rerank cache.
--     • listing_gate_check        — internal admin quality-gate queue; exposed
--                                    internal "dead/parked/dormant" assessments
--                                    of real businesses (confidentiality) and
--                                    was anon-writable (integrity).
--
-- Part B — council OTP guess cap.
--   council_accounts.magic_link_token is a 6-digit code; before this the code
--   survived unlimited wrong guesses (the only limiter was a spoofable
--   per-IP in-memory Map). magic_link_attempts lets the verify handler burn the
--   code after MAX_OTP_ATTEMPTS wrong guesses — a per-account cap that IP
--   spoofing can't defeat. Defaults 0; reset on each new code.

alter table if exists public.listing_category_synonyms enable row level security;
alter table if exists public.search_rerank_cache        enable row level security;
alter table if exists public.listing_gate_check         enable row level security;

alter table if exists public.council_accounts
  add column if not exists magic_link_attempts integer not null default 0;
