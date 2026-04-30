# Pitch System Design

**Status:** Specification, pre-build
**Last updated:** 30 April 2026
**Supersedes:** The original editorial pitch generator (torn down via migration 103)

---

## Purpose

The Pitch System produces editorial article briefs for the Atlas Network, grounded entirely in verified listing data. It replaces the original editorial pitch generator, which was disabled after producing fabricated journalism — invented venues, invented operators, invented backstories presented as factual pitches.

A pitch is a complete editorial brief: headline, angle, the listings to anchor the piece, the verified facts the writer can use, explicit editorial framing tagged separately from facts, research-needed flags for the gaps, and links to sources. A pitch is not a draft article. Approving a pitch does not generate an article — it marks the pitch as approved and surfaces it in a queue for the editor to write from when they sit down to do the writing.

The system exists to give the editor a steady supply of high-quality, grounded story ideas, with a particular bias toward surfacing independent and undercovered producers — exactly the venues the Atlas exists to lift.

---

## Failure modes this system prevents

The original pitch generator failed in six identifiable ways. The redesign addresses each by name. If any of these protections are weakened, the system can drift back into producing fabricated journalism.

**1. Ungrounded LLM generation.** The old system gave the LLM a vertical name and a vague brief. No actual listing data was passed in (or very little). The model filled the gap by inventing plausible Australian-sounding venues and stories. **Fix:** Phase 1 of the new pipeline is fully deterministic — a database query selects real listings before the LLM is invoked. The LLM is given the listing data; it does not imagine it.

**2. No fact-check pass.** Even when listing data was passed in, no verification step checked whether claims in the output traced back to that data. **Fix:** every factual claim in a generated pitch (venue name, operator, location, dates, characteristics, awards, founding stories) is validated against the source listing record before the pitch displays. Substring or structured-field match. If a claim cannot be traced, the pitch is rejected and regenerated — not patched.

**3. No separation between facts and editorial framing.** The old output mixed verifiable claims with editorial speculation in continuous prose, which made hallucinations invisible. **Fix:** pitches surface their grounding visibly. Each factual claim is tagged with the database field that supports it. Editorial framing (the angle, the voice, the why-this-why-now) is presented in a clearly separated section. The reader of the pitch can verify at a glance.

**4. No calibration before scaled use.** The old system shipped without verification. **Fix:** a three-gate calibration ceremony (n=5, n=25, n=100) is required before the system runs unsupervised. Each gate requires zero invented claims across all samples to progress.

**5. Output was treated as generative, not advisory.** The old system's pitches could become articles, articles got published, the network's editorial credibility took damage that cannot be undone. **Fix:** approving a pitch does not create an article. It marks the pitch as approved and adds it to a queue for the editor to write from. Every published article remains human-written. The pitch is a starting point, never an output.

**6. Incumbent bias in candidate selection.** Naive data-richness scoring rewards established venues with marketing teams, populated websites, press coverage, and long histories — exactly the venues least aligned with the Atlas's editorial proposition. **Fix:** hard disqualifiers for known commercial groups and recently-covered listings; positive scoring weights for owner-operator status, recent network entry, regional location, and absence of prior journal coverage; and dedicated new-producer slots in every queue that lower the data-richness floor for venues under three years old with minimal media attention.

---

## Architecture

### Two-phase pipeline

**Phase 1 — Candidate Identification (deterministic, no LLM).** A database query selects listings that have enough data richness to support an editorial brief, filtered by independence and incumbent rules, scored, and ranked. The top candidates pass to Phase 2. The LLM is not involved in this phase.

**Phase 2 — Editorial Framing (LLM, heavily constrained).** For each top candidate, the LLM receives the exact listing record plus any cross-referenced listings, and produces a structured pitch. The system prompt enforces the grounding rule explicitly. The output is then run through fact-check validation before display.

This separation is non-negotiable. The LLM never selects candidates and never invents facts. It is only ever asked to frame data it has been given.

### Queue structure

The system maintains thirty active pitches at any time:

- Nine vertical queues, each with three pitches: one general slot and two new-producer slots
- One portal queue with three slots: one general cross-vertical slot and two new-producer cross-vertical slots

Total: 30 active pitches.

When a pitch is approved or rejected, its slot regenerates with a new candidate. The system enforces uniqueness — the two new-producer slots in the same vertical hold distinct pitches; a venue currently in one slot cannot appear in another.

