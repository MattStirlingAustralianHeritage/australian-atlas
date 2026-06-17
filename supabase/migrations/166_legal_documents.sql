-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 166: legal_documents (versioned legal/consent docs)
-- ============================================================
--
-- Part of the legal-safeguard infrastructure for operator uploads + Terms
-- acceptance. Australia gives commercial platforms NO copyright safe harbour,
-- so every hosted asset needs a logged consent/warranty chain. This table is
-- the SOURCE OF TRUTH for the human-readable legal text that operators affirm.
--
-- The claim-acceptance gate and the upload-warranty gate render the CURRENT
-- version of a doc_type straight from this table (is_current = true), so the
-- legal wording can be swapped later as a DATA change, not a code change.
--
-- ⚠️  INTERIM COPY — NOT FINAL / NON-BINDING. The seeded body_md below is the
--     plain-English INTERIM wording supplied by the operator, pending review by
--     a solicitor. It is intentionally short and must be replaced with reviewed
--     legal copy before this is relied upon. Replacing it = insert a new version
--     row and flip is_current (see the bottom of this file for the pattern).
--
-- Convention notes:
--   • doc_type is TEXT + CHECK (not a native PG enum) to match the repo's
--     existing pattern (listings.status, image_moderation_status, etc.) — easy
--     to extend, fully reversible.
--   • content_hash = hex sha256 of body_md (core sha256(), no pgcrypto needed),
--     so an acceptance can be tied to the exact bytes that were shown.
--
-- ── ROLLBACK (full) ─────────────────────────────────────────
--   drop policy if exists legal_documents_public_read on legal_documents;
--   drop table if exists legal_documents cascade;   -- cascades to legal_acceptances.document_id (167)
-- ============================================================

create table if not exists legal_documents (
  id             uuid primary key default gen_random_uuid(),
  doc_type       text not null
                   check (doc_type in ('operator_agreement', 'upload_terms', 'terms_of_service', 'privacy_policy')),
  version        integer not null default 1,
  title          text not null,
  body_md        text not null,
  content_hash   text,
  effective_from timestamptz not null default now(),
  is_current     boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (doc_type, version)
);

-- At most one current version per doc_type.
create unique index if not exists legal_documents_one_current_per_type
  on legal_documents (doc_type)
  where is_current;

-- Fast "give me the live doc for this type" lookup used by the gates.
create index if not exists legal_documents_type_current_idx
  on legal_documents (doc_type)
  where is_current;

-- RLS: legal text is meant to be readable (the gates show it), but only the
-- service role may write. Public (anon/authenticated) may read CURRENT docs.
alter table legal_documents enable row level security;
drop policy if exists legal_documents_public_read on legal_documents;
create policy legal_documents_public_read
  on legal_documents
  for select
  using (is_current = true);

-- ── SEED v1 (INTERIM, NON-BINDING placeholder copy) ─────────
-- Only the two doc_types the live gates render are seeded. terms_of_service and
-- privacy_policy are valid doc_types but intentionally NOT seeded here — no copy
-- was supplied for them and we don't invent legal clauses. Add them as versioned
-- rows when reviewed copy exists.
insert into legal_documents (doc_type, version, title, body_md, is_current, effective_from)
values
  (
    'upload_terms', 1, 'Upload Terms (Interim)',
    'INTERIM TERMS. By uploading, you confirm you own this image or have permission to use it; that it infringes no copyright or moral rights; that it is not defamatory; and that anyone identifiable in it has consented. You grant the Atlas a licence to display and reproduce it across the Atlas network, and you agree to cover us for any loss arising from a breach of these confirmations. We may remove any content at our discretion.',
    true, now()
  ),
  (
    'operator_agreement', 1, 'Operator Agreement (Interim)',
    'INTERIM OPERATOR AGREEMENT. INTERIM TERMS. By uploading, you confirm you own this image or have permission to use it; that it infringes no copyright or moral rights; that it is not defamatory; and that anyone identifiable in it has consented. You grant the Atlas a licence to display and reproduce it across the Atlas network, and you agree to cover us for any loss arising from a breach of these confirmations. We may remove any content at our discretion.',
    true, now()
  )
on conflict (doc_type, version) do nothing;

-- Stamp content_hash for any rows that don't have one yet (idempotent).
update legal_documents
set content_hash = encode(sha256(convert_to(body_md, 'UTF8')), 'hex')
where content_hash is null;

comment on table legal_documents is
  'Versioned legal/consent documents (operator_agreement, upload_terms, terms_of_service, privacy_policy). The acceptance + upload gates render the is_current row of a doc_type, so wording changes are data, not code. Seeded copy is INTERIM/non-binding placeholder pending solicitor review (migration 166).';
comment on column legal_documents.is_current is
  'Exactly one row per doc_type may be current (enforced by legal_documents_one_current_per_type). The gates render the current row.';
comment on column legal_documents.content_hash is
  'Hex sha256 of body_md — lets a legal_acceptances row be tied to the exact bytes shown to the operator.';

notify pgrst, 'reload schema';
