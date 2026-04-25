# Alice Springs Polygon Rework — Findings & Options

**Date:** 2026-04-25 (late)
**Trigger:** Phase 2 post-run check identified Araluen Cultural Precinct as NULL despite being in Alice Springs proper.
**Task spec:** `Re-aggregate the alice-springs-red-centre polygon using server-side ST_Union to eliminate the sliver holes`
**Status:** **STOPPED — no DB writes applied. Source-switch decision required from Matt before applying.**

## Summary

The 4 sliver holes in yesterday's polygon were a real artifact of `ST_MakeValid`, but eliminating them does not solve the Araluen problem. **Araluen falls outside the 3 source LGAs entirely** — it sits in unincorporated NT land between the Alice Springs Town Council LGA boundary and the surrounding MacDonnell Regional Council LGA. Both yesterday's polygon and the cleanly-unioned LGA polygon exclude it.

ABS Tourism Regions (`7R070` Alice Springs + `7R140` MacDonnell + `7R150` Lasseter) form a complete topological partition without LGA gaps and capture Araluen cleanly. **Recommended path: switch source from OSM LGAs to ABS Tourism Regions.** This is a source-spec change beyond the original task, hence the STOP-and-report.

## Diagnostic: why the LGA approach can't fix Araluen

Per-LGA point-in-polygon test for Araluen (-23.70213, 133.862694):

| LGA | bbox | Araluen | Alice CBD |
|---|---|---|---|
| Alice Springs Town Council (rel 11716659) | 133.874–133.886 / -23.707 to -23.692 | **outside** | INSIDE |
| MacDonnell Regional (rel 11716646) | 129.001–137.999 / -25.999 to -22.854 | **outside** | outside |
| Petermann (rel 11716684) | 129.001–132.649 / -25.999 to -24.135 | **outside** | outside |

Araluen sits at lng 133.863 — just **west** of the Alice Springs Town LGA (which starts at lng 133.874). It's also outside MacDonnell because MacDonnell has Alice Springs Town as a *hole* (the LGAs are non-overlapping by definition; MacDonnell surrounds Alice Springs Town with a hole carved out).

This is unincorporated NT land. The Northern Territory has no LGA covering this area — it's directly governed by NT government. **No LGA-based aggregation can include Araluen** unless the Alice Springs Town LGA is buffered outward, which would be hand-tuning rather than sourcing from OSM.

## Three options evaluated

### Option A — Apply polygon-clipping union of Matt's original 3 LGAs (sliver-only fix)

| Metric | Value |
|---|---|
| Source | OSM Alice Springs Town + MacDonnell + Petermann |
| Components | 2 |
| Holes | **2** (down from 4 — the 2 sliver artifacts removed; 2 inherent enclaves remain) |
| Araluen captured | ❌ (still outside) |
| Bbox | 129.00–138.00°E / -25.99 to -22.85°S (matches editorial scope) |
| Topology | Clean union, no artifact slivers |

This eliminates the 2 sliver holes from yesterday's `ST_MakeValid` artifact. The remaining 2 holes are **inherent enclaves** in the source LGAs — likely Aboriginal land trusts or community-controlled areas inside MacDonnell and Petermann. Those are real geographic features, not artifacts.

**Result:** strictly better than current state, but **does NOT fix Araluen**. Doesn't deliver Matt's expected outcome.

### Option B — Switch source to ABS Tourism Regions (recommended)

| Metric | Value |
|---|---|
| Source | ABS TR 2021 `7R070` Alice Springs + `7R140` MacDonnell + `7R150` Lasseter |
| Components | **1** (single connected polygon — ABS TRs designed as partition) |
| Holes | **0** |
| Araluen captured | **✓ INSIDE** |
| Alice CBD captured | ✓ INSIDE |
| Uluru captured | ✓ INSIDE |
| Kings Canyon captured | ✓ INSIDE |
| Hermannsburg captured | ✓ INSIDE |
| Tennant Creek captured | ✓ outside (correct — not Red Centre) |
| Katherine captured | ✓ outside (correct) |
| Bbox | 129.00–138.00°E / -25.99 to **-17.95°S** |
| Topology | Perfectly clean — ABS TRs designed as topological partition |

