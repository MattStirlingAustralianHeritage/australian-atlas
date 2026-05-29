# Way Atlas Integration Audit

**Date:** 2026-05-29
**Author:** integration session (Claude), grounded read-only against the production master DB + migration/source code.
**Scope:** Integrate "Way" as the 10th vertical of the Australian Atlas Network behind an OFF-by-default go-live flag — "reconcile and build the real gap." Wire every network surface to a single registry + flag source of truth so Way appears nowhere via enumeration until the flag is flipped, and everywhere correctly once it is.

---

## 0. TL;DR — go-live recommendation

**Do NOT flip `WAY_ATLAS_PUBLIC` to `true` yet.** The enumeration leak fix is built, deployed, and verified in production, and the flag is confirmed OFF. But three things must clear first:

1. **An open, confirmed pre-go-live leak:** the portal's own detail page `/place/[slug]` is **not** flag-gated. All 18 Way operators are fully rendered and reachable **right now** by direct URL on `www.australianatlas.com.au` (verified live, HTTP 200). Enumeration is gated; direct-URL is not. The scope guarantee "Way appears nowhere until the flag is flipped" therefore holds for lists/counts/search/map but is **false for direct detail-page URLs**. **Decision needed** (gate `/place` by the public registry, or accept direct-URL exposure).
2. **The two editorial safety gates (Gate 1 independence, Gate 4 cultural authority) are UNVERIFIED in production** and Gate 4's DB backstop has a **real born-active insert bypass** (Section 8). No cultural_tour or Aboriginal-led operator exists yet, so neither gate has ever fired — the moment one is onboarded, the gate behaviour is load-bearing and currently unproven.
3. **The editorial calibration ceremony has not run**, and 5 operators are orphaned (listing row present, `way_meta` missing).

Items 2 and 3 are not blockers for *enumeration* go-live of the current clean set, but they are blockers for onboarding any cultural / Aboriginal-led operator and for trusting the automated discovery pipeline. Item 1 is a live exposure decision for Matt now.

**Production today:** `WAY_ATLAS_PUBLIC` is unset in Vercel → Way is invisible on every *enumeration* surface. No code change is required to go live on enumeration; flipping the flag surfaces all 18 operators network-wide.

---

## 1. Corrected premise — the build prompt was wrong on essentially every point

The original master build prompt framed Way as largely absent and to-be-built. Reality (verified this session):

| Prompt premise | Reality (verified 2026-05-29) |
|---|---|
| Way is absent / ~0 operators to ingest | Way is **~70% pre-built**: extension table, discovery pipeline, 4 gates, candidate/review tooling, an atomic approval RPC, and **18 live operators** all already existed. |
| ~13 operators | **18 active** operators (the "13" was a stale count; the set grew 22–28 May). |
| Add Way fields as columns on `listings` | Way fields live in the **`way_meta` extension table** (`{vertical}_meta` pattern, CLAUDE.md). **No Way columns were added to `listings`; no duplicate Way tables created.** |
| `known_experience_groups` is a new reference table to build | It already exists as **`commercial_groups`** (seeded 2026-04-30), with a `vertical_scope` column and 10 Way-scoped groups incl. **Voyages (case-by-case)**. I did **not** create a duplicate. |
| Vocabulary enforced via reference tables | Vocabulary is enforced via **Postgres `CHECK` constraints** (`way_meta.primary_type`/`operator_type`/`presence_type`) **+ JS label maps** (`lib/wayLabels.js`). No reference tables. |
| Portal has no detail pages (cards deep-link to verticals) | **False / stale.** The portal has had its own native detail page `/place/[slug]` since Phase 2 (April 2026); CLAUDE.md now says so explicitly. This page renders Way operators (see the leak, Section 5). |

### Instructions I correctly did NOT follow because CLAUDE.md / as-built reality won

- Did **not** add Way columns to `listings` (used `way_meta`).
- Did **not** create a `known_experience_groups` reference table (used existing `commercial_groups`).
- Did **not** create vocabulary reference tables (CHECK constraints + label maps already enforce vocab).
- Did **not** rebuild the discovery pipeline / gates / candidate tooling / RPC that already existed.
- Did **not** rely on the prompt's "no portal detail pages" assumption (it is false; the prior audit's gap #1 inherited this error — corrected in Section 11).
- Honoured the standing flag default (OFF) and left production OFF.

---

## 2. Feature flag (single source of truth)