### Output shape: anchored multi-listing pitches

A pitch has a primary listing (the anchor) and may include up to four additional supporting listings drawn from any vertical. The primary listing's vertical determines the queue slot. Cross-vertical inclusion is encouraged where the data supports it — a Small Batch story can pull in a ceramicist and a boutique stay along the way — but every included listing must contribute to the editorial argument and every claim about every listing must trace to that listing's data.

The portal queue's three slots produce pitches without a single anchor — they are inherently cross-vertical, with two to five listings of equal weight in the editorial frame.

---

## Phase 1: Candidate Identification

### Hard disqualifiers (filter first, before scoring)

A listing is excluded from the candidate pool if any of the following apply:

- The listing belongs to a known commercial group (Beckons / Baillie Lodges / Luxury Lodges US Holdings family; any group flagged in `01-independence-criteria.md`)
- The listing has been the subject of an Atlas journal article in the last 24 months
- The listing is currently in another active pitch slot anywhere in the system
- The listing's `status` is not `active`
- The listing has fewer than the minimum populated fields for its slot type (see below)

For new-producer slots, two additional disqualifiers apply:

- The listing was added to the Atlas Network more than three years ago, OR the venue's documented founding date is more than three years ago, whichever is later. (i.e. either signal alone qualifies as "too old")
- The listing has more than four media coverage entries in the network's `media_coverage_log`, OR has any entry from a major national publication. The major-national list is defined and seeded explicitly: *Gourmet Traveller*, *Broadsheet*, *Concrete Playground*, *Good Food*, *Time Out*, *The Guardian Australia* (food, culture, travel sections), *SMH Spectrum*, *The Age Good Weekend*, *The Australian* magazine, *Monocle*. Publications below this bar count as local-press mentions and are weighted but not disqualifying.

The media-coverage threshold scales by vertical to reflect how much coverage is normal for each category. Craft, Field, Found, and Corner listings get a slightly higher local-press tolerance than Small Batch, Rest, Fine Grounds, Culture, and Table — three local-press mentions is undercovered for a ceramicist, well-covered for a winery. The per-vertical multipliers are stored in a configuration table and editable without code changes.

### Minimum data thresholds

**General slot floor:** the listing must have a populated name, address with verified region, website URL, a description of at least 200 characters, and at least three additional populated fields from: operator name, founding date, awards, distinguishing practice/method, opening hours, contact details.

**New-producer slot floor:** the listing must have a populated name, address with verified region, and at least one of: a website URL, a description of at least 100 characters, or a populated operator name. The floor is deliberately lower because new producers will have thinner records — the system's editorial purpose for these slots is uplift, not over-curation.

The grounding rule does not relax with the data threshold. Whatever data is present must be the only source for factual claims; the rest is left as research-needed flags for the writer.

### Scoring

Candidates that pass disqualifiers and meet the floor are scored 0–100. Higher scores rank higher. Scoring weights:

| Signal | Weight | Notes |
|---|---|---|
| Description length and substance | +15 | Above 200 chars, increasing to 500 |
| Operator/owner name populated | +10 | |
| Founding date populated | +5 | |
| Independence flag confirmed | +10 | From curation work |
| Owner-operator confirmed | +10 | Explicit anti-incumbent signal |
| Single-location only | +5 | Not part of a group, even an independent one |
| Regional location | +5 | Not capital-city CBD |
| Recently added to network (under 12 months) | +10 | Newness as positive signal |
| No prior pitch attempts | +10 | Naturally rotates through the network |
| Geographic cluster with other Atlas listings | +10 | Cross-vertical hook potential |
| Heritage / distinctive practice documented | +10 | |

Maximum score: 100.

For new-producer slots, the "Recently added" weight is replaced by a flat +20 baseline and the "Description length" weight is reduced (a thin-website new producer is fine; the bar is grounding, not richness).

The score is stored on every generated pitch for audit. Scoring weights live in a configuration table and can be tuned without code changes — but tuning during calibration is logged as a calibration adjustment, not a normal change.

### Ranking and selection

The top three candidates per slot type per vertical are passed to Phase 2 (one for the general slot, two for the new-producer slots). The portal queue passes three cross-vertical clusters — defined as groups of two to five listings within a 50km radius that share an editorial through-line the system can identify from the data (region, theme, era, practice).

