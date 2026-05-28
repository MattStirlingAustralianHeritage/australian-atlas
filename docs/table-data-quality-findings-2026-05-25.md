# Table Atlas — Data Quality Findings

**Date:** 2026-05-25
**Context:** Surfaced during Part 4 of the hallucination-detector work plan (see `docs/banned-phrase-corpus.md` and `scripts/detect-hallucinations.mjs`). The detector was meant to identify the archival subset of Table's 162 active listings. The four-quadrant cross-reference returned an empty HIGH-confidence archive set, which triggered investigation. The investigation reframed the entire Table data-quality picture.

This document captures the finding. It is not a commit of action. The proposed Part 4a (corpus expansion) and Part 4b (stale-flag cleanup) follow as separate work, in that order, with their own sign-off gates.

---

## The operating assumption (before this work)

> "Atlas's seed-generator era left hallucinated descriptions across multiple verticals — Found (n=24 archived), Corner (n=42 archived), Fine Grounds (n=27 archived), and Table (n=122 flagged `needs_review=true`, archival pending)."

The "n=122 archival pending" framing has been part of Matt's worry list for months. Project memory carried "Table Atlas hallucinations awaiting reseed" as an explicit known issue. The detector work was meant to be the mechanism that finally cleared the backlog — same SSOT cleanup pattern as Found and Corner had used.

---

## What the data actually showed

Detector run against all 162 active Table listings, cross-referenced against `needs_review` and `data_source`:

```
Q1 — Detector flagged + needs_review=true + data_source='ai_generated':  3 (all LOW)
Q1' — Detector flagged + needs_review=true + other data_source:           0
Q2 — Detector flagged + needs_review=false:                               0
Q3 — Detector CLEAN + needs_review=true:                                119
Q4 — Detector CLEAN + needs_review=false:                                40
```

Total: 162 ✓.

The HIGH-confidence archive set was **empty**. The detector identified only 3 listings with any confidence, all at LOW band (score 5, the absolute minimum to flag).

### Score distribution within Q3

The 119 Q3 listings broke down by score:

```
score 0 (full anchors present, no other signals):       40
score 2 (single Tier 3 hit):                            66
score 4 (3.1 + one other Tier 3, or Tier 2 stack):      12
score 1 (single Tier 2 tiebreaker hit):                  1
```

The score-0 bucket (40 listings) was almost certainly real content — these descriptions contained years/numbers, naming the corpus's strongest "real content" signal positively. The score-2 bucket (66 listings) was the suspect concentration zone: descriptions lacking anchors.

---

## The peek that reframed the work

Eight Q3 samples eyeballed across sub_types (restaurant, bakery, farm_gate, market, cafe, creamery, providore, no-sub_type):

| Slug | Score | Verdict |
|---|---|---|
| restaurant-botanic | 0 | **Real.** Named chef (Jamie Musgrave), sommelier (Elle Foster), GM (Alma Pasalic), specific 2025 awards. |
| riser | 0 | **Real.** Five named founders/staff, specific employment history, founding year 2020, named previous occupants of the building. |
| caves-farm | 2 | **Real.** Rintoul family, 2021/2025 specific years, named operators, specific products and pricing. |
| margaret-river-farmers-market | 2 | **Real.** Founded 2002, specific times, specific 2018 award. |
| bakery-cafe-hazel | 2 | **Templated.** "Charming", "focus on quality ingredients", "personalized service" — pure boilerplate, no anchors. |
| little-missy-patisserie | 2 | **Real-ish.** Provençal style, Tasmanian produce, Argyle Street, "Simple enough premise, done with genuine care" editorial voice. |
| main-ridge-dairy | 4 | **Real.** Named operators (Sonia, Charlotte), specific cheese names with technique notes, specific award (Sydney Royal Gold). |
| the-house-paddock | 4 | **Real.** Named founders (Fiona + Scott Auton), specific town, specific products, specific hours. |

**Seven of eight were real, well-anchored, editorial-voice descriptions.** Only Bakery Cafe Hazel read as plainly templated.

### Follow-up — score-2 bucket eyeball (18 samples)

To get a tighter ratio on the suspect concentration zone, 18 score-2 samples across sub_types:

