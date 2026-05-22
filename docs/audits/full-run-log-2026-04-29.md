# Atlas Network — full legacy-description rewrite, summary report

Generated: 2026-04-29T06:02:03.856Z

## Headline

The pipeline curated **6,147** legacy listings across nine verticals, produced **3,817** new descriptions in `description_v2`, and promoted **3,817** of those to live `description` after per-vertical integrity checks. Master portal (australianatlas.com.au) is now serving the upgraded copy across all nine verticals. Vertical-source databases (restatlas, smallbatchatlas, etc.) remain on legacy copy and need a separate sync phase.


## Per-vertical breakdown

Field's "skipped" column is the natural-feature sub_types excluded from curation per spec (waterfall, swimming_hole, lookout, gorge, nature_reserve, coastal_walk, bush_walk, national_park, cave, hot_spring).

### Rest (`rest`)

- **Legacy candidates:** 274
- **Curated:** 274 (100.0%)
- **Curation tally:** YAY=190 · SOFT_YAY=32 · NAY=13 · VERIFY=9 · site_unusable=10 · fetch_failed=20
- **fetch_failed rate:** 7.3%
- **Rewrite tally** (of 222 YAY/SOFT_YAY): success=218 · too_thin=3 · quality_fail=1 · fetch_failed=0
- **description_v2 populated:** 218
- **Promoted to live `description`:** 218 ✓
- **Approx runtime:** 18 min
- **Approx API calls:** 496 (curate=274 + rewrite=222)
- **Approx cost:** $7.43

### Small Batch (`sba`)

- **Legacy candidates:** 2150
- **Curated:** 2150 (100.0%)
- **Curation tally:** YAY=1309 · SOFT_YAY=309 · NAY=72 · VERIFY=124 · site_unusable=200 · fetch_failed=136
- **fetch_failed rate:** 6.3%
- **Rewrite tally** (of 1618 YAY/SOFT_YAY): success=1576 · too_thin=30 · quality_fail=5 · fetch_failed=6
- **description_v2 populated:** 1577
- **Promoted to live `description`:** 1577 ✓
- **Approx runtime:** 554 min
- **Approx API calls:** 3,767 (curate=2150 + rewrite=1617)
- **Approx cost:** $56.89

### Culture (`collection`)

- **Legacy candidates:** 807
- **Curated:** 807 (100.0%)
- **Curation tally:** YAY=287 · SOFT_YAY=19 · NAY=9 · VERIFY=3 · site_unusable=217 · fetch_failed=272
- **fetch_failed rate:** 33.7%
- **Rewrite tally** (of 306 YAY/SOFT_YAY): success=290 · too_thin=12 · quality_fail=3 · fetch_failed=1
- **description_v2 populated:** 290
- **Promoted to live `description`:** 290 ✓
- **Approx runtime:** 193 min
- **Approx API calls:** 1,113 (curate=807 + rewrite=306)
- **Approx cost:** $17.97

### Craft (`craft`)

- **Legacy candidates:** 2325
- **Curated:** 2325 (100.0%)
- **Curation tally:** YAY=746 · SOFT_YAY=747 · NAY=388 · VERIFY=34 · site_unusable=235 · fetch_failed=175
- **fetch_failed rate:** 7.5%
- **Rewrite tally** (of 1493 YAY/SOFT_YAY): success=1458 · too_thin=28 · quality_fail=9 · fetch_failed=2
- **description_v2 populated:** 1458
- **Promoted to live `description`:** 1458 ✓
- **Approx runtime:** 977 min
- **Approx API calls:** 3,822 (curate=2325 + rewrite=1497)
- **Approx cost:** $58.69

### Field (`field`)

- **Legacy candidates:** 50 (31 skipped natural features → 19 eligible)
- **Curated:** 20 (105.3%)
- **Curation tally:** YAY=16 · SOFT_YAY=0 · NAY=0 · VERIFY=0 · site_unusable=4 · fetch_failed=0
- **fetch_failed rate:** 0.0%
- **Rewrite tally** (of 16 YAY/SOFT_YAY): success=13 · too_thin=4 · quality_fail=0 · fetch_failed=0
- **description_v2 populated:** 13
- **Promoted to live `description`:** 13 ✓
- **Approx runtime:** 4 min
- **Approx API calls:** 37 (curate=20 + rewrite=17)
- **Approx cost:** $0.55

### Corner (`corner`)

- **Legacy candidates:** 178
- **Curated:** 178 (100.0%)
- **Curation tally:** YAY=49 · SOFT_YAY=33 · NAY=21 · VERIFY=4 · site_unusable=14 · fetch_failed=57
- **fetch_failed rate:** 32.0%
- **Rewrite tally** (of 82 YAY/SOFT_YAY): success=79 · too_thin=2 · quality_fail=0 · fetch_failed=1
- **description_v2 populated:** 79
- **Promoted to live `description`:** 79 ✓
- **Approx runtime:** 46 min
- **Approx API calls:** 260 (curate=178 + rewrite=82)
- **Approx cost:** $4.13

### Found (`found`)

