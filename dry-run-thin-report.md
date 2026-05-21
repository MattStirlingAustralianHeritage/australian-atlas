# Thin-data dry-run — Perth Pottery Co — 2026-05-21T06:48:14Z

## Why this candidate

Phase 1 against `craft` + `new_producer` returned 20 candidates. Ranks 17–20
all tied at score 72 — the absolute floor for the craft new-producer slot.
Picked **Perth Pottery Co** from the tied group on three criteria:

- Shortest description in the tied group (396 chars vs. 398–424 for the others)
- No `founded_year`, no `awards`, no `heritage_significance`, `single_location` unknown
- Generic-sounding name ("Perth Pottery Co") that would maximally tempt
  invention of "specialises in", "founded by", or geographic-superlative
  language

Decision made by Code in flight per the set-and-forget brief; no input was
sought. Other tied candidates: `cocraft-melbourne-woodworking-courses-and-custom-furniture`,
`rezist-textiles-and-design`, `bobbin-and-ink`.

## TL;DR

Architecture holds under thin data. All 6 claims traced, fact-check passed,
confidence 65/90 — below the spec's 70-point low-confidence threshold by
design, since no `founded_year` means the +10 signal can't be earned. The
model resisted invention on several specific gaps (Elizabeth's surname,
tenure claims, awards, single-location status) and surfaced them as
research-needed.

## The pitch

**Headline.** Hands in the Clay on Beaufort Street: Inside Perth Pottery
Co's Hand-Building Studio

**Angle.** Perth Pottery Co is an owner-operated craft studio on Beaufort
Street in Inglewood where Elizabeth and her team teach hand-building —
coil, pinch, and slab — rather than wheel-throwing. The pitch is a
beginner-friendly invitation: a clay-dusted room where you walk out with
something you actually made, whether you came for a Thursday session with
herbal tea or a weekend Sip and Pot evening with wine. For a new producer
in the network, the story is simply this: a small, independent teaching
studio with a clear philosophy about how beginners learn pottery.

**Anchor listing.** Perth Pottery Co (craft — Perth). Slug `perth-pottery-co`,
ID `49f57cf5-6963-4040-aa0f-8e645aeaf5be`.

**Supporting listings.** None — Phase 2 single-anchor.

**Editorial framing.** Voice: warm, tactile, lightly conversational — the
kind of write-up that makes a curious beginner feel they could turn up on
a Thursday with nothing but the right pair of jeans. Lean into the sensory
texture already present in the record: "clay-dusted," herbal tea on a
weeknight, wine on a Saturday, the difference between watching someone
throw a bowl and pinching one yourself. Structurally, consider a two-beat
piece: open on the format-vs-philosophy contrast (hand-building over
wheel-throwing, and why that matters for someone who's never touched
clay), then close on the two class moods — quiet Thursday vs. social
weekend. Keep the operator detail human-scale: Elizabeth and her team, no
embellishment. Treat this as an introduction, not a profile — the network
is uplifting a new producer, so the brief should invite a first visit
rather than render a definitive verdict.

**Research needed.**

1. `founded_year` is null — confirm with the studio how long it has been
   operating before publishing any tenure or 'new/established' language.
2. Elizabeth's surname and role are not in the record; the writer should
   confirm directly before naming her beyond a first name.
3. `hours` is null — confirm class times and studio opening hours,
   particularly the Thursday and weekend Sip and Pot schedules referenced
   in the description.
4. `best_season` is null — if the piece is timed seasonally, confirm with
   the operator whether there is a preferred time of year to visit.
5. `awards` is an empty array — do not claim any recognition; if relevant
   accolades exist, source and add them.
6. `single_location` is null — confirm whether Perth Pottery Co operates
   only from the Beaufort Street address or has additional sites.
7. Pricing, class length, group size, and what students take home
   (greenware vs. fired/glazed pieces, despite 'firing included') should
   be confirmed directly with the studio.
8. Confirm whether the Sip and Pot evenings are BYO or whether wine is
   supplied, and any licensing detail.

## Fact-check trace

All 6 claims traced.

| # | Claim | Field | Match |
|---|---|---|---|
| 1 | Perth Pottery Co operates from a studio on Beaufort Street in Inglewood. | `description` | Substring of the description's opening sentence |
| 2 | The studio is owner-operated. | `is_owner_operator` | `"true"` — bool-coerce match against true |
| 3 | Its independence has been confirmed in the Atlas Network record. | `independence_confirmed` | `"true"` — bool-coerce match against true |
| 4 | The venue is set up to receive visitors as a workshop experience. | `visit_type` | `"workshop"` — substring match |
| 5 | It sits within the craft vertical of the network. | `vertical` | `"craft"` — substring match |
| 6 | The studio is located at 890 Beaufort St, Inglewood WA 6052. | `address` | `"890 Beaufort St, Inglewood WA 6052, Australia"` — substring match |

