-- Backfill / repair every taste_profiles row from the current source of truth
-- (user_saves + owned trail_stops). Idempotent and re-runnable — rebuilds from
-- the full positive set each time, so it doubles as the repair tool.
--
-- Run from the primary repo (which has .env.local + node_modules):
--   node scripts/run-migration.mjs \
--     "/abs/path/.aa-worktrees/taste-persistence/scripts/backfill-taste-profiles.sql"
--
-- Fail-loud / all-or-nothing: any per-user recompute error propagates and rolls
-- the run back for a clean retry (see repair_all_taste_profiles, migration 186).

select public.repair_all_taste_profiles() as profiles_recomputed;
