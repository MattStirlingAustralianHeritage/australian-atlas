@AGENTS.md

# Australian Atlas (Portal)

Umbrella platform for the 9-vertical Australian Atlas Network. Acts as the **auth hub** and **master data aggregator**.

## Tech Stack

- **Framework**: Next.js 14, App Router
- **Database**: Supabase (master portal DB + per-vertical source DBs via service keys)
- **Hosting**: Vercel
- **Payments**: Stripe (vendor subscriptions, council subscriptions, event listings)
- **Maps**: Mapbox + PostGIS
- **AI**: Anthropic Claude (editorial), Voyage AI (embeddings, voyage-3.5, 1024-dim)
- **Email**: Resend
- **JWT**: jose (HS256 for cross-vertical auth)

## Auth Architecture (Central Hub)

Australian Atlas is the **single auth source** for the entire Atlas Network.

### Roles (profiles table)

| Role | Description |
|------|-------------|
| `user` | Default. Readers who save favourites, build trips |
| `vendor` | Venue operators. `vendor_verticals` tracks which verticals they've claimed on |
| `council` | Tourism bodies. `council_id` links to `council_accounts`. Tiered: explorer/partner/enterprise |
| `admin` | Network admin (Matt). Full access everywhere |

### Auth Systems

1. **Supabase Auth** — Google OAuth + email/password + magic link OTP
   - Cookie-based sessions on australianatlas.com.au
   - `profiles` table auto-created via trigger on signup
   - `lib/supabase/auth-clients.js` for browser/server Supabase clients

2. **Shared JWT** — Cross-vertical SSO
   - `lib/shared-auth.js` signs/verifies HS256 tokens (30-day expiry)
   - JWT payload: `{ sub, email, name, role, verticals?, council_id? }`
   - Secret: `SHARED_AUTH_SECRET` env var (do NOT use ADMIN_PASSWORD)
   - Flow: vertical → `/api/auth/shared` → login if needed → redirect with `?atlas_token=`
   - Verify: vertical calls `POST /api/auth/verify` with token

3. **Council Auth** — Magic link OTP (6-digit code)
   - `council_accounts` table with tier/status
   - HMAC-signed session cookie (30 days)
   - Email domain whitelist in `lib/council-config.js`
   - Manual approval required (`approved` boolean)

4. **Admin Auth** — Password cookie
   - `ADMIN_PASSWORD` env var, `admin_auth` cookie (7 days)
   - Middleware-protected `/admin/*` routes

### Service-to-Service APIs