`lib/verticalUrl.js`:

- `VERTICAL_URLS` carries all 10 verticals; `way` has `public: false`.
- `isVerticalPublic(vertical)` — `true` for `way` only when `process.env.WAY_ATLAS_PUBLIC === 'true'`; always `true` for the other 9.
- `getPublicVerticals()` — returns 9 vertical keys when the flag is OFF, 10 (incl. `way`) when ON.

`WAY_ATLAS_PUBLIC` is **server-only** (NOT a `NEXT_PUBLIC_*` var). Server components read it directly; client components receive the public-vertical list as a **prop**, never the raw flag. This keeps the flag and any Way data out of client bundles before go-live.

### Go-live procedure

1. Resolve the Section 0 blockers (at minimum the `/place` leak decision).
2. Set `WAY_ATLAS_PUBLIC=true` in Vercel (Production) env. Redeploy.
3. Verify the surfaces in Section 7 show Way and a count of **ten** atlases.

Roll back by unsetting the var and redeploying.

### Local flag-ON testing

```
WAY_ATLAS_PUBLIC=true npm run dev -- -p 3010
```

---

## 3. Live data reality (verified read-only against production master DB, 2026-05-29)

- **18 active Way operators** in `listings` (`vertical='way'`, `status='active'`). No non-active Way rows exist (`{active: 18}`).
- All 18 are `data_source='manually_curated'`, all `needs_review=false` (none would 404 on a detail page). 0 ZZTEST/synthetic rows.
- Created incrementally **2026-05-22 → 2026-05-28** (8 on 05-22, then 05-23×1, 05-24×5, 05-25×1, 05-27×1, 05-28×2).
- **`way_meta` coverage: 13 of 18.** The 5 without a `way_meta` row are the **orphans** (Section 4).
- **`primary_type` (of the 13 with meta):** sailing_charter ×4, river_canoe_tour ×3, specialist_natural_history ×2, four_wheel_drive_expedition ×1, scenic_flight ×1, guided_walk_multiday ×1, dive_operator ×1.
- **`operator_type`:** **10 `independent` + 3 `cultural_content_non_indigenous`.** (Correction to the earlier "all clean independents": 3 are non-Indigenous cultural-content operators — but all have a non-`cultural_tour` `primary_type`, so Gate 4, which fires only for `cultural_tour`, does not apply to any current operator.)
- **Zero `cultural_tour` operators; zero Aboriginal-led operators.** The `cultural_authority_review` queue is **empty** (count 0).
- **No leak of test data:** the 2026-05-29 synthetic ZZTEST E2E row was inserted, used to exercise flag ON/OFF on `/network` and `/atlas-index`, then deleted by id with the deletion logged; active Way count restored to 18.

**Why the gates have never fired:** the discovery-pipeline gates (Gate 1/Gate 4 JS) run only on `way_candidates` flowing through discovery → review. **All 18 live operators are `manually_curated` and were inserted directly, bypassing the candidate pipeline** — so Gate 1 and pipeline-Gate-4 have *never executed* against production data. And with zero `cultural_tour` operators, the Gate 4 DB backstop has had no row to act on. This is exactly why both gates are **UNVERIFIED** (Section 8).

---

## 4. The 5 orphaned operators (listing row present, `way_meta` missing)

All five were created in the earliest batch (2026-05-22), predating the atomic approval RPC (migration `133`) that eliminated the partial-write failure mode it documents as "stranded Way listings (listings row present, way_meta empty)":

1. **Calypso Star Charters** (`calypso-star-charters`)
2. **Cape Byron Kayaks** (`cape-byron-kayaks`)
3. **Cape to Cape Explorer Tours** (`cape-to-cape-explorer-tours`)
4. **Cape Tribulation Horse Rides** (`cape-tribulation-horse-rides`)
5. **ISail Whitsundays** (`isail-whitsundays`)

**Impact:** with the flag ON, these 5 still appear on enumeration surfaces (they are active `listings` rows), and their `/place` pages render the core listing — but **without** the "About this operator" Way section (which is driven by `way_meta`). They are also the 5 not synced to wayatlas.com.au (18 live vs 13 synced). A backfill exists (`scripts/backfill-way-stranded.mjs`); these 5 should be backfilled (or have their `way_meta` authored) before go-live so they aren't half-rendered. **Not** a leak risk; a completeness/quality gap.

---

## 5. The live leak(s) and the deployed fix