If a slot's candidate pool is exhausted (no listings meet the floor and pass disqualifiers), the slot is held empty with a "no candidates" status rather than relaxing the floor. The editor sees the empty slot and knows the network's coverage in that vertical needs broadening before pitches can be generated there.

---

## Phase 2: Editorial Framing

### Input

The LLM receives:

- The full listing record(s) from the database — every populated field, no fields summarised or paraphrased
- The vertical's editorial voice guide (from project knowledge)
- A list of any cross-referenced listings (for multi-listing pitches), each with their full record
- The slot type (general vs new-producer) and what that means for tone
- Explicit instruction that no other context exists — no web search, no prior knowledge, no inferred backstory

### System prompt

The Phase 2 system prompt enforces the grounding rule absolutely. The non-negotiable elements:

> You are generating an editorial article brief for the Atlas Network, a curated discovery platform for independent Australian venues.
>
> CRITICAL RULES:
>
> - You will be given the exact database record(s) for one or more listings. Every factual claim in your pitch MUST come directly from this data. You may quote it, paraphrase it, or summarise it, but you cannot extend it.
> - If a field is empty or null, you MUST NOT invent content for it. State explicitly that the field is unpopulated and add it to research-needed.
> - You may suggest an editorial ANGLE or FRAMING — a hook, a thesis, a why-this-why-now — but the underlying facts must all be verifiable from the provided data.
> - Do NOT invent operator names, founding dates, backstories, philosophies, awards, or superlative claims (oldest, first, only, best).
> - Do NOT use phrases like "likely", "probably", "perhaps they...", "one imagines", or "it stands to reason" to smuggle speculation in as soft fact.
> - Editorial framing is creative. Facts are not. Tag them separately in your output.
> - If the data is too thin to support a grounded pitch, return a structured "insufficient data" response. Do not fabricate to fill the gap.

### Output structure

Every pitch returns a structured object with these sections:

- **Headline** (working title)
- **Angle** (one paragraph — the editorial thesis, what makes this story worth writing now)
- **Anchor listing** (the primary venue — name, vertical, region, slug)
- **Supporting listings** (any additional venues — names, verticals, regions, slugs, and a one-line note on what they contribute)
- **Verified facts** (a structured list — every factual claim, tagged with the database field that supports it, formatted as `claim → field`)
- **Editorial framing** (the creative angle, voice, structural suggestion — explicitly separated from facts)
- **Research needed** (gaps the writer must close — empty fields, unverified claims, places where the LLM identified more story potential than the data supports)
- **Confidence score** (0–100, derived deterministically from the data signals — not LLM self-assessment)

### Confidence scoring

The pitch's confidence score is computed by code, not the LLM, from the underlying listing data:

| Signal | Contribution |
|---|---|
| All claimed facts traced to fields | +40 (zero is a hard fail, not a low score) |
| Anchor listing has populated operator name | +10 |
| Anchor listing has populated founding date | +10 |
| Anchor listing has substantive description (>200 chars) | +10 |
| Multi-listing pitch with all listings grounded | +10 |
| Anchor listing has independence flag confirmed | +5 |
| Cross-references geographically coherent (within 50km radius) | +5 |
| Editorial framing distinguishable from facts | +10 (binary — no partial credit) |

Maximum: 100. A pitch scoring below 70 is flagged "low confidence" in the UI but is still surfaced — the editor decides whether to approve.

### Fact-check pass

Before any pitch is written to the database and surfaced in the queue, an automated validation step:

1. Extracts every factual claim from the verified-facts section
2. For each claim, attempts a substring or structured-field match against the cited database field
3. If any claim fails to match, the pitch is rejected and the candidate is regenerated
4. If the regeneration also fails, the candidate is held in a `pitch_generation_failures` table with the failure mode logged, and the next candidate from Phase 1 is tried

This is not optional. A pitch that has not passed fact-check cannot reach the queue.

---

## Schema

### Core tables

**pitches** — active pitches in the queue.

```
id                  uuid PK
slot_id             uuid FK → pitch_slots
vertical            text
slot_type           enum (general, new_producer)
status              enum (active, approved, rejected)
anchor_listing_id   uuid FK → listings (nullable for portal pitches)
supporting_listing_ids uuid[] (FKs → listings)
headline            text
angle               text
verified_facts      jsonb (structured: array of {claim, field, value})
editorial_framing   text
research_needed     text[]
confidence_score    int
candidate_score     int (the Phase 1 score that surfaced this candidate)
prompt_version      text (which version of the Phase 2 prompt was used)
generated_at        timestamptz
generated_by        text (model name + version)
fact_check_passed   bool
created_at          timestamptz
updated_at          timestamptz
```

