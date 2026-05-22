# Dry-run v4 comparison — 2026-05-22T01:26:54Z

## TL;DR

Perth Pottery is fully fixed — the thin-data positive example anchored
the model's headline shape, fact-check passes, confidence holds, no
bail. The v4 framing-scope extension also held: Perth's framing is
grounded with no derived numerics. **But Morris produced a NEW failure
mode that v4 was not designed to catch:** the headline and angle came
back as malformed token-leakage strings (`</antmletcer>` and
`</antml meeting:parameter>` — fragments resembling Claude's internal
tool-use meta-syntax). Fact-check still passes (12 atomic facts grounded);
framing is real and grounded; the bail detector correctly did not fire
(these are not in BAIL_TOKENS). The architecture holds; the model's
headline/angle output is unusable for an entirely different reason.

---

## Morris Whisky

### Headline (v1 → v2 → v3 → v4)

- **v1 (2026-05-21):** *"The Tokay Cask Advantage: How Morris Whisky Turned 166 Years of Fortified Winemaking Into a Single Malt"* — "166 Years" derived numeric.
- **v2 (2026-05-22):** *"x"* — bailed.
- **v3 (2026-05-22):** *"Morris of Rutherglen Finishes Single Malt in Its Own Tokay Casks"* — clean.
- **v4 (2026-05-22):** *`</antmletcer>`* — **token-leakage / corruption**. Not a bail token (BAIL_TOKENS did not match), not real prose, looks like a fragment of Claude's internal `<function_calls>` / `<parameter>` meta-syntax that leaked into the tool-use output.

### Angle (v1 → v2 → v3 → v4)

- **v1:** Real paragraph.
- **v2:** *"x"*.
- **v3:** Real paragraph.
- **v4:** *`</antml meeting:parameter>`* — same class of corruption.

### Editorial framing grounding check (v4)

The v4 framing is **real, substantive, and grounded**. Walking the
concrete claims:

| Phrase | Grounded via |
|---|---|
| "the barrel as the through-line" | verified_facts[5] (description: tokay-cask finishing) |
| "fortified wine house" | verified_facts[3] (description: "Six generations of fortified winemaking") |
| "tokay vessel" | verified_facts[5] (description: "tokay") |
| "head distiller Darren Peck" | verified_facts[4] (description) |
| "cellar door … fortified and the whisky finished in its cask" | verified_facts[5] (description), verified_facts[6] (description: cellar door pours both) |

**No "166-odd years" equivalent.** No derived numerics. No invented
phrases. The v3 scope gap is closed for Morris — the editorial framing
is fully grounded under v4's extended scope rule.

This is significant: even though headline and angle are corrupted, the
framing field obeyed the v4 rule exactly. So whatever mechanism produced
the token-leakage in headline/angle is field-specific or sampling-order-
dependent, not a wholesale prompt failure.

### Headline grounding check (v4)

The v4 headline is `</antmletcer>` — neither a named entity, a date, a
number, nor a factual claim. Trivially, the grounding rule has nothing
to check. But the output is also not usable prose. The bail detector
correctly returned null (the string is not in BAIL_TOKENS).

### Atomic claims check (v4)

12 verified_facts entries (v3 had 10). All atomic.

| # | Claim | Field | Atomic? |
|---|---|---|---|
| 1 | Morris Whisky was founded in 1859. | `founded_year` | ✓ |
| 2 | The distillery is located in Rutherglen, Victoria. | `region` | ✓ |
| 3 | Six generations of fortified winemaking inform the operation. | `description` | ✓ |
| 4 | Darren Peck is the head distiller. | `description` | ✓ |
| 5 | Morris finishes its Australian single malt in its own Rutherglen fortified wine casks, including tokay. | `description` | ✓ |
| 6 | The refurbished cellar door pours both whisky and fortified wine alongside locally sourced food. | `description` | ✓ |
| 7 | The Tokay Barrel expression retails at $148. | `description` | ✓ |
| 8 | Two Morris bottles made Halliday's best-under-$100 list. | `description` | ✓ |
| 9 | The venue carries heritage significance. | `heritage_significance` | ✓ |
| 10 | Morris is owner-operated. | `is_owner_operator` | ✓ |
| 11 | Independence has been confirmed for this listing. | `independence_confirmed` | ✓ |
| 12 | The cellar door is an experiential, visitable venue. | `visit_type` | ✓ |

All atomic. The atomic-claims rule continues to be the most stable
mechanism across all four versions.

### Full v4 pitch (Morris)

```
Headline:   "</antmletcer>"                        ← corrupted
Angle:      "</antml meeting:parameter>"           ← corrupted
Framing:    (substantial grounded paragraph)        ← clean

Verified facts:    12 atomic entries (all traced)
Research needed:   7 items

Fact-check:        PASSED (all 12 claims traced)
Confidence:        75/90 (single-anchor ceiling — framing earned its +10)
  facts_traced              +40
  founding_date_populated   +10
  substantive_description   +10
  multi_listing_all_grounded +0
  independence_confirmed    +5
  cross_references_coherent +0
  framing_distinguishable   +10
```

