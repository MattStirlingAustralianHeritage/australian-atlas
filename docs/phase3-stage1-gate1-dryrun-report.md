# Phase 3 Stage 1 — Gate 1 Dry-Run Report

**Date**: 2026-05-22 (second calibration run after billing top-up)
**Prompt version**: `phase3-stage1-v2-2026-05-22`
**Model**: `claude-opus-4-7` (effort: high, no thinking)
**Mode**: `--dry-run` (no DB writes)
**Spec**: `docs/pitch-system-phase3-design.md` §Calibration → Tier 1
**Raw trace**: `logs/phase3-stage1-gate1-dryrun-2.log`
**Earlier run report**: `docs/phase3-stage1-calibration-report.md`

---

## Executive summary

| Metric | Value |
|---|---|
| Listings | 5 |
| Outcomes | 5 / 5 `ok` |
| Pages fetched | 13 (of 14 × 5 = 70 attempted) |
| Characters extracted → validated | 4 → 4 (100%) |
| Attributes extracted → validated | 10 → 9 (**90%** — one rejected) |
| Signals extracted → validated | 28 → 28 (100%) |
| Invented characters | **0** |
| Invented attributes | **1 — caught and dropped by validator** |
| Invented signals | **0** |
| Elapsed | 203.2s |

**Architectural anti-hallucination guarantee fired for real this run.** The model produced one Julian Benson `[technique]` attribute whose `source_excerpt` was not a verbatim substring of any fetched page. The validator rejected it. That rejection is the system doing its job — not a test artifact.

**Recommendation**: **PASS Gate 1** with two new findings folded into the Tier 2 readiness decision. The validator works under live conditions; the model is non-deterministic in classification choices between runs.

---

## Comparison to the earlier run

Both runs used the same prompt (`phase3-stage1-v2-2026-05-22`) and same 5 listings. Material variance:

| Listing | Run 1 (chars / attrs / signals) | Run 2 (chars / attrs / signals) | Delta |
|---|---|---|---|
| Black Gate | 1 / 1 / 5 | 1 / 1 / 5 | Signal classification shuffled (awards collapsed to one row this time; gained a Chefin `press_coverage` signal) |
| Timboon | 0 / 0 / 5 | 0 / 0 / 5 | Stable |
| Tram Museum | 0 / 0 / 3 | 0 / 0 / 3 | "Melbourne's cable tramways exhibition" reclassified from `methodology_novelty` → `press_coverage` |
| Apostle Whey | 3 / 8 / 9 | 3 / 8-of-9 / 10 | **One attribute rejected** by the validator; one extra signal extracted; signal classifications mostly stable |
| Alkina | 2 / 4 / 5 | **0 / 0 / 5** | **Murcutt + Lewin no longer extracted as characters** — captured as a single `methodology_novelty` signal carrying both names in `signal_data` |

Variance is normal for LLMs at temperature, and both runs satisfy the architectural guarantee (every persisted excerpt traces). What this comparison surfaces:

- The validator is genuinely on the critical path — Run 2 produced a real fabrication that didn't appear in Run 1
- Edge-case classification (E3 from the first report) is **not stable across runs**, meaning prompt-tightening isn't optional if we want reproducible Stage 1 extractions

---

## Finding F1: validator rejected an invented attribute (Apostle Whey)

**Severity**: This is the validator's purpose. It did exactly what it was designed to do.

The Apostle Whey extraction produced 9 attributes on Julian Benson; one was rejected:

```
✗ attribute (parent: Julian Benson) — attribute_excerpt_not_in_source
    type:     technique
    excerpt:  "It's all part of Julian's vision to harness the power of video to
               show people the reality of farming, which we publish …"
```

This excerpt does not appear in the Apostle Whey website text we fetched (homepage, /about, /blog, plus two more). The model fabricated a quote-like passage about "Julian's vision to harness the power of video" — none of those words are on the site.

A speculative read on what happened: the /blog page does contain video content and references to publishing video material, and the /about page has Julian's first-person material about farming philosophy. The model appears to have **interpolated between two real source elements** — combining "Julian's vision" (about farming) with "video to show people" (about the venue's video publishing) — and quoted the synthetic combination as if it were a verbatim source statement.

**What worked**:

- The forced tool schema received a string that could be parsed
- The other 8 Julian Benson attributes traced cleanly
- The validator caught the one bad excerpt by substring-checking and dropped it
- The orchestrator returned `ok` (the character survives with its other attributes intact, per the validator's design)
- The CLI surfaced the rejection in the trace with the rejected excerpt visible

**What's interesting editorially**: this is the failure mode the anti-hallucination guarantee was designed for. The model didn't return "x" or "placeholder" — it returned plausible-looking material that semantically fits the venue but cannot be sourced. If we were writing to the DB, this row would have been silently dropped. The audit trail (in the rejected list) is the editorial record that "the model tried this and we caught it".

**Implication**: do not weaken the substring rule. Tier 2's stratified n=20 will probably surface more cases like this; the validator must remain the floor.

---

## Finding F2: classification variance between runs (Alkina, Tram Museum, Black Gate)

**Severity**: This is the prompt's job to constrain. Tier 2 readiness depends on it.

The same prompt against the same listings produced materially different classifications between Run 1 and Run 2:

**Alkina Lodge — Murcutt + Lewin as characters vs. as signal**:

- Run 1: 2 characters (Glenn Murcutt, Wendy Lewin) with `[background]` + `[philosophy]` attributes each
- Run 2: 0 characters; one `methodology_novelty` signal with `signal_data: {"architects": ["Glenn Murcutt", "Wendy Lewin"], "design_principle": "touch the earth lightly"}`

Both classifications are editorially defensible, and the underlying excerpt is identical. The first report flagged this as **E3 (architects-as-characters)** pending Matt's sign-off. Run 2 shows the model itself cannot pick a side. This means a Tier 2 stratified extraction will produce inconsistent character rosters across listings — same kind of edge case, different classification per run.

**Tram Museum — exhibition opening reclassified**:

- Run 1: `methodology_novelty` with excerpt "Melbourne's cable tramways: new exhibition opens 9 May"
- Run 2: `press_coverage` for the same excerpt

Neither is wrong, but `press_coverage` is closer to the spec's intent (`methodology_novelty` is for "how this venue works differently"; `press_coverage` is for external attention — and a new exhibition opening sits somewhere between both).

**Black Gate — awards consolidation**:

- Run 1: Awards extracted as two separate `award` signals (one Best Whisky, one Champion Whisky)
- Run 2: Awards consolidated into one `award` signal with an `awards` array in `signal_data`

The DB column is jsonb, so both shapes are valid storage; the editorial query layer would have to handle both. This is a real ambiguity in the prompt — "Each signal must trace to a source_excerpt" can be read as "one signal per claim" or "one signal per excerpt block".

**Implication**: prompt v2 is good enough for the architectural guarantee (substring grounding) but too loose for stable classification. Tier 2 will produce noise unless we tighten:

1. **E3 → spec decision**: define whether architects/designers of the venue's signature physical product are characters or signals. Both runs trace; the question is governance, not fabrication.
2. **`methodology_novelty` vs. `press_coverage` boundary**: clarify when a new programme/exhibition is one vs. the other.
3. **One-signal-per-claim vs. per-excerpt-block**: enforce one of the two patterns in the prompt's tool description.

---

## Per-listing results (Run 2)

### 1. Black Gate Distillery (sba) — 3 pages, 1 / 1 / 5

- Brian (distiller) again, same source, same single `[technique]` attribute (slightly different paraphrase wording: "Brian distils and matures peated whisky in Mendooran")
- 5 signals: 1 `award` (with `awards` array carrying both trophies), 1 `cross_reference` (Fleurieu Distillery, now with `location: "South Australia"`), 1 `methodology_novelty` (direct-fired pot still), 1 `award` for a truncated "Winning the Consistency of..." excerpt, 1 `press_coverage` (Chefin private chef platform)

**Editorial note**: the "Winning the Consistency of..." signal is genuinely truncated in the source text — the model included it anyway. This is a different failure mode from F1 (the excerpt is in the source, but it's an incomplete sentence; the model still claimed it as an award). The validator passed it (the substring is in the source). Whether truncated sentences should count is a future prompt tightening question, not a Gate 1 blocker.

### 2. Timboon Distillery (sba) — 1 page, 0 / 0 / 5

- Stable: 2 `methodology_novelty`, 1 `unusual_location`, 1 `first_in_category`, 1 `cross_reference` (the venue-self-heritage classification — same E1 finding as run 1)

### 3. Melbourne Tram Museum (museums) — 1 page, 0 / 0 / 3

- 1 `unusual_location`, 1 `methodology_novelty` ("most authentic tramway museum"), 1 `press_coverage` (cable tramways exhibition)
- E2 from the first report has shifted — see F2 above

### 4. Apostle Whey Cheese (sba) — 5 pages, 3 / 8-of-9 / 10

- Julian (5 attrs), Dianne (2 attrs), Luke (1 attr) — same three characters as run 1; attribute counts slightly redistributed
- **One attribute rejected** (see F1 above) — the validator's first real catch on Gate 1 listings
- 10 signals (vs. 9 in run 1) — added one `methodology_novelty` about herd-breeding for butterfat, dropped the cross_reference to Cheese Therapy distribution (the model didn't extract it this run)
- Still the richest, cleanest extraction in the set even with the rejection

### 5. Alkina Lodge (sba — lodge) — 3 pages, 0 / 0 / 5

- **Zero characters this run** (vs. 2 in run 1)
- All five signals stable: `methodology_novelty` for architecture (carrying Murcutt + Lewin in `signal_data`), `methodology_novelty` for solar/wind, `award`, `press_coverage`, `unusual_location`
- The variance is described under F2 above

---

## Content-thinness observations

- **2 of 5 listings produced zero characters this run** (Timboon, Tram Museum, Alkina — 3 if we count the run-2 Alkina behaviour). All three are venues where the first-party site is light on individual people. Timboon's site is mostly product copy; Tram Museum is a volunteer-run museum without operator profiles; Alkina is luxury accommodation that markets architecture-as-identity rather than people-as-identity.
- This is correct behaviour, not a content gap. The prompt's "empty arrays are valid output" rule held — none of the three hallucinated a character to fill the void.
- Editorially, **signal-only extractions are still useful** — Tram Museum's 3 signals cover heritage-listing, programme openings, and Melbourne tramway history. A Phase 2 pitch could anchor on any of those.
- **Apostle Whey is the calibration ceiling**: rich operator narrative + named family + specific awards. Few listings in the wider 9-vertical set will produce this much editorially-usable material on first pass.
- **Black Gate is the thin-but-grounded floor**: a single first-name distiller + product-marketing signals. Defensible but every claim is tightly scoped.

---

## Stage 2 surprises (what we'd hit next without this calibration)

Things Tier 2 will likely uncover that Gate 1 (n=5) hasn't yet:

1. **More fabricated excerpts like F1**. The validator caught one in five listings — Tier 2 (n=20) should expect three to five rejected items in aggregate. If the rate climbs above ~10% the prompt needs tightening; under that, it's acceptable noise.
2. **Sites with no /about page**. The Gate 1 listings all had structured About-style content (sometimes only on the homepage). Many craft / market listings won't have any of `/about`, `/our-story`, `/team`, `/founders` — the page chain will return 1-2 pages of pure shop content. Expect higher zero-character rates than Gate 1's 2-of-5.
3. **Non-text content carriers**. Some venues put their story in PDFs, infographics, or video — out of scope per the spec (OQ3). Tier 2 will probably surface a venue whose story is editorially substantial but trapped in non-text. Note these for Phase 4.
4. **Cross-vertical signal duplication**. A venue listed in multiple verticals (e.g. a brewery in `sba` and `craft`) could be Stage-1'd twice, producing duplicate sources. Stage 5 (cluster detection) is the spec'd solution; Tier 2 should confirm the duplication is real before we build the dedup.
5. **Squarespace / Wix / Showit boilerplate** appearing as fetched text. The html-to-text strip removes nav/footer but doesn't filter copyright tags, "site by..." attributions, or platform-stub text. Tier 2 may surface a venue where the extracted material includes platform garbage; if so, broaden the strip rules in `lib/pitch/stage1/fetch.mjs`.

---

## Gate decision

**PASS Gate 1.** Proceed to Tier 2 (n=20 stratified across the 9 verticals + portal) per spec.

Tier 2 entry conditions, ordered:

1. **F1 (validator catches fabrication)** — no action needed; the validator behaved exactly as designed. Just monitor the rejection rate in Tier 2 and revisit if it climbs over 10%.
2. **F2 (classification variance)** — Matt's call on whether to:
   - (a) Accept variance as the cost of doing business with an LLM at temperature, and rely on the human review pass in front of the editor to normalise classifications; or
   - (b) Tighten prompt v2 → v3 to make character vs. signal and signal-type-classification more deterministic. Recommend (b) before Tier 2 — even a small prompt note about the three boundaries above should help. Bump version on commit.
3. **E1 / E2 carried over from the first report** — re-examine after Tier 2 to see if the venue-self-heritage and exhibition-classification quibbles recur across more verticals or are 5-listing noise.

The architectural anti-hallucination guarantee held under fire. The validator caught a real fabrication. The extraction layer is fundamentally sound. The remaining work is prompt-tuning for classification consistency — not architecture changes.
