# Phase 3 Stage 1 — Gate 1 Calibration Report

**Date**: 2026-05-22
**Prompt version**: `phase3-stage1-v2-2026-05-22`
**Model**: `claude-opus-4-7` (effort: high, no thinking)
**Mode**: `--dry-run` (no DB writes)
**Spec**: `docs/pitch-system-phase3-design.md` §Calibration → Tier 1
**Raw trace**: `logs/phase3-stage1-gate1-dryrun.log`

---

## Executive summary

| Metric | Value |
|---|---|
| Listings | 5 |
| Outcomes | 5 / 5 `ok` |
| Pages fetched | 13 (of 14 × 5 = 70 attempted) |
| Characters extracted → validated | 6 → 6 (100%) |
| Attributes extracted → validated | 13 → 13 (100%) |
| Signals extracted → validated | 27 → 27 (100%) |
| Invented characters | **0** |
| Invented attributes | **0** |
| Invented signals | **0** |
| Elapsed | 213.1s |
| API cost | Single-digit dollars (sub-$5 estimated) |

**Architectural anti-hallucination guarantee held end-to-end.** Every extracted excerpt was a verbatim substring of the fetched source text. The substring validator did not need to reject a single item.

**Recommendation**: **PASS Gate 1**, proceed to Tier 2 (n=20 stratified across all 9 verticals). Two editorial findings for Matt's sign-off below — neither is a grounding failure; both are calibration questions about the model's classification choices.

---

## Methodology

Per `docs/pitch-system-phase3-design.md` §Calibration:

> **n=5 — Gate 1 listings (Black Gate, Timboon, Tram Museum, Apostle Whey, Alkina).** Read every claim against source. Verify substring matches by eye. Hard threshold: zero invented characters or attributes. Zero, not low rate.

The substring validator (`lib/pitch/stage1/validate.mjs`) does the programmatic substring check on every excerpt. The editorial review below confirms the *interpretation* of each excerpt: that the structured `attribute_text` / `signal_data` faithfully restates what the source says, with no semantic fabrication on top of verbatim text.

The 5 listings cover three verticals (sba, museums, lodges) and a range of website maturity (rich content-marketing sites vs. minimal Squarespace-style brochures).

---

## Per-listing results

### 1. Black Gate Distillery, Mendooran (sba)

- 3 / 14 pages fetched (homepage, /blog, /contact)
- **1 character** validated: Brian (distiller)
- **1 attribute**: `[technique]` "Brian distills and matures whisky in Mendooran using peated malt from Inverness…"
- **5 signals**: 3 `award`, 1 `cross_reference` (Fleurieu Distillery collab on "Country to Coast #6"), 1 `methodology_novelty` (direct-fired pot still)

