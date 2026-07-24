# Mount Lofty Estate group removal — 2026-07-24

Removed the Mount Lofty Estate group from the Atlas: it operates five venues
under centralised management with Accor MGallery affiliation and fails the
point-of-operation independence test.

## Investigation

**Domain matches (`listings.website` ILIKE any of the five domains):** 2 rows,
both `rest`, both SA, both unclaimed, both previously `status='active'`.

| slug | name | vertical | source_id | website | claim |
|------|------|----------|-----------|---------|-------|
| mount-lofty-house | Mount Lofty House | rest | 65 | mtloftyhouse.com.au | none |
| sequoia-lodge | Sequoia Lodge | rest | 298 | sequoialodge.com.au | none |

The other three domains (`gatekeepersdayspa.com.au`, `hardysverandah.com.au`,
`marthahardys.com.au`) have **no listings** in the network.

**Name-ILIKE matches (`%mount lofty%` / `%sequoia%` / `%hardy%`) — reported
only, NOT archived on name match:**

| listing | note |
|---------|------|
| field/mount-lofty-botanic-garden — Mount Lofty Botanic Garden (SA) | independent public garden, unrelated to the estate — left active |
| collection/mount-lofty-botanic-garden — Mount Lofty Botanic Garden (SA) | same garden (Culture vertical) — left active |
| rest/mount-lofty-house | also a domain match — archived |
| rest/sequoia-lodge | also a domain match — archived |

No listing is named "…Hardy…"; the `%hardy%` name probe matched nothing beyond
the estate set. (Note: "Hardys" already exists as a *wine* brand under the
unrelated Accolade Wines group — a reason matching here is **domain-only**.)

**`commercial_groups` (the "known_groups" table) coverage:** no existing entry
covered these domains or names before this change. Accor exists as a global
(`vertical_scope = NULL`) group with an `MGallery` brand, but its `domains` list
does not include the estate's own booking domains.

## Fix

1. **`commercial_groups` entry** — migration
   `supabase/migrations/259_mount_lofty_estate_commercial_group.sql`:
   - `group_name = 'Mount Lofty Estate'`, `category = 'hotel_accommodation'`
   - `domains` = the five estate domains (match is **domain-only**; `brands` /
     `brands_json` left empty to avoid colliding with the Accolade "Hardys"
     wine brand and the independent Mount Lofty Botanic Garden)
   - `vertical_scope = NULL` (global — the estate spans stay/dine/spa)
   - `verify_case_by_case = false` (hard independence fail)
   - `parent_entity = 'Accor (MGallery)'`
2. **Soft-archive of the two domain-matched listings** (`02-archive-listings.mjs`):
   - Master `listings.status` → **`deleted`** (see deviation note) with an audit
     `hidden_reason`. Excluded from every public surface; row + audit fields
     preserved; restorable from Trash. **No hard deletes.**
   - Rest source `properties.status` → **`archived`** (a valid source value) so
     the restatlas vertical 404s the venue and the nightly rest→master sync
     cannot reactivate it (`normalizeStatus('archived') → 'inactive'`).
   - Per-row live-claim guard: any listing with a `listing_claims` row in
     (`active`,`past_due`) is skipped and flagged, never archived silently.
     Both rows were unclaimed, so none were skipped.

### Deviation: `status='deleted'`, not `'archived'`

The brief specified `status = 'archived'` on the master listings. The live
`listings_status_check` constraint permits only
`active | inactive | pending | hidden | deleted` — `'archived'` is not a valid
`listings` status and the write would fail. `deleted` is the codebase's
reversible soft-delete / Trash state (migration 153: rows preserved, restorable,
excluded from all public surfaces), which matches the brief's intent
("soft-archive … no hard deletes … preserve rows"). The source rows carry the
literal `archived` status, which the `properties` table does accept.

## Testing

- **Portal** `australianatlas.com.au/place/{slug}` → **404** for both
  `mount-lofty-house` and `sequoia-lodge`; an active control
  (`mount-lofty-botanic-garden`) still returns 200.
- **Vertical** `restatlas.com.au/stay/{slug}` (the rest surface is `/stay`, not
  `/venue`) → `mount-lofty-house` renders the generic not-found page (matching an
  already-archived reference, `spicers-peak-lodge`). `sequoia-lodge` was still
  served from a stale Vercel ISR cache at removal time; the source data is
  correct (`archived`) and it revalidates to not-found on restatlas's next
  background regeneration.
- **Gate auto-reject** (`03-gate-reject-test.mjs`): a test `listing_candidates`
  row with `website_url = mtloftyhouse.com.au` is rejected by
  `checkCharacterGate` citing the **Mount Lofty Estate** group (domain match,
  `gate5_character`, `verify=false`). All five domains match; an unrelated
  independent domain is not rejected. The test row was deleted.
- **No collateral changes**: a full before/after snapshot of all 11,355
  `listings.status` values shows exactly the two archived ids changed
  (`active → deleted`); zero other rows changed, zero added/removed. See
  `scripts/mount-lofty/artifacts/archive_report.json`.

## Reproduce

```bash
node scripts/mount-lofty/01-insert-group.mjs      # idempotent group insert
node scripts/mount-lofty/02-archive-listings.mjs  # claim-guarded soft-archive
node scripts/mount-lofty/03-gate-reject-test.mjs  # gate auto-reject + cleanup
```
