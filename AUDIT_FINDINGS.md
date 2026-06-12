# Pre-outreach audit — findings (Phase 1)

Date: 2026-06-12 · Branch: `fix/pre-outreach-audit` (off `origin/main` a28a146) · DB: portal `nyhkcmvhwbydsqsyvizs`
WIP note: the checkout was on `feat/crawler-access-logging` with ~58 modified files; stashed as `f030e10` ("pre-outreach-audit autostash 2026-06-12"). Restore with `git stash pop` on that branch.

## 1. Copy-string map

| String | Where found | Action |
|---|---|---|
| "nine" (counting atlases) | [app/claim/page.js:54](app/claim/page.js), [app/for-venues/page.js:159](app/for-venues/page.js) (step 01), [app/about/page.js:239](app/about/page.js) ("Nine atlases, one Australia"), [app/operators/page.js:444](app/operators/page.js) (hardcoded numeral `9` "specialist atlases"), [app/press/page.js:159](app/press/page.js) ("Verticals: 9 — " followed by **ten** names), [app/developers/page.js:38](app/developers/page.js),64, [app/pricing/page.js:147](app/pricing/page.js), [app/for-councils/page.js:330](app/for-councils/page.js) | Fix all → ten/10 |
| /search, region trail CTAs ([components/RegionTrailCTA.js:41](components/RegionTrailCTA.js)) | already say "ten atlases" | none needed |
| "6,387" / "55 regions" | **not present anywhere** — /about already uses live counts via its local `getStats()` (fallback 6881/46) | extract shared stats helper anyway (about/operators/press each duplicate it) |
| "1,000 venues" | [app/claim/ClaimSearch.js:154](app/claim/ClaimSearch.js) — dynamic `listings.length`, pinned to 1,000 by the row cap | fixed by cap removal + live total count |
| "$295" | claim flow UI: [app/claim/[slug]/ClaimForm.js:171](app/claim/[slug]/ClaimForm.js),406 · [app/for-venues/page.js:28](app/for-venues/page.js),137 · [app/for-venues/FaqAccordion.js:16](app/for-venues/FaqAccordion.js) · claim confirmation email [app/api/claim/route.js:170](app/api/claim/route.js) | → $495 |
| "$295" left at $295 (out of scope, billing-accurate) | dashboard upgrade surfaces (app/dashboard/*, 5×) and claim-approval emails (app/api/admin/claims/route.js 2×) — these reflect what Stripe **actually charges today** (`STRIPE_STANDARD_PRICE_ID` = A$295). Changing them before the Stripe price changes would promise $495 and charge $295. | left; revisit when Stripe price flips |
| "unforgettable" / "authentic Australian experiences" / "bespoke itineraries" | **do not exist** — not in repo (app/components/lib), not in either stash, not in live prod HTML of /operators (curl-verified). Only data-file noise (rest-candidates.json venue descriptions, a banned-words list in lib/plan-a-stay/title-generation.js). | nothing to replace; noted |
| "Content needed" / placeholders | [app/press/page.js:264](app/press/page.js) Founding Story + Assets sections | remove both sections |
| "Claimed listings" | [app/press/page.js:161](app/press/page.js) — live stat, currently **4** (incl. 2 admin fixtures) | remove row |

## 2. /claim venue search row cap — CONFIRMED

[app/claim/page.js:26-31](app/claim/page.js) does an unbounded `.select()` (PostgREST default cap **1000 rows**), serialises to the client, and [ClaimSearch.js](app/claim/ClaimSearch.js) filters client-side. Active claimable (non-field) listings = **6,463** → only the first 1000 alphabetical names are searchable (~15%). First listing past the cap: **"Caloundra Regional Gallery"** (offset 1000). Fix: server-side ilike search route over the full table + live count in the empty-state copy.

## 3. Target rows (probed 2026-06-12, prod)

| slug | id | status | notes |
|---|---|---|---|
| admin-test-brewery | 3d1be25b-7e3f-43e3-be3e-4bfcc5d754b2 | active, is_claimed=true, Melbourne VIC | **DO NOT TOUCH ROW** — exclude from public queries in code only |
| aurum-modern-honey-mead | 1c65f6c2-65d8-462c-ad61-91e1342ff913 | active, Byron Bay NSW, aurummead.com | keep live + manual `listing_review_queue` editorial flag |
| aurum-premium-modern-honey-wines | b828c293-f272-4ffc-8ac8-78ea5a190e33 | active, Newrybar NSW, same website (ALL-CAPS scrape duplicate) | soft-archive → `status='hidden'` (+ queue record). Reversible. |

Archive mechanism: `listings.status` is a strict allowlist (`active` on every public surface; valid set active/inactive/pending/hidden/deleted per migration 153). `hidden` = the gate-review "Hide" semantic. `needs_review=true` was rejected — CLAUDE.md mandates 404 for it, which would un-publish the mead listing.

Admin/test fixtures found (slug `admin*`): admin-cafe (hidden), admin-test-brewery (active), admin-test-roastery (active), admins-test-museum (hidden). No legitimate listing matches the prefix → public-query exclusion filter = `slug NOT ILIKE 'admin%'` (covers the `admins-` variant too).

## 4. Tracking params in listings.website

`utm_*`: **246** rows · `fbclid`: 2 (subset of the 246) · `gclid`: 0 → **246 rows to clean**. All look like Google-Business-Profile boilerplate (`?utm_source=google&utm_medium=...`). Strip via migration 160 (query-string rebuild preserving non-tracking params + fragments); before/after row log written to docs/audits/. `updated_at` deliberately NOT bumped (would reshuffle recency-ordered browse surfaces).

## 5. Press page stats

"Claimed listings: 4" = live `count(is_claimed AND active)` — the 4 includes admin fixtures; row removed entirely. "Verticals: 9" is hardcoded while listing ten names. Founding Story ("Content needed" dashed box) + Assets ("available shortly") placeholder sections removed entirely.

## 6. Byron Bay narrative (DB, `regions` table)

`generated_intro` and `long_description` for `byron-bay` are **identical** text. Four sentences carry the five named references (Stone & Wood ×2, Wolf Lane, Huskee, Newrybar Boutique Hotel + Federal Village B&B in one sentence). Deleting those four sentences exactly; no copy regenerated.

**Adjacent finding (not actioned, out of brief):** `northern-rivers` editorial contains "Federal Village Glamping" and several other unverifiable venue names ("Byron Grain Cafe", "Byron Hinterland Beans", "Kingscliff Surf Lodge"…); byron-bay also retains other suspect names ("Possum Creek Cottage", "Myocum Ridge Farm Stay", "Little Dragon Ginger Beer"…). Looks like systemic invented-venue references in generated region editorial — flagged for a separate audit, not edited here ("do not regenerate copy", and only the five named references were in scope).

## 7. Other findings fixed in passing

- [app/operators/page.js:21](app/operators/page.js) queries `.eq('claimed', true)` — column is `is_claimed` → claimed-count stat silently always 0/hidden. Fixed via the shared stats helper.
- Homepage [app/page.js](app/page.js): `REGION_GEO` lacks a `'Byron Bay'` key but the region-card grid looks up `stats.regionCounts['Byron Bay']` → missing count (the reported bug). Also `CLUSTER_REGION_SLUGS` lacks `'Byron Bay'` → the Byron cluster heading renders unlinked (regions row `byron-bay` exists, status live).
- Homepage `VERTICAL_LABELS` lacks `way` → cluster-card badge shows lowercase raw key "way".
- about page `VERTICAL_CARD_BG` map lacks `'Way'` → Way card uses fallback colour.
- Footer already includes Way Atlas (gated on `WAY_ATLAS_PUBLIC`, confirmed live on prod); only the tagline line changes to "Ten atlases, one map."
- Prod regions count is **86** total (incl. drafts/stubs); /regions index shows all, so the live-count stats remain `count(*)`.

## 8. Phase 2–4 execution log (all complete, 2026-06-12)

**Code (this branch):**
- "nine"→"ten"/10 on /claim, /for-venues (step 01), /about ("Ten atlases, one Australia"), /operators (live `atlasCount`), /press (`verticals.length` = 10), /developers (×2, regions copy refreshed to "80+"), /pricing (×2), /for-councils.
- Shared stats helper `lib/networkStats.js` → /about, /operators, /press (fixes the operators `claimed` column bug; fixture rows excluded from counts).
- /press: Claimed-listings row, Founding Story and Assets placeholder sections removed.
- $295→$495: for-venues tiers + comparison table, FAQ, ClaimForm (×2), claim confirmation email. "Featured on homepage" comparison row removed.
- Footer tagline → "Ten atlases, one map." (Way Atlas link already present, gated on `WAY_ATLAS_PUBLIC`).
- /claim search rebuilt server-side (`/api/claim/search`, ilike over the full table, debounced client) + live total in empty-state copy ("…across 6,461 venues").
- Fixture exclusion (`lib/listings/publicFilter.js`) applied to: nearby API, region page (incl. Way-in-region), search API (hybrid + browse), vibe search, sitemap, claim search, network stats.
- Render-time tracking-param stripping on place-page website links (`lib/urlHygiene.js`).
- /events/submit gated ("Event submissions are opening soon" + mailto); route, events tables, Stripe routes and pipeline untouched.
- Homepage: Byron Bay added to `REGION_GEO` (count now renders — "134 listings") and `CLUSTER_REGION_SLUGS`; `way: 'Way'` badge label.
- og:title/description + twitter meta added on /for-venues, /claim, /claim/[slug], /events, /events/submit, /press.

**Data (migration 160, applied to prod 2026-06-12 via scripts/run-migration.mjs):**
- Byron Bay narrative: 4 sentences deleted from both `generated_intro` and `long_description` (verified: no target references remain).
- `aurum-premium-modern-honey-wines` → `status='hidden'` + reviewed queue record; `aurum-modern-honey-mead` kept active with pending editorial-review flag (`listing_review_queue`).
- listings.website: **246/246 rows cleaned, 0 rows still carry tracking params**; paths/other params preserved. Full row-level log: `docs/audits/2026-06-12-pre-outreach/website-changes.csv` (+ before.json/after.json/migration-run.log).
- Admin fixtures verified untouched post-migration (admin-test-brewery active + is_claimed, admin-test-roastery active, admin-cafe + admins-test-museum hidden).

**Phase 3 tests — all passed** (prod build + dev server against prod DB):
build ✔ · claim search returns Caloundra Regional Gallery (offset-1000 listing) ✔ · place-page links utm-free (proven pre-migration via render layer) ✔ · aurum duplicate 404/absent from search, claim search, region page ✔ · Admin Test Brewery absent from nearby/search/sitemap/claim, row intact ✔ · about/press/operators counts + no placeholders ✔ · events gate ✔.
