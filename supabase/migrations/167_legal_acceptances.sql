-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 167: legal_acceptances (who accepted which doc, when)
-- ============================================================
--
-- One row per (subject, document) acceptance. Written by the claim-acceptance
-- gate (POST /api/claim) and reusable by any future gate. Captures the exact
-- document version, timestamp, IP, and user agent so the consent chain is
-- auditable.
--
-- ⚠️  PRE-ACCOUNT ADAPTATION (design note):
--     A listing is claimed by an ANONYMOUS request first (name + email only);
--     the operator's account/profile is only created later on admin approval.
--     So at the moment of acceptance there is usually NO profiles row yet.
--     Therefore:
--       • operator_id is NULLABLE (back-fillable once the account exists), and
--       • claim_id (FK claims_review) + subject_email are captured so every
--         acceptance is attributable even before an account exists.
--     A CHECK guarantees at least one of the three identifiers is present.
--     The (operator_id, document_id) index from the spec is retained.
--
-- ── ROLLBACK (full) ─────────────────────────────────────────
--   drop table if exists legal_acceptances cascade;
-- ============================================================

create table if not exists legal_acceptances (
  id            uuid primary key default gen_random_uuid(),
  -- Subject of the acceptance (>= 1 of these must be set):
  operator_id   uuid references profiles(id) on delete set null,        -- once the account exists
  claim_id      uuid references claims_review(id) on delete set null,   -- the originating claim request
  subject_email text,                                                   -- email used at acceptance time
  -- What was accepted:
  document_id   uuid not null references legal_documents(id) on delete restrict,
  doc_type      text not null,        -- denormalised for easy "did they accept upload_terms?" queries
  doc_version   integer not null,
  content_hash  text,                 -- hash of the exact bytes shown (from legal_documents.content_hash)
  -- When / from where:
  accepted_at   timestamptz not null default now(),
  ip_address    text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  constraint legal_acceptances_has_subject
    check (operator_id is not null or claim_id is not null or subject_email is not null)
);

-- Spec index.
create index if not exists legal_acceptances_operator_document_idx
  on legal_acceptances (operator_id, document_id);
-- Traceability lookups for the pre-account path.
create index if not exists legal_acceptances_claim_idx
  on legal_acceptances (claim_id);
create index if not exists legal_acceptances_subject_email_idx
  on legal_acceptances (subject_email);

-- RLS: acceptance records carry IP/UA/email — service-role only (no public policy).
alter table legal_acceptances enable row level security;

comment on table legal_acceptances is
  'Audit log of legal_documents acceptances. operator_id is nullable because acceptance happens at anonymous claim time (pre-account); claim_id + subject_email keep it attributable. Service-role only (RLS, no policy).';
comment on column legal_acceptances.operator_id is
  'Profile/user who accepted, once an account exists. NULL at claim-request time — back-fill on approval. See claim_id/subject_email for the pre-account link.';

notify pgrst, 'reload schema';