No claims rejected.

## Confidence score breakdown

**Total: 65/90** — below the spec's 70-point low-confidence threshold. This
would surface in the UI flagged "low confidence" and surface to the editor
to decide whether to approve. The threshold trip is **exactly the design
intent** for a new-producer slot pitch on a thin record: the missing
founded_year alone is enough to drop the pitch below 70, which is right.

| Signal | Contribution | Reason |
|---|---|---|
| facts_traced | +40 | All 6 verified_facts passed fact-check |
| founding_date_populated | +0 | `founded_year` is null |
| substantive_description | +10 | Description 396 chars — above the 200-char floor |
| multi_listing_all_grounded | +0 | N/A — single-anchor pitch |
| independence_confirmed | +5 | `independence_confirmed = true` |
| cross_references_coherent | +0 | N/A — no supporting listings |
| framing_distinguishable | +10 | Both `editorial_framing` and `verified_facts` populated |

## Pipeline metadata

| Field | Value |
|---|---|
| Phase 1 candidate score | 72 (rank 20, tied last in the top-20) |
| Model | claude-opus-4-7 |
| Prompt version | phase2-v1-2026-05-07 |
| Effort | high |
| Adaptive thinking | dropped (incompatible with forced `tool_choice`) |
| Generated at | 2026-05-21T06:48:14.204Z |
| Total runtime | 25.9s |
| Mode | DRY-RUN (no DB writes) |
| Slot type | new_producer |
| Outcome | dry_run (success) |

## Observations

1. **The architectural anti-hallucination guarantee held under stress.** This
   is the most important finding of the day. The thin-data candidate had no
   founding date, no awards, no heritage signal, no single-location flag,
   and only a 396-character description. The model still produced a
   grounded pitch — every claim traced, no invented backstory, no
   "specialises in" language, no geographic superlative ("Perth's only...",
   "Inglewood's premier..."). The fact-check function never rejected a
   claim because the model never tried to push one through that didn't
   trace.

2. **The "don't invent" rule visibly bit on operator name.** The
   description mentions "Elizabeth" (first name only). The model used
   "Elizabeth and her team" in the angle and framing — that traces to the
   description substring in verified_facts[1]. But the model deliberately
   did NOT invent a surname; instead it put **"Elizabeth's surname and
   role are not in the record; the writer should confirm directly before
   naming her beyond a first name"** into research_needed[2]. This is the
   prompt rule "Do NOT invent operator names" working precisely as
   intended. Worth highlighting at Gate 1.

3. **Confidence score under 70 = the right signal.** The 70-point
   low-confidence threshold from the spec is calibrated, in part, around
   exactly this kind of pitch: a new-producer slot with thin descriptive
   data. The score of 65 means an editor reviewing the queue would see
   this pitch flagged, know it's a new-producer slot pitch, and decide
   whether to approve. That matches the spec's "confidence < 70 surfaces
   with a flag, not a hard reject" posture.

4. **Headline contains no derived numbers.** Unlike the Morris dry-run
   (which had a "166 Years" arithmetic in the headline not present in any
   verified_fact), the Perth Pottery Co headline contains no numbers at
   all. This is a happier surface for the architecture: there's nothing
   in the headline that bypasses fact-check. Whether the difference is
   prompt-driven, candidate-driven, or random is unclear from n=2.

5. **Research_needed array is exceptional.** Eight items, each pointing at
   a real gap, each with specific suggested action ("confirm with the
   studio", "do not claim any recognition", etc.). The research_needed
   field is doing real editorial work here — it's a writer's checklist,
   not a placeholder. This is the spec's "explicit research_needed flags
   for the gaps" rule landing well.

6. **The "Sip and Pot" detail.** The model picked up a specific session
   name from the description and used it across the pitch — angle,
   framing, and research_needed (item 8 asks about BYO licensing for
   these evenings). This is good — the model identified the
   editorially-interesting concrete detail and built around it without
   embellishing what it doesn't know (timing, licensing, format details
   all flagged for research).

7. **Two runs, two passes, no schema or pipeline issues across either.**
   The Phase 2 pipeline (after today's twelve commits) is producing
   grounded pitches on both a data-rich general-slot candidate (Morris
   Whisky, 75/90) and a thin-data new-producer-slot candidate (Perth
   Pottery Co, 65/90). The architecture is verified end-to-end against
   real listings. Gate 1 is technically unblocked.
