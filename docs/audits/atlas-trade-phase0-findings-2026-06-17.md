# Atlas Trade — Phase 0 findings & verification (2026-06-17)

Branch: `feat/trade-readiness-profile` (isolated worktree off `origin/main` @ `9380c30`).
Portal DB: `small-batch-atlas`, ref `nyhkcmvhwbydsqsyvizs`. **Portal is canonical (Rule 4)** — all
new fields live on the portal only; no vertical-project DDL.

> **Spec note.** The goal pointed at `docs/specs/atlas-trade-phase0.md`. That file does **not** exist
> in the repo (confirmed: `docs/specs/` is absent on both `origin/main` and the working checkout).
> I proceeded from the complete inline brief in the goal, which fully specifies Sections 1–5.
>
> **Method.** Every table/column/RLS fact below was verified against the **live portal DB**, not the
> docs — CLAUDE.md and `06-technical-architecture.md` are known-drifted on the commercial backend.

---

## Section 1 — Ground truth

### 1.1 Canonical commercial pipeline → the **claim** path (`listing_claims`)

Two pipelines have historically coexisted. The **claim/vendor path is canonical and live; the
operator-accounts path is inert.**

| Signal | Claim path (CANONICAL) | Operator path (INERT) |
|---|---|---|
| Claimed-operator row | `listing_claims` (5 rows) | `operator_accounts` (**0 rows**) |
| Hunchy Hills' claim | **Here** — `listing_claims.id = 51d43e0f‑07d1‑4e22‑94f5‑fa2edbdb5bfc`, tier `standard`, status `active`, `claimed_by 0838ed9e…`, claimed 2026‑06‑01 | not present |
| Working edit data-API | `PATCH app/api/dashboard/listing/route.js` → writes `listings` | `/operators/dashboard` + `GET app/api/operators/data` — stats only, **no listing-edit flow** |
| Live Stripe webhook | `app/api/stripe/webhook/route.js` → `handlePaidClaimAutoApprove()` → `grantClaim()` writes **`listing_claims`** (tier, stripe_subscription_id, stripe_customer_id, status, claimed_by) + sets `listings.is_claimed=true` | same webhook has a `handleOperatorCheckoutSuccess()` → `operator_accounts`, but the table is empty / unused |
| `processed_stripe_events` | 0 rows (the 4 active claims were granted/comped — all have `stripe_subscription_id = null`) | — |

**Verdict:** the canonical commercial entity for a claimed venue is an **active row in
`listing_claims`**. The `operator_accounts` / `/operators/*` product (travel operators curating
collections & trails) is a *different, currently-empty* feature — not dead code, but **not** the
claim-edit pipeline. Decided without asking, per brief.

### 1.2 Canonical home for operator-editable fields → the **`listings`** table

When a claimed operator edits their listing, `PATCH app/api/dashboard/listing/route.js` writes
operator-authored data **directly onto `listings`**:
`website`, `phone`, `hours` (jsonb), `hero_image_url`, **`operator_highlights`** (jsonb),
**`search_keywords`** (text[]). Authorization (1.5) is by `listing_claims.claimed_by`. There is no
separate "operator edits" table — `listings` **is** the canonical operator-editable home.

**Precedent fields:**

- **Direct-booking URL — NOT operator-editable.** Exists only as `way_meta.booking_url` (Way
  vertical-meta table), editable solely via the **admin** editor
  (`app/admin/listings/ListingEditor.js`). The operator dashboard exposes no booking field.
- **Careers / hiring URL — BUILT, inside jsonb.** Lives at
  `listings.operator_highlights -> 'hiring' = { open, url, note }` (migration 157), edited via
  `app/dashboard/listings/[id]/edit/HighlightsEditor.js`. It is a **jsonb key, not a column**.

Implication for Atlas Trade: precedent is mixed (a jsonb sub-object for hiring; a per-vertical-meta
column for booking). Trade-readiness is a **structured, queryable, cross-vertical** capability gate,
so it belongs as **first-class columns on `listings`** (next to `visitable`/`presence_type`), not
buried in `operator_highlights` jsonb (which is master-only "right now" prose) and not in a
single-vertical meta table.

### 1.3 Adjacent capacity metadata → already on `listings`

- `listings.visitable` — `boolean`, default `true`.
- `listings.presence_type` — `text`, default `'permanent'`.
- Group-size/capacity today lives only in **vertical meta**: `rest_meta.guest_capacity` (int),
  Way booking/group fields in `way_meta`. No master-level capacity column exists.

Trade-readiness is adjacent capacity metadata → its natural home is **beside `visitable` /
`presence_type` on `listings`**. This corroborates 1.2.

### 1.4 Read paths

- The portal is the **master aggregator**; vertical source DBs sync **inbound only**
  (`lib/sync/syncVertical.js`, `lib/sync/fieldMaps.js`) — fields not in the field maps are never
  clobbered ("safe by omission", as for `hours` / `operator_highlights`).
