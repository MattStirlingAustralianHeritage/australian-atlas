# commercial_groups — vertical_scope convention

## NULL scope means global

A row with `vertical_scope = NULL` applies to **every vertical**, not
just the vertical that created the row. This is the "global scope"
convention: hotel chains, large tourism conglomerates, and other groups
that span multiple verticals use `NULL` rather than listing every
vertical explicitly.

When querying `commercial_groups` filtered to a specific vertical (e.g.
`way`, `collection`, `rest`), you **must** include NULL-scope rows.

### Correct pattern (PostgREST / Supabase JS)

```js
// Reference implementation: scripts/pitch-candidates.mjs (line ~165)
// Fetches all rows, then filters in JS:
if (g.vertical_scope == null) return true          // global
if (g.vertical_scope.includes('way')) return true   // way-scoped

// PostgREST filter equivalent (used in Gate 1, cinema seeder):
.or('vertical_scope.cs.{way},vertical_scope.is.null')
```

### Incorrect pattern (the bug)

```js
// DO NOT USE — misses global-scope rows:
.contains('vertical_scope', ['way'])
// Because: NULL @> ARRAY['way'] evaluates to NULL, not true.
// PostgreSQL treats NULL as "unknown", so the row is excluded.
```

### History

This bug was discovered on 2026-05-21 when global-scope groups (e.g.
Spicers Retreats, `vertical_scope = NULL`) were silently excluded from
Gate 1 independence checks for Way Atlas candidates. The same bug existed
in `seed-cinema-candidates.mjs`. Both were fixed and a regression test
added (`scripts/test-gate1-global-scope.mjs`).

### Reference files

- `scripts/pitch-candidates.mjs` — reference implementation (JS-side null check)
- `lib/prospector/way-discovery/gate-1-independence.js` — PostgREST `.or()` pattern
- `scripts/seed-cinema-candidates.mjs` — PostgREST `.or()` pattern
- `scripts/test-gate1-global-scope.mjs` — regression test (7 assertions)
