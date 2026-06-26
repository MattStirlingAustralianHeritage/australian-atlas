# Region-field address cleanup — small-batch-atlas (nyhkcmvhwbydsqsyvizs)

**Date:** 2026-06-26  ·  **Type:** data fix (no migration)  ·  **Table:** `public.listings.region`

## Problem
~490 rows held an **address** in `listings.region` instead of a region name
(e.g. `"1 Goldie Street Wynyard, Tasmania"`, `"29 Hampden Rd"`). Surfaced while fixing
`jackman-mcross → "Hobart City"`. The `region` TEXT column is free-text (siblings store
town/region names) and is read directly by `recompute_taste_profile()` for `regionWeights`.

**Scope (high-confidence subset):** `region ~ ','` OR `region ~ '^[[:space:]]*[0-9]'`
= **489 rows**. Street-token-only hits were excluded (many legit, e.g. "Great Ocean Road").

## Method
Three-stage derivation, never hard-delete, guarded batches inside transactions, fail-loud
(any row-count mismatch → ROLLBACK; idempotency-guarded so a re-run can't double-apply).

- **Tier 1 — live spatial join (443 rows).** Region = `regions.name` of the **smallest-area
  live polygon** containing the listing point (`ST_Contains`, order by `ST_Area` asc).
  This exactly reproduces `region_computed_id` restricted to `status='live'` (verified:
  all 430 rows that already had a live `region_computed_id` agreed with this join, 0
  disagreements once ordered smallest-wins — matches the app's `region_override_id ??
  region_computed_id` display and the `listings_recompute_region` BEFORE trigger).
  Applied in **55 per-region batches**.

- **Tier 2 — address locality (32 rows).** These fall in **no live region**, and many are
  **geocode-broken** (e.g. `"Lime Kiln Rd, ACT"` pinned in SA; `"8 Regatta Ave Ballina"`
  pinned at Forster; `"21 Station St, Samford"` pinned at Currumbin). So nearest-sibling
  alone would inject wrong data. Region was taken from the **locality explicitly named in
  the human-entered `address`** (geocode-independent) — e.g. `Muswellbrook`, `Ballina`,
  `Slacks Creek`, `Adelaide Hills`, `Broome`. `Katherine` used a tight 0.37 km sibling.

- **Tier 3 — best-judgment / null (14 rows).** The remaining 14 (no explicit locality
  and/or broken geocode) were resolved by best-judgment using AU geography:
  - **12 set** from an identifiable place: `New Farm → Brisbane`, `Young`, `Morpeth →
    Hunter Valley`, `Sea World → Gold Coast`, `Glen Davis`, `Seal Rocks`, `Bombah Point`,
    `Kempsey`, `Tallebudgera Valley`, `Coomera → Gold Coast`, `Lime Kiln Rd → Canberra
    District` (state-based), `Tasman Hwy → East Coast`.
  - **2 set to NULL** (genuinely undeterminable, no matching region; full address preserved
    in the `address` column, and NULL is excluded from `regionWeights`):
    `32 Bean Ln` (Hartley/Lithgow), `60 Smith St` (Redlands bayside).

## Result
| Stage | rows | how |
|---|---|---|
| Tier 1 (live spatial → canonical region) | 443 | smallest live polygon |
| Tier 2 (address locality) | 32 | locality from `address` |
| Tier 3 (best-judgment) | 12 | identifiable place |
| Tier 3 (null) | 2 | undeterminable |
| **Resolved total** | **489** | |
| Remaining malformed | **0** | |

Listings table row count unchanged (7079) — **no deletes**. Malformed-predicate matches now = **0**.

### Taste profiles
`repair_all_taste_profiles()` re-run after each stage → 2 profiles recomputed, verified
**1024-dim, L2 norm = 1.000000**, `regionWeights` clean (no address-like keys). Neither
profile (stirling.mattski `828bdf2c`, ros.stirling `fa4ff8e4`) had any save/trail-stop
among the 489 malformed listings, so the region fix did not alter their weights — health
re-verified per instruction. (`stirling.mattski`'s source count grew during the session
from unrelated concurrent save activity; weights remained address-free throughout.)

## Artifacts
- `region-address-fix-changes-2026-06-26.csv` — all 489 old→new + disposition
- `region-address-fix-rollback-2026-06-26.sql` — restores original `region` for all 489 by id
- Scripts + intermediate JSON: `australian-atlas/.region-fix/`
- Committed copy: `docs/audits/region-address-fix-2026-06-26/` on branch `chore/region-address-fix-2026-06-26`
