# Way Atlas Integration Audit

**Date:** 2026-05-29
**Scope:** Integrate "Way" as the 10th vertical of the Australian Atlas Network behind an OFF-by-default go-live flag. "Reconcile and build the real gap" — wire every network surface to a single registry + flag source of truth so Way appears **nowhere** until the flag is flipped, and **everywhere correctly** once it is.

## Status: COMPLETE — production remains OFF

`WAY_ATLAS_PUBLIC` is unset in production, so Way is invisible on every public surface. Flipping it to `true` (Vercel env) surfaces all 18 active Way operators network-wide. **No code change is required to go live.**

## Feature flag (single source of truth)

`lib/verticalUrl.js`:

- `isVerticalPublic(vertical)` — `true` for `way` only when `process.env.WAY_ATLAS_PUBLIC === 'true'`; always `true` for the other 9 verticals.
- `getPublicVerticals()` — returns 9 vertical keys when the flag is OFF, 10 (incl. `way`) when ON.

`WAY_ATLAS_PUBLIC` is **server-only** (NOT a `NEXT_PUBLIC_*` var). Server components read it directly; client components receive the public-vertical list as a **prop**, never the raw flag. This keeps the flag and any Way data out of client bundles before go-live.

### Go-live procedure

1. Set `WAY_ATLAS_PUBLIC=true` in Vercel (Production) env.
2. Redeploy.
3. Verify the surfaces in the table below show Way and a count of **ten** atlases.

Roll back by unsetting the var and redeploying.

### Local flag-ON testing

Run the portal dev server with the env var set:

```
WAY_ATLAS_PUBLIC=true npm run dev -- -p 3010
```

(During this integration a temporary `atlas-dev-wayon` entry in `.claude/launch.json` provided a one-click flag-ON server; it has been removed as a cleanup step. Re-add a config with `"env": { "WAY_ATLAS_PUBLIC": "true" }` if you want it back.)

## Data state (verified against production master DB, 2026-05-29)

- **18 active Way operators** in `listings` (`vertical = 'way'`, `status = 'active'`).
- All 18 are `data_source = 'manually_curated'`.
- 0 rows with `needs_review = true` (none would 404 on a detail page).
- 0 ZZTEST / synthetic rows remain.
- **Count correction:** an earlier session estimated "13". The real active set grew incrementally to **18** between 2026-05-22 and 2026-05-28; all additions are legitimate manually-curated operators.
- Way operators live in the shared `listings` table (`vertical + source_id` unique). **No Way columns were added to `listings`, and no duplicate Way tables were created** — per scope constraint.

## Surfaces wired (all flag-gated)

| Surface | File(s) | Flag OFF | Flag ON |
|---|---|---|---|
| Homepage count / chips / stats | `app/page.js` (+ children) | "Nine" / 9, no Way chip | "Ten" / 10, Way chip |
| Map chips / legend / markers + API | map components + map API route | no Way chip or markers; API filters Way out server-side | Way chip + markers + popups |
| Search | search route / UI | Way excluded; Way keywords inert | Way included; keywords active |
| Explore grid / `VerticalBadge` / vertical-features | explore page + components | no Way category or badge | Way category + badge |
| Regional pages | `app/regions/[slug]/page.js` | no Way section | Way "based vs runs" experiences section |
| Footer | `components/Footer.js` | "Nine atlases, one map."; no Way link | "Ten atlases…"; Way link → wayatlas.com.au |
| `/network` | `app/network/page.js` | "nine" / 9; Way absent from counts + feed | "ten" / 10; Way count + feed entries |
| `/atlas-index` | `app/atlas-index/page.js` + `IndexClient.js` | no Way chip; Way rows excluded | Way chip + Way rows |

### No-leak boundary pattern

Every server query that reads `listings` for a public surface now includes `.in('vertical', getPublicVerticals())`, so a Way row cannot leak via enumeration before go-live. This was the key fix for `/network` and `/atlas-index` (see below).

## Pre-launch leaks found & fixed

Two network-wide enumeration surfaces were querying `listings` **without** a vertical filter, so they would have surfaced Way operators (count + names + links) even with the flag OFF:

- **`/network`** — the total / claimed / recent / added-this-week queries and the per-vertical breakdown enumerated all verticals. Fixed with `.in('vertical', publicVerticals)` on every query + a dynamic atlas-count word.
- **`/atlas-index`** — the paginated A–Z `listings` fetch enumerated all active rows. Fixed with `.in('vertical', publicVerticals)` inside the cached fetch + a flag-gated Way chip.

