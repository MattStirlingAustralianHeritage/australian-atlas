# Atlas Trade — Phase 1 findings & verification (2026-06-17)

Branch: `feat/trade-readiness-profile` (isolated worktree off `origin/main`).
Builds on Phase 0 (migration 170: six `trade_*` columns on `listings` + the
`trade_buildable_listings` predicate). **This phase adds operator-facing UI only —
no migration, no schema change, no consumer/public rendering, no predicate change.**

> Re-grounded against the live DB before writing (not the drifted docs). See
> `docs/audits/atlas-trade-phase0-findings-2026-06-17.md` for the pipeline audit.

---

## Where it was built (canonical pipeline confirmed)

The canonical commercial pipeline is the **claim path** (`listing_claims`), and the
operator-editable home table is **`listings`** — re-confirmed live:

- Operator edits write through **`PATCH /api/dashboard/listing`**
  (`app/api/dashboard/listing/route.js`), which writes `listings` columns directly.
- The editor screen is **`app/dashboard/listings/[id]/edit/page.js`** (`/dashboard`,
  the vendor/claim path). The `operator_accounts` / `/operators/dashboard` path is
  inert (0 rows) and was **not** touched.
- Ownership is enforced in that route: `listing_claims.claimed_by = user.id` AND
  `status='active'` (admins bypass), then a **Standard-plan paid gate** (`402`).

**Precedent for operator-authored fields:** `operator_highlights` (jsonb, incl. the
hiring URL) and `search_keywords` (text[]) — each saved via the same PATCH route by a
self-contained editor component (`HighlightsEditor` / `KeywordsEditor`). The trade
fields are the **first first-class (boolean/int) operator-owned column cluster** on
`listings` (the booking URL is admin-only `way_meta.booking_url`; the hiring URL is a
jsonb key — neither is a first-class operator-editable column). The new UI mirrors the
`KeywordsEditor`/`HighlightsEditor` save + validation pattern exactly.

---

## What was built

| File | Change |
|---|---|
| `lib/trade-readiness/normalize.js` | **New.** Pure normaliser (`normalizeTradeReadiness`) — the single validation authority shared by client + server. Coerces the 5 booleans (default false), validates `trade_group_size_max` (integer ≥ 1, optional null, capped at `MAX_GROUP_SIZE` = 100000). **Never clears sub-values** on a master/group toggle (preservation contract). Mirrors `lib/search-keywords/normalize.js`. |
| `app/api/dashboard/listing/route.js` | Added a `trade_readiness` write block (mirrors the highlights/keywords blocks): normalise → master-only `UPDATE listings SET trade_* …` → `42703` forward-compat → returns the fresh values. Trade columns added to the response `select`. Master-only, sync-safe by omission (not in `lib/sync/fieldMaps`), not search-indexed. |
| `app/api/dashboard/route.js` | Added the 6 trade columns to `LISTING_SELECT` so the editor receives current values. |
| `app/dashboard/listings/[id]/edit/TradeReadinessEditor.js` | **New.** Self-contained section component: master switch + reveal, sub-toggles, conditional group-size input, own dirty-tracking + Save, PATCHes `{ trade_readiness: {...} }`. Exact microcopy from the brief. |
| `app/dashboard/listings/[id]/edit/page.js` | Import + render `<TradeReadinessEditor>` after `KeywordsEditor` (within the paid/admin editor — free operators get the existing upgrade challenge). |

**Behaviour implemented:** never-set → master off, one toggle + intro copy. Master ON
reveals `trade_bespoke`, `trade_group`, `trade_contact_before_booking`,
`trade_rates_available`. `trade_group_size_max` shows only when `trade_group` is on
(integer, min 1, optional). Master/group OFF hides sub-fields but **preserves** their
stored values (the component holds them in state and always sends them; the server
writes them as-sent). `trade_rates_available` is a yes/no only — copy states Atlas
never asks for or shows the rate.

**Tier gate:** trade editing inherits the dashboard's existing Standard-plan paid gate
(the PATCH route `402`s free claims, like every other field). A free claimant sees the
existing upgrade challenge, not the editor. Noted as inherited, not newly imposed — the
`trade_buildable_listings` predicate itself remains tier-agnostic (active claim only).

---

## Verification (pass/fail)

