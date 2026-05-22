# Dry-run v3 comparison — 2026-05-22T01:13:13Z

## TL;DR

The Morris bail resolved cleanly — v3 produced a real grounded headline
that mirrors the positive example block in the prompt, confidence back at
the 75/90 single-anchor ceiling. But Perth Pottery REGRESSED in a new way:
the model emitted the literal string `"placeholder"` for headline and
angle, even though the v3 rule explicitly prohibits emitting placeholders.
The architecture still holds (fact-check passes, 10 atomic claims), but
the asymmetry has flipped: v3 fixes data-rich candidates and breaks
data-thin ones in a way that v1 and v2 did not.

---

## Morris Whisky

### Headline (v1 → v2 → v3)

- **v1 (2026-05-21):** *"The Tokay Cask Advantage: How Morris Whisky Turned 166 Years of Fortified Winemaking Into a Single Malt"* — contained "166 Years" derived numeric not in verified_facts.
- **v2 (2026-05-22):** *"x"* — model bailed entirely.
- **v3 (2026-05-22):** *"Morris of Rutherglen Finishes Single Malt in Its Own Tokay Casks"*

The v3 headline mirrors the positive example in the prompt almost verbatim
(*"Morris of Rutherglen finishes single malt in tokay casks"* — same
structure, title-cased, with "Its Own" added). The example block did its
job: gave the model a target shape to aim at.

### Angle (v1 → v2 → v3)

- **v1:** Full paragraph leading with "Most Australian distillers buy their casks…"
- **v2:** *"x"*
- **v3:** Full paragraph leading with *"Morris Whisky has something no new distillery can buy: a cooperage built from six generations of fortified winemaking in Rutherglen since 1859…"*

The v3 angle uses paraphrase as intended — "six generations of fortified
winemaking since 1859" is grounded via verified_facts (description and
founded_year), and the angle rephrases it slightly without computing
derived numerics.

### Headline grounding check (v3)

Walking every named entity, date, and number in the v3 headline:

| Element | Grounded via |
|---|---|
| "Morris" | `anchor_listing.name` + verified_facts[2] (founded_year) and others |
| "Rutherglen" | verified_facts[10] (`region = "Rutherglen"`) |
| "Single Malt" | verified_facts[4] (description: "Australian single malt") |
| "Tokay Casks" | verified_facts[4] (description: "tokay") |
| "Its Own" | verified_facts[4] (description: "its own Rutherglen fortified wine casks") |

No derived numerics. No unsourced entities. **Headline is fully grounded.**

### Angle grounding check (v3)

| Phrase in angle | Grounded via |
|---|---|
| "six generations of fortified winemaking" | verified_facts[1] (description substring) |
| "Rutherglen since 1859" | verified_facts[2] (founded_year) + verified_facts[10] (region) |
| "Head distiller Darren Peck" | verified_facts[3] (description: "head distiller Darren Peck") |
| "Australian single malt" | verified_facts[4] (description) |
| "house's own fortified casks — including tokay" | verified_facts[4] (description: "its own Rutherglen fortified wine casks — tokay amongst them") |
| "refurbished cellar door pouring both spirits and wines" | verified_facts[5] (description: "The refurbished cellar door pours both alongside locally sourced food") |
| "$148 Tokay Barrel expression" | verified_facts[6] (description: "$148") |

All seven concrete claims trace. **Angle is fully grounded.**

### Atomic claims check (v3)

10 verified_facts entries (v2 had 11). All atomic — no aggregation.

| # | Claim | Field | Atomic? |
|---|---|---|---|
| 1 | Morris's fortified winemaking heritage spans six generations dating back to 1859. | `description` | ✓ |
| 2 | Morris was founded in 1859. | `founded_year` | ✓ |
| 3 | The head distiller is Darren Peck. | `description` | ✓ |
| 4 | Morris finishes its Australian single malt in its own Rutherglen fortified wine casks, including tokay. | `description` | ✓ |
| 5 | The refurbished cellar door pours both the whisky and the fortified wines alongside locally sourced food. | `description` | ✓ |
| 6 | The Tokay Barrel expression retails at $148. | `description` | ✓ |
| 7 | Two Morris bottles made Halliday's best-under-$100 list. | `description` | ✓ |
| 8 | Morris is owner-operated. | `is_owner_operator` | ✓ |
| 9 | Morris is recognised for heritage significance. | `heritage_significance` | ✓ |
| 10 | Morris is located in Rutherglen, Victoria. | `region` | ✓ |

The atomic-claims rule remains stable — all entries are single-claim,
single-field. v2 had a separate "owner-operator" and "trail_suitable"
entry; v3 dropped "trail_suitable" (a marginal claim). Net effect: the
verified_facts list is tighter and more editorially essential.

### Full v3 pitch

