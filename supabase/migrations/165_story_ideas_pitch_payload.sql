-- 165_story_ideas_pitch_payload.sql
-- Carry the full editorial pitch through to the Editorial Queue.
--
-- When an admin "keeps" a pitch — either from the auto-triage at /admin/pitches
-- or the manual researcher at /admin/pitches/new — the pitch becomes a
-- story_ideas row surfaced on /admin/editorial. Until now only the headline and
-- angle survived that hand-off. The verified facts, research-needed list,
-- editorial framing, scores, supporting venues and provenance — the entire
-- research backbone a writer needs to stay grounded and avoid hallucinating —
-- were dropped on the floor. story_ideas had no structured pitch storage; the
-- manual keep route even folded a few fields into notes text as a stop-gap
-- (see the now-removed composeNotes() helper).
--
-- This adds first-class structured columns mirroring the pitches table, plus a
-- pitch_id back-link and a full pitch_snapshot for anything not first-classed
-- (prompt_version, generated_by/at, fact-check + verification metadata).
--
-- All additive and idempotent: nothing is renamed, dropped, or retyped, so
-- existing story_ideas rows and the code that reads them keep working unchanged.

ALTER TABLE story_ideas
  ADD COLUMN IF NOT EXISTS headline               text,
  ADD COLUMN IF NOT EXISTS editorial_framing      text,
  ADD COLUMN IF NOT EXISTS verified_facts         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS research_needed        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS supporting_listing_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS candidate_score        int,
  ADD COLUMN IF NOT EXISTS confidence_score       int,
  ADD COLUMN IF NOT EXISTS slot_type              text,
  ADD COLUMN IF NOT EXISTS pitch_id               uuid,
  ADD COLUMN IF NOT EXISTS pitch_snapshot         jsonb;

COMMENT ON COLUMN story_ideas.headline IS
  'Proposed article title carried from the kept pitch (distinct from story_angle, the hook).';
COMMENT ON COLUMN story_ideas.editorial_framing IS
  'Voice/framing guidance carried from the kept pitch.';
COMMENT ON COLUMN story_ideas.verified_facts IS
  'Grounded facts from the pitch — array of strings or {claim,field,value}. The writer''s anti-hallucination backbone.';
COMMENT ON COLUMN story_ideas.research_needed IS
  'Open research items from the pitch — array of strings.';
COMMENT ON COLUMN story_ideas.supporting_listing_ids IS
  'Related listing ids referenced by the pitch — array of uuid strings stored as jsonb.';
COMMENT ON COLUMN story_ideas.candidate_score IS
  'Pitch candidate score (0-100) at keep time.';
COMMENT ON COLUMN story_ideas.confidence_score IS
  'Pitch confidence score (0-100) at keep time.';
COMMENT ON COLUMN story_ideas.slot_type IS
  'Editorial slot type the pitch filled (general | new_producer).';
COMMENT ON COLUMN story_ideas.pitch_id IS
  'Back-link to pitches.id for auto-triage keeps (null for manual pitches, which have no pitches row).';
COMMENT ON COLUMN story_ideas.pitch_snapshot IS
  'Full snapshot of the kept pitch for provenance and future fidelity.';

-- Surface the new columns to PostgREST / supabase-js immediately.
NOTIFY pgrst, 'reload schema';