```
TEMPLATED (5–6 of 18):
  bakery-cafe-hazel                       (unambiguous)
  butcher-and-the-farmer-tramsheds        (unambiguous)
  farm-cove-eatery                        (unambiguous)
  daci-daci-bakers                        (unambiguous)
  little-french-nest                      (unambiguous)
  chapters-boathouse                      (borderline-leans-templated; named owners but heavy template voice)

REAL (12–13 of 18):
  5-acres-bar-kitchen, africola, adelaide-hills-farmers-markets,
  ballina-farmers-producers-market, barossa-farmers-market,
  bellevue-farm-gate, black-barn-farm, caldermeade-farm-cafe,
  baked-gluten-free, flour-and-stone, erda, four-ate-five
```

**~28–33% templated, ~67–72% real in the score-2 bucket.**

---

## Extrapolated breakdown of Table's 162 active listings

| Subset | Count | Action implied |
|---|---|---|
| Q4 (detector CLEAN + needs_review=false) | 40 | None — both signals say "fine" |
| Score-0 in Q3 (anchors present) | 40 | Stale flag — real content needing flag cleared |
| Score-2 in Q3, real (~70%) | ~46 | Stale flag — real content needing flag cleared |
| Score-2 in Q3, templated (~30%) | ~20 | Corpus-expansion target |
| Score-4 in Q3 | 12 | Mixed — needs eyeball after corpus expansion |
| Q1 (detector flagged LOW) | 3 | Corpus-expansion target (low confidence at current calibration) |
| Score-1 in Q3 (tiebreaker only) | 1 | Probably stale flag |

**Estimated totals:**
- **~25–30 truly templated listings** (corpus-expansion + targeted action target)
- **~85–95 real-content listings with stale `needs_review=true` flag** (data-cleanup target)
- 40 already clean per both signals (no action)

The original "n=122 archival pending" was a measurement of `needs_review=true` count. It was not a measurement of actual hallucination. The flag has been carrying old debt that the content has since paid off — by curation, by Candidate Review approvals, by operator submissions, by whatever organic process has been quietly improving Table content without anyone clearing the original review flag.

The reseed has effectively happened. Just not as a discrete job.

---

## Detector behaviour validation

The detector did the right thing on every sample. Its job was to identify content matching the corpus's known hallucination patterns; the corpus describes the Found/Corner/Fine Grounds template style. Table's templated content uses a *different* template style:

```
Found/Corner/FG templates (in corpus):
  "a must-visit for book lovers seeking thoughtfully curated reads..."
  "a haven for stationery lovers, letter writers..."
  "worth a visit for vinyl enthusiasts and music lovers..."

Table templates (NOT in corpus):
  "A charming independent [vertical] specializing in..."
  "A contemporary [vertical] celebrating premium, seasonal ingredients..."
  "Honoring classic [cuisine] traditions while embracing modern creativity..."
  "An impressive selection of [items], complemented by..."
```

These are recognisably AI-template but use a different vocabulary register — softer adjectives ("charming", "contemporary"), different verbs ("specializing", "celebrating", "honoring", "embracing"), different rhetorical structures (no "haven for", no "must-visit" CTA). The corpus was built on 94 archived descriptions from Found/Corner/FG and characterises that pattern space precisely. Table's templated content was never in the corpus's training data.

This is a **corpus gap**, not a detector failure.

---

## Secondary finding: pattern 3.4 (long comma list) false-fires on real content

During the score-2 bucket eyeball, several listings scoring 2 had `2+ digit number` and `4-digit year` present — meaning pattern 3.1 should not have fired. The score still came out at 2, indicating a different Tier 3 pattern was responsible. Investigation showed pattern 3.4 (≥4 commas in a sentence) firing on:

- Africola's wine producer list: "Ochota Barrels, Jauma, Gentle Folk, Koerner, Unico Zelo" — 4 commas, all proper nouns
- Adelaide Hills Farmers Markets specialist rotation: "Artisan first Saturday, Local Flavours second, Sustainable Living third, Wellness fourth" — 3 commas, proper nouns

Both are legitimate inventory lists, not seed-generator dumps. The 4+ comma threshold from Part 3 calibration is not tight enough — real descriptions use proper-noun lists of stockists, dishes, producers.

**Fix proposed for Part 4a corpus expansion:**

Either (a) raise the threshold to ≥5 commas, or (b) refine the regex to distinguish proper-noun lists ("HAY, Muuto, Ferm Living, Carl Hansen Søn" — capitalised tokens) from generic-adjective lists ("great food, amazing service, lovely atmosphere, perfect for any occasion" — lowercase descriptive phrases).

