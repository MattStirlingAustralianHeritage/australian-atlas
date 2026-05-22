# Fine Grounds Data Operations — 2026-05-22

Continuation of portal-as-SSOT audit (portal-ssot-audit-2026-05-21.md).

## Part A: Network-wide Hallucination Audit

Scanned all 10 verticals for hallucinated seed listings using fingerprint: bulk-insert on single date, `data_source='ai_generated'|'manually_curated'`, website URLs that don't resolve, descriptions with no verifiable facts.

| Vertical | Cohort Date | Cohort Size | Sampled | Fail Rate | Suspected |
|----------|-------------|-------------|---------|-----------|-----------|
| Fine Grounds | 2026-04-01 | ~40 | 20 | 68% | ~27 |
| Corner | 2026-04-01 | 87 | 20 | 50% | ~43 |
| Found | 2026-04-01 | 118 | 20 | 28% | ~33 |
| Small Batch | — | — | — | clean | 0 |
| Collected | — | — | — | clean | 0 |
| Field | — | — | — | clean | 0 |
| Table | post-reseed | 168 | 20 | 0% | 0 |
| Heritage | — | — | — | clean | 0 |
| Craft | — | — | — | clean | 0 |
| Made | — | — | — | clean | 0 |

**Total suspected: ~103** across 3 verticals.
Corner and Found are Tier 2 findings for separate sessions. Only Fine Grounds actioned this session.

## Part B: Fine Grounds Actions

### B.1 — HTTP-check unconfirmed site_unusable listings

Checked 4 listings marked `site_unusable` where the URL might still resolve:

| Slug | URL | HTTP | Verdict |
|------|-----|------|---------|
| barefoot-barista | barista.com.au | 200 | REAL — retained |
| north-beach-coffee | northbeachcoffee.com.au | 200 | REAL — retained |
| alice-springs-coffee | alicespringscoffee.com.au | 0 | Hallucinated — archived in B.2 |
| broome-coffee-co | broomecoffeeco.com.au | 0 | Hallucinated — archived in B.2 |

### B.2 — Archive hallucinated + NAY listings (n=28)

Set `status='hidden'`, `hidden_reason` populated for 28 listings:
- 27 hallucinated seed listings (fingerprint: generic name, non-resolving URL, invented descriptions)
- 1 NAY listing (huskee — product brand, not a venue)

Verification: 28/28 confirmed hidden. All 8 real venues confirmed still active.

### B.3 — Slug renames (n=2)

| Old Slug | New Slug | Reason |
|----------|----------|--------|
| noosa-coffee-roasters | noosa-coffee-roastery | Venue self-identifies as "Roastery" |
| margaret-river-roasters | margaret-river-roasting-co | Venue self-identifies as "Roasting Co" |

### B.4 — Re-push 3 real venues to vertical

These portal listings had stale `source_id` values pointing to deleted vertical rows. Re-pushed to FG vertical DB and updated portal source_ids.

| Venue | Target Table | New Vertical ID | Old source_id | New source_id |
|-------|-------------|-----------------|---------------|---------------|
| Seven Seeds Coffee Roasters | roasters | 210 | 134 | roaster_210 |
| Shenannigans | roasters | 211 | roaster_44 | roaster_211 |
| Shenannigans Cafe | cafes | 119 | cafe_40 | cafe_119 |

Round-trip verified: all 3 source_ids resolve back to correct vertical rows.

### B.5 — Import 7 vertical-only listings to portal

Listings that existed on FG vertical but not portal. Description flowed vertical→portal for initial creation only (explicit exception to Rule 4 — one-time inbound, not ongoing sync).

| Venue | Table | Vertical ID | Portal source_id |
|-------|-------|-------------|-----------------|
| Wolff Coffee Roasters | roasters | 18 | roaster_18 |
| Wolff Coffee Roasters Cafe | cafes | 8 | cafe_8 |
| Room 10 | cafes | 25 | cafe_25 |
| Hey Jupiter | cafes | 16 | cafe_16 |
| Someday Coffee Co | cafes | 35 | cafe_35 |
| Born in Brunswick | cafes | 38 | cafe_38 |
| Traveller | cafes | 21 | cafe_21 |

All 7 round-trip verified. Meta rows created with correct entity_type.

## Final Reconciliation

| Metric | Count |
|--------|-------|
| Portal FG active | 130 |
| Portal FG hidden | 29 |
| Portal FG total | 159 |
| Vertical roasters | 85 |
| Vertical cafes | 45 |
| Vertical total | 130 |
| **Portal active vs Vertical total** | **130 = 130 ✅** |

### Remaining data quality notes

- 49 portal listings have bare numeric source_ids (legacy, pre-prefix convention) — not actionable this session
- 1 listing (`black-star-coffee-roasters`) has `candidate-` prefix source_id
- 2 listings have valid prefixes but point to missing vertical rows: `barefoot-barista` (roaster_50), `north-beach-coffee-co-wollongong` (cafe_91) — venues are real but vertical rows were deleted in earlier cleanup
