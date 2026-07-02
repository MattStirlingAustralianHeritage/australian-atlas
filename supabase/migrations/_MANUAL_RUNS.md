# Manual migration runs

This file records migrations that were applied to the live database
outside the normal `scripts/run-migration.mjs` flow — usually because of
tooling issues with the runner or the pooler.

These migrations should still exist as `.sql` files in this directory
for version-controlled history, replay against a fresh database, and
audit. If a numbered migration is recorded as "manual" below but no
matching `.sql` file is present, that's a backlog item: the file needs
to be reconstructed from whatever SQL was actually executed and added
to the migrations directory.

---

## 2026-05-22

Migrations **129**, **130**, and **131** run manually via the Supabase
SQL editor (pooler access broken in CLI; resolved separately). Verified
via the dashboard.

- **129** — `compute_venue_pitch_score` and `validate_pitch_grounding`
  functions dropped. Confirmed orphaned by
  `scripts/_verify_orphaned_functions.mjs`. No application code paths
  reference either function in the current pitch system architecture
  (Phase 2 onward).
- **130** — `pitch_slots` seeded. 20 rows: 10 verticals × 2 slot types
  (`general`, `new_producer`).
- **131** — `pitch_failure_mode` enum extended with new value
  `bail_token_detected`, used by `lib/pitch/pipeline.mjs`'s bail-token
  detection when a model returns a bail string in headline, angle, or
  editorial_framing. The orchestrator now logs these to
  `pitch_generation_failures` alongside `fact_check_failed` and
  `insufficient_data_returned`.

Database state verified via the Supabase dashboard before this entry
was written. The corresponding `.sql` files do not currently live in
`supabase/migrations/` — flagged as a backlog item to reconstruct from
the executed SQL and add for replay/audit completeness.

## 2026-05-22 (continued)

Migration files 129, 130, 131 reconstructed and written to disk per the
intended schema state. 130 reflects the final reseed to 30 rows (Matt
is applying that reseed via the SQL editor in parallel with this commit).
Files are now part of the migration history for future replay.

## 2026-05-22 (continued)

Migration 132 applied via Supabase SQL editor and file reconstructed to disk.
Creates pitch_sources, pitch_characters, pitch_character_attributes, and
pitch_signals tables, plus pitch_source_type, pitch_attribute_confidence,
and pitch_signal_type enums. Schema documented in
docs/pitch-system-phase3-design.md.

## 2026-07-03

Migrations 034 (opening_hours JSONB on corner/found/table/fine_grounds/sba
_meta) and 088 (field_meta trail_* columns) applied to prod via
scripts/run-migration.mjs + NOTIFY pgrst — both files existed in the repo
but had never been applied. The gap made every meta upsert for those
verticals fail ("Could not find the 'opening_hours' column ... in the
schema cache"), which the chunked sync surfaced as ~120s per-row fallback
storms per sba chunk. First post-fix /api/cron/sync: 230.8s, 7,060 synced,
0 vertical errors.

## 2026-07-03 (continued)

Migration 215 (found_meta_shop_type_check + vintage_store) applied to prod
via scripts/run-migration.mjs + NOTIFY pgrst. The found vertical's canonical
category list (VERTICAL_CATEGORIES.found) already included 'vintage_store'
and the listing-level validator accepted it, but the found_meta CHECK still
listed the older 7 values — so 11 vintage_store shops failed their meta
upsert every sync ("violates check constraint found_meta_shop_type_check").
Constraint re-created from the full canonical list; verified vintage_store
now present.
