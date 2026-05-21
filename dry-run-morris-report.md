# Morris Whisky dry-run — 2026-05-21T06:46:00Z

## TL;DR

The Phase 2 pipeline produced a grounded pitch end-to-end. All 8 verified-fact
claims traced to the source listing record, fact-check passed, and the
confidence score hit the single-anchor ceiling (75/90).

## The pitch

**Headline.** The Tokay Cask Advantage: How Morris Whisky Turned 166 Years of
Fortified Winemaking Into a Single Malt

**Angle.** Most Australian distillers buy their casks. Morris Whisky inherits
them. Operating out of Rutherglen on the back of six generations of fortified
winemaking dating to 1859, head distiller Darren Peck finishes single malt in
the family's own tokay and fortified wine barrels — a maturation pipeline no
new-build distillery can replicate. With the Tokay Barrel expression sitting
at $148 and two bottles on Halliday's best-under-$100 list, there's a clear
editorial hook: the whisky boom meets generational wine heritage, and the
casks are the story.

**Anchor listing.** Morris Whisky (sba — Rutherglen). Slug `morris-whisky`,
ID `317dd385-e865-4d58-8a41-f80d7e9cb3a0`.

**Supporting listings.** None — Phase 2 is single-anchor by design.

**Editorial framing.** Lead with the cask. The most interesting fact in the
record isn't the founding date — it's that Morris's wine inheritance becomes
a whisky production advantage no competitor can buy. Suggest a long-form
feature voice: unhurried, materials-focused, the writer in the cellar door
tasting fortified and single malt side by side. Structure as a triptych —
heritage (1859, six generations), process (tokay-cask finishing, Peck's
role), and proof (the $148 Tokay Barrel, the Halliday recognitions). Resist
romanticism about "Australian whisky's coming of age" and instead let the
barrels do the narrative work. The refurbished cellar door is the natural
scene-setter for an in-person dispatch.

**Research needed.**

1. Cellar door opening hours — `hours` field is null.
2. Best season to visit — `best_season` field is null.
3. Sub-type classification within the sba vertical — `sub_type` and
   `sub_types` are empty.
4. Names of the two Morris bottles recognised on Halliday's best-under-$100
   list (description references the accolade but does not name them).
5. Background on head distiller Darren Peck beyond his current role —
   tenure, prior work, role in launching the whisky program.
6. When the whisky program began relative to the 1859 winemaking founding —
   the record gives a wine founding date but no distillery start date.
7. Any formal awards — the awards array is empty despite the Halliday
   mention in description; confirm whether listings exist elsewhere.
8. Confirmation of family ownership/succession given `is_owner_operator` is
   true and the description cites six generations — names and current
   generation.

## Fact-check trace

All 8 claims traced. Each row: the natural-language claim, the cited
database field, and the literal value the LLM extracted as proof.

| # | Claim | Field | Match |
|---|---|---|---|
| 1 | Morris was founded in 1859. | `founded_year` | `"1859"` — numeric-exact match against integer 1859 |
| 2 | Six generations of fortified winemaking, Darren Peck, tokay casks, $148 Tokay Barrel, Halliday best-under-$100 (aggregated) | `description` | First clause of `description` (substring match against full description text) |
| 3 | Morris Whisky is owner-operated. | `is_owner_operator` | `"true"` — bool-coerce match against true |
| 4 | The venue carries heritage significance. | `heritage_significance` | `"true"` — bool-coerce match against true |
| 5 | Its independence has been confirmed by Atlas curators. | `independence_confirmed` | `"true"` — bool-coerce match against true |
| 6 | The cellar door is set up as an experiential visit. | `visit_type` | `"experiential"` — substring match |
| 7 | Morris Whisky sits at 154 Mia Mia Rd, Rutherglen VIC. | `address` | `"154 Mia Mia Rd, Rutherglen VIC 3685, Australia"` — substring match |
| 8 | The venue is suitable for trail-style itineraries. | `trail_suitable` | `"true"` — bool-coerce match against true |

No claims rejected.

## Confidence score breakdown

**Total: 75/90** (single-anchor theoretical maximum is 75 — see
`lib/pitch/confidence.mjs`, the two multi-listing-only signals can't be
earned by definition).

