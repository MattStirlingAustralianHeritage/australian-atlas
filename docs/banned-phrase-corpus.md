# Banned Phrase Corpus — Hallucinated Description Detection

**Purpose:** Score active portal listing descriptions for hallucination risk. Designed from empirical analysis of 94 confirmed-hallucinated listings archived across Fine Grounds (28), Corner (42), and Found (24) during the May 2026 SSOT audit.

**Target cohort:** 5,722 active listings created on 2026-04-01 (the seed batch). Listings created after that date came through the Candidate Review pipeline with human oversight and are lower-risk.

**Scope:** Description text only. This corpus does not re-check URL validity (already handled by Fix 3 and the Corner/Found cleanup).

---

## Tier 1 — Strong Signals

Single hit warrants flagging. These phrases appear exclusively or near-exclusively in hallucinated content and are absent from honest Atlas writing.

| # | Phrase | Archived (of 94) | Active hits | Non-April hits | Rationale |
|---|--------|-------------------|-------------|----------------|-----------|
| 1.1 | `particularly known for` | 24 (25.5%) | 56 | 0 | Signature hallucination marker. Never appears in reviewed or operator-verified content. |
| 1.2 | `must-visit` | 9 (9.6%) | 5 | 0 | Promotional CTA. Antithesis of Monocle-adjacent editorial voice. |
| 1.3 | `worth a visit` | 15 (16.0%) | 5 | 0 | Same CTA pattern. Zero honest uses in the entire corpus. |
| 1.4 | `delightful destination` | 5 (5.3%) | 6 | 0 | Promotional adjective + generic noun. Flagged in the audit doc as exemplary hallucination phrase. |
| 1.5 | `a wonderful destination` | 5 (5.3%) | 3 | 0 | Variant of 1.4. |
| 1.6 | `destination for families` | 5 (5.3%) | 6 | 0 | Template closer for toy-shop vertical. |
| 1.7 | `passionate booksellers` | 9 (9.6%) | 3 | 0 | Verbatim from the bookshop template sentence (9 archived copies). |
| 1.8 | `personal recommendations` | 9 (9.6%) | 3 | 0 | Part of same bookshop template. |
| 1.9 | `stationery lovers` | 8 (8.5%) | 5 | 0 | Verbatim from the stationery-shop template (8 archived copies). |
| 1.10 | `anyone looking to discover` | 5 (5.3%) | 3 | 0 | Homewares template closer. |
| 1.11 | `artisan craftsmanship` | 7 (7.4%) | 2 | 0 | Jewellery-shop template. Sounds like a gift-shop sign. |
| 1.12 | `quality pressings` | 8 (8.5%) | 3 | 0 | Record-store template. No real record shop calls them "quality pressings." |

### Template Sentences (Tier 1-T)

These are complete sentences copy-pasted verbatim across multiple hallucinated descriptions. Any active listing containing one of these is flagged HIGH automatically, regardless of other signals.

| # | Template sentence | Archived copies | Active copies | Category |
|---|-------------------|-----------------|---------------|----------|
| T1 | `a must-visit for book lovers seeking thoughtfully curated reads and personal recommendations from passionate booksellers` | 9 | 3 | bookshops |
| T2 | `a haven for stationery lovers, letter writers, and anyone who appreciates the art of beautiful paper goods and writing instruments` | 8 | 5 | stationery |
| T3 | `worth a visit for vinyl enthusiasts and music lovers hunting for rare finds and quality pressings` | 8 | 3 | records |
| T4 | `expect racks of carefully curated garments spanning decades, from mid-century dresses to retro denim and statement accessories` | 8 | 1 | vintage clothing |
| T5 | `a delightful destination for families and gift buyers looking for quality toys and games` | 5 | 6 | toy shops |
| T6 | `a wonderful destination for anyone looking to discover unique homewares, gifts, and beautifully crafted pieces for the home` | 5 | 3 | homewares |
| T7 | `worth a visit for anyone seeking distinctive, often locally made jewellery pieces and artisan craftsmanship` | 7 | 2 | jewellery |
| T8 | `visitors can browse through cabinets of porcelain, silverware, and jewellery alongside larger pieces of period furniture and artwork` | 6 | 4 | antiques |
| T9 | `browse showroom floors filled with restored sideboards, dining settings, armchairs, and lighting from the 1950s through the 1980s` | 6 | 4 | mid-century furniture |