**pitch_slots** — the 30 queue slots themselves.

```
id              uuid PK
vertical        text (one of nine + 'portal')
slot_index      int (1, 2, or 3 within the vertical)
slot_type       enum (general, new_producer)
current_pitch_id uuid FK → pitches (nullable when empty)
last_filled_at  timestamptz
status          enum (active, empty_no_candidates)
```

**approved_pitches** — pitches the editor has approved and queued for writing.

```
id              uuid PK (separate from pitches.id — approval is a state transition with its own row)
pitch_id        uuid FK → pitches
approved_at     timestamptz
approved_by     uuid FK → users
written_at      timestamptz (nullable, set when the editor marks the article written)
article_id      uuid FK → articles (nullable, set when the editor links the published article)
```

**rejected_pitches** — soft-deleted rejections for audit trail.

```
id              uuid PK
pitch_id        uuid (no FK — pitches row is deleted on rejection but ID retained)
pitch_snapshot  jsonb (full pitch contents at time of rejection)
rejected_at     timestamptz
rejected_by     uuid FK → users
rejection_reason text (nullable, optional tagging)
```

**media_coverage_log** — known external coverage per listing, used by Phase 1's new-producer disqualifier.

```
id              uuid PK
listing_id      uuid FK → listings
publication     text
publication_tier enum (major_national, regional, trade, blog)
url             text
title           text
published_date  date
recorded_at     timestamptz
recorded_by     enum (manual, automated_seed, automated_refresh)
```

**pitch_generation_failures** — candidates that passed Phase 1 but failed fact-check at Phase 2, for audit and prompt-tuning.

```
id              uuid PK
candidate_listing_id uuid FK → listings
slot_id         uuid FK → pitch_slots
failure_mode    enum (fact_check_failed, insufficient_data_returned, llm_error)
attempted_at    timestamptz
prompt_version  text
raw_llm_output  text
failed_claims   jsonb (the specific claims that didn't trace)
```

**pitch_score_weights** — Phase 1 scoring configuration.

```
id              uuid PK
signal_name     text
weight          int
slot_type       enum (general, new_producer, both)
vertical        text (nullable — applies to all if null)
active          bool
updated_at      timestamptz
updated_by      uuid FK → users
```

### Migrations

Five migrations bring the schema into being. They will be numbered starting from 105 and committed as a single coherent change. Migration 105 will be applied to the production database only after the corresponding consumer code is committed and deployed — per the migration deployment discipline added to CLAUDE.md after the migration 104 incident.

The seven orphaned tables currently on production (`pitch_sources`, `pitch_characters`, `pitch_character_attributes`, `pitch_signals`, `pitches`, `pitch_score_weights`, `vertical_noun_mappings`) are dropped before the new schema is created. They were created during exploratory work that was abandoned, contain no production data of value (one row in `vertical_noun_mappings` aside, easily re-seeded), and committing the new design over the top of them risks structural conflict.

---

## Calibration ceremony

The system does not run unsupervised until it has passed three calibration gates. Each gate requires zero invented claims across all samples to progress. The same discipline as the description rewrite pipeline.

**Gate 1 — n=5.** The editor names five listings. The system generates a pitch for each. The editor reads every claim in every pitch and traces it to the source data. If any claim is invented, partially invented, or extends beyond what the data supports, the gate fails. The system is not patched — the prompt is revised, and the gate is rerun from scratch with five new listings.

**Gate 2 — n=25.** Stratified across all nine verticals plus portal. Five general-slot pitches and twenty new-producer pitches (to stress-test the lower data-richness floor). The editor spot-checks every pitch — same standard as Gate 1.

**Gate 3 — n=100.** Stratified across all verticals and slot types. The editor reads every output end-to-end. This is the gate that catches subtle drift the smaller samples miss — the LLM finding ways to soften speculation as soft fact, the cross-references that don't quite cohere, the editorial framing that quietly extends beyond the data.

After Gate 3 passes, the system enters production use with continued spot-checking — but is no longer required to be reviewed end-to-end before pitches surface.

