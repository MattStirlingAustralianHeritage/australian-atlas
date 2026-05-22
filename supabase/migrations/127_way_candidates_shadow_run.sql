-- ============================================================
-- 127_way_candidates_shadow_run.sql
--
-- Add shadow_run boolean to way_candidates to segregate the
-- shadow discovery run output from calibration data.
--
-- Context: the shadow discovery run (May 2026) produces ~300
-- candidates from ATAP/ECO/ATA seed sources. These must be
-- isolated from the 5 calibration rows (cli_seed, May 19) so
-- neither dataset pollutes the other. The admin view at
-- /admin/way-atlas-shadow filters to shadow_run = true only.
-- Nothing from the shadow run flows into Candidate Review
-- without an explicit promotion step.
--
-- Backfill: existing rows get shadow_run = false (calibration).
-- New rows from the shadow discovery pipeline set shadow_run = true.
-- ============================================================

ALTER TABLE way_candidates
  ADD COLUMN IF NOT EXISTS shadow_run BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS way_candidates_shadow_run_idx
  ON way_candidates (shadow_run)
  WHERE shadow_run = true;
