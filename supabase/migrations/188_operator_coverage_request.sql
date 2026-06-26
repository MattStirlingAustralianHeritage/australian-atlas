-- 188: operator "what you'd like covered" — a free-text rewrite request.
--
-- The original intake (migration 141) was deliberately all discrete fields and
-- "never a free prose box", to keep the generator grounded. This adds ONE
-- free-text field through which the operator says, in their own words, what they
-- want written about or added (a new space, a change, an award, the bits that
-- matter to them). It is still operator-supplied source material: the generator
-- treats it as facts it may use, and the source-binding check counts it as a
-- groundable source — so the no-invention guarantee is preserved (the model may
-- only use what the operator actually wrote).
--
-- Additive and nullable: old rows and old code that never set it are unaffected.

ALTER TABLE operator_facts
  ADD COLUMN IF NOT EXISTS coverage_request TEXT;

COMMENT ON COLUMN operator_facts.coverage_request IS
  'Free-text operator request: what they want the description to cover or add, in their own words. Source material for generation; counts toward source-binding. Never published verbatim.';

NOTIFY pgrst, 'reload schema';
