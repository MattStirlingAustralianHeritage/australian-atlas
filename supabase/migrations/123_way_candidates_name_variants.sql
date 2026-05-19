-- ============================================================
-- 122_way_candidates_name_variants.sql
--
-- Phase 2B addendum: add name_variants TEXT[] to way_candidates.
--
-- Why: the wukalina Walk calibration run surfaced a Stage 3 false-
-- positive class. Site-scoped web_search returns generic body
-- pages (e.g. ecotourism.org.au's own "ECO Certification" marketing
-- page) that pass URL validation + domain whitelist but DO NOT
-- mention the operator specifically. Stage 3 was persisting these
-- as "wukalina Walk: ECO Certification" claims with the generic
-- body page as source — exactly the fabrication failure mode the
-- pipeline exists to prevent.
--
-- Fix: Stage 3 now fetches each candidate URL's page text and
-- requires the operator name (or a variant) to appear in it before
-- the signal can persist. To make match correctness robust:
--
--   • naive substring on the full operator name produces false
--     negatives (case differences, dropped suffixes — "Wukalina Walk"
--     vs "wukalina")
--   • naive substring on a single short core like "wukalina" produces
--     false positives (place name vs operator name)
--
-- The fix uses a name-variant search vocabulary stored on each
-- candidate. The Stage 3 verifier accepts a hit if any variant
-- appears in case-normalised page text. Confidence band drops by
-- one level if only the shortest variant matches (e.g. "wukalina"
-- alone — could be a place-name reference rather than the operator).
--
-- Variants generation is algorithmic at candidate creation time
-- (see lib/prospector/way-discovery/variants.js). For edge cases
-- the array is hand-editable later via Candidate Review.
--
-- Schema impact: additive only. Existing rows default to '{}' which
-- means "no variants registered yet" — Stage 3 will treat this as
-- "fall back to full name only" and pipeline still runs. Backfill
-- happens when way-discover.mjs sees an existing candidate row.
-- ============================================================

alter table way_candidates
  add column if not exists name_variants text[] not null default '{}'::text[];

-- GIN index supports fast lookup if we ever want to find all
-- candidates whose variants contain a given token (e.g. for
-- de-duplication of new seeds against existing candidates).
create index if not exists way_candidates_name_variants_gin
  on way_candidates using gin (name_variants);