Both fixed in commit `156a88e`. The React `cache()` dedup was preserved by calling `getPublicVerticals()` **inside** the zero-arg cached fetch, so `generateMetadata` and the page share one query.

## End-to-end verification (synthetic, 2026-05-29)

Per explicit user request, one ZZTEST synthetic Way listing was inserted into the production master DB to exercise the full create → surface → teardown path:

- **Insert:** `listings` row — name `ZZTEST Way E2E 1780033084107`, slug `zztest-way-e2e-1780033084107`, `vertical=way`, `status=active`, `data_source=manually_curated`, `needs_review=false`. Active Way count 18 → 19.
- **Flag ON** (local, port 3010): appeared on `/network` (Way count 19 + recent feed) and `/atlas-index` (Way chip + name + slug link). ✅
- **Flag OFF** (local, port 64621): completely absent from `/network` (the Way vertical was not rendered at all) and `/atlas-index` (no chip, no row). ✅
- **Teardown:** row deleted by explicit id; deletion logged; active Way count restored to 18; 0 ZZTEST rows remain. Post-teardown flag-ON surfaces re-confirmed Way = 18. ✅

Deletion log:

```
DELETED -> table=listings | id=54d0cc0f-ecbf-416c-956f-497c82eb1b85 | name="ZZTEST Way E2E 1780033084107" | slug="zztest-way-e2e-1780033084107" | vertical=way | status=active
```

## Known gaps / deferred (flag for decision)

1. **Place detail links point to wayatlas.com.au regardless of flag.** The portal has no detail pages of its own — cards link to each vertical's canonical URL (per CLAUDE.md: "Portal does NOT have its own detail pages"). A Way canonical link is therefore reachable by **direct URL** even with the flag OFF; only **enumeration** (lists, counts, search) is gated. If the enumeration-vs-direct-URL distinction matters before go-live, the canonical-link passthrough must also be gated. **Decision needed.**
2. **Multi-base map treatment deferred.** Way operators may run experiences across multiple regions; the map currently treats each operator as a single point. A multi-base / service-area treatment was scoped out.
3. **Way not on the region map hero.** Region hero maps were not extended to plot Way operators.
4. **"Based" keys off `primary_region_id`, not a spatial `region_id`.** Regional Way membership uses the operator's primary region, not a spatial join — intentional given the operator/region data model.

## Constraints honoured

- Flag defaults OFF; production left OFF.
- No Way columns added to `listings`; no duplicate Way tables.
- Concurrent uncommitted WIP not touched (a separate process was editing the repo throughout this work — see commit note).
- Synthetic test data ZZTEST-prefixed and torn down with deletions logged; no unlogged row deletions; no columns or tables dropped.
- Article body protection respected (no writes to `articles`).
- Secret files never read with content-printing commands; `run-migrations.mjs` untouched.

## CLAUDE.md conflicts encountered

None that required guessing. The "Portal does NOT have its own detail pages" convention is the basis for gap #1, which is flagged for a decision rather than resolved unilaterally.

## Commits (all on `main`, `way:` prefix, currently unpushed)

```
89c8394  way: add go-live gate flag as registry SSOT in verticalUrl                       (flag SSOT)
c22e4e7  way: derive homepage atlas count + listing total from public registry            (homepage)
00634d7  way: derive map chips/legend from public registry + filter map API server-side   (map)
7410f59  way: filter search by public registry + gate Way keywords behind flag            (search)
d7e7fb7  way: gate explore category grid by flag + add Way to badge/features maps          (explore/badge)
45017f3  way: add regional based-vs-runs experiences section behind flag                  (regional)
156a88e  way: gate /network and /atlas-index by public registry                           (leak fix)
986e40e  way: derive footer atlas count + Way network link from public registry           (footer)
```

Notes:

- `156a88e` initially landed on the concurrent `repair/claim-flow-foundation` branch (a concurrent process switched branches mid-session). It was moved onto `main` via a branch-pointer fast-forward — no checkout, no working-tree disturbance — per user direction.
- `986e40e` also incidentally carries a one-line `/plan` "Plan a trip" Explore link added by the concurrent process; committed as-is per user direction.