- Canonical public detail page: `app/place/[slug]/page.js` (one Next app renders all verticals).
  Operator-controlled data surfaces: `operator_highlights` (read via
  `lib/operator-highlights/read.js`, rendered on the place page), plus per-vertical `*_meta` joins.
- **Plan-a-Stay v2 (future trade builder's engine — DO NOT MODIFY):**
  `app/api/plan-a-stay/retrieve/route.js` queries the pool as
  `from('listings').select(...).eq('status','active').eq('visitable',true).not lat/lng null`,
  region via `region_computed_id`/`region_override_id`, `.in('vertical', …)`, `limit 500`; meal/
  accommodation pool is `verticals ∈ {fine_grounds, table, rest}`. A future **trade** builder will
  mirror this query shape but **must** start from `trade_buildable_listings` (Section 3) instead of
  raw `listings`. Plan-a-Stay v2 is **traveller-facing** and is left untouched.

### 1.5 RLS / auth state

| Table | RLS enabled | Policies | Per-owner edit enforced at DB? |
|---|---|---|---|
| `listings` | yes (not forced) | `Public can read active listings` (SELECT, public, `status='active'`); **`Service role full access listings` (ALL, role `public`, `USING true`)** | **No.** The `FOR ALL TO public USING(true)` policy makes RLS a no-op for writes. |
| `listing_claims` | yes (not forced) | `owner reads own claims` (SELECT, authenticated, `claimed_by = auth.uid()`); **no INSERT/UPDATE/DELETE policy** | reads locked to owner; writes only via service-role |

**How ownership is actually enforced:** *in application code, not RLS.* The edit route uses the
**service-role** client (bypasses RLS) and gates every write with:

```js
// app/api/dashboard/listing/route.js
const { data: ownClaim } = await sb.from('listing_claims')
  .select('id').eq('listing_id', listingId)
  .eq('claimed_by', user.id).eq('status','active').maybeSingle()
if (!ownClaim) return 403
```

The new `trade_*` columns inherit exactly this posture: an operator can only set them through that
same ownership-gated PATCH route. **Gap (recorded for a later auth pass, not built here):** the DB
does not enforce per-row ownership on `listings` — the open `USING(true)` policy means RLS provides
no write protection; all safety is app-layer. This matches prior findings elsewhere in the repo.

### Decision (made from findings, not asked)

**Canonical table for the trade-readiness profile = `listings`.** It is simultaneously the
operator-edit write target (1.2), the home of adjacent capacity metadata (1.3), and the pool the
future trade builder reads (1.4).

**Canonical "claimed" signal = an active `listing_claims` row** — the ownership source of truth used
by the live edit-authz (1.1/1.5). We deliberately do **not** use `listings.is_claimed`: it is a
denormalized mirror that has **drifted on prod** — 6 rows carry `is_claimed=true` but only **4**
have an active claim (`"1813"` and `"Bindi Wine Growers"` flag claimed with **no** `listing_claims`
row at all). Using `is_claimed` would leak stale rows into the trade pool.

---

## Section 2 — Schema (migration 170)

**Numbering note.** When phase 0 was built off `origin/main @ 9380c30`, the latest migration file
was `164_image_moderation_columns.sql`, so the work was first authored and **applied to the DB** as
`165`. Before landing, `origin/main` advanced 5 commits (concurrent council/legal work) and now
carries `165_story_ideas_pitch_payload.sql` … `169_infringement_reports.sql`. To avoid colliding
with that `165`, the files were renumbered to the true next free number, **170**, prior to commit.
The rename is filename-only — this repo does not track migration filenames, and the schema objects
were already applied to the DB (under the original run), so **no re-apply was needed**. (The
directory also has older drift: `163` has no file though it was applied to prod, and `158`/`164`
appear twice.)

Files (additive, non-destructive, idempotent):
- Up:   `supabase/migrations/170_trade_readiness_profile.sql`
- Down: `supabase/migrations/170_trade_readiness_profile_down.sql`

Columns added to `public.listings`:

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `trade_welcome` | boolean | NOT NULL | `false` | Master switch — not trade-includable unless true |
| `trade_bespoke` | boolean | NOT NULL | `false` | Welcomes individual/bespoke trade (DMCs, trip designers) |
| `trade_group` | boolean | NOT NULL | `false` | Welcomes group/volume trade |
| `trade_group_size_max` | integer | NULL | — | Group ceiling; meaningful only when `trade_group=true`; null = unspecified |
| `trade_contact_before_booking` | boolean | NOT NULL | `false` | Operator requires direct contact before any trade inclusion |
| `trade_rates_available` | boolean | NOT NULL | `false` | Operator offers trade rates — **boolean only; Atlas never stores/displays the rate value** |

**Applied to portal DB:** yes — "Migration complete" (run under the original `165` filename before
the rename; the file is now `170`, the DB objects are unchanged). To re-run idempotently:
`node scripts/run-migration.mjs supabase/migrations/170_trade_readiness_profile.sql`.

**Rollback command:**
```
node scripts/run-migration.mjs supabase/migrations/170_trade_readiness_profile_down.sql
```

---

## Section 3 — The single gate predicate

**`public.trade_buildable_listings`** (view, created in migration 170) is the **sole** definition of
the trade-buildable pool:

```sql
create or replace view public.trade_buildable_listings as
  select l.*
  from public.listings l
  where l.trade_welcome = true
    and exists (select 1 from public.listing_claims c
                where c.listing_id = l.id and c.status = 'active');
```

- **trade-buildable IFF** an active `listing_claims` row exists (canonical claimed signal, §1)
  **AND** `trade_welcome = true`.
- **Every future trade read path (builder, export, API) MUST consume this view.** The rule is stated
  in a `COMMENT ON VIEW` at the definition site and in the migration header. No re-implemented filter
  anywhere else.
- **Not wired into any consumer surface** (per brief). No trade consumers exist yet — this ships the
  predicate only. **Plan-a-Stay v2 is traveller-facing and must not consume this predicate.**

**View vs lib helper:** the brief allows a `lib/` helper if read patterns favour it. The codebase
reads `listings` via ad-hoc `supabase.from('listings')` calls per route (no central query builder),
so a DB **view** is the cleanest single source of truth (`from('trade_buildable_listings')`). A lib
wrapper now would be **unused scaffolding** (no consumer, and the brief says not to wire one in), so
none is shipped. When the first trade consumer is built, a thin `lib/trade/buildablePool` helper may
wrap the view — but **the view stays canonical.**

---

## Section 4 — Verification (pass/fail)

All run against the live portal DB after applying the up-migration.

| # | Check | Result |
|---|---|---|
| 1 | 6 `trade_*` columns exist with correct type/null/default | **PASS** — all 6, types/defaults/nullability exact |
| 2 | View `trade_buildable_listings` exists | **PASS** |
| 3 | **Consent:** every existing row `trade_welcome = false` | **PASS** — 6943 rows, `opted_in = 0`, `not_false = 0` |
| 4 | Hunchy Hills specifically `trade_welcome = false` (all 6 trade fields false/null) | **PASS** |
| 5 | Predicate returns **zero** rows now | **PASS** — `buildable_now = 0` |
| 6 | Predicate correctness in a txn: set Hunchy Hills `trade_welcome=true` → appears; rollback → zero | **PASS** — in-txn view returned exactly `Hunchy Hills Distillery (sba)`; after `ROLLBACK`, view = 0 rows |
| 7 | No real operator left opted in after txn test | **PASS** — Hunchy Hills `trade_welcome = false` post-rollback |
| 8 | Down migration reverses cleanly | **PASS** — after down: `trade_cols = 0`, `view_exists = 0` |
| 9 | Up re-applies; DB left in up state | **PASS** — after re-apply: `trade_cols = 6`, `view_exists = 1`, `opted_in = 0`, `buildable_now = 0` |
| 10 | RLS — operator can edit only their own row | **GAP (recorded, not built)** — `listings` RLS is a no-op for writes (`Service role full access` = `FOR ALL TO public USING(true)`); per-row ownership is enforced **only in app code** (`listing_claims.claimed_by` in the PATCH route, via service-role). The `trade_*` columns inherit this. Deferred to a later auth pass per brief; no RLS built here. |

**Final DB state:** up-migration applied; 6 columns + view live; nothing opted in.

---

## Section 5 — Disposition (landed)

Phase 0 was first prepared staged-for-review (nothing committed). On review sign-off it was landed:

- Committed on `feat/trade-readiness-profile` (isolated worktree), then **rebased onto the current
  `origin/main`** (which had advanced 5 commits of concurrent council/legal work) and
  **fast-forwarded onto `origin/main`**, which auto-deploys the portal via Vercel.
- The landed commit is schema-file + this audit doc only — **no application code reads the new
  columns/view** (phase 0 ships no consumers), so the deploy changes no runtime behaviour; the
  additive schema was already applied to the DB.
- Migration **170 applied** to the portal DB; rollback command above.
- Concurrent-agent safety: built in a dedicated worktree off `origin/main` so the other agent's WIP
  on `feat/image-moderation` (in the main checkout) was never touched; re-fetched + rebased onto the
  latest `origin/main` immediately before the FF push.
- Landed artefacts: this findings file + `170_trade_readiness_profile.sql` +
  `170_trade_readiness_profile_down.sql`. (Investigation helper and `node_modules`/`.env.local` in
  the worktree were never committed.)

**Landed to `origin/main`.** Remaining for later phases: operator-facing edit UI for the trade
fields, and the first trade consumer (which must read `trade_buildable_listings`).
