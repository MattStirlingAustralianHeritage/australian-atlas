# Pitch System — Phase 3 Design

**Status:** Active — Stage 1 build
**Author:** Matt Smith
**Date:** 22 May 2026
**Supersedes:** The "tables dropped" decision in `docs/pitch-system-design.md` line 305. Those four tables (`pitch_sources`, `pitch_characters`, `pitch_character_attributes`, `pitch_signals`) are deliberately re-introduced as the foundation of the discovery layer.

> **AS-BUILT NOTE — 2026-05-29**
>
> "Phase 3" is overloaded: **this** doc means the *discovery layer*; the older `pitch-system-design.md` uses "Phase 3" to mean *calibration at scale*. The reconciled current-state record is `pitch-system-state-audit-2026-05-29.md`.
>
> - **Stage 1 (first-party discovery) is built and ran in production on 22 May** — 450 rows across the four discovery tables; the substring validator demonstrably dropped invented content under load. The formal n=5 → n=20 → n=50 gate ceremony was **skipped**; no signed-off calibration report exists. **Stages 2–6 are design-only (no code).**
> - **The live pitch path does NOT read these tables.** The Phase 2 generator and the batch runner (`scripts/pitch-run-batch.mjs`) ground on the master `listings` table ONLY. The discovery → composition integration this doc anticipates is **not wired**. The first production pitch run (2026-05-29) grounded entirely on `listings`.

## Purpose

Phase 2 calibrated the in-pipeline pitch generator. It takes a listing plus pre-existing supporting signal data and produces a structured editorial pitch with fact-check guarantees. What it does not do is **find** the signal data. Phase 3 is that work: a discovery layer that fetches venue first-party sources, extracts characters and signals into structured database rows, and surfaces those rows to Phase 2 as inputs.

Architecturally, Phase 3 inverts the data flow from "human-curated listing → pitch" to "venue first-party content → structured research → pitch". The model's job in Phase 3 is retrieval, not generation. Every claim that lands in the database traces to a literal substring of a fetched source. The architectural anti-hallucination guarantee from Phase 2 extends here: no fact exists in the database unless its `source_excerpt` substring-matches the source it claims to come from.

## Core Principles

1. **Source binding is non-negotiable.** Every character, attribute, and signal carries a `source_excerpt` that must substring-match the original fetched text. Validation runs at write time. A row with an unsourced or unverifiable excerpt cannot be inserted.

2. **Retrieval, not generation.** The model reads fetched content and fills structured slots. It does not compose prose. Output is JSON with citations, not narrative.

3. **First-party means the venue's own voice.** Stage 1 fetches from the venue's own website only. Press, awards, and external coverage come in later stages. The rule "first-party = the venue presents this person/fact as part of its identity" filters out incidental mentions.

4. **Implied confidence is allowed but bounded.** The `confidence` field on attributes accepts `explicit` or `implied`. Implied attributes still require a source_excerpt and the inference must be one short logical step from the text. Multi-step inferences, speculation, or aesthetic interpretation are rejected.

5. **Editorial pre-reporting, not published prose.** The output is research material a human reads to decide whether to pursue a story. It is never published verbatim. The threshold is "is this useful research?", not "is this a finished article?".

## Data Model

Four tables and three enums, defined in migration 132. All tables FK to `listings(id)` and cascade on listing deletion. Source-bound tables FK to `pitch_sources(id)` with `ON DELETE RESTRICT` — you cannot delete a source row that has dependent characters, attributes, or signals; that would break the architectural guarantee.

### Enums

```
pitch_source_type:
  - venue_first_party       (venue's own website, Instagram, podcast)
  - editorial_third_party   (named publication with editorial standards)
  - institutional           (awards bodies, government registers, industry associations)
  - atlas_internal          (existing Atlas journal articles)

pitch_attribute_confidence:
  - explicit                (literally stated in the source_excerpt)
  - implied                 (one-step inference from the source_excerpt)

pitch_signal_type:
  - press_coverage
  - award
  - listing_change
  - cluster
  - silence
  - cross_reference
  - recently_opened
  - first_in_category
  - founder_pivot
  - emerging_recognition
  - unusual_location
  - methodology_novelty
```