### Pipeline metadata (Morris v4)

| Field | Value |
|---|---|
| Phase 1 candidate score | 82 (unchanged) |
| Model | claude-opus-4-7 |
| Prompt version | phase2-v4-2026-05-22 |
| Effort | high |
| Generated at | 2026-05-22T01:25:55.294Z |
| Total runtime | 21.9s (v3 was 23.8s — fastest Morris run yet) |
| Outcome | dry_run (fact-check passed, headline/angle corrupted) |

---

## Perth Pottery Co

### Headline (v1 → v2 → v3 → v4)

- **v1:** *"Hands in the Clay on Beaufort Street: Inside Perth Pottery Co's Hand-Building Studio"*
- **v2:** *"Hands in the Clay: Inside Perth Pottery Co's Hand-Building Studio on Beaufort Street"*
- **v3:** *"placeholder"* — bailed.
- **v4:** *"Hands in the Clay on Beaufort Street"* — **clean, mirrors the v4 thin-data positive example almost verbatim.**

The thin-data example block in the v4 prompt is literally:
*"a grounded headline is 'Hands in the Clay on Beaufort Street'"*. The
model echoed this exactly. Worth noting: the example may have been TOO
prescriptive — the model used it as a template rather than as
inspiration. Whether that's good (predictable, safe) or bad (limits
editorial variation) is a Gate 1 judgment call.

### Angle (v1 → v2 → v3 → v4)

- **v1, v2:** Substantial paragraphs about beginner-friendly invitation.
- **v3:** *"placeholder"*.
- **v4:** Substantial grounded paragraph leading with *"Perth Pottery Co is an owner-operated hand-building studio on Beaufort Street in Inglewood…"*

Real prose, paraphrasing the description. All concrete claims trace.

### Editorial framing grounding check (v4)

Walking concrete claims in v4 framing:

| Phrase | Grounded via |
|---|---|
| "clay under fingernails" | metaphor / framing — not a factual claim |
| "clay-dusted studio" | verified_facts[1]–[5] (description includes "clay-dusted") |
| "herbal tea on a Thursday, wine on a Saturday" | verified_facts[3] (description: tea-and-wine Thursday/weekend formats) |
| "Perth Pottery Co reads as approachable" | editorial framing — not a factual claim |
| "600–800 words" | suggestion / framing — not a factual claim about the venue |
| "Elizabeth" | verified_facts[2] (description: "Elizabeth and her team") |
| "deliberate choice to skip the wheel" | verified_facts[4] (description: "rather than the wheel") |

**No derived numerics about the venue.** The "600–800 words" is a
writer-guidance number, not a venue claim — the v4 rule's scope is
"named entities, dates, numbers, and factual claims" *about the
venue*, not writer's-tool numbers. Acceptable, though it might be
worth being precise about this in a future revision if Matt wants
zero numbers of any kind in framing.

### Headline grounding check (v4)

| Element | Grounded via |
|---|---|
| "Hands in the Clay" | verified_facts[4] (description: "coil, pinch, and slab" — i.e. hand-building) |
| "Beaufort Street" | verified_facts[1] (description: "On Beaufort Street in Inglewood") |

Fully grounded. No derived numerics, no unsourced entities.

### Atomic claims check (v4)

10 verified_facts entries (v3 had 10). All atomic — no change in shape
from v3.

### Full v4 pitch (Perth Pottery)

```
Headline:   "Hands in the Clay on Beaufort Street"  ← mirrors the v4 thin-data example
Angle:      (substantial grounded paragraph)
Framing:    (substantial grounded paragraph)

Verified facts:    10 atomic entries (all traced)
Research needed:   8 items

Fact-check:        PASSED (all 10 claims traced)
Confidence:        65/90 (unchanged from v1/v2 — below 70 threshold, flagged)
  facts_traced              +40
  founding_date_populated   +0    (no founded_year)
  substantive_description   +10
  multi_listing_all_grounded +0
  independence_confirmed    +5
  cross_references_coherent +0
  framing_distinguishable   +10
```

### Pipeline metadata (Perth Pottery v4)

| Field | Value |
|---|---|
| Phase 1 candidate score | 72 (unchanged) |
| Model | claude-opus-4-7 |
| Prompt version | phase2-v4-2026-05-22 |
| Effort | high |
| Generated at | 2026-05-22T01:26:54.846Z |
| Total runtime | 26.7s (v3 was 22.2s) |
| Outcome | dry_run (clean success) |

---

## Bail detection

**The bail-token detector did NOT fire on either candidate.** This is
correct behaviour for both:

- **Perth Pottery v4:** real headline, real angle, real framing — no
  bail to detect. The prompt revisions alone closed the v3 regression.

- **Morris v4:** the headline and angle contain corrupted strings
  (`</antmletcer>`, `</antml meeting:parameter>`) — but these are not
  members of BAIL_TOKENS. The detector checks set membership after
  case+whitespace normalisation; it does not pattern-match against
  markup-like artefacts. detectBailToken returned `null`.

