# Way Atlas — Phase 5 Calibration Tracking Items

Items surfaced during Phase 2B (discovery pipeline build) that need
revisiting during Phase 5 calibration. Each item lists the symptom,
the current behaviour, what to watch for, and the trigger that
escalates the item from "tracked" to "needs fixing."

---

## CT-1 — Anthropic web_search returns null page_age on Stage 2 hits

**Surfaced:** wukalina Walk calibration runs (run_ids
`c4e917ab-64e1-418f-9dfe-be4fa84dfd27` and
`228007eb-d876-49d0-95a1-802a15ba137e`, both 2026-05-XX).

**Symptom:** Anthropic's `web_search` server tool returned
`page_age = null` on every Stage 2 (editorial press) hit across two
runs. The Stage 2 runner's `parsePageAge()` handles null gracefully
(persists `published_date = null` on the signal's `raw_data`), and
Stage 6's `silence.press_24mo` aggregator treats null dates
conservatively — it counts a null-date signal as "in window" so
silence won't fire on operators whose press hits exist but lack
parseable dates.

**Why it matters:** Stage 6's silence signals are editorially
load-bearing — the editor reads them at triage. If `page_age` stays
null indefinitely, `silence.press_24mo` becomes a binary
"any-press-ever" check rather than the date-windowed "no-press-in-
last-24-months" check the spec calls for.

**What to watch for during Phase 5 calibration (n=5, n=20, n=50):**
- Across all 75 calibration operators, count how many Stage 2
  signals come back with non-null `published_date`.
- If <50% have parseable dates, the date-windowed silence signal
  is unreliable.

**Trigger to escalate:**
- If page_age stays null on all/most operators across multiple
  calibration runs, swap Stage 2's source to one that does return
  publication dates reliably (Tavily and Brave both return
  `published_date` as a first-class field).
- Or: add a fallback date extractor — fetch the article URL, parse
  `<meta property="article:published_time">` or schema.org JSON-LD
  `datePublished`. Polite-fetch already in place.

**Rough fix size:** ~50 LOC for an HTML-meta date extractor; ~150
LOC for a Tavily/Brave swap (consumer changes only — raw search
JSON already persisted on `raw_data` so the swap is bounded).

**Status:** TRACKING. Don't fix during Phase 2B. Re-evaluate after
Phase 5 Gate 1 calibration (n=5).

---

## CT-2 — TWC variant "tasmanian" matches state name, not operator

**Surfaced:** Phase 2C investigation, TWC Stage 3 calibration data.

**Symptom:** `generateNameVariants("Tasmanian Walking Company")`
produces `["tasmanian walking company", "tasmanian walking", "tasmanian"]`.
The shortest variant "tasmanian" matches Tasmania the state rather
than the operator. Three of TWC's 7 Stage 3 signals matched on
"tasmanian" alone (BFA "Tasmania" member listing, two Welcome to
Country generic listings). Confidence was correctly dropped to LOW
(shortest-variant-only match), but the signals are still false positives.

**Root cause:** The variant generator trims generic descriptors
("walking", "company") but doesn't check whether the remaining core
is a geographic term (state name, city name, region name).

**Fix:** Add an exclusion set of Australian state/territory names and
major geographic terms to the variant generator. If the trimmed core
is in the exclusion set, stop trimming one step earlier. Narrow change
(~20 LOC in variants.js). Does not block 2C — confidence band
downgrade limits the damage.

**Status:** TRACKING. Fix before Phase 5 n=20 calibration.

---

## CT-3 — commercial_groups.domains column empty for all Way groups

**Surfaced:** Phase 2C investigation, Gate 1 implementation.

**Symptom:** All 9 Way-scoped commercial_groups entries have empty
`domains` arrays. Gate 1's domain matching cannot fire until these
are populated. Name/brand matching still works.

**Fix:** Editorial task — research and populate domains for Experience
Co, Journey Beyond, SeaLink, AAT Kings, APT, Intrepid, G Adventures,
Discovery Parks, Voyages. Estimate ~30 minutes of research.

**Status:** TRACKING. Populate before Gate 1 activation in production.

---

## CT-4 — Scoring weights and thresholds: calibrate at n=20

**Surfaced:** Phase 2C calibration run (n=5), 2026-05-19.

**Symptom:** The 4-gate architecture is correct, but specific weight
values and surfacing thresholds are draft. The n=5 calibration run
exposed two structural issues (fixed in-session: silence penalty
removal, character exemption for G3 floor). Remaining weight values
(guide points, method points, press points, caps) and the asymmetric
threshold (G2≥15, G3≥5, total≥25) are calibrated against only 5
operators. They need validation against a broader set.

**What to watch for during Phase 5 calibration (n=20, n=50):**
- Do worthy operators consistently fail specific gates? Indicates
  a weight is too low or a floor too high.
- Do weak operators pass that shouldn't? Indicates a weight is too
  generous or a cap too high.
- Does the character exemption (G2≥25 → G3 floor drops to 0) fire
  on operators where it shouldn't? Monitor for false positives.
- Are the G2 guide point caps (5 first, 3 additional, cap 20)
  appropriately rewarding without over-indexing on team size?

**Trigger to revisit:**
- After Phase 5 Gate 1 calibration (n=20): review weight values
  against the 20-operator scoring spread. If >30% of editorially-
  worthy operators fail a single gate, that gate's weights need
  recalibration.

**Status:** TRACKING. Architecture fixed. Weights are draft until n=20.

---

## CT-5 — Stage 1 experience_type classification: wukalina mistyped

**Surfaced:** Phase 2C calibration run (n=5), 2026-05-19.

**Symptom:** Stage 1 LLM extraction classified wukalina Walk's
experience as `guided_walk_multiday` instead of `cultural_tour`,
despite wukalina being a definitional Aboriginal cultural tour
(palawa-owned, on Country, cultural content as primary product).
This caused Gate 4 to report `not_applicable` instead of `pass`.
The operator still surfaced (G2=21, G3=9, total=30 clears all
other thresholds), so this is not a 2C blocker.

**Root cause:** The Stage 1 extraction prompt's classification
guidance is insufficiently specific for distinguishing Indigenous-led
cultural tours from guided walks that happen to traverse Country.

**Fix:** Refine Stage 1 extraction prompt with explicit classification
examples:
- wukalina-shaped cases (Indigenous-led, on Country, cultural
  content as primary product) → `cultural_tour`
- TWC Uluṟu-shaped cases (cultural content as one component in
  a broader geographic walking offering) → `guided_walk_multiday`
  with `aboriginal_partnership` signal attached
- Heritage tours about settler/colonial history → `heritage_tour`

Prompt engineering task (~30 LOC change in stage-1-first-party.js).

**Status:** TRACKING. Fix before Phase 5 n=20 calibration.

---

(Future calibration items append below.)
