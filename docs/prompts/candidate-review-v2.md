# Queued: Candidate Review v2 — Admin Editing Overhaul

**Status:** Waiting on Phase 1 regions architecture completion.
**Do not start until:** Phase 1.8 verified (spatial containment trigger live, `listings.region_override_id` column exists and working).
**Reference:** [docs/architecture/regions.md](../architecture/regions.md) — specifically the Data Model and Override Mechanisms sections. The region dropdown in this tool is the primary implementation of Override Mechanism 1 ("Humanator admin UI — primary path"). Writes go to `region_override_id`, never to `region_computed_id` or the legacy `listings.region` column (except during the transition period specified in Phase 3).

---

## Context

The admin Candidate Review tool at `/admin/candidates` currently presents listings as read-only cards with binary publish/skip actions. Review is showing that source data has structural problems (wrong region assignments derived from audit bounding box names, addresses not verified, suburb buried in `internal_notes` blob). Reviewers need to fix data inline before publish rather than publishing-then-fixing or skipping-and-losing-the-listing.

## Investigation first (do before any code changes)

1. Read `app/admin/candidates/page.js` (or equivalent route) and enumerate every field currently rendered on the candidate card. Produce a list.
2. Read the publish handler. Enumerate every field currently written to `listings` on publish. Produce a list.
3. Identify the schema of the candidates source — confirm where the "region" text currently shown ("Adelaide" in our reference case) comes from. Is it the candidate row itself, or derived from source metadata? Show me the query.
4. Report findings before writing any new code.

## Implement (in this order, committing between each step)

### Step 1 — Region dropdown

- Add a dropdown sourced from `SELECT id, name FROM regions WHERE status IN ('live', 'draft_activating') ORDER BY name`.
- Pre-populate from existing candidate region field if it matches a valid region name.
- Show computed region alongside (from spatial trigger result once listing is inserted — may require a preview geocoding step).
- Writes to `listings.region_override_id` on publish.

### Step 2 — Address, suburb, name, website editable inputs

- Parse `internal_notes` for structured fields (`Category: X | Suburb: Y`) and pre-populate.
- Editable text inputs for each.
- Validate: address non-empty for visitable listings, website URL format, name non-empty.

### Step 3 — Primary type dropdown vertical-specific validation

- Verify options match vertical canonical types. Reject candidate if `primary_type` doesn't match the vertical on validation.

### Step 4 — Operator type dropdown

- Optional dropdown: `independent`, `public_heritage`, `aboriginal_community`, `concessionaire`, `trust`. Defaults to `independent`.

### Step 5 — Preserve keyboard shortcuts and queue flow

- Y / N / E / skip / arrow keys unchanged.
- Edit actions don't disrupt the queue position.
- "Save and continue" and "Save and publish" are distinct actions.

## Test cases

- Open Hotel California Road at Inkwell Wines (in Rest queue, shows as "Adelaide"). Change region dropdown to McLaren Vale. Publish. Verify listing lands on `/regions/mclaren-vale` with correct `region_override_id`. Verify `region_computed_id` also resolves to McLaren Vale via the spatial trigger (override and computed should agree).
- Open a listing with bad suburb in `internal_notes`. Edit suburb inline. Publish. Verify `listings.suburb` reflects the edit.
- Open a listing with wrong `primary_type` for the vertical (e.g. Rest candidate with `primary_type = Ceramicist`). Attempt to publish. Expect validation rejection.
- Open a candidate, edit several fields, press E again to cancel edits. Verify unsaved changes are discarded.
- Queue navigation (N skip, Y publish) preserves edits-in-progress warning if any.

## Do not change

- The underlying publish pipeline beyond what's required to write the new fields.
- The review queue / rejected log tab structure.
- The vertical filter tabs.
- The candidate-generation pipeline (this is a display/editing problem, not a source-data problem).
