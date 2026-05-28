# Portal-as-Single-Source-of-Truth — Audit

**Date:** 21 May 2026 (audit), 28 May 2026 (latest status update)
**Author:** Matt Smith
**Status:** Tier 1 complete; Tier 2 hallucination cleanup complete across three verticals; manual review queue complete; Finding A scored 77 HIGH (now 40 after Gate 1 hides); Finding B augmented and re-run, network clean after 39 institutional-outlet and chain-franchise hides; Gate 1 independence policy codified in `docs/gate-1-independence-policy.md`
**Execution model:** Claude Code with repo + DB access, run section by section

---

## Status Update — 22 May 2026

This section records what has changed since the audit was authored. The original audit document below remains intact as the historical record. This section is the working state.

### Finding-0 resolved — Path A committed

The audit's top-level finding asked whether the network should commit to Phase 3 (portal-canonical, verticals as read replicas), abandon Phase 3, or defer pending the commercial test. The decision is **Path A — commit to Phase 3 now, execute after the commercial backend ships.**

Rationale: the convention-based approach had failed on four of ten verticals; the rewrite pipeline's editorial work was being silently overwritten by the inbound sync (the Fix 2 finding below); stating architectural intent publicly is cheap and orients future work even if execution is sequenced.

The decision is recorded as **Rule 4** in `CLAUDE.md` (commit `44f83e4` on the atlas-cms repo, 22 May 2026):

> The portal is the canonical store for all listing data, not just the lowest common denominator. Every field that describes a listing — operational metadata, opening hours, editorial descriptions, traveller content, accreditations, region assignments, cross-vertical relationships — lives on the portal. Verticals are display surfaces that read from the portal, not stores that hold data the portal doesn't have.

Rule 4 names this as a target rather than a current state. The full migration (moving Table's opening hours, Field's traveller content, etc. into portal columns; rebuilding vertical-side write paths through Candidate Review) is sequenced behind the commercial backend rebuild. Until then, portal-canonical is the design principle every new feature is built against:

- No new vertical-side data store should be created.
- No new vertical-side write path should be added; existing ones are flagged for deprecation, not immediate removal.
- Every new field added to a vertical schema must also exist on the portal.
- The inbound vertical-to-portal sync is metadata-only.

### Tier 1 fix progress

| # | Fix | Status | Commit | Notes |
|---|-----|--------|--------|-------|
| 1 | events/[slug] silent failure | ✅ Complete | `46b9d98` | Two-line fix: `is_active` → `status='published'`; switched query to `listings_with_region` view |
| 2 | Rest description drift (54%) | ✅ Complete | `a175cde` + repair/push | See "Fix 2 outcomes" below |
| 3 | Fine Grounds row count mismatch | ✅ Complete | `785f3af` | See "Fix 3 outcomes" below |
| 4 | Table Atlas cross-vertical scripts | ⏳ Next | — | — |
| 5 | Way Atlas credentials | ✅ Complete | (env-only, no commit) | Portal can now reach Way Atlas DB; operators table is empty by design (pre-curation phase) |

### Fix 2 outcomes — beyond what the audit predicted

The audit reported 54% drift on Rest, 9.5% on SBA, 8.1% on Collection. Investigation revealed the root cause was not stale syncs but **active bidirectional overwrite**: the inbound vertical-to-portal sync was writing `description` from the vertical's stale copy onto the portal's rewritten copy, reversing the rewrite pipeline's editorial work.

- **461 SBA descriptions** had already been reverted by inbound sync (audit caught 389 at the snapshot moment; another 72 had been reverted in the time between the audit and the repair).
- **2 Collection** and **4 Rest** descriptions had also been reverted.
- **3,335 rewritten descriptions** were then pushed outbound to all nine verticals (description data on Way Atlas not yet relevant — empty by design).
- **Zero reversions remaining** across all nine verticals after verification.

The Fix 2 commit narrows the inbound sync to metadata-only and references Rule 4 explicitly. It is the first installment of portal-canonical for editorial fields.

### New Tier 2 follow-ups surfaced during Fix 2

These are additions to the original Tier 2 list (items 6-10 in the original audit), discovered during Fix 1 and Fix 2 execution:

- **Audit `is_featured` / `sub_type` / `sub_types` drift across all verticals.** Rule 4 names these as portal-authoritative. Fix 2 narrowed inbound sync to remove `description` only; the other three Rule-4 candidates need the same investigation-before-action treatment Fix 2 received. If drift exists, the fix is structurally identical (remove from inbound mapper).

- **Audit Supabase queries for implicit 1000-row truncation.** The Fix 2 outbound push initially missed 448 Craft listings because a `.select()` call without explicit `.limit()` inherited Supabase's default 1000-row cap. No exception thrown; query just returned truncated results. This is a Section 6 silent-failure pattern of a different shape than the `cluster_id` bug — truncation rather than try/catch — and worth auditing across the portal codebase.

- **Investigate the 13 MISSING_VERTICAL listings.** Fix 2's outbound push reported 13 listings where the portal had `description_v2` but no matching vertical row existed. This is the Section 2 finding-shape confirmed in real numbers. Either initial sync never ran for these listings or vertical-side rows were deleted at some point. Decide per case whether to push (create vertical row) or archive on portal. *(Fix 3 resolved 1 of these — `black-star-coffee-roasters` — via standard Candidate Review flagging.)*

- **Investigate the 7 SKIPPED listings from the Fix 2 push.** Push script reported skipped without a documented reason. Could be identical descriptions, slug conflicts, non-published status, or something else. Worth a quick audit while investigating the 13 not-found rows.

### Fix 3 outcomes — beyond what the audit predicted

The audit reported Fine Grounds row count mismatch: portal 151, vertical 126, gap of 25. Investigation revealed the gap was not a sync bug but **a partial cleanup of hallucinated seed listings** — vertical-side rows had been deleted during cleanup of fabricated content; the portal-side records were never archived to match.