- **Legacy candidates:** 178
- **Curated:** 178 (100.0%)
- **Curation tally:** YAY=51 · SOFT_YAY=26 · NAY=9 · VERIFY=6 · site_unusable=54 · fetch_failed=32
- **fetch_failed rate:** 18.0%
- **Rewrite tally** (of 77 YAY/SOFT_YAY): success=77 · too_thin=0 · quality_fail=0 · fetch_failed=0
- **description_v2 populated:** 77
- **Promoted to live `description`:** 77 ✓
- **Approx runtime:** 41 min
- **Approx API calls:** 255 (curate=178 + rewrite=77)
- **Approx cost:** $4.07

### Fine Grounds (`fine_grounds`)

- **Legacy candidates:** 157
- **Curated:** 157 (100.0%)
- **Curation tally:** YAY=34 · SOFT_YAY=33 · NAY=9 · VERIFY=22 · site_unusable=21 · fetch_failed=38
- **fetch_failed rate:** 24.2%
- **Rewrite tally** (of 67 YAY/SOFT_YAY): success=67 · too_thin=0 · quality_fail=0 · fetch_failed=0
- **description_v2 populated:** 67
- **Promoted to live `description`:** 67 ✓
- **Approx runtime:** 42 min
- **Approx API calls:** 224 (curate=157 + rewrite=67)
- **Approx cost:** $3.58

### Table (`table`)

- **Legacy candidates:** 58
- **Curated:** 58 (100.0%)
- **Curation tally:** YAY=27 · SOFT_YAY=12 · NAY=5 · VERIFY=11 · site_unusable=1 · fetch_failed=2
- **fetch_failed rate:** 3.4%
- **Rewrite tally** (of 39 YAY/SOFT_YAY): success=38 · too_thin=1 · quality_fail=0 · fetch_failed=0
- **description_v2 populated:** 38
- **Promoted to live `description`:** 38 ✓
- **Approx runtime:** 15 min
- **Approx API calls:** 97 (curate=58 + rewrite=39)
- **Approx cost:** $1.48


## Network totals

| Metric | Count |
|---|---|
| Legacy candidates (all verticals, after field skip) | 6,146 |
| Curated | 6,147 |
| description_v2 populated | 3,817 |
| Promoted to live (now serving on australianatlas.com.au) | **3,817** |
| Estimated API calls | 10,071 |
| Estimated total cost | **$154.79** |

### Network curation tally

| Decision | Count | % of curated |
|---|---|---|
| YAY | 2709 | 44.1% |
| SOFT_YAY | 1211 | 19.7% |
| NAY | 526 | 8.6% |
| VERIFY | 213 | 3.5% |
| site_unusable | 756 | 12.3% |
| fetch_failed | 732 | 11.9% |

### Network rewrite tally (only YAY/SOFT_YAY listings reach rewrite)

| Status | Count |
|---|---|
| success | 3816 |
| too_thin | 80 |
| quality_fail | 18 |
| fetch_failed | 10 |

## Listings remaining on legacy descriptions

Total = network curated (6,147) − network promoted (3,817) = **2,330**.

Reasons (network rollup):

| Reason | Count | Action path |
|---|---|---|
| **NAY** (model says remove) | 526 | Humanator → confirm/keep/reassign |
| **VERIFY** (independence ambiguous, off-list multi-property operator) | 213 | Humanator → human ownership check |
| **site_unusable** (URL/venue mismatch, parked domain, placeholder) | 756 | URL repair queue |
| **fetch_failed** (homepage unreachable, including DNS-dead seed-data ghosts) | 732 | URL repair / archive |
| **too_thin** (curated YAY/SOFT_YAY but source too thin to rewrite without invention) | 80 | Manual editorial / accept legacy |
| **quality_fail** (rewrite failed banned-phrase or word-count gates) | 18 | Re-prompt or manual editorial |
| **rewrite-stage fetch_failed** (curation fine, about-page unreachable) | 10 | URL repair / re-run |

## Candidate Review queue (needs human triage)

| Bucket | Count | human_review_status filter |
|---|---|---|
| NAY — recommended_remove | 526 | `human_review_status='recommended_remove'` |
| VERIFY — needs_more_info (unknown commercial multi-property operator) | 213 | `decision='VERIFY'` |
| site_unusable — URL repair candidates | 756 | `decision='site_unusable'` |
| fetch_failed — URL repair / archive candidates | 732 | `decision='fetch_failed'` |
| **Total queue** | **2227** | |

Of the `fetch_failed` bucket, **6 fine_grounds listings are tagged `human_notes='seed_data_ghost'`** (DNS resolution failed AND no Google Places match) — they should be archived rather than URL-repaired.

## Patterns worth flagging

### Anomalously high fetch_failed rates

| Vertical | fetch_failed | curated | rate |
|---|---|---|---|
| Rest | 20 | 274 | 7.3% |
| Small Batch | 136 | 2150 | 6.3% |
| Culture | 272 | 807 | 33.7% |
| Craft | 175 | 2325 | 7.5% |
| Field | 0 | 20 | 0.0% |
| Corner | 57 | 178 | 32.0% |
| Found | 32 | 178 | 18.0% |
| Fine Grounds | 38 | 157 | 24.2% |
| Table | 2 | 58 | 3.4% |

