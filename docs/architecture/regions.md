# Regions — Source of Truth

**Date:** 23 April 2026
**Author:** Matt Smith
**Status:** Active

## Purpose

This document defines how region values are populated, validated, 
and maintained on the portal's `listings` table. It exists because 
the original approach — letting vertical syncs write region data 
directly — resulted in 239 of 258 active Rest listings having 
street addresses in their `region` field instead of region names. 
The bug was invisible for months because no feature read region 
data in a way that failed loudly, until Plan-a-Stay was built.

This doc is the fix, and more importantly, the specification that 
prevents the same class of bug recurring. It is authoritative. 
Code that touches region data must conform to it. If this doc and 
a prompt conflict, this doc wins and the prompt should be flagged.

## Principles

1. **Region is an editorial concept, not a geographic one.**
   When geography, editorial judgement, and discovery intent 
   conflict, editorial wins. Geography is the default starting 
   point, not the final word.

2. **Region is mandatory for visitable listings only.** 
   Non-visitable listings (online-only makers, mobile operators, 
   by-appointment practices) may have NULL region. The map, 
   trails, and Plan-a-Stay exclude these anyway; forcing region 
   on them creates data fiction.

## Data Model

Two fields on `listings`:

- `region_computed_id` (UUID, foreign key to `regions.id`, 
  nullable) — the result of spatial containment: given the 
  listing's lat/lng, which region polygon contains it. Recomputed 
  automatically whenever lat/lng changes.

- `region_override_id` (UUID, foreign key to `regions.id`, 
  nullable) — set manually by an admin when editorial judgement 
  differs from the geographic result. Never written by an 
  automated process.

Reads use the override if set, else the computed value. Downstream 
code can either check both fields explicitly or consume a view 
that implements the coalesce.

Foreign key references rather than name strings, so region renames 
are atomic (one row update in the `regions` table, no bulk listing 
updates required).

The existing `listings.region` text column is preserved through 
Phase 2 of implementation, then deprecated in Phase 3.

## Override Mechanisms

1. **Humanator admin UI (primary path).** A dropdown in the 
   listing edit form that sets `region_override_id`. Expected to 
   be the way 99% of overrides get created.

2. **Bulk reassignment script (secondary path).** Used when a 
   region is renamed, split, or merged, or when a boundary review 
   reassigns a cluster of listings at once. Runs as an 
   admin-invoked script, not an automated process.

3. **No claim-time overrides.** Venue claims don't surface region 
   as an editable field. If an owner disagrees with their region 
   assignment, they raise it via claim notes and an admin resolves 
   it in Humanator. Keeping overrides admin-only prevents 
   commercial pressure from influencing editorial assignments.

## Sync Behaviour

1. Vertical-to-portal syncs write lat/lng, name, slug, 
   description, status, hero image, contact details, and other 
   listing metadata. They do not write `region`, `region_computed_id`, 
   or `region_override_id`.

2. On insert or when lat/lng changes, a database trigger 
   recomputes `region_computed_id` from the new coordinates against 
   the region polygons in the `regions` table.

3. `region_override_id` is only ever written by an admin action 
   through the Humanator admin UI, or by a named bulk reassignment 
   script run by an admin. No automated process, sync, or 
   background agent writes to `region_override_id` under any 
   circumstances.

4. Vertical-side region-like fields (`restatlas.properties.sub_region` 
   and its equivalents on other verticals) are ignored by the 
   sync. They are neither read as authoritative nor logged as 
   advisory. Fixing these fields upstream is out of scope for 
   this decision and may leave vertical-site features that depend 
   on them in a degraded state. That is a known and accepted 
   consequence; a separate follow-up task will address 
   vertical-side consumption patterns (see OQ1).

5. Validation at sync boundary: before writing to `listings`, 
   sync validates required fields. Missing lat/lng on a visitable 
   listing, status not in the enumerated set, sub_type not 
   matching the vertical's canonical types, or state not a valid 
   two-letter code — any of these cause the row to be written to 
   a `listings_quarantine` table instead of `listings`. An admin 
   alert lists quarantined rows daily. Rows promote from 
   quarantine to `listings` once the data is corrected.

## Edge Cases

### 1. Listing sits geographically in one region, editorially in another