- **27 hallucinated listings** on Fine Grounds (bulk-inserted 2026-04-01, `manually_curated`, non-resolving domains, template-generated venue names like "Gosford Bean Project", "Magnetic Island Roasters") — archived on portal.
- **1 NAY listing** (huskee) archived per curation verdict.
- **3 real venues** with deleted vertical rows (seven-seeds, shenannigans, shenannigans-cafe) — re-pushed to vertical with new source_ids.
- **2 slug mismatches** (noosa, margaret-river) — portal slugs aligned to venue self-identification.
- **7 vertical-only listings** (Wolff Coffee Roasters, Room 10, Hey Jupiter, Single Origin Roasters, Born in Brunswick, Someday Coffee, Traveller) — pulled into portal per Rule 4. This was a Section 1 SSOT violation: rows existed on the vertical without portal authority, dating from the 2026-03-31 initial seed.
- **Final reconciliation:** portal active (130) = vertical total (130). Balanced.

The Fix 3 commit (`785f3af`) is a `chore(data)` rather than a code change — all operations were data-layer cleanup via Supabase API.

### Network-wide hallucination audit (Fix 3 Part A)

The hallucination pattern is broader than CLAUDE.md previously documented. Audit ran across all 10 verticals checking for the fingerprint: bulk insert on 2026-04-01, `data_source='manually_curated'`, non-resolving domains, template-generated venue names.

| Vertical | Cohort size | Archived | Excluded as real | Deferred (HTTP_OTHER) | Status |
|----------|-------------|----------|------------------|----------------------|--------|
| Fine Grounds | 101 | 28 | — | — | ✅ Cleaned 2026-05-22 |
| Corner | 87 | 42 | 2 | 3 | ✅ Cleaned 2026-05-25 |
| Found | 118 | 24 | 2 | 3 | ✅ Cleaned 2026-05-25 |
| SBA, Collection, Craft, Rest, Field, Table | — | — | — | — | Clean (no hallucinated cohort detected) |
| Way | 0 | — | — | — | No operators yet (pre-curation phase) |
| **Total network-wide** | **306** | **94** | **4** | **6** | |

Network cleanup commits: `785f3af` (Fine Grounds), `28d8f6c` (Corner), `755e12d` (Found).

**Important reframing:** CLAUDE.md currently states "Table Atlas had 331 hallucinated listings and was recommended for offline/reseed." The audit found Table sampling as CLEAN. Either the reseed has happened (and CLAUDE.md is stale) or the 331 were archived (reducing 499 → 168 current). Worth confirming before updating CLAUDE.md. The line should be expanded to record the network-wide finding: hallucinations confirmed on Table, Fine Grounds, Corner, and Found — all from the same 2026-04-01 automated seed process. Audit other bulk seeds before they go live.

### Manual review queue from hallucination cleanup — ✅ Completed 2026-05-25

Ten listings surfaced during Corner and Found cleanup that required manual judgement rather than bulk-archive treatment. Worked through individually 25 May 2026.

| # | Slug | Vertical | Outcome |
|---|------|----------|---------|
| 1 | `the-paperback-bookshop` | Corner | URL verified working (audit false positive — paperbackbooks.com.au loads in browser); Found duplicate listing deleted |
| 2 | `new-edition-bookshop` | Corner | Original URL was a wholesale hallucination; replaced with verified real URL (`newedition.com.au`); description rewritten from venue site; region populated |
| 3 | `dirty-janes-bowral` | Found | Addressed; bonus: descriptions written for all three Dirty Janes locations (Bowral, Canberra, Orange) |
| 4 | `modern-times-fitzroy` | Found | Venue out of business — hidden |
| 5 | `readings-carlton` | Corner | Verified clean (real description, real URL, real address) — no changes needed |
| 6 | `chapel-street-bazaar` | Found | URL cleared (real venue has no website); description rewritten |
| 7 | `wunderkammer-melbourne` | Found | Verified clean (description is grounded with specifics) — no changes needed |
| 8 | `ampersand-cafe-bookshop` | Found | Verified clean — no changes needed (one unverified award claim noted but accepted) |
| 9 | `mr-toys-cairns` | Corner | **Franchise chain (Toyworld)** — hidden, fails Gate 1 independence |
| 10 | `eckersleys-sydney` | Corner | Listing already gone — no action |

### Finding A — hallucinated descriptions on real venues — ✅ Detection complete, 77 rewrite candidates surfaced

The 2026-04-01 seed produced two kinds of corruption, not one:

1. **Fake venues with fake websites** — caught by HTTP-failure detection in Fix 3 and the Corner/Found cleanup. 94 listings archived.
2. **Real venues with fabricated descriptions** — *not* caught by the HTTP audit. This finding addresses category 2.

**Detection approach used:** deterministic banned-phrase pattern matching, no LLM. A three-tier corpus was empirically derived from the 94 archived hallucinated descriptions (`docs/banned-phrase-corpus.md`), then calibrated against:

- **Sample 1** — 555 known-good listings (post-April `ai_generated` and `manually_curated`). Final result: 0 HIGH, 0 MEDIUM. Zero false positives.
- **Sample 2** — the 10-case manual review set. Final result: 4/4 hallucinated → HIGH, 6/6 real/rewritten → CLEAN or LOW. Perfect separation.

Two threshold adjustments during calibration: Tier 3 weight 5 → 4, MEDIUM threshold 15 → 16. Both surfaced and approved.

**Cohort scan results** — full scan across the 5,721 active `manually_curated` listings from 2026-04-01:

| Vertical | Total | HIGH | MEDIUM | LOW | CLEAN |
|----------|-------|------|--------|-----|-------|
| collection | 902 | 0 | 4 | 399 | 499 |
| corner | 43 | 21 | 1 | 5 | 16 |
| craft | 2,265 | 0 | 8 | 834 | 1,423 |
| field | 167 | 0 | 1 | 14 | 152 |
| fine_grounds | 73 | 0 | 0 | 25 | 48 |
| found | 90 | 56 | 0 | 7 | 27 |
| rest | 47 | 0 | 0 | 3 | 44 |
| sba | 2,132 | 0 | 1 | 381 | 1,750 |
| table | 2 | 0 | 0 | 0 | 2 |
| **TOTAL** | **5,721** | **77** | **15** | **1,668** | **3,961** |