- `POST /api/auth/promote-role` — verticals call this when a claim is approved
  - Header: `x-api-secret: {SHARED_API_SECRET}`
  - Body: `{ userId, role, vertical?, councilId? }`
  - Additive only (won't downgrade admin or vendor)

- `GET /api/auth/profile` — returns current user's profile (requires Supabase session)

### Env Vars (Auth)

```
SHARED_AUTH_SECRET=      # Dedicated secret for JWT signing (required)
SHARED_API_SECRET=       # Service-to-service API key for promote-role
ADMIN_PASSWORD=          # Admin login password
```

## Database

### Master Portal DB (migrations in supabase/migrations/)

- `listings` — aggregated from all verticals (vertical + source_id unique)
- `{vertical}_meta` — vertical-specific fields (sba_meta, craft_meta, etc.)
- `regions` — 32 Australian regions with GeoJSON, editorial, status
- `profiles` — unified identity (user/vendor/council/admin roles)
- `vendor_accounts` — legacy, being replaced by profiles
- `council_accounts` — tourism body subscriptions and auth
- `council_regions`, `council_content`, `council_activity` — council features
- `articles` — CMS-synced editorial content
- `events` — community events with Stripe payment
- `trips` — user-curated itineraries
- `listing_analytics` — anonymous view/click tracking

### Vertical Source DBs

Accessed via `lib/supabase/clients.js` → `getVerticalClient(vertical)`.
Each vertical has its own Supabase project. See `VERTICAL_CONFIG` for table names and type filters.

## Migration Deployment Discipline

Whenever a migration is applied to a production database, the verification protocol must include both:

- **Schema verification:** the migration was applied correctly, data integrity is intact, the new tables/columns/constraints exist as specified.
- **Code-deployment verification:** the application code that reads from or writes to the changed schema is committed to main, deployed to Vercel, and verified working against the new schema in production. Loading the affected URLs in a browser is the only acceptable verification — "the dev server compiled cleanly" is not.

Migrations involving column renames, removed columns, type changes, or backfilled state require both halves of verification before the schema change is treated as complete. A migration applied to production with un-deployed consumer code is a live incident. If the verification protocol cannot be completed in a single session — for example, the editor needs to leave before code can be reviewed and deployed — the migration should be staged on a development database first, with the production migration deferred until the corresponding code deployment can land in the same window.

### Pre-migration checklist

Before applying any migration to production:

- List every file that reads from or writes to the affected schema. Confirm those files have been updated locally.
- Confirm those files are committed and ready to push.
- Confirm the editor is available for the deployment verification step.
- Only then apply the migration.

## Regions

- `regions` table: ~46 Australian regions with slug, state, description, hero image, editorial content
- **Region index cards** (`components/RegionIndexCard.js`, used on `/regions` and `/explore`): server-rendered — inline SVG state silhouette (`lib/regions/stateOutlines.js`) with the region centroid dot, place count, and top-3 category chips (`lib/regions/verticalMix.js`, hourly `unstable_cache` key `regions-index-vertical-mix`)
  - Replaced the old per-card live Mapbox GL maps (`RegionMapCard`, deleted) which each cost a WebGL context and rendered as blank dark boxes when GL was capped/blocked
  - The dark cartographic style those cards used lives on in `lib/atlas-map-style.js` (still used by `/on-this-road`)
- **Detail hero images**: Mapbox Static Images API
  - `hero_image_url` at 1280×500 @2x (Mapbox API max width is 1280)
  - `hero_image_source` = 'mapbox_static' (will change to 'operator' when claimed listings provide real photography)
  - URL pattern: `https://api.mapbox.com/styles/v1/{MAPBOX_STYLE}/static/{lng},{lat},{zoom},0/{width}x{height}@2x?access_token={token}`
  - Detail page style: `mapbox/light-v11`
  - Zoom levels: 7–10 depending on region size (stored in `map_zoom` column)
  - Coordinates stored in `center_lat`, `center_lng` columns
- **Editorial content**: Generated via Anthropic Claude, stored in `generated_intro` / `long_description`
  - Voice: Monocle-adjacent, place-grounded, anti-chain, non-promotional
  - Detail page renders max 250 words (truncated in render layer as safety net)
  - `reviewed` boolean for human QA workflow
- **Listing counts**: Denormalized `listing_count` updated by cron sync
- **Region matching**: Text-based `ilike` on `listings.region` with alias map in `updateRegionCounts.js`
  - Aliases handle multi-name regions (e.g. "Hobart" → "Hobart & Southern Tasmania")
- **Index page design**: Cream header (contrasts dark cards), 3-column grid, each card is a live Mapbox GL map with dark cartographic style
- **Detail page design**: Mapbox hero → breadcrumb + description + vertical pills → editorial (250 words max) → venue listings by vertical → interactive map
- **Scripts**: `seed-region-mapbox-images.mjs` (Mapbox static), `generate-region-editorial.mjs` (Claude)
- **Pages**: `/regions` (index, SSR), `/regions/[slug]` (detail with hero, editorial, listings, map)

## Trails

- `trails` table: Editorial and user-curated trails linking venues across verticals
  - `type`: 'editorial' (admin-created) or 'user' (community)
  - `visibility`: 'private' (creator only), 'link' (shareable URL), 'public' (discoverable)
  - `short_code`: 8-char random code for sharing URLs (`/t/[shortcode]`)
  - `slug`: URL-friendly identifier for editorial trails (`/trails/[slug]`)
  - Editorial fields: `hero_intro`, `cover_image_url`, `curator_name`, `curator_note`, `duration_hours`, `best_season`
- `trail_stops` table: Ordered stops referencing the master `listings` table
  - `listing_id` FK to `listings.id` (the network-level venue identifier)
  - Denormalized: `venue_name`, `venue_lat`, `venue_lng`, `venue_image_url`, `vertical`
  - `order_index` for stop ordering, `notes` for per-stop commentary
- **Pages**: `/trails` (discovery index), `/trails/[slug]` (detail), `/trails/builder` (builder UI), `/t/[shortcode]` (share)
- **API**: `/api/trails` (CRUD), `/api/trails/[id]` (single), `/api/trails/search` (cross-vertical venue search)
- **Admin**: `/admin/trails` (editorial trail management)
- **Editorial voice**: Monocle-adjacent, place-grounded, anti-chain, non-promotional. Editorial defaults: 7–9 stops, 1–3 days (hard cap 7), max 2 stops from the same vertical per day. Full standard in `docs/editorial-brief-trails.md`.
- **Scripts**: `seed-editorial-trails.mjs` (seeds example editorial trails with real venue data)

## Admin Auth

- JWT-based session tokens (signed with `ADMIN_SESSION_SECRET` via jose HS256, 30-day expiry)
- Cookie: `atlas_admin` (httpOnly, secure in production)
- Login: `/admin/login` → `POST /api/admin-auth` → JWT cookie
- Logout: `GET /admin/logout` → clears cookie
- Middleware verifies JWT on all `/admin/*` routes (except `/admin/login`)
- Backward compatible with legacy `admin_auth` cookie
- **Required env vars** (set in Vercel, never committed):
  - `ADMIN_PASSWORD` — the admin password
  - `ADMIN_SESSION_SECRET` — signing key (generate: `openssl rand -base64 32`)

## User Account

- `/account` — Universal user landing page (role-aware)
  - Regular users: saved places, trails, explore
  - Vendors: + vendor dashboard link
  - Admins: + admin link
  - Councils: + council dashboard link
- Post-login redirect goes to `/account` (not `/dashboard`)
- `/dashboard` remains vendor-specific (My Listings, Analytics, Producer Picks, etc.)
- Nav is auth-aware: shows user avatar + dropdown when logged in, "Sign In" when not

## File Structure

```
app/            — pages and API routes
lib/supabase/   — clients.js (data), auth-clients.js (auth)
lib/sync/       — syncVertical.js, fieldMaps.js, updateRegionCounts.js
lib/            — shared-auth.js, council-config.js
supabase/       — migrations (001-016)
components/     — shared UI (ListingCard, RegionMap, VerticalBadge, etc.)
scripts/        — data sync, seeding, editorial generation
```

## Key Conventions

- All pages use App Router (lowercase page.js, layout.js)
- Portal does NOT have its own detail pages — cards link to vertical canonical URLs
- One-directional sync: verticals → master (via cron/sync API)
- Embeddings: 1024-dim vectors (Voyage AI voyage-3.5)
- CSS uses custom properties (--color-cream, --color-accent, --color-ink, etc.)
- Fonts: `--font-display` (Playfair Display), `--font-body` (DM Sans)
- Editorial content is generated once and stored — never generated at runtime
- Region hero images use local SVG placeholders or uploaded images with attribution (`hero_image_credit`)

## AI Itinerary Builder

- `/itinerary` — AI-powered trip planning using Anthropic Claude API
- Intent detection in search: queries with travel/trip intent are routed to the itinerary builder
- Generates multi-day itineraries pulling from the master `listings` table across all verticals
- Anthropic API integration via server-side route (API key never exposed to client)

## Data Integrity Rules

- Website URLs must never be AI-generated. They may only be populated from: Google Places API data, operator-submitted data, or manually verified sources. Any URL not from one of these sources must be nulled before publishing.
- All venue tables should include `data_source` (text: 'ai_generated' | 'google_places' | 'operator_verified' | 'manually_curated') and `needs_review` (boolean, default false) columns.
- Venues with `needs_review = true` must not be rendered publicly — return 404 on detail pages.
- AI-generated descriptions should show a disclaimer: "Description auto-generated. Own this listing? Claim it to update."
- Never render a "Visit Website" button if website_url is null.
- Homepage stat numbers link to /map?type=[value] for pre-filtered map views.
- The /explore page reads ?region= URL params on mount for pre-filtered views from homepage city cards.

## Ownership State Protection (CRITICAL)

**`listing_claims` is the single source of truth for who owns a listing. `listings.is_claimed` is derived display state. No automated process — sync, cron, script, agent, or enrichment pipeline — may set `is_claimed` to false on, or delete, a listing that has a live claim (`listing_claims.status IN ('active','past_due')`).**

This rule exists because the vertical sync silently re-derived `is_claimed` from vertical claim flags and un-claimed 27 of 28 operator-owned listings (incident 2026-07-21, fixed in commit `4b5f247` + migration 256). Operators were locked out of their dashboards for up to four weeks before anyone noticed.

### Enforcement layers (all must stay in place)

1. **Database triggers** (migration 256): `trg_protect_owned_listing_claim_flag` coerces `is_claimed` back to true on any write while a live claim exists; `trg_protect_owned_listing_delete` blocks DELETE of an owned listing (the `listing_claims.listing_id` FK is ON DELETE CASCADE — deleting the listing silently destroys the ownership row); `trg_stamp_listing_on_live_claim` stamps `is_claimed=true` when a claim becomes live.
2. **Sync claim guard** (`syncSourceRows` in `lib/sync/syncVertical.js`): forces `is_claimed=true` in sync payloads for listings with live claims; withholds the column entirely if the guard read fails.
3. **Monitor** (`/api/cron/claim-integrity`, 30 min after each sync pass): emails the admin on any drift — trampled flags, hidden owned listings, approved claims that never provisioned, duplicate live claims.

### Rules for new code

- Never gate an owner-facing query on `is_claimed` — join `listing_claims` on `claimed_by` + status instead. The dashboard locked every operator out precisely because it filtered on display state.
- To un-claim a listing, deactivate the `listing_claims` row FIRST (the Stripe cancel webhook is the reference flow), then clear `is_claimed`.
- To delete an owned listing, deactivate the claim first, deliberately. The DB will refuse otherwise.
- Vertical claim columns differ per vertical (`VERTICAL_CLAIM_FIELD` in `lib/supabase/clients.js`) and craft's `venues` table has NO claim column at all — never assume the vertical knows about ownership.

## Lockout Prevention (CRITICAL)

An operator or user losing access to their account or listing is this platform's worst incident class. It has happened twice — the 2026-07-21 sync trample (27/28 operators un-claimed, see Ownership State Protection above) and the password-reset dead end (recovery links minted a session but never asked for a new password, so the reset silently failed everywhere else). The infrastructure below exists so it cannot happen silently again. Do not remove or weaken any layer without replacing it.

### Layers

| Layer | What it guards | Where |
|-------|----------------|-------|
| DB triggers (migration 256) | `is_claimed` can't go false / listing can't be deleted while a live claim exists | `supabase/migrations/256_ownership_state_protection.sql` |
| Sync claim guard | Sync payloads can't trample ownership display state | `syncSourceRows` in `lib/sync/syncVertical.js` |
| `claim-integrity` cron (every 6h) | Listing side: trampled flags, hidden owned listings, failed grants, duplicate live claims. Account side: orphaned claimants (no profile/login), role-locked-out owners (dashboard 403s a non-vendor role) | `app/api/cron/claim-integrity/route.js` |
| `auth-canary` cron (daily) | Recovery flow end-to-end with a real token: recovery link → `/auth/callback` → must land on `/auth/update-password`; page renders; magic links mintable. A dedicated inert canary account, password rotated every run | `app/api/cron/auth-canary/route.js` |
| `fleet-health` deadman (daily) | The tripwires themselves — alerts if `claim-integrity` or `auth-canary` stop running | `app/api/cron/fleet-health/route.js` |
| Live-claim statuses | `past_due` (Stripe dunning) still counts as ownership everywhere owner-facing — a bounced card never empties a dashboard | `LIVE_CLAIM_STATUSES` in `lib/claims/statuses.js` |
| Access Doctor | Break-glass diagnosis + magic-link unblock when a human reports a lockout | `/admin/access-doctor`, `lib/admin/accessDoctor.js` |

### Rules for new code

- Owner-facing claim queries use `.in('status', LIVE_CLAIM_STATUSES)` — never `.eq('status', 'active')`, and never a gate on `is_claimed` (see Ownership State Protection).
- Any new scheduled agent that guards an invariant MUST be added to fleet-health's `EXPECTED` map in the same PR — an unlisted tripwire is a tripwire that can die silently.
- Auth-flow changes (login, callback, recovery, update-password) must keep the auth-canary green: the canary asserts recovery links land on `/auth/update-password`. If you change that route, update the canary in the same PR.

### Runbook: "I can't get into my listing"

1. `/admin/access-doctor` → enter their email. It checks auth identity, profile role, claims and listing state, and names the fix.
2. Fastest unblock is the magic sign-in link button (no password needed; auto-creates the account if missing). Google sign-in also bypasses password problems instantly.
3. For ownership drift (trampled flag, hidden listing), see Ownership State Protection above; the repair pattern is `_repair_claim_state.mjs`.

## Article Body Protection (CRITICAL)

**No automated process, agent, cron job, script, or enrichment pipeline may write to the `body` or `content` field of any record in the `articles` table under any circumstances.**

This is a hard, non-negotiable rule. It exists because the article sync pipeline (`syncArticles.js`) previously overwrote a published article body with stale CMS data, destroying editorial work.

### Rules

1. The `body_locked` column on `articles` is set to `true` for all published articles. A PostgreSQL trigger (`protect_article_body`) prevents body updates when locked.
2. Only the admin CMS editor (`/api/admin/articles` PATCH) may update article body. It temporarily unlocks, writes, and re-locks.
3. The article sync pipeline (`lib/sync/syncArticles.js`) syncs metadata only (title, excerpt, tags, hero image). It NEVER includes `body` in UPDATE operations. Body is only written on INSERT (new articles).
4. The content recycling agent may only write `meta_description` and `recycled_at` to articles. No other fields.
5. No other agent, script, or cron may write to the articles table at all.
6. If you are writing code that touches the `articles` table, ask: "Does this modify body/content?" If yes, STOP. Only the admin PATCH route is allowed.

### Allowed article writes by source

| Source | body | meta_description | recycled_at | Other metadata |
|--------|------|------------------|-------------|---------------|
| Admin CMS (PATCH) | ✅ (unlocks → writes → relocks) | ✅ | — | ✅ |
| syncArticles.js | ❌ NEVER (on update) | — | — | ✅ metadata only |
| syncArticles.js | ✅ (on INSERT only) | — | — | ✅ |
| Content recycling | ❌ | ✅ (if null) | ✅ | ❌ |
| Any other agent | ❌ | ❌ | ❌ | ❌ |

## Secret file handling

The following files contain secrets and MUST NEVER be read with content-printing commands:

- `.env`, `.env.local`, `.env.production`, `.env.*` (any env file)
- Any file matching `*secret*`, `*credential*`, `*token*`, `*key*` (case-insensitive) that is not a public reference doc
- `~/.aws/credentials`, `~/.ssh/id_*`, `~/.netrc`, `~/.pgpass`
- Any Supabase service-role key file, regardless of name

Banned commands against these files: `cat`, `less`, `more`, `head`, `tail`, `grep` (without `-c`), `awk`, `sed`, `od`, `xxd`, `hexdump`, `strings`, `vim`/`nano`/`emacs` in print mode, redirecting them into another command's stdin, or piping them anywhere except a length/existence check.

Permitted operations:

- `test -f .env.local` — check existence
- `wc -l .env.local` — line count
- `grep -c VARIABLE_NAME .env.local` — presence count (0 or 1), never the value
- `grep -n VARIABLE_NAME .env.local | cut -d: -f1` — line number stripped of content, only if the pipe is verified to strip before any output is emitted

If a secret value is ever printed to conversation output, tool output, or any log:

1. Stop immediately. Do not continue with the current task.
2. Notify the user with the specific key/credential leaked and the source file.
3. Request immediate rotation. Provide the console URL or rotation steps.
4. Refuse to run any further commands that touch the leaked credential until the user confirms rotation.

The rule applies even when the leak appears incidental — a key fragment in a stack trace, a token in a URL, a credential in an error message. Stop, surface, request rotation. Do not weigh whether the leak "matters enough" to halt. Halt is the default.