### 5a. Enumeration leak — FOUND, FIXED, DEPLOYED, VERIFIED ✅

Two network-wide enumeration surfaces queried `listings` **without** a vertical filter, so they surfaced Way operators (count + names + links) even with the flag OFF:

- **`/network`** — totals / claimed / recent / added-this-week + per-vertical breakdown enumerated all verticals.
- **`/atlas-index`** — the paginated A–Z `listings` fetch enumerated all active rows.

Both fixed (commit `156a88e`) with `.in('vertical', getPublicVerticals())` on every server query + a dynamic atlas-count word. The React `cache()` dedup was preserved by calling `getPublicVerticals()` **inside** the zero-arg cached fetch.

**Production verification (2026-05-29, against the deployed domain `www.australianatlas.com.au`, flag OFF):**

- `/atlas-index` → HTTP 200; "Way Atlas" 0, "wayatlas.com.au" 0, "Untamed Escapes" 0, "Diversity Charters" 0.
- `/network` → HTTP 200; "Nine atlases" present, "Ten atlases" 0, Way count/feed absent.
- Footer → "Nine atlases, one map." with no Way link.
- `/plan` → HTTP 200 (no 404 — see Section 12 caveat).
- `vercel env ls` → only `WAY_SUPABASE_URL` + `WAY_SUPABASE_SERVICE_KEY` (source-DB creds). **`WAY_ATLAS_PUBLIC` is NOT set → flag OFF in production confirmed.**
- Latest Production deploy ● Ready, holding both `www` and apex aliases (apex 307-redirects to `www`).

### 5b. Direct-URL leak via `/place/[slug]` — OPEN, CONFIRMED LIVE ⚠️ (decision needed)

The portal's **own** detail page `app/place/[slug]/page.js` fetches a listing by slug + `status='active'` with **no** `getPublicVerticals()`/vertical filter (`getListing()`, lines ~99–110), and renders a dedicated **"About this operator (Way Atlas only)"** section from `way_meta` (lines ~716–776). It is not flag-gated.

**Verified live on production with the flag OFF:**

- `https://www.australianatlas.com.au/place/untamed-escapes` → **HTTP 200, ~90 KB**, fully renders the operator name, description, "About this operator", "Operating regions", "Eyre Peninsula", and the claim CTA.
- `https://www.australianatlas.com.au/place/calypso-star-charters` (an orphan) → **HTTP 200, ~64 KB**, renders the listing (no Way meta section).

So **all 18 Way operators are individually reachable and fully rendered by direct URL today**, and the page emits canonical + OpenGraph + JSON-LD (indexable if discovered). Slugs are shared with wayatlas.com.au, so they are guessable/known.

**This is the single most important pre-go-live finding.** It was missed previously because the prior audit inherited the false "portal has no detail pages" premise. **Fix (when approved):** gate `getListing()` (or the page) by `getPublicVerticals()` — return `notFound()` for a vertical not in the public set. **Not fixed in this session** per the explicit stop point and stop-for-sign-off discipline; surfaced here for Matt's decision.

### No-leak boundary pattern (enumeration)

Every server query that reads `listings` for a public *enumeration* surface now includes `.in('vertical', getPublicVerticals())`. `/place/[slug]` is the one public read that does **not** yet apply it (5b).

---

## 6. What was built / wired

| Surface | File(s) | Flag OFF | Flag ON |
|---|---|---|---|
| Flag SSOT | `lib/verticalUrl.js` | `way.public=false`; `isVerticalPublic('way')=false` | `WAY_ATLAS_PUBLIC=true` → `isVerticalPublic('way')=true` |
| Homepage count / chips / stats | `app/page.js` (+ children) | "Nine" / 9, no Way chip | "Ten" / 10, Way chip |
| Map chips / legend / markers + API | map components + map API route | no Way chip/markers; API filters Way out server-side | Way chip + markers + popups |
| Search | search route / UI | Way excluded; Way keywords inert | Way included; keywords active |
| Explore grid / `VerticalBadge` / vertical-features | explore page + components | no Way category or badge | Way category + badge |
| Regional pages | `app/regions/[slug]/page.js` | no Way section | Way "based vs runs" experiences section |
| Footer | `components/Footer.js` | "Nine atlases, one map."; no Way link | "Ten atlases…"; Way link → wayatlas.com.au |
| `/network` | `app/network/page.js` | "nine" / 9; Way absent | "ten" / 10; Way count + feed |
| `/atlas-index` | `app/atlas-index/page.js` + `IndexClient.js` | no Way chip; Way rows excluded | Way chip + Way rows |
| `/place/[slug]` detail | `app/place/[slug]/page.js` | **NOT gated — Way renders (5b)** | Way renders |