**Editorial assessment**: Clean. The character is thin (first-name-only — the source genuinely doesn't give a surname) but not invented. Awards are specific (named bodies, named trophies). The cross-reference to Fleurieu Distillery is exactly the kind of cross-vertical signal the discovery layer is built for.

**Minor**: One generic `award` signal extracted from /contact with `signal_data: {}` — the excerpt "home to our award-winning Australian single malt whisky and dark rum" is a venue claim without specifics; this duplicates the more substantive awards from the blog. Not a fabrication, but a candidate for de-duplication in a later stage. **Action**: none for Gate 1; flag for Stage 5 cluster work.

---

### 2. Timboon Distillery (sba)

- 1 / 14 pages fetched (homepage only)
- **0 characters** (no named people on the page that was reachable)
- **5 signals**: 2 `methodology_novelty`, 1 `unusual_location` (housed in a restored historic railway shed), 1 `first_in_category` ("largest collection of true Australian Craft Spirits"), 1 `cross_reference` (Timboon's pre-licensure bush-still heritage)

**Editorial assessment**: Acceptable. The first earlier calibration run got 0 pages (the site 503'd); the second run got the homepage through. Fetcher resilience to flaky hosts confirmed.

**Editorial finding (E1)**: The `cross_reference` for "Timboon's whisky story began long before licences and distillery doors, when hidden bush stills supplied the district…" describes the *venue's own heritage narrative*, not a reference to another venue. The spec's `cross_reference` signal type is meant for "venue X mentioned alongside venue Y" cases. Same pattern appears at Melbourne Tram Museum (E1.b below). The substring is verbatim and the editorial value of the signal is real; the question is whether `cross_reference` is the right classification or whether the spec needs a new signal type for venue-self-heritage. **Action**: flag for Matt; no Gate 1 blocker.

---

### 3. Melbourne Tram Museum (museums)

- 1 / 14 pages fetched (homepage only)
- **0 characters**
- **3 signals**: 1 `unusual_location` (heritage-listed Hawthorn Tram Depot), 1 `methodology_novelty` (new cable-tramways exhibition opening 9 May), 1 `cross_reference` (Melbourne tramway history since 1885)

**Editorial finding (E2)**: The `methodology_novelty` signal for "Melbourne's cable tramways: new exhibition opens 9 May" is editorially more of a `recently_opened` signal (a new exhibition opening). The model defaulted to `methodology_novelty` likely because the spec doesn't have a "new exhibition opens" signal type and `recently_opened` is described as venue-level openings. **Action**: flag for Matt; either reinterpret `recently_opened` to include programme-level openings, or add a new signal type, or accept the model's borderline classification. No Gate 1 blocker.

**E1.b**: same pattern as Timboon — the `cross_reference` for "Melbourne has been one of the world's great tramway cities since 1885" is venue-self-heritage, not a cross-venue reference.

---

### 4. Apostle Whey Cheese (sba)

- 5 / 14 pages fetched (homepage, /about, /blog, plus two more)
- **3 characters**: Julian Benson (founder), Dianne Benson (co-founder), Luke Benson (farm manager)
- **8 attributes** distributed: Julian gets 6 (biographical, background, quote, philosophy×2, technique), Dianne gets 1 (biographical), Luke gets 1 (family_history)
- **9 signals**: 4 named `award` rows with bodies + years, 1 `founder_pivot` (diversified into cheese after 30 years dairy), 2 `methodology_novelty` (single-origin dairy farm, regenerative farming), 1 `unusual_location` (15 minutes from the Twelve Apostles), 1 `cross_reference` (Cheese Therapy national distribution)

**Editorial assessment**: The richest, cleanest extraction in the set. This is exactly the editorial material the discovery layer is built to surface — every character has multiple atomic attributes, every attribute traces, signals are specific.

The "one quote per character maximum" rule held: Julian gets one `quote` attribute (the milk-quality statement). The model correctly did not classify other paraphrased beliefs as quotes; they became `philosophy` and `technique` attributes instead — exactly the discipline the prompt's "Tom believes in single-herd cheese ≠ quote" example was teaching.

The 4 named awards (Corangamite Shire 2025, Best White Mould 2019, Nantwich gold, DIAA silver) are exactly the structured editorial material the network was thin on before Phase 3 existed.

**Action**: none. Hold this up as the calibration baseline.

---

### 5. Alkina Lodge (sba — luxury accommodation)

- 3 / 14 pages fetched (homepage, /blog, /contact)
- **2 characters**: Glenn Murcutt (Architect), Wendy Lewin (Architect)
- **4 attributes**: each character gets `[background]` (described as renowned Australian architect who co-designed the lodges) + `[philosophy]` ("touch the earth lightly" design principle)
- **5 signals**: 1 `methodology_novelty` (solar + wind power for all energy), 1 `unusual_location` (100 acres pristine native bush on GOR), 1 `press_coverage` (Australia.com, nine.com.au mentions), 1 `award` (Australian Tourism Award), 1 `methodology_novelty` (three Murcutt-designed residences)

**Editorial finding (E3) — the substantive one**: Glenn Murcutt and Wendy Lewin are extracted as **characters connected to the venue's identity**. The prompt rule is:

> A character must be presented as connected to the venue's identity: founders, makers, head chefs, owners, named team members. Customers, suppliers mentioned in passing, or family members not part of the operation do not qualify.

Murcutt + Lewin designed the lodges 20 years ago; they don't operate or own Alkina. But the venue's *entire marketing identity* is built around the architecture — "Designed by internationally renowned Australian architects Glenn Murcutt and Wendy Lewin" leads the homepage, and the buildings are literally the product. Architects-of-the-product arguably qualify as "makers" in a broader reading of the rule.

**The editorial question**: are architects who designed a venue's signature physical product "characters" in the Stage 1 sense, or are they external collaborators that should be captured as `cross_reference` signals instead?

The substring grounding is impeccable — both characters cite the same verbatim excerpt and their attributes are atomic claims drawn from it. The question is purely classification.

**Action**: requires Matt's editorial sign-off. Two reasonable directions:

1. **Accept architects-as-makers**: extend the prompt's "makers" definition to include named designers/architects of the venue's signature physical product. Document the rule explicitly.
2. **Reclassify as cross_reference**: tighten the prompt to "characters must be operationally connected" (currently/recently). Murcutt + Lewin become a single `cross_reference` signal with both names in `signal_data`.

Recommend option 1 — it matches editorial intent (a story about Alkina that ignored Murcutt would be incomplete) and the existing extraction is editorially correct.

---

## Findings consolidated

| ID | Severity | Issue | Action |
|---|---|---|---|
| **E1** | Calibration | `cross_reference` signal used for venue-self-heritage at Timboon + Tram Museum | Decide: tighten the rule, or add `heritage_narrative` signal type, or accept |
| **E2** | Calibration | `methodology_novelty` used for a new exhibition opening (Tram Museum) — arguably `recently_opened` | Decide: broaden `recently_opened` to cover programme openings, or accept |
| **E3** | **Substantive** | Architects (Murcutt + Lewin) classified as characters at Alkina Lodge | **Matt's call** — see "the editorial question" above |
| **(Minor)** | Cleanup | Generic redundant `award` signal at Black Gate /contact | Defer to Stage 5 cluster/dedup work |

**No findings on the architectural anti-hallucination guarantee.** Every excerpt traces. The validator's 100% pass rate is not a "no test could fail" — it's that the model behaved.

---

## Other observations

- **`signal_data` JSON-string workaround works.** The schema layer's strict-mode rejection of open-shape objects (initial v1 attempt) forced a switch to JSON-encoded strings; the model produced valid JSON in 27/27 cases without retry. Prompt v2 documented the encoding requirement.
- **Fetch resilience**: 4 of 5 sites worked first time. Timboon's host was flaky across runs but the 14-path chain absorbed the 503s and still produced a usable page. Pipeline handled it cleanly via the `no_pages_fetched → ok` recovery.
- **Page-chain hit rate**: 13 pages from 70 attempted (~19%). Typical for the spec'd path list — most venues don't have `/founders` or `/makers`, but the chain costs nothing per missing path (404s are silent) and the floor is high enough that one rich /about page anchors the whole extraction.
- **Empty-extraction cases (Timboon, Tram Museum) returned 0 characters cleanly** — neither hallucinated to fill the void, both produced legitimate signal-only outputs. The "empty arrays are valid output" rule held.

---

## Gate decision

**PASS Gate 1.** Proceed to Tier 2 (n=20 stratified across the 9 verticals + portal) per spec.

Conditions:

1. Matt's sign-off on **E3** (architect-as-character) before Tier 2. Either confirms the current behaviour is desired or motivates a prompt v3 patch.
2. **E1** and **E2** are nice-to-fix but not Tier-2-blocking. Re-examine after Tier 2 to see if the classification quibbles recur across more verticals or are 5-listing noise.

If E3 motivates a prompt revision, bump to `phase3-stage1-v3-...` and re-run this same 5-listing set to confirm the v3 prompt produces the desired classification, before launching into Tier 2.

---

## Appendix: per-page text caveat

This calibration validated the *extraction* layer against the *fetched* text. It did **not** independently re-fetch each venue's site to confirm the html-to-text strip matches what a human browser shows. That check belongs in a separate fetch-fidelity audit if and when an editorial review surfaces a "but the website said X" mismatch. For Gate 1 the assumption is that html-to-text v10 with the strip rules in `lib/pitch/stage1/fetch.mjs` is faithful, which the calibration commits to as a working hypothesis.
