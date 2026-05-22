-- 129_drop_orphaned_pitch_functions.sql
-- Drop functions orphaned by the Phase 2 rewrite.
-- compute_venue_pitch_score and validate_pitch_grounding were superseded
-- by the new fact-check + confidence + bail-detection pipeline in
-- lib/pitch/*. Confirmed orphaned via scripts/_verify_orphaned_functions.mjs.

DROP FUNCTION IF EXISTS compute_venue_pitch_score CASCADE;
DROP FUNCTION IF EXISTS validate_pitch_grounding CASCADE;