### Tables

**`pitch_sources`** — every fact in the discovery layer traces back to a row here. One row per fetched URL per listing per fetch cycle.

```
id                  uuid          PK
listing_id          uuid          FK to listings, NOT NULL
source_type         pitch_source_type NOT NULL
source_url          text
source_publication  text
source_author       text
source_date         date
source_text         text          NOT NULL — the full fetched passage
fetched_at          timestamptz   NOT NULL DEFAULT now()
created_at          timestamptz   NOT NULL DEFAULT now()
```

The `source_text` field is mandatory and contains the full text of the fetched page. This is what enables verification six months after generation. If a writer questions a claim, the source text is right there to check against.

**`pitch_characters`** — named people associated with the venue. Each character requires a `primary_source_id` — schema-enforced via NOT NULL FK. No character can exist without a real source row introducing them.

```
id                  uuid          PK
listing_id          uuid          FK to listings, NOT NULL
name                text          NOT NULL
role                text
primary_source_id   uuid          FK to pitch_sources, NOT NULL, ON DELETE RESTRICT
created_at          timestamptz   NOT NULL DEFAULT now()
```

**`pitch_character_attributes`** — everything you'd say about a character. One claim per row, one citation per row. Atomic by design.

```
id                  uuid          PK
character_id        uuid          FK to pitch_characters, NOT NULL, ON DELETE CASCADE
attribute_type      text          NOT NULL, CHECK IN (
                                    'background', 'family_history', 'technique',
                                    'achievement', 'quote', 'biographical', 'philosophy'
                                  )
attribute_text      text          NOT NULL
source_id           uuid          FK to pitch_sources, NOT NULL, ON DELETE RESTRICT
source_excerpt      text          NOT NULL — the specific clause supporting this attribute
confidence          pitch_attribute_confidence NOT NULL
created_at          timestamptz   NOT NULL DEFAULT now()
```

**`pitch_signals`** — non-character signals. Awards, press mentions, listing changes, cluster patterns, novelty markers, silences. `source_id` is nullable specifically for `silence` signals (which point at the absence of sources). Every other signal type requires a source — enforced by a CHECK constraint.

```
id                  uuid          PK
listing_id          uuid          FK to listings, NOT NULL
signal_type         pitch_signal_type NOT NULL
source_id           uuid          FK to pitch_sources, NULL OK, ON DELETE RESTRICT
signal_data         jsonb         NOT NULL DEFAULT '{}'
created_at          timestamptz   NOT NULL DEFAULT now()

CONSTRAINT pitch_signals_source_required CHECK (
  signal_type = 'silence' OR source_id IS NOT NULL
)
```

## The Six Discovery Stages

Phase 3 is six discovery stages, each producing rows in the tables above. Stages have dependencies; Stage 1 is the foundation.

1. **First-party sources** — venue's own website. (This document's primary focus.)
2. **Editorial third-party** — press whitelist + targeted web search per venue.
3. **Institutional** — per-vertical award scrapers (Halliday, GABS Hat awards, etc.).
4. **Atlas internal** — cross-reference against existing Atlas journal articles.
5. **Cross-reference detection** — scan first-party text for mentions of other listings.
6. **Silence computation** — derive `silence` signals from absences (no recent press, no awards, etc.).

Logical build order: 1 → 4 → 5 → 2 → 3 → 6. Stages 2–6 are out of scope for the current build phase.

## Stage 1: First-party sources

Given a listing's `website_url`, Stage 1 fetches the homepage plus a heuristic chain of about-pages, uses an LLM to extract characters and venue signals as structured JSON with mandatory `source_excerpt` for every field, substring-validates each excerpt against the original fetched text, and INSERTs validated rows into the four tables.

### Page chain

In order, attempt to fetch each of:

```
/                  (homepage)
/about
/about-us
/our-story
/the-story
/process
/studio
/makers
/team
/people
/founders
/contact
/journal
/blog
```