**Distribution analysis.** 77 HIGH (1.3% of cohort). All 77 have working URLs and zero chain matches from Finding B — they are all rewrite candidates under the action decision tree.

**HIGH concentration is in Corner (21/43 = 49%) and Found (56/90 = 62%).** Other verticals show zero HIGH. This does NOT mean those verticals are clean — it means their seed process used different templates that don't trip the corpus. SBA, Collection, Craft, Fine Grounds, Rest, and Field hallucinations (where they exist) would need per-vertical template analysis or LLM-assisted classification to detect. **Scoped limitation of this pass.**

**Notable items in the 77 HIGH list:**

- **toyworld-alice-springs** (Corner, score 75) — Toyworld franchise chain, same shape as Mr Toys Cairns. Gate 1 violation, not just a description problem. Toyworld is not in `commercial_groups`, which is why Finding B didn't catch it. Action: hide, then add Toyworld (and probably other missing chains) to `commercial_groups` and re-run Finding B.
- **Multiple charity shops** (Salvos, Vinnies, Brotherhood, Red Cross, Anglicare across both Corner and Found) — real venues, hallucinated descriptions. These present an editorial question separate from the description fix: each store is locally operated but part of a national charitable organisation. Independence determination requires a framework decision before any action on the listings themselves.
- **dirty-janes-bowral** (Found, score 68) — already addressed in the manual review queue.

**Output:** `scripts/output/finding-a-full-cohort-2026-05-25.json`.

**Status:** detection complete. Action items below. No archiving performed.

### Finding B — franchise/chain operators past Gate 1 independence — ✅ Augmented, re-run, 39 hides actioned

**Two-phase finding.** Initial investigation 25 May 2026 found the network clean against the existing `commercial_groups` table (11 matches, 8 case-by-case luxury operators correctly in network, 2 false positives, 1 ambiguous resolved). But Finding A's HIGH list and the manual review queue surfaced chain operators not in `commercial_groups` — Toyworld, Eckersleys, and the entire category of national charity-shop networks. The chain audit was only as strong as the chain inventory, and the inventory had gaps.

**Augmentation, 28 May 2026.** Following codification of the Gate 1 Independence Policy (`docs/gate-1-independence-policy.md`, commit `19291a4`), 14 entries were added to `commercial_groups`:

- 12 charity chains (category `charity_chain`): Salvation Army, St Vincent de Paul, Brotherhood of St Laurence, Red Cross, Anglicare, Save the Children, Lifeline, RSPCA, Diabetes Australia, Cancer Council, Endeavour Foundation, MS Australia
- 2 commercial chains (category `retail_chain`): Toyworld, Eckersleys

Total `commercial_groups` rows: 39 → 53.

**Re-run results, 28 May 2026.** Re-applying the chain audit against the augmented table produced 52 matches (up from 11):

