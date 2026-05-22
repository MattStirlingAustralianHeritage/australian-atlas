# Editorial Trails — Phase 1.1 backlog

Items deferred from Phase 1 verification. Track here so they don't drop.

## 1. Candidate prompt — refuse over-cap sequences

**Symptom (observed during E2E test):** the model produced an 11-stop sequence
where Day 1 totalled 396 km against a 200 km/day cap, and surfaced the
violation as a warning rather than refusing the sequence.

**Desired behaviour:** if the only viable sequence violates a hard constraint
(max_km_per_day, must_start_at, must_end_at, must_include), the model returns
a structured refusal with the actionable suggestion — not an over-cap
sequence with a warning. Possible refusal shapes:

```json
{ "refusal": "no_viable_sequence",
  "reason": "Cannot fit all selected verticals into 200 km/day from this region without ferries; widen to 250 km/day or add Bellarine Peninsula as secondary region.",
  "stops": [], "warnings": [] }
```

**Touch:** `lib/trails/candidate-prompt.js` — add a refusal contract; update
the output JSON schema; update the API consumer
(`generate-candidates.js`) to surface refusals to the candidate review UI.

## 2. Existing editorial trails are hero-less

Two pre-Phase-1 editorial trails (`melbourne-yarra-valley-independent-scene`,
`barossa-adelaide-hills-artisan-corridor`) were always missing
`cover_image_url`. The migration renamed the column but cannot manufacture
data. Public `/trails` index and `/trails/[slug]` pages have been verified to
render gracefully without a hero image — no broken `<img>` tags, no layout
shift. The trails will stay hero-less until manually re-uploaded via the
draft editor's hero upload.

## 3. trail_revisions.notes → proper comment system (Phase 2)

For Phase 1, status-transition notes ("returned to draft because the intro
reuses legacy phrasing") are stored as a single `notes` field on the
revision. Phase 2 introduces a thread-style comment system.

## 4. author_id / editor_id populated on transitions (Phase 2)

Phase 1 does not populate these — admin auth is a single shared password,
not per-user accounts. Phase 2 introduces admin user accounts and partner
accounts; that's when these foreign keys start carrying real values.

## 5. Hero image upload reuse

The draft editor's hero image upload should reuse the existing media
handling pattern from `app/admin/articles/page.js`. Phase 1 stub uses a
plain URL input pending that integration.