Stop at the first page that 404s for a given URL pattern; don't keep trying variants if `/about-us` works. 404s are skipped silently. Network errors are logged but don't halt the chain. Successfully fetched pages return `{ url, text, fetched_at }` to the orchestrator.

### Fetch behaviour

- 10-second timeout per request
- 1–2 second delay between requests (these are small business websites)
- User agent: `Mozilla/5.0 (compatible; AustralianAtlas/1.0; +https://australianatlas.com.au)`
- HTML stripped to text via `html-to-text` package (chosen for minimal-noise plaintext output — strips script/style, preserves paragraph breaks)
- If zero pages fetched successfully, log `stage1_no_first_party_content` and return; this is not a failure to recover from, it's a real signal about the venue

### Structured extraction prompt

Same architectural pattern as Phase 2's prompt (CRITICAL RULES section, locked-in via unit tests, prompt-versioned). Key rules:

- Every `source_excerpt` MUST be a verbatim substring of the source text provided. Paraphrasing source_excerpts is forbidden.
- Every attribute and signal's source_excerpt must directly support the claim it cites.
- `confidence: "implied"` is allowed but the inference must be one short logical step from the source_excerpt. Multi-step inference, aesthetic interpretation, and speculation are rejected.
- Do not invent characters not named in the source.
- Do not extract characters mentioned only in passing or in third-party context.
- One quote per character maximum. Quotes only when literally in source with attribution.
- Return `{ characters: [], venue_signals: [] }` as the top-level structure.

Prompt version: `phase3-stage1-v1-2026-05-22`. Increment on any wording change. Lock the version string and key rule substrings into unit tests so silent edits fail loudly.

### JSON output structure

```json
{
  "characters": [
    {
      "name": "string",
      "role": "string or null",
      "source_url": "the url this character was extracted from",
      "source_excerpt": "the exact passage naming and introducing this person",
      "attributes": [
        {
          "attribute_type": "background|family_history|technique|achievement|quote|biographical|philosophy",
          "attribute_text": "what this attribute says",
          "source_excerpt": "the exact clause supporting this attribute",
          "confidence": "explicit|implied"
        }
      ]
    }
  ],
  "venue_signals": [
    {
      "signal_type": "recently_opened|first_in_category|founder_pivot|emerging_recognition|unusual_location|methodology_novelty|award|press_coverage|cross_reference",
      "source_url": "the url this signal was extracted from",
      "source_excerpt": "the exact passage",
      "signal_data": { "...type-specific fields..." }
    }
  ]
}
```

## Grounding Validation

Before any INSERT, every `source_excerpt` from the LLM output must substring-match the original fetched text from the URL it cites. Substring match is case-insensitive and whitespace-normalised (collapsing runs of whitespace to single spaces).

### Validation rules

- **Source URL must exist in fetched_pages.** If the LLM cites a URL that wasn't fetched, the whole character or signal is rejected.
- **Character source_excerpt must substring-match the source text.** If the excerpt doesn't appear in the source, the character is rejected (and all its attributes go with it).
- **Each attribute's source_excerpt must substring-match independently.** A character can survive with some attributes rejected — the orchestrator drops the bad attributes and keeps the character if its primary excerpt validates and at least one attribute survives.
- **Implied confidence doesn't relax substring matching.** The architectural rule is that the excerpt must exist in source, regardless of inference type. `implied` means the inference between excerpt and claim is one short step; it doesn't mean the excerpt itself is loose.
- **Signals validate the same way** — source_url must exist, source_excerpt must substring-match.

### Validation output

The validator returns `{ valid: [...], invalid: [...] }`. Invalid entries carry a `reason`:

- `source_url_not_fetched`
- `excerpt_not_in_source`
- `attribute_excerpt_not_in_source`

Rejected items log for prompt iteration. Patterns in rejection signal where the prompt needs tightening.

## Stage 1 Orchestrator

Single entry point per listing:

1. Read listing (`website_url`, `name`, `vertical`)
2. Fetch first-party pages
3. If zero pages fetched, log and return
4. Call LLM with structured extraction prompt + fetched content
5. Parse JSON response
6. Run substring validation
7. Log invalid extractions with reasons
8. INSERT validated rows in FK order: `pitch_sources` → `pitch_characters` → `pitch_character_attributes` → `pitch_signals`
9. Return summary: `{ listing_id, pages_fetched, characters_extracted, characters_validated, signals_extracted, signals_validated, sources_inserted }`

All DB access uses the Supabase JS client with the service-role key. Do not route through the migration runner.

### CLI

`scripts/discovery-stage1.mjs` with `--dry-run` flag mirroring the Phase 2 CLI:

```
node scripts/discovery-stage1.mjs --dry-run --listing-slug=<slug>    # no DB writes
node scripts/discovery-stage1.mjs --listing-slug=<slug>              # writes to DB
```

Dry-run does everything except INSERTs. Essential for calibration.

## Calibration

Same discipline as Phase 2's calibration ceremony. Three-tier scaling:

1. **n=5 — Gate 1 listings (Black Gate, Timboon, Tram Museum, Apostle Whey, Alkina).** Read every claim against source. Verify substring matches by eye. Hard threshold: zero invented characters or attributes. Zero, not low rate.
2. **n=20 — stratified across all 9 verticals plus portal.** Confirm extraction quality holds outside the SBA-heavy Gate 1 set.
3. **n=50 — broader sample.** Watch for systematic failure modes by vertical (Craft sites often have less structured about-pages than SBA, for example).

Each tier produces a calibration report mirroring Gate 1's format. Each tier gates the next.

## What Stage 1 Does Not Do

For clarity:

- **Doesn't compose pitches.** That's Phase 2's job.
- **Doesn't fetch press, awards, or external content.** Stages 2–3.
- **Doesn't run scheduled background sweeps.** First builds are on-demand CLI invocations.
- **Doesn't replace Candidate Review.** Different workflow; Candidate Review handles listing curation, Stage 1 populates research material.
- **Doesn't infer beyond what the source supports.** The implied confidence band is bounded by one-step inference; aesthetic or speculative interpretation is out.
- **Doesn't generate quotes.** Quotes only appear if literally in source with named attribution.

## Implementation Sequence

1. Foundation (today):
   - Migration 132 schema applied via SQL editor ✓
   - Migration 132 file reconstructed and committed
   - `_MANUAL_RUNS.md` updated with 132 entry
   - `html-to-text` package installed
   - This design doc committed
2. Build (next session):
   - `lib/pitch/stage1/fetch.mjs` + tests
   - `lib/pitch/stage1/prompt.mjs` + tests
   - `lib/pitch/stage1/validate.mjs` + tests
   - `lib/pitch/stage1/orchestrate.mjs`
   - `scripts/discovery-stage1.mjs`
3. Calibration (after build):
   - Dry-run against five Gate 1 listings
   - Report mirroring Gate 1 format
   - Editorial review claim-by-claim
   - Gate decision (pass = proceed to n=20; fail = prompt revision)

## Open Questions

Decisions explicitly not made in this doc, parked for build time:

- **OQ1: Refresh cadence.** Stage 1 currently runs on-demand. Whether to re-fetch a listing's sources every N days (and what N is) is a Stage 6/Phase 4 question.
- **OQ2: Multi-language sites.** Stage 1 doesn't handle non-English content. Few Atlas listings have non-English websites; revisit if a real case appears.
- **OQ3: PDF/document sources.** Some venues publish PDFs of their story. Out of scope for Stage 1 — text-pages only.
- **OQ4: Source deduplication across fetch cycles.** If we re-fetch tomorrow, do we update existing source rows or insert new ones with the new `fetched_at`? Insertion is simpler; updates lose historical text. Parked.
- **OQ5: Character deduplication.** If "Tom McHugh" appears on /about and /team, do we have one character with two source rows or two character rows? Likely one; merge logic deferred to Stage 5 (cross-reference detection).