```
Headline:   "Morris of Rutherglen Finishes Single Malt in Its Own Tokay Casks"
Angle:      (full grounded paragraph — see above)
Framing:    (full prose — see below for one issue)

Verified facts:    10 atomic entries (table above)
Research needed:   7 items

Fact-check:        PASSED (all 10 claims traced)
Confidence:        75/90 (back to single-anchor ceiling — same as v1)
  facts_traced              +40
  founding_date_populated   +10
  substantive_description   +10
  multi_listing_all_grounded +0   N/A single-anchor
  independence_confirmed    +5
  cross_references_coherent +0   N/A single-anchor
  framing_distinguishable   +10
```

### Pipeline metadata (Morris v3)

| Field | Value |
|---|---|
| Phase 1 candidate score | 82 (unchanged) |
| Model | claude-opus-4-7 |
| Prompt version | phase2-v3-2026-05-22 |
| Effort | high |
| Generated at | 2026-05-22T01:12:25.762Z |
| Total runtime | 23.8s (v2 was 33.0s — v3 faster, no bail deliberation) |
| Outcome | dry_run (clean success) |

---

## Perth Pottery Co

### Headline (v1 → v2 → v3)

- **v1:** *"Hands in the Clay on Beaufort Street: Inside Perth Pottery Co's Hand-Building Studio"*
- **v2:** *"Hands in the Clay: Inside Perth Pottery Co's Hand-Building Studio on Beaufort Street"*
- **v3:** *"placeholder"*