Scenario: A venue on the border between Central Victoria and 
Macedon Ranges is 400m inside Central Victoria's polygon, but the 
venue markets itself as Macedon Ranges, local press treats it as 
Macedon Ranges, and travellers searching for Macedon Ranges stays 
expect to find it.

Resolution: Editorial override wins. Admin sets 
`region_override_id` to Macedon Ranges in Humanator. 
`region_computed_id` remains Central Victoria for audit purposes. 
The discrepancy is visible in any query comparing the two fields, 
which is deliberate — it surfaces every editorial decision for 
review.

### 2. Regions overlap each other by design

Scenario: The regions table has both "Launceston & Tamar Valley" 
and "Tamar Valley" as separate live regions. A listing near George 
Town falls inside both polygons.

Resolution: When spatial containment returns multiple matches, 
`region_computed_id` gets the smaller polygon by area. This 
implements the existing rule in the curation standards doc ("if a 
listing sits on the boundary between two regions, assign it to 
the more specific/smaller region") mechanically. Admin can 
override if editorial judgement differs.

### 3. Listing's lat/lng falls outside every live region polygon

Scenario: A listing in a remote area (central Australia, offshore 
island, genuinely remote Kimberley) has valid lat/lng but no live 
region polygon contains it.

Resolution: `region_computed_id` is NULL. The listing quarantines 
for admin review. Admin either (a) sets `region_override_id` 
manually from the live regions list, (b) flags the region polygon 
as needing to extend, or (c) marks the listing as non-visitable 
if it genuinely belongs nowhere. NULL region on a visitable 
listing is an unresolved state, not a final state.

### 4. Listing's lat/lng falls inside a DRAFT region

Scenario: A Sydney CBD listing's coordinates fall inside the 
Sydney region polygon, but Sydney's status is 'draft'. The 
whitelist would exclude it, but geographically it belongs there.

Resolution: `region_computed_id` gets set to the draft region's 
id regardless of status. Downstream features that filter to live 
regions only (Plan-a-Stay, region landing pages) naturally 
exclude these. When the region activates, no data change is 
required — the listings are already correctly assigned, they just 
become visible. Draft regions exist to stage data before public 
launch; this is correct behaviour.

### 5. Listing has known-wrong lat/lng but correct region

Scenario: A listing was geocoded to a point slightly outside its 
actual venue (maybe the geocoder resolved to the suburb centroid 
instead of the address), putting it in the wrong region polygon.

Resolution: Two paths. Preferred: fix the lat/lng, let 
`region_computed_id` recompute correctly. Fallback: set 
`region_override_id` if the lat/lng can't be corrected 
immediately. The override is correct but the underlying lat/lng 
is still wrong, which will surface in map rendering — so fixing 
lat/lng is the real resolution. Override is a band-aid, not a 
fix.

### 6. Region gets renamed

Scenario: "Launceston & Tamar Valley" gets renamed to "Greater 
Launceston" because editorial positioning changes.

Resolution: Update `regions.name` in place. Because listings 
reference region by FK (id), no listing-level migration is 
required. Any caches or denormalised name fields elsewhere in the 
system must invalidate on the change.

### 7. Region gets split into two

Scenario: "Launceston & Tamar Valley" splits into "Launceston" 
and "Tamar Valley" as separate regions with distinct polygons.

Resolution: The bulk reassignment script runs. For every listing 
currently assigned to the old region, re-run the spatial join 
against the new polygons. Listings get reassigned to whichever 
new polygon contains their lat/lng. Listings with 
`region_override_id` pointing at the now-archived region need 
manual review — the override explicitly disagreed with geography, 
so the split's geographic reassignment may or may not match the 
editorial intent.

### 8. Region gets merged with another

Scenario: Two adjacent small regions combine into one larger 
region.

Resolution: Bulk reassignment script. Listings in both old 
regions get `region_computed_id` recomputed against the new 
merged polygon. Overrides pointing at either old region get 
rewritten to the new region (safe, since the merge is a 
superset). Old region rows get `status = 'archived'`, not 
deleted, for audit history.

### 9. Region gets deleted entirely

Scenario: A region is removed from the Atlas because it was a 
mistake or consolidated elsewhere.

Resolution: Never hard-delete a region row. Set `status = 
'archived'`. Listings previously assigned to it get 
`region_computed_id` recomputed; if they fall into another live 
region, they move. If they don't, they quarantine per Edge Case 
3. Archived regions remain queryable for audit but don't appear 
in admin dropdowns or public surfaces. FK constraints on 
listings use ON DELETE SET NULL as a defensive measure even 
though hard-deletes shouldn't happen.

### 10. A visitable listing has NULL region_computed_id AND NULL region_override_id

Scenario: The listing is visitable, lat/lng is valid, but 
`region_computed_id` returned NULL (lat/lng outside all live 
polygons) and no admin has set an override yet.

Resolution: The listing is in quarantine state. It does not 
appear on the portal, map, region pages, Plan-a-Stay, or any 
public surface. It appears in the Humanator's "needs region 
assignment" queue. It can be fetched directly by slug/ID for 
admin purposes but is invisible to users. Quarantine is not a 
permanent state — it demands resolution.

### 11. A non-visitable listing with NULL region

Scenario: An online-only maker on Craft Atlas has no physical 
location. Region is NULL on all fields. This is the intended 
state.

Resolution: No action. Non-visitable listings are not required 
to have a region. They appear in search, vertical landing pages, 
and by direct link, but never in region-based surfaces. This is 
correct behaviour, not a bug.

## Implementation Plan

This plan executes in three phases. Phase 1 sets up the 
infrastructure without breaking anything. Phase 2 is the 
backfill. Phase 3 is the ongoing enforcement. Each phase has 
verification criteria before moving to the next.

### Phase 1 — Infrastructure

1.1 Enable the PostGIS extension on the portal Supabase project.

1.2 Add `polygon` column to the regions table:
    - Type: `GEOMETRY(MultiPolygon, 4326)`
    - Nullable (populated in a separate task)
    - GIST index for spatial query performance

1.3 Add region FK columns to the listings table:
    - `region_computed_id UUID NULL REFERENCES regions(id) ON 
      DELETE SET NULL`
    - `region_override_id UUID NULL REFERENCES regions(id) ON 
      DELETE SET NULL`
    - B-tree indices on both columns
    - Existing `listings.region` text column left in place for 
      Phase 2 verification

1.4 Verify with queries: FK constraints enforced, indices present, 
    counts sensible.

1.5 Build the spatial containment trigger. Fires on INSERT or 
    UPDATE of listings.latitude or listings.longitude. Computes 
    `ST_Contains` against live and draft region polygons. If 
    multiple matches, selects the region with the smallest 
    polygon area. Writes result to `listings.region_computed_id`. 
    If no match, writes NULL.

1.6 Build the `listings_quarantine` table mirroring the listings 
    schema plus `failure_reason` and `quarantined_at` columns. 
    Promotion function moves rows from quarantine to listings 
    once failure conditions are resolved.

1.7 Build the sync validation layer. Before any write to listings, 
    check: lat/lng present for visitable listings, status in 
    enumerated set, sub_type matches vertical, state is 
    two-letter code. Failures quarantine the row with the 
    specific failure_reason.

1.8 Build the daily quarantine alert. Scheduled job queries 
    `listings_quarantine`, emails matt@australianatlas.com.au 
    with the list of quarantined rows grouped by failure_reason.

**Verification before Phase 2:**
- PostGIS enabled and queryable
- All 55 live regions have polygons populated (separate task 
  precedes Phase 2)
- Spatial containment trigger tested against 10 known listings 
  across different regions — `region_computed_id` matches 
  expected value for each
- Quarantine table accepts writes and the promotion function 
  works
- Daily alert fires (even if empty)

### Phase 2 — Backfill

2.1 Snapshot the listings table. SQL dump to a backup location 
    before any UPDATE runs. If the backfill goes wrong, this is 
    the rollback point.

2.2 Run the spatial join as a one-time backfill across all 
    listings. `UPDATE listings SET region_computed_id = (spatial 
    containment result)`. Log every row change with before/after 
    values to a `backfill_log` table.

2.3 Spot-check the Rest vertical. For the 258 Rest listings, 
    query `region_computed_id` and verify against editorial 
    expectation. The 19 that matched canonical regions under the 
    whitelist check should now have computed values that match 
    their manually-assigned region. The 239 that were 
    contaminated should now have correct `region_computed_id` 
    derived from lat/lng.

2.4 Spot-check each other vertical. Pull 20 random listings per 
    vertical, verify `region_computed_id` is editorially correct. 
    If any vertical shows systematic mismatch, investigate before 
    proceeding.

2.5 Manual review of edge cases. Listings with NULL 
    `region_computed_id` (lat/lng outside all polygons) get 
    flagged in the Humanator's "needs region assignment" queue. 
    Admin resolves by setting `region_override_id` or correcting 
    lat/lng. This is ongoing, not blocking.

2.6 Re-enable the "Plan your stay" homepage card. The underlying 
    data is now correct; the feature can be promoted again.

**Verification before Phase 3:**
- Every Rest listing has `region_computed_id` matching editorial 
  expectation (spot-checked 20+)
- Plan-a-Stay page shows correct regional grouping when loaded
- Backfill log is preserved for audit
- Quarantine queue is being worked through (not necessarily empty, 
  but actively resolving)

### Phase 3 — Enforcement

3.1 Refactor all vertical sync functions (`mapRestListing`, 
    `mapSmallBatchListing`, `mapCraftListing`, etc.). Remove any 
    code that writes to `listings.region`, 
    `listings.region_computed_id`, or 
    `listings.region_override_id`. Syncs write lat/lng; the 
    trigger handles the rest.

3.2 Deprecate the legacy `listings.region` text column. Rename to 
    `listings.region_legacy_do_not_use`. After 30 days without 
    incident, drop the column.

3.3 Add continuous invariant checks. A scheduled daily job runs:
    - Count of visitable listings with NULL `region_computed_id` 
      AND NULL `region_override_id` (should be zero, or trending 
      to zero)
    - Count of listings where sub_type doesn't match 
      vertical's canonical types
    - Count of listings where state is not a valid two-letter 
      code
    - Count of listings where status is not in enumerated set
    - Count of listings with NULL lat/lng where visitable = true
    Emails matt@australianatlas.com.au daily with any non-zero 
    counts.

**Verification:**
- Sync functions no longer write region fields
- Legacy column deprecated and eventually dropped without 
  incident
- Daily invariant report arrives in inbox, counts are tracked 
  over time

## Open Questions

Decisions explicitly not made in this doc, parked for future work.

### OQ1 — Vertical-side consumption of region

This doc decides how region is populated on the portal. It does 
not decide what each vertical's own frontend does with region 
data. If restatlas.com.au has region-based landing pages or 
filtering that currently reads from `properties.sub_region`, 
those surfaces are currently broken and will stay broken until a 
separate follow-up addresses how verticals consume region from 
the portal (reverse sync, direct join, or API read). Scope: 
separate task, not urgent if vertical-side region features are 
low-traffic.

### OQ2 — Multi-region listings

A listing belongs to exactly one region in this model. Some 
listings legitimately straddle regions in traveller mental models 
(a venue on the Mornington Peninsula / Bayside border might 
rightfully be discoverable under both). This doc does not support 
multi-region listings; the data model could be extended via a 
join table (`listings_regions` with a primary flag) if editorial 
need emerges. Parked until the need is real.

### OQ3 — Sub-regions

Some regions are editorially composite — "Launceston & Tamar 
Valley" contains sub-areas that travellers recognise (Rosevears, 
Exeter, George Town). This doc treats regions as flat. If Atlas 
editorial later wants sub-region hierarchy (for regional guide 
depth, for finer Plan-a-Stay coverage), the regions table can 
grow a `parent_id` column. Parked until the need is real.

### OQ4 — Draft region activation workflow

When a draft region activates to live, its listings become 
visible on public surfaces. There's no defined workflow for 
"activating a region" beyond flipping status. Worth formalising: 
what checks run before activation, what admin sees the 
newly-visible listings, whether there's a review gate. Parked 
until the first real activation (Sydney, Melbourne, Brisbane, 
Adelaide, Perth, and Hobart are all currently draft).

### OQ5 — Polygon maintenance

Polygons from external sources (ATDW, state tourism bodies) may 
change over time. This doc doesn't define how polygon updates get 
pulled in. Manual refresh is fine for now (polygons rarely 
change), but worth formalising if the data ever needs versioning 
or automated refresh. Parked.

### OQ6 — Historical region assignments

When a listing's `region_computed_id` changes (because lat/lng 
was corrected, or polygons were refined), the previous value is 
lost unless the `backfill_log` captures it. Long-term audit of 
"what region was this listing assigned to in 2026?" is not 
supported by this model. If editorial or commercial needs ever 
require historical region assignment, a `regions_history` table 
would be the shape. Parked.