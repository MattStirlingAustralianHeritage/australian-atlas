# Legal-upload-safeguards

Infrastructure for a traceable consent/warranty chain on operator content + a
documented notice-and-takedown process. Australia gives commercial platforms no
copyright safe harbour, so every hosted operator asset needs (a) a recorded
warranty from the uploader and (b) a fast, logged takedown lever.

> **All human-readable legal copy in this branch is INTERIM plain-English
> placeholder, pending solicitor review.** See [§ Interim legal copy](#interim-legal-copy).

> **Branch only.** No production migrations were run; nothing is merged. Apply
> the migrations to a database *before* deploying the consumer code — see
> [§ Deployment ordering](#deployment-ordering).

---

## What it does (by phase)

**Schema (migrations 166–169)**
- `166_legal_documents.sql` — versioned legal docs + seed of `upload_terms` v1 and
  `operator_agreement` v1 (interim copy, `content_hash`, `is_current`). RLS:
  public can read current docs; only service-role writes.
- `167_legal_acceptances.sql` — who accepted what, when (version, IP, UA).
- `168_asset_provenance.sql` — per-upload consent/warranty record + takedown lever.
- `169_infringement_reports.sql` — notice-and-takedown intake + workflow.

**Claim acceptance gate (Phase 3)** — `/claim/[slug]` now renders the current
Operator Agreement + Upload Terms from the DB, each with its own required
checkbox. `POST /api/claim` fails closed if the docs can't load, blocks the
claim unless both are affirmed, and writes a `legal_acceptances` row per doc.

**Upload warranty gate (Phase 4)** — the dashboard photo editor shows an
image-rights affirmation (+ optional source/credit). `POST /api/dashboard/listing/upload`
rejects an upload without the warranty and writes an `asset_provenance` row;
**fail closed** — if provenance can't be written, the just-uploaded object is
removed and the upload fails. A DB `CHECK` also forbids a provenance row with
`upload_warranty_accepted = false`. The same route serves hero, gallery, **and
event** images (`EventsSection.js`), so all three are gated and recorded
(`asset_kind in ('hero','gallery','event')`).

**Notice-and-takedown (Phase 5)** — `/report-infringement` (linked from the
place-page "Report an issue" modal) captures a report incl. a good-faith
statement, persists it (`status = received`), and emails
`matt@australianatlas.com.au` via Resend. Admin queue at
`/admin/infringement-reports`: advance status (+ `status_changed_at`,
`handled_by`, `internal_notes`), archive (soft, no hard delete), and the
fast-response lever — set an asset's `takedown_status = removed` (reversible,
logged).

## Files

```
ADDED
  supabase/migrations/166_legal_documents.sql
  supabase/migrations/167_legal_acceptances.sql
  supabase/migrations/168_asset_provenance.sql
  supabase/migrations/169_infringement_reports.sql
  lib/legal/documents.js                         # getCurrentLegalDocuments + recordLegalAcceptances
  app/api/legal/current/route.js                 # GET current docs (renders live wording)
  app/api/report-infringement/route.js           # public takedown intake
  app/report-infringement/page.js + ReportInfringementForm.js
  app/api/admin/infringement-reports/route.js    # admin status/archive/takedown actions
  app/admin/infringement-reports/page.js + InfringementReportsQueue.js
  docs/legal-upload-safeguards/{README.md, verify.mjs}

CHANGED
  app/claim/[slug]/page.js                        # fetch + pass legal docs
  app/claim/[slug]/ClaimForm.js                   # two affirmation checkboxes, gated submit
  app/api/claim/route.js                          # affirmation gate + acceptance recording
  app/api/dashboard/listing/upload/route.js       # warranty gate + provenance write (fail-closed)
  app/dashboard/listings/[id]/edit/page.js        # image-rights panel + warranty fields on upload
  app/dashboard/listings/[id]/edit/EventsSection.js   # event-image warranty (shares the upload route)
  components/ReportIssueButton.js + ReportIssueModal.js   # infringement entry point
  app/place/[slug]/page.js                        # pass slug to the report button
```

## Design decisions (worth a glance before sign-off)

- **A — `legal_acceptances.operator_id` is nullable.** A claim is made
  anonymously (name + email) *before* an account exists, so `operator_id` is
  null at acceptance time. `claim_id` (FK `claims_review`) + `subject_email`
  keep the row attributable, and a `CHECK` requires at least one identifier.
  Back-fill `operator_id` when the account is created on approval.
- **B — `asset_provenance` is keyed by listing + storage path, not an asset
  FK.** There is no per-row assets table (hero = `listings.hero_image_url`;
  gallery = a storage manifest), so provenance uses
  `listing_id + asset_kind + storage_path + public_url`, with `uploaded_by` →
  `profiles(id)`. `infringement_reports.asset_id` is a nullable FK to
  `asset_provenance(id)` — the only meaningful asset handle.
- **C — branched off `origin/main`** in an isolated worktree (not the
  concurrent `feat/image-moderation` WIP). `doc_type` and the status columns are
  `TEXT + CHECK`, matching the repo convention (not native PG enums). New PII
  tables get RLS (service-role only) even though most existing tables don't —
  these carry IPs / emails / internal notes and would otherwise be anon-readable
  via the auto REST API.

## Deployment ordering

The consumer code reads/writes the new tables, and the gates **fail closed**
(claim 503 / upload 500) when the tables are absent. So:

1. Apply migrations **166 → 169** (in order) to the target DB.
2. Then deploy the code.

Running the code against a DB without these tables will block claims and
uploads. (This matches the repo's migration-deployment discipline in CLAUDE.md.)

## Verification

No Docker / Supabase CLI / local Postgres is available here, and production
migrations are forbidden, so testing used an **in-process pglite Postgres** for
the DB layer and **esbuild** to parse every source file. Re-run the DB suite:

```
npm i --no-save @electric-sql/pglite
node docs/legal-upload-safeguards/verify.mjs
```

**Covered (passing):**
- Migrations 166–169 apply cleanly (fresh DB).
- Schema: all 4 tables, every CHECK allowlist, indexes (incl. the
  one-current-per-`doc_type` partial unique), RLS enabled on all 4.
- Seeds: `upload_terms` / `operator_agreement` bodies are **verbatim**;
  `content_hash = sha256(body_md)`; only the two supplied doc_types seeded
  (no invented ToS / privacy copy).
- Data-layer end-to-end: acceptance rows written + attributable pre-account;
  provenance `CHECK` rejects `warranty = false`; report defaults to `received`;
  status workflow; asset takedown `removed` ↔ `active` (reversible, logged);
  report soft-archive retains the row.
- The **real** `lib/legal/documents.js` helper (`getCurrentLegalDocuments` +
  `recordLegalAcceptances`) run against the live tables via a supabase-js shim.
- `esbuild` parses all 16 added/changed `.js`/JSX files; `node --check` passes
  on every non-JSX route + the lib.

**Deferred to post-migration (could not run here):**
- Live HTTP/browser end-to-end of the Next routes + React components. The app
  talks to Supabase over REST (service-role) and the new tables don't exist on
  prod (no prod migration), and pglite has no PostgREST layer — so a running
  server can't exercise the routes here. The route gate logic was verified by
  inspection + the DB invariants above; please smoke-test in the browser after
  the migrations are applied to a dev/staging DB.
- Resend email is wired (`to: matt@australianatlas.com.au`) but **not** sent
  during testing (no real outbound email in dev).

<a name="interim-legal-copy"></a>
## Interim legal copy

**Every piece of human-readable legal wording in this branch is interim,
plain-English placeholder and is NOT final or legally reviewed.** It is rendered
from the DB precisely so the solicitor's final wording is a *data* change (a new
`legal_documents` version with `is_current` flipped), not a code change. Replace
before relying on this:

- `legal_documents.upload_terms` v1 — seeded interim "INTERIM TERMS. …" copy
  (migration 166). Shown in the claim gate + the upload image-rights panel.
- `legal_documents.operator_agreement` v1 — seeded interim
  "INTERIM OPERATOR AGREEMENT. INTERIM TERMS. …" copy (migration 166). The
  literal prepend leaves a double "INTERIM …" lead-in — confirm whether you want
  the prefix to *replace* the "INTERIM TERMS." lead-in instead.
- `legal_documents.terms_of_service` and `privacy_policy` — **not seeded** (no
  copy was supplied; we don't invent clauses). Add reviewed versions when ready.
- Inline microcopy pending the same review: the claim-form checkbox labels
  (`ClaimForm.js`); the upload affirmation sentence + panel heading
  (`edit/page.js`) + the event-image affirmation (`EventsSection.js`); the
  `/report-infringement` page intro, field labels, and the
  good-faith statement sentence (`ReportInfringementForm.js`); the report-modal
  "Report a copyright or intellectual-property issue" link.

To publish a revised version: insert a new `legal_documents` row for the
`doc_type` with the next `version`, set `is_current = true` (the partial unique
index auto-enforces a single current row), and the gates pick it up immediately.
