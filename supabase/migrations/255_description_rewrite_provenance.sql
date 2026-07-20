-- 255: rewrite-request provenance on operator description drafts.
--
-- Two additive columns on operator_description_drafts so the admin queue can
-- tell a Claude-produced revision (admin-triggered, addressing an operator's
-- change request) apart from an operator-triggered generation, and can show
-- what the revision was asked to address.
--
--   origin       — 'operator' (default; the operator hit Generate) or
--                  'admin_rewrite' (the admin clicked "Rewrite with Claude").
--   rewrite_note — the instruction bundle the rewrite honoured: the operator's
--                  request-changes note plus any admin guidance.
--
-- Rollback:
--   ALTER TABLE operator_description_drafts DROP COLUMN IF EXISTS origin;
--   ALTER TABLE operator_description_drafts DROP COLUMN IF EXISTS rewrite_note;

ALTER TABLE operator_description_drafts
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'operator';

ALTER TABLE operator_description_drafts
  DROP CONSTRAINT IF EXISTS operator_description_drafts_origin_check;
ALTER TABLE operator_description_drafts
  ADD CONSTRAINT operator_description_drafts_origin_check
  CHECK (origin IN ('operator', 'admin_rewrite'));

ALTER TABLE operator_description_drafts
  ADD COLUMN IF NOT EXISTS rewrite_note TEXT;