This is the expected behaviour given the BAIL_TOKENS design — a literal
allow-list of known bail variants, not a pattern matcher. The Morris
v4 failure is a different class of problem that BAIL_TOKENS was not
designed to catch.

**Should Morris's `</antmletcer>` and `</antml meeting:parameter>` be
added to BAIL_TOKENS?** Probably not literally — those exact strings
may never recur. The corrupted strings appear to be token-level
leakage of Claude's internal tool-use meta-syntax (`<function_calls>`,
`<parameter>`, etc.). A pattern-based detector ("flag any string
starting with `</`" or "flag any string containing `antml`") would be
more useful than expanding the literal set. **Out of scope for v4 —
flagged for Matt's decision.**

---

## Observations

1. **The v3 scope gap is closed (Morris framing).** Morris v4 framing
   contains no "166-odd years" equivalent. The extended-scope rule
   landed cleanly. This is the primary architectural win of v4.

2. **The v3 Perth Pottery regression is closed.** The thin-data
   positive example anchored the model's headline shape — the v4
   headline is literally the example, near-verbatim. Editorial
   acceptability is a Gate 1 judgment (see observation #5).

3. **NEW Morris failure: token-leakage in headline + angle.** The
   model emitted what look like fragments of its own tool-use
   meta-syntax (`</antmletcer>`, `</antml meeting:parameter>`) in the
   headline and angle fields. The framing and verified_facts fields
   are clean and grounded. This is a different class of failure than
   v2's "x" or v3's "placeholder" — it's not a bail (the model
   appears to have tried to produce content; the content is just
   corrupted). It bypasses the v4 bail-token enumeration and the
   detector both, because neither was designed to match markup-like
   artefacts.

4. **Hypotheses for the Morris token-leakage.** Three plausible
   causes, in rough order of likelihood:
   - **(a) Sampling glitch.** Claude occasionally produces token-level
     anomalies at high effort settings. A re-run might produce clean
     output. Worth re-running Morris before declaring v4 broken on
     data-rich candidates.
   - **(b) Increasingly complex prompt.** v4 has the largest CRITICAL
     RULES block of any version (8 bullets including the v4 expansions),
     plus two example blocks, plus the bail-token enumeration. At some
     point prompt complexity may interact pathologically with
     structured output mode. Worth measuring against a leaner variant.
   - **(c) Tool-use meta-syntax interference.** Claude's internal
     prompt-construction uses XML-ish tags (`<function_calls>`,
     `<parameter>`, etc.). If the model's tokenizer/decoder produces
     these tokens near the start of a generation, they could leak into
     a structured field. Less likely under standard tool use but
     possible.

5. **Perth's headline = the thin-data example verbatim.** This is
   architecturally desirable (predictable, low-risk) but editorially
   ambiguous (low variation across thin-data pitches). At Gate 1, if
   the editor sees multiple thin-data pitches all leading with "Hands
   in the Clay on Beaufort Street" or close variants, the example
   block may need to be replaced with abstract guidance rather than a
   specific candidate headline. Worth deciding before Gate 2 (n=25).

6. **The atomic-claims rule remains the most stable mechanism across
   all four versions.** Both candidates produced 10–12 atomic
   verified_facts entries in v4; no aggregation appeared. The atomic
   rule has caused zero regressions across v2/v3/v4. It's quietly
   doing the most reliable architectural work.

7. **Confidence scores held.** Morris 75/90 (single-anchor ceiling,
   despite corrupted headline/angle — framing earned the +10 framing-
   distinguishable signal). Perth Pottery 65/90 (below the 70-point
   low-confidence threshold, as designed for a thin-data new-producer
   pitch). The confidence function continues to be a reliable
   downstream filter.

8. **Architectural anti-hallucination guarantee remains intact across
   all four versions.** No fabricated content has reached a pitch in
   v1, v2, v3, or v4. The fact-check pass rejects nothing because the
   model never tries to push ungrounded claims through. The "166
   Years" bug was the only architectural concern, and v4 has closed
   it (in framing as well as headline/angle) — verified on Perth
   Pottery; verifiable on Morris's framing despite the corrupted
   headline/angle.

9. **The oscillation pattern across versions:** v1 ('166 Years' bug,
   Perth clean), v2 (Morris bails, Perth clean), v3 (Morris clean,
   Perth bails), v4 (Morris token-leakage, Perth clean). Each
   version has closed the prior version's known failure modes and
   introduced something new on Morris. The pattern is not random —
   Morris (data-rich) is consistently the harder candidate for the
   prompt to handle. Perth Pottery (data-thin) has been clean in
   three of four versions. If Matt wants a "first version with both
   candidates clean", we have not yet reached it — v4 is closest
   (architecturally clean on both, only the surface-prose corruption
   on Morris remains).

10. **The Morris failure should be reproduced before reacting.** Single
    sample size. A re-run of Morris v4 could either (a) reproduce the
    corruption (suggesting a systematic interaction between the prompt
    and Morris's data shape) or (b) produce clean output
    (suggesting a sampling glitch worth flagging but not architecting
    around). I did NOT re-run within this session — the user's brief
    was two runs (Morris + Perth Pottery), and a third run is its
    own decision.