Verified at three levels: pure-logic unit tests, **real route-level e2e through the
running handler with minted shared-JWTs**, and dev-server compile/SSR of both new files.
Dev server run from the worktree on :3939 against the live portal DB; the test fixture
(**Admin Test Brewery** `3d1be25b`, owner `828bdf2c`, standard/paid) was reset to all
defaults afterward — nothing left opted in.

| # | Check | Result |
|---|---|---|
| 1 | `normalizeTradeReadiness` unit tests (17 cases) | **PASS** — booleans coerce/default-false; size 12/'8' ok; ''/null → null; 0/-3/12.5/'abc'/>cap rejected; cap boundary ok; array/null/string payloads rejected |
| 2 | **Master-off preserves sub-values** (unit) | **PASS** — `{welcome:false, bespoke:true, group:true, size:12}` → all preserved, only welcome false |
| 3 | ESM syntax (`node --check`) on both routes + normalize | **PASS** |
| 4 | Owner sets all-on size 12 via real PATCH | **PASS** — `200`; DB shows all true + size 12; predicate **includes** the listing (claimed + welcome) |
| 5 | GET echoes trade fields to owner | **PASS** — `trade_welcome=true`, `trade_group_size_max=12` returned |
| 6 | **Master OFF preserves sub-values via real PATCH** | **PASS** — `200`; DB `trade_welcome=false` but `bespoke/group/size` unchanged; predicate now **excludes** the listing |
| 7 | Group-size validation via real PATCH | **PASS** — size `0` → `400`, size `'abc'` → `400`, neither wrote |
| 8 | **Operator cannot edit another operator's trade fields** | **PASS** — non-owner vendor JWT PATCH → `403` "You do not own this listing"; DB unchanged (no cross-operator write) |
| 9 | Unauthenticated PATCH | **PASS** — `401` |
| 10 | Reset fixture → defaults; predicate 0 network-wide | **PASS** — all false/null; `trade_buildable_listings` = 0 rows |
| 11 | No regression to existing dashboard fields | **PASS** — GET returns all existing fields (name, slug, website, phone, hours, search_keywords, paid) **and** the 6 trade fields together; PATCH change is additive (existing blocks byte-unchanged); route compiles + runs |
| 12 | `TradeReadinessEditor` compiles + SSRs | **PASS** — mounted via a throwaway route: `200`, HTML contains "Trade readiness" + all exact microcopy; with `welcome:true, group:true` the sub-fields **and** "Maximum group size" render (master-on + group-on reveals confirmed) |
| 13 | Edit `page.js` compiles with the new import/section | **PASS** — mounted via a throwaway route: `200`, renders |

**Deferred to Matt (auth-gated UI):** clicking the toggles as a logged-in operator in a
real browser session. The dashboard is gated on a Supabase session that can't be forged
here — consistent with the established "verify auth-gated UI at the data/route layer +
have Matt confirm in-browser" pattern. Everything reachable without that session (logic,
the real route handler with real ownership/paid/validation gates, the live DB writes, the
predicate interaction, and SSR of both files) is verified above.

---

## RLS / auth (re-checked; changed since Phase 0)

Phase 0 recorded `listings` RLS as a write no-op (`FOR ALL TO public USING(true)`). That
gap is now **closed**: a concurrent commit landed **migration 171 ("enable RLS on public
tables")**, which removed the open policy. `listings` RLS now has **only** a `SELECT`
policy for public on active rows — anon/authenticated can no longer write `listings`
directly. Per-row ownership of trade edits is enforced **in application code** (the PATCH
route's `listing_claims.claimed_by` + active-claim + paid checks, via the service-role
client that bypasses RLS). The new `trade_*` columns inherit exactly this posture. There
is still no per-row `UPDATE` RLS policy — not required while all writes go through the
trusted server route, and the cross-operator block is proven at the route level (check 8).
No RLS was built in this phase (per brief).

---

## Stop state

- Changes **staged** on `feat/trade-readiness-profile`, **nothing committed**.
  No push / PR / merge / deploy.
- No migration (Phase 0's migration 170 already supplies the columns + predicate; not re-run).
- Files: `lib/trade-readiness/normalize.js`, `TradeReadinessEditor.js` (new);
  `app/api/dashboard/listing/route.js`, `app/api/dashboard/route.js`,
  `app/dashboard/listings/[id]/edit/page.js` (edited). Throwaway test/probe artifacts and
  the worktree `.next` were removed; `node_modules`/`.env.local` never staged.

**Stopped for review.**
