-- Migration 128: Add brands_json JSONB column to commercial_groups
--
-- Replaces the TEXT[] brands column with a JSONB array that carries
-- per-brand match_mode: "exact", "prefix", or "token".
--
-- Three matching modes:
--   exact  — full string equality. For short/generic brands (Oaks, Vibe, QT, W Hotels).
--   prefix — operator name starts with brand. For hotel brands (Sheraton Mirage → Sheraton).
--   token  — brand appears as consecutive complete tokens anywhere. For multi-word group names.
--
-- The old brands TEXT[] column is kept for backward compatibility but
-- Gate 1 now reads brands_json exclusively.

ALTER TABLE commercial_groups
  ADD COLUMN IF NOT EXISTS brands_json JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN commercial_groups.brands_json IS
  'Per-brand matching config. Array of {name, match_mode} objects. match_mode: exact|prefix|token.';