**Bbox concern resolved by inspection:** the bbox max-north of -17.95°S looks like it would extend toward Tennant Creek, but Tennant Creek (-19.65, 134.19) is verified OUTSIDE the actual polygon shape. The northern bbox extension is from a thin Aboriginal land trust extension in MacDonnell TR, not a broad scope expansion.

**Result:** delivers Matt's expected outcome. Cleaner topology than any LGA-based approach. Source change is the only reason this is non-trivial.

### Option C — Hybrid (ABS TR `7R070` for Alice tight + OSM MacDonnell + OSM Petermann)

| Metric | Value |
|---|---|
| Source | ABS TR `7R070` + OSM MacDonnell + OSM Petermann |
| Components | 1 |
| Holes | **20** (massive boundary-mismatch artifacts) |
| Araluen captured | ✓ |
| Topology | Bad — boundary mismatches between ABS and OSM sources create 20 sliver gaps |

**Rejected.** Combining ABS and OSM polygons creates many small gap holes wherever their boundary lines don't exactly align (which is most of the boundary).

## Recommendation

**Option B (ABS TR-only).** Three reasons:

1. **Delivers the stated expected outcome** — Araluen resolves to alice-springs-red-centre.
2. **Better topology** than any LGA-based approach (1 component, 0 holes vs. 2 components + 2-4 holes).
3. **No new tooling needed** — already proven pattern from earlier batch (Hobart & Southern Tasmania, Darwin & Top End, etc. all use ABS TR sources).

The trade-off is the source-of-record change in the polygon sourcing report. The polygon's editorial scope is essentially identical to Matt's earlier intent (Alice + MacDonnell + Petermann/Lasseter coverage). What changes is the *boundary precision* — ABS TRs use SA4 boundaries which are designed for statistical analysis and form a partition without gaps; OSM LGAs use legal/administrative boundaries which have gaps where unincorporated land exists.

## How to apply

The script `scripts/fix-alice-springs-polygon.mjs` supports both sources via `--source=lga` (default, original spec) or `--source=abs` (recommended fix).

To apply Option B (recommended):

```bash
node scripts/fix-alice-springs-polygon.mjs --source=abs --apply
```

This will:
1. Fetch ABS TRs `7R070`, `7R140`, `7R150` from `geo.abs.gov.au`.
2. Compute topological union via polygon-clipping (Martinez algorithm — equivalent to PostGIS `ST_Union`).
3. UPDATE `regions.polygon` for `slug='alice-springs-red-centre'`.
4. Trigger re-fire (no-op `lat = lat` UPDATE) for NULL listings inside the bbox 129–138°E / -26 to -22.85°S.
5. Report rescued count and verify Araluen specifically.

Expected post-apply numbers:
- Araluen Cultural Precinct: NULL → alice-springs-red-centre
- Total NT NULL listings rescued: estimated 1–5 (Araluen + a handful of similar unincorporated-land cases)
- updated_at bumped: ~10–20 listings (bbox-scoped — small acceptable cosmetic noise)

## Implementation notes

- **No direct Postgres connection available.** Supabase project is on IPv6-only direct + non-pooler tenant, neither reachable from local machine. Server-side `ST_Union` not callable via supabase-js SDK. Workaround: client-side topological union via `polygon-clipping` (Martinez algorithm) — produces identical output to PostGIS `ST_Union` for non-pathological inputs, written back as GeoJSON via standard SDK UPDATE.
- **New dep:** `polygon-clipping@^0.15.7` (no transitive deps, ~50KB, MIT) added to package.json. Used solely by this fix script for client-side polygon union. Justification: server-side `ST_Union` not reachable, Martinez algorithm (what polygon-clipping implements) is the standard polygon-clipping algorithm and produces identical output to PostGIS for non-pathological inputs.
- **Strict task constraint observed.** "If ST_Union produces an unexpected result, STOP and report" applies here because the LGA-only union fails the expected outcome (Araluen must resolve). Hence STOP and this report.
