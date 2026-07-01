# Korean Launch — Authoritative Spec

Status: **staged** on branch `feat/ko-launch` (not merged, not pushed).
Owner: Matt. Target locale: **ko** (Korean). Default locale: **en** (unchanged).

This document is the authoritative spec for adding a Korean-language experience to
the Australian Atlas portal. It was authored as part of the `feat/ko-launch` work
because the referenced `docs/ko/launch-spec.md` did not yet exist in any ref. It
follows the directive that commissioned the work and the concrete architecture
chosen after reading the live codebase.

---

## Hard invariants (non-negotiable)

1. **Existing English URLs are UNCHANGED.** `/place/foo`, `/search`, `/regions/x`
   must resolve exactly as before, byte-for-byte in routing behaviour. No route
   folders are moved. Korean is served under a `/ko` prefix only.
2. **Additive migration only.** `listing_translations` is a new table. The
   `listings` table is never altered. Translations live beside the source, never
   overwrite it.
3. **Never blank.** Every localized surface falls back to the English source
   column whenever a Korean row (or field) is missing. A missing translation
   degrades to English, never to an empty string.
4. **Search stays English under the hood.** The existing English embedding search
   is unchanged. A Korean query is translated to English *at request time* and
   then fed to the same pipeline.

---

## Architecture decision: middleware rewrite, not a `[locale]` move

next-intl's canonical App-Router setup puts every route under `app/[locale]/`.
With ~218 page/layout files and a hard "English URLs unchanged" invariant, that
physical move is high-risk. Instead this launch uses next-intl in its **"without
i18n routing"** mode plus a **middleware rewrite**:

- English requests are never rewritten. Locale resolves to `en`.
- A `/ko/...` request is rewritten internally to the underlying route (`/ko/place/x`
  → `/place/x`) with an `x-atlas-locale: ko` request header. The browser URL keeps
  `/ko`. next-intl reads the header in `getRequestConfig` and serves Korean.
- The root layout already reads cookies (auth), so **every route is already
  dynamically rendered** — the rewrite reliably yields Korean; nothing is baked as
  static English HTML.

This satisfies `localePrefix: 'as-needed'` semantics (default locale unprefixed,
Korean prefixed) without moving a single route folder, and gives every route a
Korean equivalent for free because it is the same route tree.

---

## 1. Migration — `listing_translations`

`supabase/migrations/201_listing_translations.sql`, applied via
`scripts/run-migration.mjs`.

```
listing_translations (
  listing_id  uuid    not null references listings(id) on delete cascade,
  locale      text    not null,               -- 'ko'
  name        text,                            -- translated; null → fall back to listings.name
  description text,                            -- translated; null → fall back to listings.description
  source_hash text,                            -- sha256 of source (name + \0 + description) for idempotency
  model       text,                            -- provenance
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  primary key (listing_id, locale)
)
```

- RLS enabled; anon/authenticated may `SELECT` (public content); writes are
  service-role only (the render path uses the service-role admin client, which
  bypasses RLS, but the policy is defence-in-depth).
- Additive only. `listings` is untouched.

## 2. Content run — `scripts/translate-listings.mjs`

`node scripts/translate-listings.mjs --locale ko`

- Reads active, public listings (`status='active'`, public verticals), translates
  `name` + `description` with Claude Haiku (`claude-haiku-4-5`), batched and
  concurrency-limited.
- **Idempotent**: computes `source_hash`; a listing whose source is unchanged and
  already translated is skipped. `--force` re-translates. `--limit N` for smoke
  tests.
- Upserts rows into `listing_translations`.
- Writes `ko-review.html` (side-by-side EN/KO review table) to the repo root.
- Prints rows written + estimated cost.

## 3. UI strings — next-intl messages

- `messages/en.json` holds interface (chrome) strings, namespaced: `nav`,
  `footer`, `home`, `search`, `place`, `common`, `language`.
- `messages/ko.json` is generated from `en.json` with Haiku
  (`scripts/translate-ui.mjs`).
- `i18n/request.js` (`getRequestConfig`) resolves locale from the
  `x-atlas-locale` request header and loads `messages/{locale}.json`.
- Root layout wraps children in `NextIntlClientProvider`; components read strings
  via `useTranslations` / `getTranslations`.

## 4. Routing — next-intl, `localePrefix: 'as-needed'`

- `next.config.mjs` wrapped with `createNextIntlPlugin('./i18n/request.js')`.
- `middleware.js` gains a locale block: detect `/ko` prefix, compute the base
  path, use the base path for the existing auth checks, and finish with a rewrite
  that injects `x-atlas-locale`. English is passed through untouched.
- `lib/i18n/config.js` — `locales`, `defaultLocale`, `localePrefix`.
- `components/LocalizedLink.js` — a `next/link` wrapper that prefixes `/ko` when
  the active locale is Korean, so navigation stays within the language.
- `components/LanguageSwitcher.js` — toggles EN ⇄ KO for the current path.

## 5. Rendering — localized with English fallback

- `getListing(slug, locale)` overlays `listing_translations` (`name`,
  `description`) onto the English row when `locale === 'ko'`, field-by-field, with
  English fallback on any missing field.
- `lib/i18n/listingLabels.js` localizes the display labels for vertical category,
  sub-type, and region name (static dictionaries, EN + KO). Missing → English.
- The place page renders Korean name/description/type/region under `/ko`; every
  field falls back to English if untranslated. Never blank.

## 6. Search — translate the query, keep the engine

- `lib/search/translateQuery.js` — detects Hangul (or `?lang=ko`) and translates
  the query to English via Haiku (cached), fail-open to the raw query.
- `app/api/search/route.js` translates `q` to English *before* embedding and the
  hybrid RPC. Everything downstream is unchanged.

## 7. SEO — hreflang, sitemap, html lang

- Middleware emits `Link: <...>; rel="alternate"; hreflang="en|ko|x-default"`
  response headers on every HTML page (uniform, covers all routes).
- `app/sitemap.js` adds `alternates.languages` (en + ko) to every entry and lists
  the `/ko` home.
- `<html lang>` is set per resolved locale in the root layout.

## Testing

- `next build` passes.
- An English URL behaves exactly as before.
- The `/ko` equivalent renders Korean with no blank fields.
- The language switcher round-trips.
- A Korean search returns results.