A failure at any gate halts the system entirely. The failure is investigated, the prompt or schema is revised, and the gate is rerun with fresh samples. The threshold is zero invented claims; a "low rate" of invention is not acceptable. The architectural validation should make zero-invention the natural state. Calibration confirms it.

---

## What approval and rejection do

**Approve.** The pitch's status moves from `active` to `approved`. A row is created in `approved_pitches` linking back to the pitch. The pitch slot regenerates with a new candidate from Phase 1. The approved pitch surfaces in a separate `/admin/approved-pitches` view, where the editor works through them when they sit down to write. Approval does not create a draft article. It does not notify any external system. It is a marker that the editor intends to write this story, and a complete brief to write from when the time comes. Once an article has been written and published, the editor can optionally link the article back to the approved pitch via the `article_id` field — useful for tracking which approved pitches converted to publication and which sat in the queue.

**Reject.** The pitch is moved to `rejected_pitches` (full snapshot retained), the original `pitches` row is deleted, and the slot regenerates with a new candidate. An optional rejection-reason field is available but not required at rejection time. Over time, populated rejection reasons surface signal about what the system gets wrong — `wrong angle`, `hallucinated claim`, `already covered`, `not editorially interesting`. This data informs prompt revision and scoring weight tuning.

The editor never has to reject a pitch with a reason. The friction-free path is two clicks (reject, confirm). The reasoning is opt-in for sessions where the editor has the bandwidth to tag.

---

## What this system does not do

These are deliberate exclusions from the design. Adding any of them is a future scope decision, not a v1 oversight.

- It does not write articles. Approval is a brief, not a draft.
- It does not search the web during pitch generation. All grounding is from the database. The `media_coverage_log` is populated separately (manual seed plus periodic automated refresh) and consulted only as a disqualifier.
- It does not auto-publish, auto-notify, or auto-anything beyond regenerating slots. Every step that produces public-facing content involves a human.
- It does not generate pitches that span more than five listings. Editorial coherence collapses past that, and grounding becomes harder to verify.
- It does not handle visual media (no hero image suggestions, no photo briefs). Images are the editor's call at write time.
- It does not score editorial quality of finished articles. Pitches are the input to writing; quality of output is a separate editorial concern.

---

## Open questions for build time

These are not design decisions to revisit — they're implementation details the build agent will need to confirm with the editor before coding:

1. The Phase 2 LLM prompt's exact wording, including the few-shot examples it will reference. The principles are non-negotiable; the phrasing will iterate during Gate 1 calibration.
2. The seed list for the `media_coverage_log`. Initial population is a one-off web search across the network; the search query strategy and the per-vertical search depth need to be specified.
3. The frequency of slot regeneration. Slots refill on approve/reject, but there's a question of whether they also refresh periodically (say, monthly) to surface new candidates as the network grows. My recommendation: yes, monthly background refresh, replacing only candidates whose underlying scoring data has shifted materially.
4. Per-vertical media coverage threshold multipliers. The principle is set (Craft/Field/Found/Corner more lenient than Small Batch/Rest/Fine Grounds/Culture/Table); the exact numbers come from looking at real coverage volumes per vertical during seed.

---

## Phasing

The build is staged. Each phase ships and is verified before the next is started.

**Phase 1 of the build — schema + Phase 1 of the pipeline.** Migrations created, seven orphaned tables dropped, new schema in place. Phase 1 candidate identification implemented and runnable as a standalone script that returns ranked candidates without invoking the LLM. Verified by running against the live network and confirming the candidate pools look editorially sane.

**Phase 2 of the build — Phase 2 of the pipeline.** LLM integration, prompt finalised, fact-check pass implemented. Calibration Gate 1 (n=5) runs. Halts until passed.

**Phase 3 of the build — calibration at scale.** Gates 2 and 3 (n=25, n=100). Runs in stages with editor review between each. Halts until passed.

**Phase 4 of the build — admin UI.** The queue view at `/admin/pitches`, the approved-pitches view at `/admin/approved-pitches`, the slot status indicators, the approve/reject flow. Built only after the pipeline is calibrated — no point building UI for a system that might still be hallucinating.

**Phase 5 of the build — background refresh and media coverage seeding.** The monthly slot refresh, the initial population of `media_coverage_log`, the periodic refresh job for new external coverage. Built last because the system is fully usable without it; this is operational hardening.

The phases are independent commits and can ship across multiple sessions. They do not need to ship in a single push.