---

## Tier 2 — Weak Signals

Common enough in real or reviewed-AI writing that only accumulation is informative. Each hit adds weight but is not diagnostic alone.

Two weight bands within Tier 2:
- **Standard (weight 3)** — phrases with ≤20% leak rate. Meaningful when they accumulate with other signals.
- **Tiebreaker (weight 1)** — phrases with >20% leak rate. Only matter as the last increment that pushes a borderline case over a threshold.

The 20% leak-rate ceiling was set by reasoning (not data) when resolving Open Question 1. Part 3 calibration enforces against the 131 post-April Candidate Review listings; if any of those score MEDIUM+ at weight 3 for any phrase in this table, the phrase moves to weight 1.

| # | Phrase | Archived (of 94) | Active hits | Non-April hits | Leak rate | Weight | Rationale |
|---|--------|-------------------|-------------|----------------|-----------|--------|-----------|
| 2.1 | `known for` | 78 (83.0%) | 172 | 6 | 3.5% | **3** | Extremely common in hallucinated content but also used (sparingly) in reviewed AI descriptions. |
| 2.2 | `specialising in` | 31 (33.0%) | 37 | 4 | 10.8% | **3** | Found-vertical template opener. Legitimate in some real descriptions (e.g. specialist retailers). |
| 2.3 | `a haven for` | 8 (8.5%) | 9 | 1 | 11.1% | **3** | Near-zero honest use but one confirmed non-April hit. |
| 2.4 | `destination for anyone` | 11 (11.7%) | 17 | 2 | 11.8% | **3** | Template closer variant. Small leak into reviewed content. |
| 2.5 | `for anyone` | 20 (21.3%) | 80 | 7 | 8.8% | **3** | Very broad. Useful only in combination. |
| 2.6 | `book lovers` | 11 (11.7%) | 8 | 1 | 12.5% | **3** | Bookshop template. One legitimate non-April use. |
| 2.7 | `anyone seeking` | 12 (12.8%) | 19 | 4 | 21.1% | **1** | Common in template closers but also appears in legitimate descriptions. Above leak ceiling — tiebreaker only. |
| 2.8 | `rare finds` | 9 (9.6%) | 4 | 1 | 25.0% | **1** | Record-shop template. Legitimate uses elsewhere. Above leak ceiling — tiebreaker only. |
| 2.9 | `thoughtfully curated` | 9 (9.6%) | 29 | 8 | 27.6% | **1** | Used by both the seed generator and the Candidate Review AI. Above leak ceiling — tiebreaker only. |
| 2.10 | `carefully curated` | — | 39 | 9 | 23.1% | **1** | Same as 2.9. Reviewed AI content uses this phrase legitimately. Above leak ceiling — tiebreaker only. |

### Removed from Tier 2

- `mid-century` — **dropped entirely**. 60% leak rate. Real mid-century furniture shops legitimately use the term as a primary descriptor; flagging on it would catch them by definition. Structural patterns 3.1 (no anchors) and 3.3 (CTA ending) still catch hallucinated mid-century furniture descriptions without this phrase.
- `located in` (bare phrase) — **dropped entirely**. 163 active hits with only 9 non-April (5.5% leak), but the volume is too high to be a useful Tier 2 signal. The diagnostic pattern is the promotional suffix structure, which has been **promoted to Tier 3 (pattern 3.8)** with a dedicated regex.

---

## Tier 3 — Structural Patterns

Sentence-level and description-level patterns that are harder to match with simple string search but carry strong diagnostic weight.

