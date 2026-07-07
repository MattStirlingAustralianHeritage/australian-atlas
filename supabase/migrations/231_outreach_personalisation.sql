-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 231: Outreach AI personalisation
-- ============================================================
-- Stores a per-listing AI-written personal opener ({{personal_note}}) on the
-- outreach row so it can be reviewed/edited before send and merged into the
-- email body. Additive / idempotent.
-- ============================================================

ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS personal_note text;
ALTER TABLE operator_outreach ADD COLUMN IF NOT EXISTS personal_note_generated_at timestamptz;