### The regional "crux" — `way_meta.primary_region_id` / `operating_region_ids`, not `listings.region_id`

Regional Way membership keys off `way_meta.operating_region_ids` (array) and `primary_region_id`, **not** `listings.region_id` / the spatial `region_computed_id` — because offshore / multi-region operators have a NULL spatial region. This is what lets an operator appear on **every** region it runs in, with "based in" vs "runs experiences here" framing (Spec Section V).

**Grounded example — Untamed Escapes:** `primary_region_id` = **Eyre Peninsula** (based), `operating_region_ids` = **Eyre Peninsula, Margaret River, Kangaroo Island, Flinders Ranges, Adelaide Hills** (runs). It therefore surfaces on 5 region pages — including Margaret River in WA (cross-state) — with the based-vs-runs distinction. A spatial-only join would have placed it in one region (or none).

### Latent `sba` fallback

During the wiring the surfaces were moved off hardcoded nine-item vertical lists onto `getPublicVerticals()`, removing the class of bug where Way could be mis-bucketed by a default. Remaining `|| 'sba'` literals (e.g. `app/explore/page.js` article-vertical labeling, admin candidate defaults, `app/api/itinerary` intent mapping) are **display-only fallbacks for a missing vertical**, not flag/enumeration leak vectors.

---

## 7. Flag-gating verification (OFF / ON)

- **Enumeration surfaces:** verified OFF in production (Section 5a) and ON locally during the build + the 2026-05-29 ZZTEST E2E run (a synthetic Way row appeared on `/network` + `/atlas-index` with the flag ON, was completely absent with the flag OFF, then was torn down with the deletion logged).
- **`/place/[slug]`:** verified **NOT** gated — renders Way with the flag OFF in production (Section 5b).

---

## 8. Editorial safety gates — UNVERIFIED (and one real hole)

There are two enforcement layers. Neither has executed against production Way data.

### Layer A — discovery pipeline (JS, candidate scoring)

- **Gate 1 — Independence** (`lib/prospector/way-discovery/gate-1-independence.js`): binary pass/fail; matches a candidate's name variants / brands / website domain against `commercial_groups` where `vertical_scope @> {way}` **or** `vertical_scope IS NULL` (global). A `verify_case_by_case=true` group yields a **review flag, not a hard auto-reject** — this is the **Voyages** mechanism (Voyages Indigenous Tourism Australia is seeded with `verify_case_by_case=true`).
- **Gate 4 — Cultural authority** (`lib/prospector/way-discovery/gate-4-cultural.js`): fires per experience where `experience_type='cultural_tour'`. `aboriginal_owned_led`/`aboriginal_community` auto-pass; `cultural_content_non_indigenous` auto-fails Aboriginal cultural content; `aboriginal_partnership`/other require named cultural-authority signals. **Note a spec-vs-as-built nuance:** the JS treats Gate 4 failure as **per-experience** (an operator with other backable experiences still surfaces — "mixed"), **not** an operator-level "automatic NAY" as the spec text states.