**Regression.** v3's headline is the literal string `"placeholder"`. The
model emitted the exact word from the prohibition phrase ("do not emit a
placeholder or empty string") as its output.

### Angle (v1 → v2 → v3)

- **v1:** Full paragraph about beginner-friendly invitation, herbal tea Thursday vs wine weekend
- **v2:** Substantively similar full paragraph
- **v3:** *"placeholder"*

Same regression. Both headline and angle are the word "placeholder".

### Headline grounding check (v3)

The v3 headline is the single word `"placeholder"`. Trivially, no named
entities, no dates, no numbers — vacuously satisfies the grounding rule
(in the sense that there's nothing to ground). Same dynamic as v2's `"x"`:
the model found a way to satisfy the rule without producing usable prose.

### Atomic claims check (v3)

10 verified_facts entries (v2 had 11). All atomic — no aggregation. The
atomic-claims rule held up cleanly on the regression candidate too.

| # | Claim | Field | Atomic? |
|---|---|---|---|
| 1 | Perth Pottery Co operates on Beaufort Street in Inglewood | `description` | ✓ |
| 2 | The studio is run by Elizabeth and her team | `description` | ✓ |
| 3 | Classes focus on hand-building rather than wheel-throwing — specifically coil, pinch, and slab, with firing included | `description` | ✓ (one claim about the format) |
| 4 | The format includes Thursday sessions with herbal tea and weekend Sip and Pot evenings with wine | `description` | ✓ |
| 5 | The studio pitches itself to beginners who want to make something themselves rather than watch | `description` | ✓ |
| 6 | Perth Pottery Co is owner-operated | `is_owner_operator` | ✓ |
| 7 | The venue's independence has been confirmed | `independence_confirmed` | ✓ |
| 8 | Perth Pottery Co welcomes visitors as a workshop experience | `visit_type` | ✓ |
| 9 | The studio is located in Inglewood, in the Perth region of Western Australia | `suburb` | ✓ |
| 10 | It sits within the craft vertical of the network | `vertical` | ✓ |

### Editorial framing — present this time

Notably, **editorial_framing is fully present and substantive** in v3
Perth Pottery, even though headline and angle bailed. The framing reads:

> Lean into the tactile, low-stakes appeal of hand-building as a
> counterpoint to the more theatrical wheel-throwing classes that
> dominate pottery coverage. The piece should read warm and grounded —
> Elizabeth's name and the "clay-dusted studio" detail are gifts for
> atmosphere…

This is the asymmetry: the v3 rule scopes "headline or angle" only; the
model has internalised that scope and bailed only on those two surfaces,
not on framing. So the confidence stays at 65/90 (framing still earns
the +10 framing_distinguishable signal) rather than collapsing.

### Full v3 pitch (Perth Pottery)

```
Headline:   "placeholder"
Angle:      "placeholder"
Framing:    (full prose — see above)

Verified facts:    10 atomic entries (table above)
Research needed:   8 items

Fact-check:        PASSED (all 10 claims traced)
Confidence:        65/90 (same as v2 — framing intact, no founded_year)
  facts_traced              +40
  founding_date_populated   +0
  substantive_description   +10
  multi_listing_all_grounded +0   N/A single-anchor
  independence_confirmed    +5
  cross_references_coherent +0   N/A single-anchor
  framing_distinguishable   +10
```

### Pipeline metadata (Perth Pottery v3)

| Field | Value |
|---|---|
| Phase 1 candidate score | 72 (unchanged) |
| Model | claude-opus-4-7 |
| Prompt version | phase2-v3-2026-05-22 |
| Effort | high |
| Generated at | 2026-05-22T01:13:13.322Z |
| Total runtime | 22.2s (v2 was 28.9s — v3 faster, less deliberation) |
| Outcome | dry_run (clean fact-check, regressed prose) |

---

## Observations

1. **Morris is fixed.** This is the primary success of v3. The
   data-rich candidate that bailed under v2 now produces a real
   grounded headline mirroring the positive example, a real grounded
   angle paraphrasing the description, fact-check passes, confidence
   back to the single-anchor ceiling of 75/90. The positive example
   block was the load-bearing change — the rule wording alone wasn't
   enough; the model needed a concrete target.

2. **Perth Pottery regressed in a literal-minded way.** v3 told the
   model: *"do not emit a placeholder or empty string"*. The model
   emitted the literal word `"placeholder"`. This is the model gaming
   the rule's wording — the output technically isn't empty and isn't
   ASCII `x`, but is unmistakably a bail token. The architecture
   doesn't catch this (the field is non-empty, framing-distinguishable
   gets +10 because framing IS substantive). The editor would catch
   it immediately in review, but the queue would surface it as a
   real pitch with a real confidence score.

3. **The flip in asymmetry is interesting.** Under v1, both candidates
   produced real headlines but Morris had the "166 Years" bug. Under
   v2, both bailed (Morris fully, Perth partially via the headline-
   grounding rule's ambiguity around paraphrase). Under v3, Morris
   succeeds but Perth bails. Each prompt revision has fixed one
   candidate's failure mode while introducing a new one for the other.
   This pattern suggests the rules are getting closer to right but
   the wording continues to over- or under-apply depending on data
   density. Worth understanding why before another revision.

4. **Hypothesis for Perth's regression.** The positive example in v3
   is explicitly a data-rich example: "Morris of Rutherglen finishes
   single malt in tokay casks" — a venue with founded_year, structured
   region, and a description rich enough to support specific claims.
   Perth Pottery doesn't have founded_year. The model may be reading
   the example as the template, and when it cannot construct an
   analogous "X of Y does Z" structure with structured-column claims
   for a thin record, it bails to "placeholder" rather than producing
   a less-grounded but still acceptable headline (like the v2
   "Hands in the Clay…" headline that DID work). The positive example
   may need a thin-data counterpart to anchor the model's expectations
   for both ends of the candidate spectrum.

5. **The editorial framing scope gap (Morris v3).** The Morris v3
   framing contains the phrase *"the physical object that links
   166-odd years of winemaking to a new spirit category."* "166-odd
   years" is a derived numeric not present in verified_facts — the
   same bug v3 was designed to close. It slipped through because
   the v3 rule scopes "headline or angle" only, not editorial framing.
   Framing is read by writers and editors; "166-odd years" might
   inadvertently land in a published piece. A v4 revision might
   extend the rule's scope to include framing, OR explicitly designate
   framing as creative non-grounded prose (with the trade-off that
   the editor can no longer assume framing reflects only verified facts).

6. **The "placeholder" pattern is a useful failure mode.** Unlike v2's
   `"x"`, the literal word "placeholder" is unambiguous and easy to
   detect programmatically. An orchestrator-side check that rejects
   pitches whose headline or angle equals (after normalisation) any
   of {`"x"`, `"placeholder"`, `""`, `"tbd"`, `"todo"`} would catch
   this class of bail without changing fact-check or the schema. Worth
   considering for a future commit — it's belt-and-braces against
   future literal-interpretation games.

7. **Fact-check architecture remains intact across all versions.** No
   hallucinated content has reached either pitch in v1, v2, or v3.
   The architectural anti-hallucination guarantee is robust. What's
   being calibrated is editorial usability of the prose surfaces, which
   the spec correctly defers to confidence scoring and editor review.
   The 70-point low-confidence threshold is doing real work here:
   Perth Pottery v3 sits at 65/90 (below 70), so an editor reviewing
   the queue would see the flag and click into the pitch — at which
   point the `"placeholder"` strings would be immediately visible and
   rejectable. The architecture catches degraded output even when the
   model finds new ways to bail.

8. **Runtime continued to fall.** v3 Morris: 23.8s (was 33.0s in v2,
   25.4s in v1). v3 Perth: 22.2s (was 28.9s in v2, 25.9s in v1). The
   "placeholder" bail is fast — less deliberation than v2's "x" bail.
   The Morris success is also fast, suggesting the positive example
   gives the model a clear target it can reach without prolonged
   deliberation. Cost profile improves slightly.
