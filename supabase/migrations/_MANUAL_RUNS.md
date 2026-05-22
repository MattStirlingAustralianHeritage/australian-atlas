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