**These run only on `way_candidates`.** All 18 live operators are `manually_curated` direct inserts that never traversed the candidate pipeline → **Gate 1 and pipeline-Gate-4 have never run in production.** A `commercial_groups` snapshot: 53 total groups, **10 Way-explicit** (SeaLink, G Adventures, Intrepid, Discovery/G'day, AAT Kings/TTC, Beckons/Baillie, Experience Co, **Voyages — case-by-case**, Journey Beyond, APT) + 37 global.

### Layer B — DB publication backstop (SQL triggers)

- `116_cultural_authority_review.sql`: a `way_meta` **queue trigger** (`AFTER INSERT OR UPDATE OF primary_type, cultural_authority_verified`) that, for an unverified `cultural_tour`, **inserts a `pending` row into `cultural_authority_review`** — and a resolution trigger that flips `way_meta.cultural_authority_verified` on review. The queue trigger **only enqueues; it does not block or demote the listing.**
- `118_way_cultural_authority_gate.sql`: two triggers on `listings`:
  - **UPDATE** (`BEFORE UPDATE OF status`): blocks promotion of a `cultural_tour` to `active` unless verified — but only when `old.status <> 'active'` (a genuine promotion).
  - **INSERT** (`BEFORE INSERT`): **permissive when `way_meta` is absent at insert time** (lines ~108–120), deferring enforcement to "a subsequent status transition."

### The real hole (correcting the prior "UPDATE-only" suspicion)

The earlier suspicion was "Gate 4's trigger guards the UPDATE path only." **More precise:** there *is* an INSERT trigger, but it has a deliberate **`way_meta`-absent escape hatch**. Combined with the documented/normal write order — **insert the listing `status='active'` first, the `way_meta` row second** (exactly what `approve_way_candidate` (migration `133`) does, and what `mapWayListing()`/`mapWayMeta()` do per `115`) — a born-active `cultural_tour` with `cultural_authority_verified=false` is:

1. INSERTed into `listings` active → INSERT trigger sees no `way_meta` yet → **passes**.
2. `way_meta` INSERTed (`cultural_tour`, unverified) → queue trigger **enqueues a pending review** but **does not block/demote**.

Result: **the listing is live and public with only a pending review.** The UPDATE gate never fires (no promotion transition — the row was born active). A secondary edge: if an already-active `cultural_tour` is later **rejected**, `way_meta.cultural_authority_verified` flips false but the listing **stays active** until some later status update (which may never come).

This is latent today (0 `cultural_tour` operators) but **load-bearing the instant an Aboriginal-led / cultural operator is onboarded.** Per Spec Section VI ("no exceptions, no soft-launches, no 'we'll verify later'"), this must be closed before any `cultural_tour` goes live.

### Minimal test spec for a later clean window

Run with a **single agent against a quiet DB**, throwaway **ZZTEST**-prefixed rows, deletions logged:

- **Gate 1:** insert a candidate matching a `commercial_groups` entry (e.g. an Intrepid/G Adventures brand) through the candidate path → expect a **fail/auto-reject**; insert a **Voyages**-matching candidate → expect a **case-by-case review flag, not a hard reject**.
- **Gate 4 — both paths:** attempt a `cultural_tour` with `operator_type` ∉ `aboriginal_*`:
  - **UPDATE path:** create it non-active, then promote to `active` → expect the `118` UPDATE trigger to **block**.
  - **INSERT path (the suspected hole):** insert `listings` `status='active'` then `way_meta` (`cultural_tour`, unverified), normal order → expect it to **slip through to active** with only a pending `cultural_authority_review` row. **Record the outcome** to confirm/deny the bypass behaviourally.

---

## 9. Known gaps / deferred (flag for decision)

1. **`/place/[slug]` direct-URL leak — OPEN (Section 5b).** Highest priority. Decision: gate by `getPublicVerticals()` or accept direct-URL exposure.
2. **Editorial gates UNVERIFIED + Gate 4 born-active insert hole (Section 8).** Resolve before any cultural_tour / Aboriginal-led operator.
3. **5 orphaned operators (Section 4).** Backfill `way_meta` (or author it) before go-live so they aren't half-rendered.
4. **Editorial calibration ceremony not run.** The discovery pipeline / gates have not been calibrated against a curated decision set. Do this before trusting automated discovery for Way.
5. **Multi-base map treatment deferred.** Operators are plotted as a single point; a multi-base / service-area treatment was scoped out.
6. **Way not on the region map hero.** Region hero maps were not extended to plot Way operators.
7. **wayatlas Phase-3 read-replica migration deferred.** Way data continues to arrive via manual curation / source-DB creds, not the planned read-replica sync.
8. **Cross-vertical Way relationships** (e.g. a Way operator related to a Rest/Table venue) not modelled.
9. **Way candidate "experiences" secondary table** (`way_candidate_experiences`) populated only in the discovery path; manual operators have no experience breakdown.

---

## 10. Risks + recommendation

- **Recommendation:** Way must **not** go public until (a) the `/place` direct-URL leak decision is made and implemented if gating is wanted, (b) the gate write-path behaviour is verified and the Gate 4 born-active hole is resolved, and (c) the editorial calibration ceremony has run. The 5 orphans should be backfilled regardless.
- **Lower-risk partial go-live** (if Matt wants the clean set visible sooner): the **current 18 are all `independent`/`cultural_content_non_indigenous`, zero `cultural_tour`** — so Gate 4 is not yet exercised by live data. Enumeration go-live of this set is comparatively low-risk *provided* the `/place` leak is accepted or fixed and the orphans are backfilled. But onboarding any cultural / Aboriginal-led operator after that is gated on Section 8.
- **Data-integrity risk if the gate hole is left open:** an unverified `cultural_tour` could be published by the normal write order without ever being blocked — a direct violation of Spec Section VI.

---

## 11. Documentation reconciliation (stale docs to fix)

- **CLAUDE.md / prior audit "portal has no detail pages":** **false.** `/place/[slug]` exists (Phase 2, April 2026) and renders Way. The prior `way-atlas-integration-audit.md` gap #1 ("place detail links point to wayatlas.com.au … portal does NOT have its own detail pages") both mis-described the architecture and missed the real `/place` leak. Corrected here (Section 5b).
- **"~13 Way operators" / "all clean independents":** stale — **18 active**, of which **10 independent + 3 cultural_content_non_indigenous** (Section 3).
- **`known_experience_groups`:** the real table is **`commercial_groups`** (with `vertical_scope`, `verify_case_by_case`, `brands_json`). Any doc/spec referring to `known_experience_groups` as a separate artifact should point to `commercial_groups`.
- **Spec Section VI "Gate 4 = automatic NAY":** the as-built JS pipeline implements **per-experience** Gate 4 ("mixed" operators still surface), not an operator-level automatic NAY. Reconcile spec vs as-built.
- **Vertical-definition / SSOT docs:** should note the go-live SSOT now lives in `lib/verticalUrl.js` (`public` flag + `isVerticalPublic` + `getPublicVerticals`), and that `WAY_ATLAS_PUBLIC` is server-only.

---

## 12. Constraints honoured

- Flag defaults OFF; production left OFF (`WAY_ATLAS_PUBLIC` unset in Vercel, verified).
- No Way columns added to `listings`; no duplicate Way tables; used `way_meta` + existing `commercial_groups`.
- Concurrent uncommitted WIP not touched: a separate process was editing the repo throughout (the working tree is checked out on `repair/claim-flow-foundation` with modified `ListingEditor.js` / `wayLabels.js` / a seed script, untracked `_probe_*.mjs`, and a new untracked `139_way_meta_marine_touring.sql`). All commits in this work were made with a **throwaway-index surgical commit to `main`** (no checkout, real index untouched), so the concurrent branch and WIP were never disturbed.
- This session's DB work was **read-only** (no synthetic writes against the churning production master DB, per instruction). The recon was a temporary read-only script, run then deleted.
- Synthetic test data (prior session) ZZTEST-prefixed and torn down; deletion logged; no unlogged deletions; no dropped columns/tables.
- Article body protection respected; secret files never read with content-printing commands; `run-migrations.mjs` untouched.
- **`/plan` caveat (hand-off, not fixed):** footer commit `986e40e` incidentally carries the concurrent process's `/plan` "Plan a trip" Explore link. `/plan` currently returns **HTTP 200** in production (no 404), so there is no live regression — but the link's correctness is owned by the claim-flow / Plan-a-Stay process, not this work. Flagged for that owner; left as-is per direction.

---

## 13. Commits (all on `main`, `way:` prefix)

```
89c8394  way: add go-live gate flag as registry SSOT in verticalUrl
c22e4e7  way: derive homepage atlas count + listing total from public registry
00634d7  way: derive map chips/legend from public registry + filter map API server-side
7410f59  way: filter search by public registry + gate Way keywords behind flag
d7e7fb7  way: gate explore category grid by flag + add Way to badge/features maps
45017f3  way: add regional based-vs-runs experiences section behind flag
156a88e  way: gate /network and /atlas-index by public registry (leak fix)
986e40e  way: derive footer atlas count + Way network link from public registry
a5c90e8  way: add integration audit doc for the 10th-vertical go-live
(this commit) way: rewrite integration audit — corrected premise, /place leak, gate analysis
```

Notes:

- `156a88e` initially landed on the concurrent `repair/claim-flow-foundation` branch (the concurrent process switched branches mid-session); it was moved to `main` via a branch-pointer fast-forward — no checkout, no working-tree disturbance.
- The leak fix (`156a88e`) is pushed and **deployed**; production no longer enumerates Way and the flag is OFF (Section 5a).
- `986e40e` also incidentally carries the concurrent `/plan` Explore link (Section 12).
