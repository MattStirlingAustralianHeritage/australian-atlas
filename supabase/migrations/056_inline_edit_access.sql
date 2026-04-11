-- ============================================================
-- Migration 056: Add inline_edit_access to profiles
-- Allows granting inline listing edit access to non-admin users
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS inline_edit_access boolean NOT NULL DEFAULT false;