| # | Pattern | Archived (of 94) | Detection method | Rationale |
|---|---------|-------------------|------------------|-----------|
| 3.1 | **No specific anchors** — no founding years, named founders, specific dates, or concrete numbers | 94 (100%) | Regex: absence of `\b(19\|20)\d{2}\b` AND absence of named-person patterns | The single strongest structural signal. Every hallucinated description lacks verifiable specifics. Real Atlas descriptions anchor in named people, dates, and numbers. |
| 3.2 | **"Known for [bare comma list]"** — inventory-dump structure: `Known for X, Y, Z.` with no article or context | 67 (71.3%) | Regex: `Known for [A-Z][^.]{5,60}[,]` | The seed generator dumped category keywords into a comma list. Real descriptions integrate specialties into prose. |
| 3.3 | **CTA ending** — description ends with an invitation/recommendation | 34 (36.2%) | Regex: final sentence contains `visit\|destination\|stop by\|don't miss\|worth\|haven\|must` | Atlas editorial voice describes, it doesn't sell. A closing sales pitch is a hallucination flag. |
| 3.4 | **Long comma list** — sentence with 3+ commas (inventory dump) | 33 (35.1%) | Count commas per sentence | The seed generator used comma-separated lists to simulate specificity without any actual knowledge. |
| 3.5 | **"[Name] is a [category] in [place]" opener** | 23 (24.5%) | Regex: description starts with venue name + `is a\|is an\|is the` within first 80 chars | Template opener. Real Atlas descriptions don't start with "[X] is a [thing]" — they start with what makes the place distinctive. |
| 3.6 | **Doubled location adjectives** — same adjective used twice with different geographic scopes | 4 (4.3%) | Regex: repeated location adjective (`vibrant\|tropical\|bustling\|coastal\|charming\|picturesque`) | Low frequency but high specificity. "Tropical Cairns in tropical Far North Queensland" is unmistakable. |
| 3.7 | **Missing apostrophes in proper nouns** — capitalised place name ending in 's' in possessive context | 1 (1.1%) | Regex: `[A-Z][a-z]+s\s+[A-Z]` where context implies possession (e.g. "Fremantles West End") | Low frequency but near-certain when present. The seed generator dropped apostrophes from possessive place names. Confirmed in New Edition Bookshop case (Fremantle). |
| 3.8 | **Promotional "located in [Place], [Place]'s [adj] [noun]" suffix** — the seed generator's geographic-filler template | 14 (14.9%) | Regex: `/located in [A-Z][a-z]+(\s[A-Z][a-z]+)*, [A-Z][a-z]+(\s[A-Z][a-z]+)*'s \w+ \w+ (known\|famous\|renowned\|celebrated) for [^.]{20,}/i` | Promoted from Tier 2 row 2.9. Bare "located in" is too common (163 active hits, only 5.5% leak but too noisy at that volume). The diagnostic pattern is the full promotional structure: "Located in Adelaide, South Australia's elegant capital known for its festivals…". Verb list (`known\|famous\|renowned\|celebrated`) handles template variants. The optional `(\s[A-Z][a-z]+)*` group handles multi-word place names ("New South Wales", "Far North Queensland"). |

### FG-specific template (not scored separately — caught by 3.1 + 3.3)

The Fine Grounds hallucinations used a distinct three-sentence template:
1. "A [adjective] cafe [preposition] [place] serving [Invented Roaster Name] espresso..."
2. "[Interior description with specific-sounding fabricated details]"
3. "Their [invented signature dish/drink] is [superlative local claim]."

These are harder to detect mechanically because the details sound specific (e.g. "scallop pie with leatherwood honey glaze"). However, they invariably fail the 3.1 check (no specific anchors — no named founders, no real dates) and often fail 3.3 (CTA-adjacent endings). The invented roaster names (e.g. "Gosford Bean Project", "Cairns Reef Roasters") can be cross-referenced against real roaster databases but that's out of scope for string-based detection.

---

## Scoring Formula

### Weights

| Signal type | Points per hit |
|-------------|---------------|
| Template sentence (Tier 1-T) | **50** (auto-HIGH) |
| Tier 1 phrase | **10** |
| Tier 2 phrase (standard — entries 2.1–2.6) | **3** |
| Tier 2 phrase (tiebreaker — entries 2.7–2.10: `anyone seeking`, `rare finds`, `thoughtfully curated`, `carefully curated`) | **1** |
| Tier 3 structural pattern | **4** |

### Calculation

```
raw_score = (template_matches × 50) + (tier1_hits × 10) + (tier2_standard_hits × 3) + (tier2_tiebreaker_hits × 1) + (tier3_hits × 4)
```

No normalisation by description length. Rationale: short hallucinated descriptions (e.g. FG's 150-char stubs) should score lower naturally because they contain fewer phrases, and that's appropriate — they're less likely to be template-generated and more likely to be sparse-but-honest seed descriptions. Long descriptions with many hits are the primary concern.

### Thresholds

| Classification | Score range | Action |
|----------------|------------|--------|
| **HIGH** | ≥ 25 or any template sentence match | Almost certainly hallucinated. Flag for rewrite or archival. |
| **MEDIUM** | 16–24 | Likely hallucinated. Manual review recommended. |
| **LOW** | 5–14 | Some hallucination signals but could be legitimate. Review only if time permits. |
| **CLEAN** | 0–4 | Below detection threshold. No action. |

### Action Decision Tree (HIGH listings only — not automated)

All HIGH-scoring listings are surfaced to Matt for the rewrite-vs-archive call. No automated action.

| Condition | Action |
|-----------|--------|
| URL works + venue verifiable | **Rewrite** the description |
| URL broken or venue unverifiable | **Archive** the listing |
| URL works + venue is chain/franchise | **Archive** (Gate 1 violation) |

### Expected distribution (estimate based on archived sample)

- HIGH: ~150–300 listings (descriptions sharing template sentences or hitting 3+ Tier 1 phrases)
- MEDIUM: ~200–500 listings (descriptions with 2 Tier 1 + structural patterns)
- LOW: ~500–1,000 listings (single weak signals)
- CLEAN: ~4,000–4,800 listings (no significant hallucination markers)

These are rough estimates. The calibration step will validate before any bulk action.

---

## Frequency Data — Empirical Backbone

### Phrase presence in 94 archived hallucinated descriptions

| Phrase | Count | % of 94 |
|--------|-------|---------|
| `known for` | 78 | 83.0% |
| `specialising in` | 31 | 33.0% |
| `particularly known for` | 24 | 25.5% |
| `located in` | 14 | 14.9% |
| `worth a visit` | 15 | 16.0% |
| `for anyone` | 20 | 21.3% |
| `destination for` | 14 | 14.9% |
| `anyone seeking` | 12 | 12.8% |
| `book lovers` | 11 | 11.7% |
| `specialising in vintage` | 10 | 10.6% |
| `thoughtfully curated` | 9 | 9.6% |
| `must-visit` | 9 | 9.6% |
| `rare finds` | 9 | 9.6% |
| `a haven for` | 8 | 8.5% |
| `stationery lovers` | 8 | 8.5% |
| `quality pressings` | 8 | 8.5% |
| `delightful destination` | 5 | 5.3% |
| `a wonderful destination` | 5 | 5.3% |

### Structural pattern presence in 94 archived descriptions

| Pattern | Count | % of 94 |
|---------|-------|---------|
| No specific anchors | 94 | 100.0% |
| "Known for [comma list]" structure | 67 | 71.3% |
| CTA ending | 34 | 36.2% |
| Long comma list (3+ commas/sentence) | 33 | 35.1% |
| "[Name] is a [category]" opener | 23 | 24.5% |
| Doubled location adjective | 4 | 4.3% |

### Duplicate sentence frequency in archived descriptions

| Sentence | Copies in archive | Copies still active |
|----------|-------------------|---------------------|
| Bookshop closer | 9 | 3 |
| Stationery closer | 8 | 5 |
| Record-store closer | 8 | 3 |
| Vintage-clothing middle | 8 | 1 |
| Jewellery closer | 7 | 2 |
| Antiques middle | 6 | 4 |
| Mid-century furniture middle | 6 | 4 |
| Toy-shop closer | 5 | 6 |
| Homewares closer | 5 | 3 |

Note: "active copies" count may include April-1 listings whose URLs resolve (real venue, hallucinated description) as well as listings from other verticals that used the same seed process.

---

## Implementation notes for the detector

This section captures resolutions that future readers (and future Claude sessions) need to understand the corpus as specification rather than draft. The previous "Open Questions / Needs Validation" section has been resolved and removed; this section explains what landed and why.

### Authoritative source for weights and thresholds

The weights table in "Scoring Formula → Weights" (above) is the canonical specification for the detector. Any earlier specification — including the sketched weights in the Part 2.2 brief (Tier 1 = 5, Tier 2 = 1, template = 10+, structural = 2, flag at 5, high at 10) — was illustrative of structure, not numeric spec. Those numbers predated the empirical analysis of 94 archived hallucinated descriptions that produced this corpus.

If the brief and the corpus disagree, **the corpus wins**. The corpus numbers are grounded in real archived content; the brief numbers were guesses.

The starting thresholds (HIGH ≥ 25, MEDIUM 15–24, LOW 5–14, CLEAN 0–4) are estimates that Part 3 calibration validates against:
- **Known-good control:** 50 listings sampled from post-April Candidate Review content. Must produce <5% false positive at score ≥ 5.
- **Known-bad control:** 20 hand-selected listings from the archived sets (Found n=24, Corner n=42). Must produce 100% catch at the HIGH threshold.

If calibration fails either bar, thresholds and weights adjust until both are met. The numbers in this document at that point become the calibrated production thresholds.

### Tier 2 weight bands

Two weight bands within Tier 2 (standard = 3, tiebreaker = 1) were introduced when resolving the "curated family" question. The 20% leak-rate ceiling separates them: phrases above 20% leak are tiebreaker-only.

The 20% cutoff is reasoning, not data. Part 3 calibration enforces empirically: if any of the 131 post-April Candidate Review listings score MEDIUM+ (≥15) for any phrase in the standard band, that phrase moves to tiebreaker. The ceiling can tighten further if calibration demands; it cannot relax.

### "Located in" — promoted from Tier 2 to Tier 3

Bare `located in` was previously listed as Tier 2 entry 2.9 with the note "promotional suffix only". This was an awkward fit — Tier 2 phrases are single-token signals; the diagnostic pattern is a structural template that needs a regex. It now lives as Tier 3 pattern 3.8 with the regex spelled out.

The verb list (`known|famous|renowned|celebrated`) was widened from the initial sketch (which had only `known for`) to handle legitimate template variants. The multi-word place name handler (`(\s[A-Z][a-z]+)*`) covers "New South Wales", "Far North Queensland", etc.

### FG (Fine Grounds) template detection — scope decision

The Fine Grounds hallucinations are more sophisticated than Corner/Found — they invent specific-sounding roaster names, dishes, and interior details. Cross-referencing invented roaster names against a real roaster registry would improve detector precision, but doing so requires its own data-curation pipeline.

**Decision: out of scope for this corpus.** Structural pattern 3.1 (no specific anchors) catches all 94 archived hallucinated descriptions including all FG cases. The detector's recall on the known-bad set is already 100% via 3.1. Adding a roaster-name cross-reference would only improve precision (filtering out legitimately-sparse descriptions), and any false-positive cost is bounded — a lone 3.1 hit scores 5, well below the MEDIUM threshold of 15.

If precision becomes the bottleneck later, the roaster cross-reference is its own work plan.

### Scope of action — detection vs. action

This corpus and the detector built on it identify hallucinated **descriptions**. Whether the underlying venue is real, whether the URL works, and whether the listing should be rewritten or archived are separate operator decisions captured in the Action Decision Tree (Scoring Formula → Action Decision Tree, above). The detector outputs scores; humans (Matt) decide rewrite-vs-archive. Detection ≠ action.