- 38 charity_chain matches → hidden with `hidden_reason = 'institutional_outlet'`
- 1 retail_chain match (`toyworld-alice-springs`) → hidden with `hidden_reason = 'chain_franchise'`
- 8 case-by-case luxury operators → no action (as expected)
- 3 false positives from prefix matching → no action (Fairfield/Aloft/Merivale Studios, same as 25 May run)
- 2 events deferred for case-by-case → no action (Lifeline Canberra Bookfair, Toowoomba Lifeline Bookfest — flagged as periodic events rather than venues, separate question about Atlas's stance on events)

**Total hides actioned: 39.** Zero failures. All hides verified post-execution.

**Cross-reference with Finding A's 77 HIGH list:** 36 of the hidden listings were also Finding A HIGH (chain operators with hallucinated descriptions). Toyworld Alice Springs (also Finding A HIGH) hidden as chain_franchise. The two deferred Lifeline bookfairs were Finding A HIGH but remain active pending case-by-case review. Net reduction in HIGH rewrite queue: 77 → 40.

**Conclusion: the network is clean on chain infiltration against the augmented `commercial_groups`.** The Gate 1 framework now matches the policy as written.

**Outstanding items from Finding B:**

1. **Case-by-case review of 4 deferred listings:** `mill-markets-daylesford`, `mill-markets-ballarat`, `lifeline-canberra-bookfair`, `toowoomba-lifeline-bookfest`. Mill Markets is a multi-location private operator (Gate 1 question); the Lifeline listings are events rather than venues (separate question about Atlas's stance on events).
2. **Smith Family + Mission Australia:** investigated, both skipped from `commercial_groups`. Smith Family exited retail December 2019. Mission Australia operates ~8-10 op shops in NSW Illawarra/South Coast only — regional rather than national scale.
3. **Gate 1 prefix match precision** still worth tuning — `Fairfield` and `Aloft` continue to trip the gate as false positives. Require exact match for brand names under ~6-8 characters.

**Outputs:**
- `scripts/output/finding-b-chain-audit-2026-05-25.json` (original 11-match run)
- Augmented commercial_groups inserts and Finding B re-run results documented in this audit, 28 May 2026

### Updated Tier 2 follow-ups list

- ~~**Corner Atlas hallucination cleanup (~43 listings).**~~ ✅ Done 2026-05-25 (commit `28d8f6c`).
- ~~**Found Atlas hallucination cleanup (~33 listings).**~~ ✅ Done 2026-05-25 (commit `755e12d`).
- ~~**Manual review queue (10 listings).**~~ ✅ Done 2026-05-25 (no commit — work was in the listings editor, not git).
- ~~**Finding A — design and execute hallucinated description detection.**~~ ✅ Done 2026-05-25. Corpus + scorer in `docs/banned-phrase-corpus.md` + `scripts/finding-a-scorer.mjs`. 77 HIGH rewrite candidates identified.
- ~~**Finding B — audit franchise/chain operators past Gate 1.**~~ ✅ Done 2026-05-25 (initial run, network clean against existing table) and 2026-05-28 (augmented with 14 new entries, 39 hides actioned, network confirmed clean against augmented table).
- ~~**Charity shops framework decision.**~~ ✅ Done 2026-05-25. Reading B (charity shops fail Gate 1 on operational grounds). Policy codified in `docs/gate-1-independence-policy.md` (commit `19291a4`).
- ~~**Add Toyworld and missing franchises to `commercial_groups`.**~~ ✅ Done 2026-05-28 as part of Finding B augmentation. Toyworld + Eckersleys + 12 charity chains added.

**Open from Findings A and B (new work items):**

- **Rewrite the 40 remaining HIGH descriptions from Finding A.** Real venues that pass Gate 1, hallucinated descriptions need replacing. Work shape is one-listing-at-a-time, same as the manual review queue from 25 May. Even split across Corner (20) and Found (20). Decision pending on whether to batch this work or trickle as listings come up naturally.
- **Case-by-case review of 4 deferred listings:** Mill Markets ×2 (Gate 1 question for multi-location private antique-market operator), Lifeline Canberra Bookfair and Toowoomba Lifeline Bookfest (events rather than venues, separate question about Atlas's stance on events).
- **Tune Gate 1 prefix match mode for short brand names.** Require exact match for brand names under ~6-8 characters to eliminate the Fairfield/Aloft class of false positives.
- **Per-vertical hallucination detection for SBA, Collection, Craft, Fine Grounds, Rest, Field.** The Finding A corpus catches Corner/Found template patterns. Other verticals likely have hallucinations using different templates. Would require per-vertical template analysis (each vertical's seed process) or LLM-assisted classification.

**Open from earlier (still pending):**

- **Re-push 2 more real venues to Fine Grounds vertical.** `barefoot-barista` (roaster_50) and `north-beach-coffee-co-wollongong` (cafe_91) — real venues whose vertical rows were deleted during the hallucination cleanup. Five-minute task.
- **Backfill bare numeric source_ids on Fine Grounds (49 listings).** Legacy pre-prefix convention; lookup happens to work today but is ambiguous.
- **Confirm Table Atlas reseed status.** CLAUDE.md says 331 hallucinated and flagged for reseed; the 22 May audit found Table sampling clean. Verify which happened and update CLAUDE.md.
- **Audit `is_featured` / `sub_type` / `sub_types` drift across all verticals** (Fix 2 follow-up).
- **Audit Supabase queries for implicit 1000-row truncation** (Fix 2 follow-up).
- **Investigate the 12 remaining MISSING_VERTICAL listings** from Fix 2's outbound push.
- **Investigate the 7 SKIPPED listings** from Fix 2's outbound push.

### Documentation drift caught during Fix 2 and Fix 3

- The audit (Section 5) flagged `properties` and `listings` as "verify" annotations for Rest and Table verticals. Fix 2 confirmed: Rest uses `properties` (correct in CLAUDE.md), Table uses `listings` (correct in CLAUDE.md). Both "verify" annotations can be removed.
- Fine Grounds uses dual tables (`roasters` + `cafes`), not `venues` as CLAUDE.md states. Still pending fix.
- The CLAUDE.md Table Atlas hallucination line (331 listings) needs updating per the audit above.

---

## Purpose

This audit tests whether the Atlas Network's stated architecture — *australianatlas.com.au is the single write path; verticals are downstream display surfaces* — holds in reality. The rule is stated in `CLAUDE.md` and `06-technical-architecture.md` but has accumulated drift across ten vertical projects, a 22-agent automation system, three specification documents (regions, cross-vertical, pitch system) that each impose their own field-level discipline, and at least one known silent-failure pattern (the `cluster_id` bug) suggesting the drift is not always visible.

The audit decomposes "portal as SSOT" into six testable invariants, checks each across all ten verticals, and produces a prioritised fix list.

## Scope

**All ten verticals**, including Way Atlas (live as of May 2026).

| Vertical          | Domain                    | Main Table             |
|-------------------|---------------------------|------------------------|
| Portal            | australianatlas.com.au    | listings               |
| Small Batch       | smallbatchatlas.com.au    | venues                 |
| Culture           | collectionatlas.com.au    | venues                 |
| Craft             | craftatlas.com.au         | venues                 |
| Fine Grounds      | finegroundsatlas.com.au   | venues                 |
| Rest              | restatlas.com.au          | properties (verify)    |
| Field             | fieldatlas.com.au         | places                 |
| Corner            | corneratlas.com.au        | shops                  |
| Found             | foundatlas.com.au         | shops                  |
| Table             | tableatlas.com.au         | listings (verify)      |
| Way               | wayatlas.com.au           | operators              |

**Out of scope**: Practice Atlas (separate stack, editorially separate); Australian Heritage (separate publication).

## Decomposition — six invariants

The rule "portal is SSOT" means six distinct things. The audit tests each independently:

1. **Write-path discipline** — no vertical-side code writes to its own DB independently of the portal sync.
2. **Canonical record integrity** — portal and vertical rows agree on key fields (no sync drift).
3. **Automation boundary** — no automated process writes to published article body fields.
4. **Field-level write discipline** — computed and editorial fields (region IDs, claim state, cross-vertical presence, featured flags) are written only by sanctioned paths.
5. **Architectural drift** — documentation, code, and schema agree on table and column names.
6. **Silent-failure detection** — query patterns that catch schema errors and return degraded data instead of failing loudly.

Plus one top-level finding pre-flagged before audit begins:

**Finding-0: Way Atlas went live without Phase 3 of the cross-vertical spec.** The cross-vertical doc describes verticals-as-read-replicas as the end state; Way Atlas is live with its own Supabase project and its own write paths, which means the architectural target has receded by one vertical, not advanced. This is a primary architectural finding regardless of what the rest of the audit returns. Discussed in Section 8.

---

## Section 1 — Write-path discipline

### What it tests

The stated rule: edits go through portal admin, not through individual vertical admin UIs. Verticals may have edit UIs but these are secondary and should not bypass the portal.

The audit looks for any code in vertical repos that writes to listing-bearing tables independently of the portal sync.

### Sanctioned write paths (whitelist)

These are the only paths that should appear:
- Portal admin (Candidate Review) writing to `portal.listings`
- Portal-to-vertical sync writing to vertical listing tables
- Operator claim edits writing back through portal claim infrastructure
- Read-only RPCs from vertical to portal

Anything else — vertical-side admin UIs, direct mutations on vertical DBs, edge functions on vertical projects writing to listing tables — is a violation.

### Claude Code prompt

```
Audit write-path discipline across all ten Atlas vertical repos.

For each of these repos (you have access to all of them):
- atlas-portal
- smallbatch-atlas, culture-atlas, craft-atlas, finegrounds-atlas
- rest-atlas, field-atlas, corner-atlas, found-atlas, table-atlas
- way-atlas

Step 1 — Find all Supabase write operations.
In each vertical repo (NOT the portal), grep for these patterns:
- supabase.from('<listing_table>').insert
- supabase.from('<listing_table>').update
- supabase.from('<listing_table>').upsert
- supabase.from('<listing_table>').delete
- Any RPC calls that mutate listing tables
- Any Supabase edge functions that mutate listing tables

Substitute <listing_table> with the vertical's actual main entity table
(venues / properties / places / shops / listings / operators per the
table reference in this audit doc).

Step 2 — For each hit, classify:
- VIOLATION: vertical-side write to its own listing table, bypassing portal
- SANCTIONED: claim flow writeback through portal-integrated path
- READ-ONLY: RPC that reads via mutation (rare; flag for review)
- UNKNOWN: needs human judgement (flag and continue)

Step 3 — Output a table per vertical with columns:
file_path | line | operation | classification | notes

Do not propose fixes. This is diagnostic only.

Pay special attention to:
- Way Atlas — newest vertical, write paths most likely to have been
  built without portal integration in mind
- Table Atlas — known data quality issues; may have ad-hoc write paths
  introduced during hallucination remediation
- Rest Atlas — regions contamination history suggests write-path issues
```

### Expected findings

Plausible based on memory and project docs:
- Way Atlas likely has independent write paths; it's brand new and the Phase 3 read-replica architecture was never built
- Table Atlas reseed work may have introduced direct writes
- Most other verticals: probably some legacy admin routes that were never fully decommissioned

### Severity rubric

- **Critical** — vertical writes that have actually caused data drift (verify against Section 2 results)
- **High** — vertical writes to fields the portal also writes (race condition territory)
- **Medium** — vertical writes to fields the portal doesn't touch (de facto field ownership)
- **Low** — vertical writes that are clearly orphaned dead code

---

## Section 2 — Canonical record integrity

### What it tests

For listings that exist on both portal and a vertical, the field values should agree. Where they disagree, one of three things is happening:
1. The vertical was written to directly (Section 1 violation)
2. The sync ran with a bug and produced drift
3. The portal record was updated after sync, sync hasn't run again

All three are problems. The audit measures the rate per vertical, per field.

### Method

Sample-based reconciliation. For each vertical, pull N=200 random listings, join against portal, compare field by field.

### Claude Code prompt

```
Audit canonical record integrity between portal and each vertical.

For each of the ten verticals (Way included):

Step 1 — Pull a random sample of 200 listings from the vertical's main
table. Get id, slug, and these comparison fields:
- name
- description
- latitude, longitude
- hero_image_url
- status
- website_url
- primary_type (or equivalent on the vertical)

Step 2 — For each sampled listing, find the corresponding portal
listings row. Join key: slug + vertical (the portal listings table has
a vertical column).

Step 3 — Compare each field. Record:
- MATCH — values identical
- DRIFT_TEXT — text fields differ (capture both values)
- DRIFT_COORDS — lat/lng differ by more than 0.0001 degrees
- DRIFT_STATUS — status field differs
- MISSING_PORTAL — vertical row has no corresponding portal row (this
  is a Section 1 violation in disguise — a vertical row was created
  without going through the portal)
- MISSING_VERTICAL — portal row references this vertical but no row
  found on the vertical (sync failure)

Step 4 — Output per vertical:
- Total sampled: 200
- Drift rate per field (count and percentage)
- Top 10 examples of each drift type with both values shown
- Aggregate verdict: CLEAN (<1% drift), DRIFTING (1-10%), CORRUPTED (>10%)

Step 5 — Cross-reference with Section 1 results. Where a vertical
shows DRIFT_TEXT on description and Section 1 also found a
vertical-side write to the description field, the linkage is causal.
Flag these explicitly.

Special handling:
- Rest Atlas region field: known historical drift documented in
  05-regions.md. Compare against `region_computed_id` from the
  Section 4 audit rather than the legacy `region` text column.
- Table Atlas: 331 hallucinated listings flagged for reseed. Sample
  these separately and report drift rates inside the hallucination
  cohort vs outside it.
- Way Atlas: brand new; drift rate should be ~0% if sync was set up
  correctly. Anything above 0% is suspect.
```

### Severity rubric

- **Critical** — drift rate >10% on any vertical, or any MISSING_PORTAL hits
- **High** — drift rate 1-10%, or MISSING_VERTICAL >5% on any vertical
- **Medium** — drift rate 0.1-1%, isolated to non-editorial fields
- **Low** — drift rate <0.1%

---

## Section 3 — Automation boundary

### What it tests

The rule from `CLAUDE.md`: "No automated process may write to published article body fields. This rule exists because an automation once overwrote a published journal article."

The audit verifies the 22-agent system honours this. Two questions: (a) which agents have write access to which tables, and (b) does any agent's write path touch a published article body column.

### Claude Code prompt

```
Audit the 22-agent automation system for compliance with the
published-article-body write boundary.

Step 1 — Inventory all agents.
List all 22 agents currently deployed. For each, capture:
- Agent name
- Code location (file path)
- What tables it writes to
- What columns within those tables it writes to
- Authentication mechanism (service role key, anon key, RLS-restricted)

Step 2 — Identify the protected columns.
The portal journal_articles table (or equivalent — verify name) has a
body column for published article content. There may be other
published-content body columns elsewhere — region guides, collections,
council briefings. Inventory all "published body" columns across the
portal schema.

Step 3 — Cross-reference.
For each agent from Step 1, check whether any of its write paths
touches any column from Step 2. Any match is a VIOLATION.

Step 4 — Check for indirect paths.
Some agents may write to draft fields that are then promoted to
published fields via a separate process. Flag any such promotion paths
and verify they have human approval gates.

Step 5 — Output:
- Agent inventory table (name, writes, status)
- Protected columns list
- Violations table (if any) with agent name, file path, column written,
  recommended remediation
- Promotion paths table (if any) with approval gate verification

This is the audit section most likely to surface a single critical
violation that needs immediate fix. Treat any VIOLATION as Critical
severity by default.
```

### Severity rubric

- **Critical** — any agent that can write to a published body column, regardless of whether it has ever done so
- **High** — agents writing to draft body columns without a verified human approval gate on the promotion path
- **Medium** — agents writing to non-body content fields (metadata, descriptions) with no logging
- **Low** — agents writing to non-content fields with full logging

---

## Section 4 — Field-level write discipline

### What it tests

Three specification documents impose field-level discipline:

- **`05-regions.md`** — region fields (`region_computed_id`, `region_override_id`) have specific write paths. Computed by trigger; override only by admin UI. No sync writes either.
- **Cross-vertical spec** — `listing_vertical_presence` and `listing_relationships` rows are admin-written only. No automated cross-vertical inference.
- **Pitch system spec** — pitch fields are write-once at composition time, validated at write via `claim_map`. No retroactive edits without re-validation.

Each spec is a localised SSOT discipline. The audit checks whether each is being honoured.

### Claude Code prompt

```
Audit field-level write discipline against three specifications.

PART A — Regions discipline (per 05-regions.md)

Step 1 — Find all writers to listings.region_computed_id and
listings.region_override_id. Search across all repos for any code
that writes to these columns.

Step 2 — Classify each:
- TRIGGER — the database trigger defined in Phase 1 of regions.md
  (sanctioned for region_computed_id only)
- ADMIN_UI — Humanator dropdown writing to region_override_id
  (sanctioned for region_override_id only)
- BULK_SCRIPT — admin-invoked bulk reassignment (sanctioned for either,
  with audit trail)
- VIOLATION — anything else

Step 3 — Check for legacy listings.region writes. Per regions.md
Phase 3, this column should be renamed to region_legacy_do_not_use
and eventually dropped. Find any code still writing to it.

PART B — Cross-vertical discipline (per cross-vertical spec)

Step 1 — Verify listing_vertical_presence and listing_relationships
tables exist. If they don't, the spec hasn't been implemented;
note this and move on.

Step 2 — If they exist, find all writers. Sanctioned paths:
- Humanator admin UI
- Phase 2 reconciliation script (admin-invoked)
Anything else is a VIOLATION.

Step 3 — Verify the constraint trigger: a listing's additional
vertical (in listing_vertical_presence) cannot equal its primary
vertical. Test by attempting an insert that violates this; should
fail.

PART C — Pitch system discipline (per Pitch System Design)

Step 1 — Verify pitch system has been built. If not, note and
move on.

Step 2 — If built, sample 50 pitch rows. For each, verify:
- Every character_id in the row exists in pitch_characters and has
  primary_source_id NOT NULL
- Every signal_id references a pitch_signals row with a valid source
  (except silence signals)
- The claim_map JSON, if stored, maps every named entity in
  display_summary to a real binding
- No row has been edited post-creation (check updated_at vs created_at;
  any edits flag for review)

PART D — Other field-level disciplines

The portal has other fields with implied write discipline that isn't
documented in a spec doc but should hold. Audit:
- listings.is_featured — should be admin-only
- listings.status — should follow defined state transitions
- listings.slug — should be immutable post-creation except by admin
- claims.status — should follow the claim state machine
- vendor_profiles.* — should be operator-only after claim approval

For each, find writers and classify against expected discipline.

Output for all four parts: violations table, with severity.
```

### Severity rubric

- **Critical** — any write path that contradicts an explicit spec doc rule (regions.md, cross-vertical, pitch system)
- **High** — implicit-discipline violations on featured/status/slug fields
- **Medium** — write paths with no logging or audit trail
- **Low** — orphaned code that could write but doesn't run in production

---

## Section 5 — Architectural drift

### What it tests

Documentation and code references should match the live schema. Known cases already on the docket from memory:

- `primary_type` vs `sub_type` — docs reference `primary_type`, schema uses `sub_type`. This contributes to the `cluster_id` bug (Section 6) by setting a precedent of doc/schema mismatch being tolerated.
- Table name verifies — `CLAUDE.md` literally has "(verify)" annotations next to `properties` and `listings` for Rest and Table verticals. These have never been verified.
- Renames not propagated — Collection Atlas → Culture Atlas in editorial language but domain remains `collectionatlas.com.au`. Anywhere code uses `collection_atlas` vs `culture_atlas` is a vector for drift.

### Claude Code prompt

```
Audit architectural drift between documentation, code, and schema.

PART A — Table name drift

Step 1 — For each vertical, query its Supabase project for actual
table names that contain listing data. Use information_schema.tables.

Step 2 — Compare against the table reference in CLAUDE.md and
06-technical-architecture.md:
| Vertical     | Doc says        | Schema has      | Status         |
|--------------|-----------------|-----------------|----------------|
| Small Batch  | venues          | ?               | ?              |
... etc

Step 3 — For mismatches, find every code reference to the wrong name
and produce a fix list. Don't fix yet; just enumerate.

PART B — Column name drift

Step 1 — Sample query: SELECT * FROM listings LIMIT 1 on the portal.
Capture the full column list.

Step 2 — Grep all docs (CLAUDE.md, 05-regions.md, 06-technical-
architecture.md, cross-vertical spec, pitch spec, way atlas spec,
01-04 atlas network docs) for column references on listings tables.

Step 3 — For each documented column, check whether it exists in the
actual schema. Report:
- DOCUMENTED_NOT_IN_SCHEMA (e.g. primary_type per memory)
- IN_SCHEMA_NOT_DOCUMENTED
- NAME_MISMATCH (e.g. primary_type/sub_type)

Step 4 — Repeat for each vertical's main entity table.

PART C — Code reference drift

Step 1 — Grep all repos for column name patterns. Build an index of
which columns each codebase references.

Step 2 — Cross-reference against actual schema. Any column referenced
in code but not present in schema is a latent bug (will trigger silent
failure if reached at runtime — see Section 6).

Step 3 — Pay special attention to:
- primary_type vs sub_type across all code
- region vs region_computed_id vs region_override_id
- cluster_id (the known bug)
- Any references to deprecated table or column names

PART D — Naming inconsistencies

Step 1 — Find places where the same concept has multiple names:
- "Culture Atlas" vs "Collection Atlas" (editorial vs domain)
- "Candidate Review" vs "Humanator" (current vs former)
- Any others

Step 2 — Recommend canonical names and produce a rename audit (where
each variant appears, and which should be updated).

Output for all four parts: a single consolidated drift register
listing every mismatch with severity.
```

### Severity rubric

- **Critical** — a documented column that doesn't exist and is referenced in production query paths (this is the `cluster_id` pattern)
- **High** — table name mismatches between docs and schema
- **Medium** — column name mismatches in non-critical paths
- **Low** — naming inconsistencies (Culture/Collection, Candidate Review/Humanator) — confusing but not breaking

---

## Section 6 — Silent-failure detection

### What it tests

The `cluster_id` bug, per memory: a SELECT references a non-existent column at line 95 of `app/place/[slug]/page.js`; a try/catch retry block bypasses the meta lookup and returns stripped data; ~65% of listings display generic vertical labels ("CULTURAL INSTITUTION") instead of actual sub_types ("Cinema").

This is a pattern, not an incident. The audit looks for other instances of the same anti-pattern: query code that catches schema errors and returns degraded data instead of failing loudly.

### Claude Code prompt

```
Audit for silent-failure query patterns matching the cluster_id bug.

The cluster_id bug pattern:
1. A SELECT references a column that no longer exists (or never did)
2. The query throws a Postgres error
3. A try/catch block catches the error
4. A retry path runs with reduced fields and succeeds
5. The page renders with degraded data
6. No error reaches logs at severity that would trigger alerts

Step 1 — Find all try/catch blocks in portal and vertical repos that
wrap Supabase queries. Specifically look for:
- try { supabase.from(...).select(...) } catch { ... }
- .catch() chains on Supabase queries
- Conditional retry logic after a query failure

Step 2 — For each, check the catch behaviour:
- LOGS_AND_THROWS — error is logged at error level AND re-thrown
  (acceptable, fails loudly)
- LOGS_AND_DEGRADES — error logged, but degraded fallback returned
  (this is the cluster_id pattern; flag)
- SILENT_DEGRADES — error not logged, degraded fallback returned
  (worst case; flag as Critical)
- NO_FALLBACK — error swallowed, null returned (flag for review)

Step 3 — For each LOGS_AND_DEGRADES and SILENT_DEGRADES instance:
- Capture the query
- Identify which columns it references
- Verify each column exists in the current schema
- If any column doesn't exist or has been renamed, this is an active
  silent failure right now — Critical

Step 4 — Specific known case: the cluster_id bug at
app/place/[slug]/page.js line 95 (or wherever it currently lives).
Verify it's still there. Report sub_type null rate to confirm scale
(~65% per memory).

Step 5 — Look for related patterns:
- Queries that use SELECT * and then access specific columns — these
  fail silently if columns are renamed
- Queries that destructure fields in JS/TS without null-checking — if
  a column is missing, downstream code may silently use undefined
- Queries with optional chaining (?.) on result fields — masks missing
  columns

Output: a catalogue of silent-failure sites with their query, the
columns they reference, whether those columns currently exist, and
severity.
```

### Severity rubric

- **Critical** — silent-failure pattern currently active in production (cluster_id is the example)
- **High** — silent-failure pattern dormant (no current schema mismatch, but the structural risk remains)
- **Medium** — degraded fallbacks with logging at warn level or higher
- **Low** — try/catch on queries that re-throw

---

## Section 7 — Way Atlas specific checks

### What it tests

Way Atlas is the newest vertical and the most likely to have been built without honouring the full architectural discipline. The spec inherits portal-as-SSOT (Section 2 of the Way Atlas spec) but specifies its own Supabase project, its own write paths via the Humanator extensions, and its own integration with portal cross-vertical infrastructure.

### Claude Code prompt

```
Audit Way Atlas specifically for SSOT compliance.

Step 1 — Confirm Way Atlas is live: domain reachable, listings
public, Supabase project exists.

Step 2 — Verify the operators table schema matches the spec
(Section IV of Way Atlas Specification). For each spec field, check
it exists in the schema with the correct type. Flag missing fields
and extra fields.

Step 3 — Verify the spatial model (Section V of spec):
- departure_point_lat/lng populated for all live listings
- primary_region_id populated and FK-valid against portal regions
  table
- operating_region_ids populated as an array
- multiple_departure_points flag handled correctly

Step 4 — Verify the cultural authority gate (Section VI of spec):
- Every cultural_tour listing has operator_type in
  (aboriginal_owned_led, aboriginal_partnership, aboriginal_community)
- No cultural_content_non_indigenous listings interpret Aboriginal
  cultural content (cross-check descriptions for keywords)

Step 5 — Verify integration with portal:
- Are Way Atlas operators present in portal.listings with
  vertical='way'?
- Does the portal map render Way pins?
- Does portal search return Way operators?
- Do regional landing pages include Way operators in
  operating_region_ids?

Step 6 — Verify auto-reject list compliance:
- known_experience_groups table exists and is populated per spec
  Section II
- No listing's operator matches any group_name or sub_brand in
  known_experience_groups (sample at least 20% of listings)

Step 7 — Verify calibration was completed:
- Was the 5/20/50 calibration ceremony run per spec Section X?
- Are the calibration records stored anywhere?
- If not, this is a significant process gap

Output: per-step pass/fail, with specific failures enumerated.
```

### Severity rubric

- **Critical** — any cultural authority gate failure (Gate 4); any auto-reject list miss; any cultural_content_non_indigenous listing on sacred/Country-specific content
- **High** — portal integration gaps (Way operators not searchable from portal); schema mismatches with spec
- **Medium** — calibration not documented; operating_region_ids unpopulated
- **Low** — extra fields beyond spec

---

## Section 8 — Top-level architectural finding (Finding-0)

### The finding

Way Atlas went live with its own Supabase project and its own write paths. The cross-vertical specification describes verticals-as-read-replicas as the Phase 3 end state — the moment "portal is the single write path" stops being a convention and becomes structurally enforced. That phase has not happened. Way going live without it means the architectural target has receded by one vertical, not advanced.

This is not a bug. The Way Atlas spec is internally consistent and the work that's been done is correct against that spec. The drift is at the level above: there are now two architectural targets in the documentation, and the network is operating against the older one.

### The two targets

**Current state (all ten verticals):** each vertical is an independent Supabase project. Portal syncs to verticals via downstream write paths. SSOT holds by convention — every contributor agreeing to write through the portal and not bypass it. Verifiable only by audit (this document).

**Phase 3 end state (cross-vertical spec):** vertical Supabase projects are read replicas over portal data. Vertical-side write paths don't exist; they're physically impossible. SSOT holds by structure. Verifiable by schema inspection (the absence of write capability).

### What needs deciding

The audit doesn't resolve this; it surfaces it. The decision is:

1. **Commit to Phase 3.** Treat the current state as transitional. The audit findings from Sections 1-7 become the punch list for getting to Phase 3, not for fixing individual violations in perpetuity. New verticals built between now and Phase 3 (none currently planned post-Way, but Front Bar Atlas is referenced as a future build) are built against the Phase 3 architecture so they don't need rework.

2. **Abandon Phase 3.** Acknowledge that ten independent Supabase projects is the actual architecture and Phase 3 is aspirational. Treat the audit findings from Sections 1-7 as ongoing operational discipline. Update CLAUDE.md and the cross-vertical spec to reflect that "portal is single write path" is a convention enforced by audit, not by architecture. Add a recurring audit cadence (quarterly?) to the operations rhythm.

3. **Defer the decision pending commercial test.** Both options have real costs. Phase 3 is a substantial engineering project that competes for time with the commercial backend rebuild (per memory, the dependency blocking outreach). Abandoning it requires updating multiple specs. A defensible third option is to acknowledge the tension, leave both specs in place, and revisit after the commercial test produces evidence about whether the platform is sustainable at all.

Option 3 is the path of least immediate cost. Option 1 is the path of least long-term cost. Option 2 is the honest one if Phase 3 isn't going to happen.

### What the audit can do

The audit can produce evidence to inform the choice. If Sections 1-7 return low violation rates across the board, the convention-based approach is working and Option 2 or 3 is defensible. If they return high violation rates, the convention has already failed and either Option 1 or a much stricter operational discipline is required.

---

## Prioritised fix list — template

The audit produces evidence; the fix list synthesises it. After running all sections, populate this template:

### Tier 1 — Critical, fix this week
- Active silent-failure patterns currently degrading user-visible data (e.g. `cluster_id` bug)
- Automation boundary violations (any agent writing to published article bodies)
- Cultural authority gate failures on Way Atlas
- Auto-reject list misses on Way Atlas

### Tier 2 — High, fix this month
- Documented column drift causing latent silent failures
- Vertical-side write paths to fields the portal also writes (race condition territory)
- Drift rates >10% on any vertical's canonical record integrity
- Way Atlas portal integration gaps

### Tier 3 — Medium, fix this quarter
- Documentation drift on column names and table names
- Vertical-side write paths to fields the portal doesn't touch (de facto field ownership; resolve before Phase 3 if Phase 3 is on)
- Implicit-discipline violations (featured, status, slug)
- Calibration documentation gaps

### Tier 4 — Low, fix opportunistically
- Naming inconsistencies (Culture/Collection, Candidate Review/Humanator)
- Orphaned code that could write but doesn't run
- Extra schema fields beyond spec

### Tier 0 — Strategic decision (Finding-0)
- Commit to Phase 3, abandon Phase 3, or defer pending commercial test

---

## Execution sequence

Run sections in this order. Each section's output feeds later sections:

1. Section 5 first (architectural drift). Without a current schema snapshot, every later section operates on potentially stale docs.
2. Section 6 next (silent-failure detection). High-value, surfaces active bugs.
3. Section 3 (automation boundary). Critical risk, fast check, narrow scope.
4. Section 1 (write-path discipline). Provides input for Section 2.
5. Section 2 (canonical record integrity). Confirms or refutes whether Section 1 violations are causing observable drift.
6. Section 4 (field-level write discipline). Builds on Sections 1, 2, 5.
7. Section 7 (Way Atlas specific). Standalone but informed by all previous sections.
8. Synthesise Finding-0 (Section 8) and produce the prioritised fix list.

Estimated time end-to-end with Claude Code access to all repos: one focused day. Plan to do it in one sitting so cross-references between sections stay fresh.

---

## What this audit deliberately doesn't do

- Doesn't propose fixes inline. Diagnostic only. The fix list is downstream.
- Doesn't test commercial backend integration. Per memory, this is unbuilt and untested; auditing it would produce noise.
- Doesn't audit the trail maker. Same reason.
- Doesn't audit performance, security, RLS policies, or auth. Those are separate audits.
- Doesn't audit editorial quality (voice compliance, banned phrases, description style). The description rewrite pipeline handles this.
- Doesn't replace the daily invariant checks specified in regions.md Phase 3 or cross-vertical spec Phase 3. Those are ongoing operational signals; this audit is a snapshot.