Option (b) is more precise but more code. Option (a) is simpler and might be sufficient — the seed generator's inventory dumps were typically longer than four items. Calibration after Part 4a corpus expansion will surface which.

---

## Proposed sequencing

### Part 4a — Corpus expansion against Table-template samples (next)

Seed corpus from the 6 templated samples eyeballed above. Identify Table's distinctive phrasing: "charming independent", "celebrating premium", "in the heart of", "expertly crafted dishes", "exceptional ingredients", "this independent establishment", "perfect present", "complementary candles", "celebrating local [region] produce", "memorable dining experiences", "leans into", "embracing modern creativity", "honoring classic".

Frequency-analyse against active Table listings and against the known-good control. Add the diagnostic phrases as new corpus entries (Tier 1 if zero leak, Tier 2 if some leak). Fix pattern 3.4 alongside. Recalibrate the detector. Re-run on Table — expected outcome: ~25–30 listings flag HIGH/MEDIUM.

Action on the flagged subset per the existing action tree: archive where URL dead or venue unverifiable; rewrite where venue verifiable.

Commit pattern: `chore(detect): corpus expansion for Table-template hallucination style` + `chore(data): Table Atlas SSOT cleanup — archive hallucinated seed listings (n=XX)`.

### Part 4b — Stale-flag cleanup (after Part 4a)

After Part 4a confirms the templated subset has been handled, the remaining `needs_review=true` listings are by definition the stale-flag set. Clear `needs_review` on the subset where the corpus-expanded detector confirms anchors AND no templated signals, conditional on the brief amendment below.

Expected outcome: ~85–95 currently-404ing Atlas-quality listings come back online. The largest user-facing impact of this entire detector arc.

Commit pattern: `chore(data): Table Atlas stale-flag cleanup — clear needs_review on n=XX corpus-confirmed clean listings`.

### Brief amendment for Part 4b

The original work plan rule:

> "Don't modify the existing `needs_review` flag logic. The detector is additive; the flag stays as the existing operational mechanism."

The peek finding invalidated the premise that the flag accurately signals "needs review" on Table. Tightened amendment:

> **needs_review modifications are in scope when:**
> 1. The detector (post-corpus-expansion) confirms description anchors are present AND no templated signals fire.
> 2. A sample of the cleared subset is eyeball-verified before the bulk operation runs.
>
> The brief's original rule still applies to needs_review modifications outside these conditions.

This preserves the original rule's spirit (don't casually modify a quality-related flag) while creating the specific exception this finding warrants.

---

## What goes off the worry list

The "Table Atlas hallucinations awaiting reseed" item that has been on Matt's project worry list for months can be reframed:

- **The bulk reseed has effectively happened.** Real, well-anchored, editorial-voice descriptions exist on ~85–95 of the 122 listings currently flagged. Restaurant Botanic, Riser, Caves Farm, Bellevue Farm Gate, Flour and Stone, Main Ridge Dairy — these are exemplary Atlas content.
- **The remaining templated subset is small** (~25–30 listings) and addressable via corpus expansion + targeted action.
- **The visibility problem is the bigger user-facing issue** than the hallucination problem at this point. ~85–95 listings of real content are currently 404ing in production per the data-integrity rule. Unblocking them is high-impact, low-risk work (re-exposing real content, not creating new content).

The detector did its job by surfacing this. The four-quadrant cross-reference was the mechanism that turned a presumed "archive these 122" into a much more accurate "archive ~25, rewrite some of them, unblock ~95".

---

## 2026-05-28 Update — refined estimates after stratified sampling

Three days after the original analysis, returned to complete the seed-tagging work for Part 4a (corpus expansion). Did three additional passes: Q1-LOW peek (3 listings), stratified 20-sample pass across {restaurant, cafe, bakery, market, farm_gate}, follow-up 8-sample pass across {creamery, sub_type=null}. 28 fresh listings tagged total. The original analysis is intact; what follows refines it on five axes.

### Pool drift

| Date | Active total | Score==2 cohort |
|---|---|---|
| 2026-05-25 (original analysis) | 162 | 66 |
| 2026-05-28 (this update) | 174 | 92 |
| Delta | +12 | +26 |

Source of drift unidentified. Possible candidates: Candidate Review active runs, operator submissions, scheduled import job, or other ingestion. Worth investigating as its own task; not blocking Part 4a since the detector is calibrated against the live pool and will catch new templated content as it arrives.

### Real-ratio shift