| Signal | Contribution | Reason |
|---|---|---|
| facts_traced | +40 | All 8 verified_facts passed fact-check |
| founding_date_populated | +10 | `founded_year = 1859` |
| substantive_description | +10 | Description well above the 200-char floor |
| multi_listing_all_grounded | +0 | N/A — single-anchor pitch |
| independence_confirmed | +5 | `independence_confirmed = true` |
| cross_references_coherent | +0 | N/A — no supporting listings to check |
| framing_distinguishable | +10 | Both `editorial_framing` and `verified_facts` populated |

`operator_name_populated` (+10) is deliberately not included — that signal
was dropped on 2026-05-05 because the column doesn't exist on `listings`.
The 90-point absolute max already accounts for the drop.

## Pipeline metadata

| Field | Value |
|---|---|
| Phase 1 candidate score | 82 (top SBA general-slot candidate) |
| Model | claude-opus-4-7 |
| Prompt version | phase2-v1-2026-05-07 |
| Effort | high |
| Adaptive thinking | dropped (incompatible with forced `tool_choice`) |
| Generated at | 2026-05-21T06:46:00.971Z |
| Total runtime | 25.4s |
| Mode | DRY-RUN (no DB writes) |
| Slot type | general |
| Outcome | dry_run (success) |

## Observations

1. **Aggregated multi-claim facts.** Verified fact #2 packs five distinct
   sub-claims (six generations, founding 1859, Darren Peck as head distiller,
   tokay-cask finishing, $148 Tokay Barrel, Halliday recognition) into a
   single `claim` string with one `description` field citation. The
   substring is genuinely present in the description, so fact-check accepted
   it. This is the architecture working as designed — every claim must
   trace, and this one traces — but the editorial preference might be one
   atomic fact per entry instead of aggregations. If you want the model to
   split these out, the system prompt is the place to do it; the validator
   would need no changes. Worth deciding before Gate 1 calibration.

2. **Research-needed array is rich and accurate.** Eight items, each
   pointing at a real gap in the record (null `hours`, null `best_season`,
   empty `sub_type`, etc.). The model is correctly surfacing absences rather
   than inventing fill-ins. The two items that show research-needed
   awareness even beyond "field is null" — #4 ("names of the two bottles
   recognised on Halliday's list") and #5 ("background on Darren Peck
   beyond his current role") — confirm the prompt's "if a field is empty
   you MUST NOT invent" rule is biting correctly.

3. **Headline cites a non-claimed number.** "166 Years" in the headline is
   2026 − 1859 = 167, off by one (technically 165 if you don't count
   inclusive). Neither founding_year + math nor "166" appears as a
   verified_facts entry. The fact-check function only validates the
   `verified_facts` list, not the headline string. **This is a real gap.**
   The model's arithmetic is a derived claim not subject to fact-check.
   Recommend: either prompt-tune to forbid derived numbers in headlines, or
   add headline/angle to the fact-check pass (substring-check every numeric
   token in headline against verified_facts.value). The architecture's
   anti-hallucination guarantee currently does NOT extend to headline
   prose — and "166 years" looks plausible enough that an editor reading
   fast might not catch it.

4. **Address field substring match worked cleanly.** The LLM's claim
   `"Morris Whisky sits at 154 Mia Mia Rd, Rutherglen VIC"` cited the
   `address` field with the verbatim full value. Notable because the
   listing record had both `address` and `street_address` columns; the
   model picked the right one.

5. **Confidence ceiling reached.** 75/90 is the single-anchor max. There's
   no headroom to detect "this pitch is even better than usual" within the
   single-anchor design. Anything beyond 75 requires multi-listing support
   (which is deferred). Worth knowing: every fact-checked single-anchor
   pitch with a populated founding date, a substantive description, and a
   confirmed independence flag will score 75/90 by construction.

6. **No schema or pipeline errors.** No 400s, no parse failures, no
   missing-tool-call errors. The strict-schema audit from commit `01412a7`
   and the adaptive-thinking drop from `881aeb9` together unblocked the
   pipeline cleanly.

7. **Runtime profile.** 25.4 seconds end-to-end for one candidate at
   `effort: 'high'` on Opus 4.7. Gate 1 (n=5) would budget ~2 minutes of
   wall time. Gate 2 (n=25) ~10 minutes. Gate 3 (n=100) ~45 minutes.
   Calibration ceremony costs are reasonable.