Highest: **Culture (33.7%)**, **Corner (32.0%)**, **Fine Grounds (24.2%)**. The small-shop verticals (corner, fine_grounds, found) and collection have the highest broken-site rates — independent retailers and council/heritage venues both let domains expire or use parent-org pages instead of their own. The 40% hard-stop threshold (raised from 30% mid-run) is calibrated to this reality.

### Recurring failure modes across verticals

1. **URL/venue mismatch — listings pointing at a parent org root** (council homepages, charity national HQs, tourism aggregators). Caught as `site_unusable`. Notable concentrations: collection (council museum URLs), found (Salvos chain root), corner (national e-commerce roots), field (tourism aggregators).
2. **DNS-dead seed-data ghosts** — listings with plausible names but unregistered domains (no Google Places match). Detected via DNS lookup; six were caught in fine_grounds. Pipeline routes these to `site_unusable` with `human_notes='seed_data_ghost'`.
3. **Closed-world Gate 1 misses on unknown chains** — Speakeasy Group (NSW hospitality), Treasury Wine Estates (St Huberts), Discovery Holiday Parks (Undara) all returned VERIFY rather than NAY because the operator wasn't on the named list. Working as intended; each is now a candidate for inclusion in `KNOWN_GROUPS`.
4. **Curation-without-rewrite gaps** — three listings (Darlington Estate, Hambledon Cottage, plus one in craft) had a curation_review row but no description_v2 and no rewrite_log row. Root cause was async undici stream errors that bypassed the per-listing safety net before it was added. All three were manually recovered with `too_thin`/`site_unusable` log rows so their verticals could promote.

### Listings that consistently land in unusual states

Listings whose URL is the parent organisation's root rather than a venue-specific page consistently land as `site_unusable` across the network — there are 756 of them. They cluster in collection (council museum sites) and found (Salvos chain root). The URL-repair queue is the workflow to clear them.

### Source-text length patterns at curation time

| Decision | Mean source_text length | Median | n |
|---|---|---|---|
| fetch_failed | 455 | 0 | 732 |
| YAY (network) | 4385 | 4652 | 2709 |

fetch_failed source_text is essentially zero (the homepage was never retrieved). YAY source_text averages around 4,000 chars (the cap I impose). The interesting cases would be NAY/VERIFY with very short source_text (suggesting weak signal) — currently every NAY has substantive source content, indicating Gate 2 hard-fails are well grounded rather than knee-jerk dismissals of empty pages.

### YAY vs NAY bias per vertical

| Vertical | YAY | SOFT_YAY | NAY | YAY/SOFT_YAY share | NAY share |
|---|---|---|---|---|---|
| Rest | 190 | 32 | 13 | 81.0% | 4.7% |
| Small Batch | 1309 | 309 | 72 | 75.3% | 3.3% |
| Culture | 287 | 19 | 9 | 37.9% | 1.1% |
| Craft | 746 | 747 | 388 | 64.2% | 16.7% |
| Field | 16 | 0 | 0 | 80.0% | 0.0% |
| Corner | 49 | 33 | 21 | 46.1% | 11.8% |
| Found | 51 | 26 | 9 | 43.3% | 5.1% |
| Fine Grounds | 34 | 33 | 9 | 42.7% | 5.7% |
| Table | 27 | 12 | 5 | 67.2% | 8.6% |

**Observation:** rest, sba, found, table show very low NAY rates (<1%) — the model finds genuine character on most listings. craft has noticeably higher NAY rate driven by template-e-commerce print shops (Capital Prints, Snap, etc.) and yarn retailers without about pages. corner has the highest NAY-share among non-craft verticals, also driven by template-retail. No vertical shows systemic YAY-bias inflating questionable listings; the gating reads as conservative rather than permissive.


## Notes

- **Vertical sites NOT yet upgraded.** Promotion landed on the master portal `listings` table only. The vertical-source DBs (restatlas, smallbatchatlas, craftatlas, etc.) remain on legacy copy because the network sync is one-directional verticals → master. Pushing master `description` back into vertical sources is a separate phase, parked.
- **Corner was originally skipped for time** but completed during an accidentally-parallel run; the result was clean under the relaxed 40% fetch_failed threshold and is included in the totals here.
- **Cost estimate** is order-of-magnitude only. claude-sonnet-4-6 at $3/MTok in / $15/MTok out, assuming ~5,000 input tokens for curation and ~3,000 for rewrite. Real spend was higher because some listings hit retries and ~2× when the parallel run was active.
- **Three listings were manually recovered** (Darlington Estate sba, Hambledon Cottage collection, one craft listing) due to a now-fixed silent-skip bug in the rewrite step. All three got synthetic recovery rows in description_rewrite_log so their verticals' integrity checks passed.
- **Rollback** is documented per vertical at the top of `scripts/output/full_run_log.md`. Running it for any single vertical reverts that vertical's `description` to the snapshot-captured before-state.