The original 18-sample score-2 follow-up returned 67–72% real / 28–33% templated. The stratified passes returned a different rate:

| Pass | Fresh samples | Unambiguous templated | Borderline | Real |
|---|---|---|---|---|
| Restaurant/cafe/bakery/market/farm_gate | 17 | 6% | 0% | 94% |
| Creamery | 4 | 0% | 0% | 100% |
| Sub_type=null | 4 | 25% | 25% | 50% |
| Q1 LOW (detector-flagged) | 3 | 33% | 67% | 0% |
| **Combined stratified (28 fresh)** | **28** | **~11%** | **~11%** | **~78%** |

The original 18-sample pass appears to have over-weighted templated content by accident of random sampling. Stratified coverage produced a tighter estimate of the true rate.

### Hypothesis (A) confirmed — templated content concentrates in sub_type=null

The bucket-rate table above shows the variance: sub_type=null carries 50% templated lean (1 unambiguous + 1 borderline of 4) vs creamery at 0% and the other curator-tagged sub_types at 6%. Q1 (which is sub_type-mixed but detector-pre-selected) is 100% templated or borderline.

**Durable insight worth surfacing into the corpus doc:** sub_type assignment correlates with editorial quality. Absence of sub_type tagging correlates with template-era ingestion that never received the editorial pass. For future curation triage: untagged listings should be reviewed first. This is the single best heuristic for prioritising future cleanup passes.

### Refined templated upper bound

Original extrapolation in this doc: ~25–30 truly templated listings. Refined: **~12–22**.

Composition:
- Score==2 cohort (92 listings) at observed ~11% unambiguous rate: ~9–15 templated.
- Q1 LOW cohort (3 listings): all templated or borderline.
- Score==4 cohort (12 listings, unsampled): ~1–4 at similar rates.

Tightens the Part 4a expected re-run outcome from "20–35 flagged at HIGH/MEDIUM" to "12–22". Reduces the target-action workload meaningfully.

### Calibration known-good pool contamination

`avocado-moment-cafe` is `data_source='manually_curated'`, `needs_review=false`, created post-2026-04-02, but the description content is pure template ("a down-to-earth cafe celebrating healthy, delicious food", "this independent venue", "commitment to sustainable practices" — zero anchors).

The calibration script's known-good pool relies on `data_source` being accurate. The existing comment in `calibrate-detector.mjs` already documents pre-April mislabel contamination (red-cross-subiaco, salvos-bunbury) and uses the date filter to dodge it. avocado-moment-cafe shows the mislabel pattern didn't fully end at 2026-04-01.

**Implication for Part 4a recalibration:** the calibration's reported false-positive rate is overstated when contaminated listings get correctly flagged by the corpus-expanded detector. At current 2.0% reported FP, contamination of 1–3 listings out of the 50-sample known-good control could push the threshold check ("FP < 5%") to spurious failure during recalibration.

**Fix:** introduce `scripts/calibration-known-good-exclusions.json` as a versioned audited exclusion list. Spot-check the known-good control before recalibration; manually exclude any avocado-moment-cafe-style mislabels. Each entry carries `slug`, `vertical`, `excluded_at`, `reason`. List is data, not logic — separate file makes growth auditable and each exclusion individually justifiable. Lands as Part 4a setup before phrase extraction.

### Seed lock at 12 for Part 4a phrase extraction

```
Unambiguous templated (8):
  bakery-cafe-hazel
  butcher-and-the-farmer-tramsheds
  farm-cove-eatery
  daci-daci-bakers
  little-french-nest
  farmhouse-kings-cross
  patina-at-customs-house
  avocado-moment-cafe

Borderline-leans-templated (4):
  chapters-boathouse
  meelup-farmhouse
  self-raised-bread-shoppe
  midden-by-mark-olive
```

Inside (ii)'s 10–15 target. Phrase extraction proceeds primarily on the 8 unambiguous; the 4 borderline are edge-case calibration material — they test whether extracted phrases fire on partial-template content without over-firing.

### Side fix landed: prompt-template placeholder bleed (n=1)

During stratified sampling, `the-orchard-table` description was found to begin with the literal string `Description (40-80 words):\n\n` — a prompt-template instruction line that leaked into stored data via the AI-generation pipeline. Scanned all active listings (all 9 verticals) for 16 placeholder patterns; only this one listing affected.

Fixed in commit `3a95c0b`. Scan tool kept as `scripts/scan-placeholder-bleed.mjs` for future audits.
