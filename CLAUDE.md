@AGENTS.md

# Australian Atlas (Portal)

Umbrella platform for the 9-vertical Australian Atlas Network. Acts as the **auth hub** and **master data aggregator**.

## Tech Stack

- **Framework**: Next.js 14, App Router
- **Database**: Supabase (master portal DB + per-vertical source DBs via service keys)
- **Hosting**: Vercel
- **Payments**: Stripe (vendor subscriptions, council subscriptions, event listings)
- **Maps**: Mapbox + PostGIS
- **AI**: Anthropic Claude (editorial), Voyage AI (embeddings, 1536-dim)
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

## Regions

- `regions` table: ~46 Australian regions with slug, state, description, hero image, editorial content
- **Hero images**: Mapbox Static Images API (interim — visually consistent, geographically accurate)
  - Card images: `hero_image_card_url` at 600×400 @2x
  - Detail hero: `hero_image_url` at 1280×500 @2x (Mapbox API max width is 1280)
  - `hero_image_source` = 'mapbox_static' (will change to 'operator' when claimed listings provide real photography)
  - URL pattern: `https://api.mapbox.com/styles/v1/{MAPBOX_STYLE}/static/{lng},{lat},{zoom},0/{width}x{height}@2x?access_token={token}`
  - Style: `mapbox/outdoors-v12`
  - Zoom levels: 7–10 depending on region size (stored in `map_zoom` column)
  - Coordinates stored in `center_lat`, `center_lng` columns
- **Editorial content**: Generated via Anthropic Claude, stored in `generated_intro` / `long_description`
  - Voice: Monocle-adjacent, place-grounded, anti-chain, non-promotional
  - Detail page renders max 250 words (truncated in render layer as safety net)
  - `reviewed` boolean for human QA workflow
- **Listing counts**: Denormalized `listing_count` updated by cron sync
- **Region matching**: Text-based `ilike` on `listings.region` with alias map in `updateRegionCounts.js`
  - Aliases handle multi-name regions (e.g. "Hobart" → "Hobart & Southern Tasmania")
- **Index page design**: Clean header (no dark banner), 3-column grid, cards show name + state + listing count only (no description)
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
- Embeddings: 1536-dim vectors (OpenAI text-embedding-3-small compatible)
- CSS uses custom properties (--color-cream, --color-accent, --color-ink, etc.)
- Fonts: `--font-display` (Playfair Display), `--font-body` (DM Sans)
- Editorial content is generated once and stored — never generated at runtime
- Region hero images use Unsplash with proper attribution (`hero_image_credit`)

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
