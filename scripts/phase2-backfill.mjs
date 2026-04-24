#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// phase2-backfill.mjs
//
// Retroactively populate listings.region_computed_id by firing the Phase 1.5
// spatial containment trigger across all eligible listings. Replicates the
// trigger's logic in dry-run mode; fires the actual trigger in apply mode.
//
// Trigger logic (from migration 097_spatial_containment_trigger.sql):
//   SELECT r.id FROM regions r
//   WHERE r.status IN ('live', 'draft') AND r.polygon IS NOT NULL
//     AND ST_Contains(r.polygon, ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326))
//   ORDER BY ST_Area(r.polygon) ASC, r.id ASC
//   LIMIT 1
//
// Eligible population: status='active' AND visitable=true
//                      AND lat IS NOT NULL AND lng IS NOT NULL
// Non-visitable listings are explicitly skipped per Edge Case 11.
//
// Usage:
//   node scripts/phase2-backfill.mjs           # dry-run (default)
//   node scripts/phase2-backfill.mjs --apply   # writes via trigger fire
//
// Dry-run outputs:
//   docs/audits/<DATE>-phase2-backfill-dryrun-summary.md
//   docs/audits/<DATE>-phase2-backfill-dryrun-changes.csv
//
// Apply outputs:
//   docs/audits/<DATE>-phase2-backfill-applied.md
//
// Rollback (apply mode only): UPDATE listings SET region_computed_id = NULL;
// Safe because region_computed_id has no downstream dependencies yet (Phase 3
// introduces them).
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

const APPLY = process.argv.includes('--apply')
const DATE = new Date().toISOString().slice(0, 10)

const envText = readFileSync('.env.local', 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const BATCH_SIZE = 500
const PAGE_SIZE = 1000

// ── Geometry utilities (replicating ST_Area + ST_Contains on EPSG:4326) ─────
// ST_Area on a geometry in SRID 4326 returns the sum of the shoelace area in
// decimal degrees² (NOT km² — that would require ::geography casting). For
// tie-breaking in the trigger's ORDER BY, degree² is what PostGIS actually
// compares, so we replicate that unit.
function shoelace(ring) {
  let s = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return s / 2
}
function stArea4326(mp) {
  let total = 0
  for (const poly of mp.coordinates) {
    let outer = Math.abs(shoelace(poly[0]))
    for (let i = 1; i < poly.length; i++) outer -= Math.abs(shoelace(poly[i]))
    total += outer
  }
  return total
}
function pipRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
function stContains(mp, lng, lat) {
  for (const poly of mp.coordinates) {
    if (!pipRing(lng, lat, poly[0])) continue
    let inHole = false
    for (let i = 1; i < poly.length; i++) { if (pipRing(lng, lat, poly[i])) { inHole = true; break } }
    if (!inHole) return true
  }
  return false
}

// ── Paginated fetch ─────────────────────────────────────────────────────────
async function fetchAll(tableName, selectExpr, filterFn) {
  const all = []
  let from = 0
  for (;;) {
    let q = sb.from(tableName).select(selectExpr).range(from, from + PAGE_SIZE - 1).order('id')
    q = filterFn(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

// ── Main ────────────────────────────────────────────────────────────────────
const startTime = Date.now()
console.log(`Phase 2 backfill — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)

// Fetch regions
console.log('\n── Fetching regions ──')
const regions = await fetchAll('regions', 'id, name, slug, state, status, polygon',
  q => q.in('status', ['live', 'draft']).not('polygon', 'is', null))
console.log(`  ${regions.length} region(s) with polygon and status in (live, draft)`)
for (const r of regions) r.area_deg2 = stArea4326(r.polygon)
regions.sort((a, b) => a.area_deg2 - b.area_deg2 || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
console.log(`  sorted by area_deg2 ASC, id ASC (smallest first to match trigger):`)
for (const r of regions) console.log(`    ${r.slug.padEnd(28)} ${r.status.padEnd(6)} area_deg2=${r.area_deg2.toFixed(5)}`)

// Fetch eligible listings
console.log('\n── Fetching eligible listings ──')
const eligible = await fetchAll(
  'listings',
  'id, name, slug, vertical, region, lat, lng, region_computed_id, region_override_id, visitable, status',
  q => q.eq('status', 'active').eq('visitable', true).not('lat', 'is', null).not('lng', 'is', null)
)
console.log(`  ${eligible.length} eligible listing(s)`)

// Compute proposed assignment per listing (replicates trigger)
console.log('\n── Computing proposed region assignments (client-side PIP) ──')
const results = []
const perRegionCount = Object.fromEntries(regions.map(r => [r.id, 0]))
let nullCount = 0
for (const l of eligible) {
  let matched = null
  for (const r of regions) {
    if (stContains(r.polygon, l.lng, l.lat)) { matched = r; break }
  }
  if (matched) {
    perRegionCount[matched.id]++
    results.push({ listing: l, proposed: matched })
  } else {
    nullCount++
    results.push({ listing: l, proposed: null })
  }
}
console.log(`  ${eligible.length - nullCount} listings would match a region`)
console.log(`  ${nullCount} listings would get NULL (projected quarantine)`)

// ── Non-eligible reporting ──────────────────────────────────────────────────
const { count: nonVisitableCount } = await sb.from('listings').select('*', { count: 'exact', head: true })
  .eq('status', 'active').or('visitable.eq.false,visitable.is.null')
const { count: missingCoordCount } = await sb.from('listings').select('*', { count: 'exact', head: true })
  .eq('status', 'active').eq('visitable', true).or('lat.is.null,lng.is.null')

if (APPLY) {
  // ── Apply mode: fire the trigger via no-op UPDATE on lat ──────────────────
  console.log('\n── Apply: firing trigger in batches ──')
  const ids = eligible.map(l => l.id)
  const total = ids.length
  const batches = Math.ceil(total / BATCH_SIZE)
  let processed = 0
  for (let b = 0; b < batches; b++) {
    const batchRows = eligible.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE)
    const batchStart = Date.now()
    // Fire the trigger by writing each row's lat to its current value (no-op
    // data change, but BEFORE UPDATE OF lat, lng trigger still fires). Parallel
    // with concurrency 20 to keep the backfill within reasonable wall-clock.
    const CONCURRENCY = 20
    for (let i = 0; i < batchRows.length; i += CONCURRENCY) {
      const chunk = batchRows.slice(i, i + CONCURRENCY)
      const errs = await Promise.all(chunk.map(l =>
        sb.from('listings').update({ lat: l.lat }).eq('id', l.id).then(r => r.error)
      ))
      for (let j = 0; j < chunk.length; j++) {
        if (errs[j]) console.log(`  WARN row ${chunk[j].id}: ${errs[j].message}`)
      }
    }
    processed += batchRows.length
    const ms = Date.now() - batchStart
    console.log(`  batch ${b + 1}/${batches}: ${batchRows.length} rows in ${ms}ms (total ${processed}/${total})`)
  }

  // Post-run verification — compare actual vs predicted
  console.log('\n── Post-run verification ──')
  const { count: stillNullCount } = await sb.from('listings').select('*', { count: 'exact', head: true })
    .eq('status', 'active').eq('visitable', true).is('region_computed_id', null)
    .not('lat', 'is', null).not('lng', 'is', null)
  const appliedMatched = total - (stillNullCount || 0)
  console.log(`  actually matched: ${appliedMatched}`)
  console.log(`  actually NULL:    ${stillNullCount || 0}`)
  console.log(`  predicted matched: ${total - nullCount}`)
  console.log(`  predicted NULL:    ${nullCount}`)
  const drift = Math.abs(appliedMatched - (total - nullCount))
  if (drift > 0) console.log(`  ⚠ drift of ${drift} rows between prediction and actual — investigate`)

  // Distribution by region from actual DB state
  const appliedDist = []
  for (const r of regions) {
    const { count } = await sb.from('listings').select('*', { count: 'exact', head: true })
      .eq('status', 'active').eq('region_computed_id', r.id)
    appliedDist.push({ slug: r.slug, name: r.name, status: r.status, count: count || 0, predicted: perRegionCount[r.id] })
  }

  writeApplySummary({
    date: DATE,
    regions,
    eligibleTotal: total,
    appliedMatched,
    appliedNull: stillNullCount || 0,
    predictedMatched: total - nullCount,
    predictedNull: nullCount,
    appliedDist,
    nonVisitableCount: nonVisitableCount || 0,
    missingCoordCount: missingCoordCount || 0,
    durationMs: Date.now() - startTime,
  })
  console.log(`\nApplied summary written to docs/audits/${DATE}-phase2-backfill-applied.md`)
} else {
  // ── Dry-run mode: write summary + CSV ────────────────────────────────────
  writeDryRunCsv({ date: DATE, results })
  writeDryRunSummary({
    date: DATE,
    regions,
    eligibleTotal: eligible.length,
    matchedTotal: eligible.length - nullCount,
    nullTotal: nullCount,
    perRegionCount,
    results,
    nonVisitableCount: nonVisitableCount || 0,
    missingCoordCount: missingCoordCount || 0,
    durationMs: Date.now() - startTime,
  })
  console.log(`\nSummary written to docs/audits/${DATE}-phase2-backfill-dryrun-summary.md`)
  console.log(`CSV written to     docs/audits/${DATE}-phase2-backfill-dryrun-changes.csv`)
}

console.log(`\nDuration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`)

// ── Writers ─────────────────────────────────────────────────────────────────
function writeDryRunCsv({ date, results }) {
  const header = 'listing_id,vertical,name,slug,lat,lng,current_region_text,proposed_region_id,proposed_region_name,proposed_region_slug'
  const rows = results.map(({ listing, proposed }) => [
    listing.id,
    listing.vertical,
    csvEscape(listing.name),
    listing.slug,
    listing.lat,
    listing.lng,
    csvEscape(listing.region),
    proposed?.id || '',
    csvEscape(proposed?.name || ''),
    proposed?.slug || '',
  ].join(','))
  writeFileSync(`docs/audits/${date}-phase2-backfill-dryrun-changes.csv`, header + '\n' + rows.join('\n') + '\n')
}

function writeDryRunSummary({ date, regions, eligibleTotal, matchedTotal, nullTotal, perRegionCount, results, nonVisitableCount, missingCoordCount, durationMs }) {
  const sorted = [...regions].sort((a, b) => perRegionCount[b.id] - perRegionCount[a.id])
  const distTable = sorted.map(r => {
    const n = perRegionCount[r.id]
    const pct = ((n / eligibleTotal) * 100).toFixed(2)
    return `| ${r.name} | \`${r.slug}\` | ${r.state} | ${r.status} | ${n} | ${pct}% |`
  }).join('\n')

  // NULL-assignment breakdown by vertical
  const nullByVertical = {}
  for (const { listing, proposed } of results) {
    if (!proposed) nullByVertical[listing.vertical] = (nullByVertical[listing.vertical] || 0) + 1
  }
  const nullVerticalTable = Object.entries(nullByVertical).sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `| ${v} | ${n} |`).join('\n')

  // Top 20 NULL listings per vertical
  const topNullByVertical = {}
  for (const { listing, proposed } of results) {
    if (proposed) continue
    const v = listing.vertical
    if (!topNullByVertical[v]) topNullByVertical[v] = []
    topNullByVertical[v].push(listing)
  }
  const topNullSections = Object.entries(topNullByVertical)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([v, rows]) => {
      const picks = rows.slice(0, 20)
      const table = picks.map(l => `| \`${l.slug}\` | ${csvEscape(l.name).replace(/"/g, '')} | ${l.lat} | ${l.lng} | ${l.region || '—'} |`).join('\n')
      return `### ${v} — ${rows.length} NULL listing${rows.length === 1 ? '' : 's'} (top 20 shown)\n\n| Slug | Name | Lat | Lng | Current region text |\n|---|---|---|---|---|\n${table || '| (none) |'}\n`
    }).join('\n')

  // Anomalies
  const zero = sorted.filter(r => perRegionCount[r.id] === 0)
  const suspicious = sorted.filter(r => perRegionCount[r.id] > eligibleTotal * 0.25)
  const outOfAustralia = results.filter(({ listing }) => {
    const { lat, lng } = listing
    return lat > -10 || lat < -45 || lng < 112 || lng > 154
  }).slice(0, 20)

  const md = `# Phase 2 Backfill — Dry-Run Summary

**Date:** ${date}
**Mode:** DRY-RUN (no DB writes)
**Trigger:** Manual invocation of \`scripts/phase2-backfill.mjs\` prior to Phase 2 apply run
**Duration:** ${(durationMs / 1000).toFixed(1)}s

## Pre-flight

| Metric | Value |
|---|---|
| Eligible listings (active + visitable=true + lat/lng not null) | **${eligibleTotal}** |
| Listings that would match a live/draft region polygon | ${matchedTotal} |
| Listings that would get NULL (projected quarantine) | **${nullTotal}** |
| Non-visitable active listings (skipped per Edge Case 11) | ${nonVisitableCount} |
| Active listings missing lat or lng (ineligible) | ${missingCoordCount} |
| Live/draft regions used in this run | ${regions.length} |

## Distribution by region

| Region | Slug | State | Status | Listings | Share |
|---|---|---|---|---|---|
${distTable}

Regions ordered by listing count desc. Trigger logic sorts polygons by \`ST_Area ASC, id ASC\` (smallest first) so listings inside multiple overlapping polygons resolve to the smallest-area match. Example: a listing in the City of Hobart LGA is inside both Hobart City (small) and Hobart & Southern Tasmania (large) — it resolves to Hobart City per that ordering.

## Projected quarantine — NULL assignment breakdown by vertical

| Vertical | Listings with proposed_region = NULL |
|---|---|
${nullVerticalTable || '| (none) | 0 |'}

${topNullSections || '*(No NULL-assignment listings.)*'}

## Anomalies

### Regions attracting zero listings

${zero.length === 0 ? '*None. All regions attract at least one listing.*' : zero.map(r => `- **${r.name}** (\`${r.slug}\`, ${r.state}, ${r.status}) — ${perRegionCount[r.id]} listings. Possible polygon scale issue worth review.`).join('\n')}

### Regions attracting >25% of eligible listings

${suspicious.length === 0 ? '*None. No single region dominates the distribution.*' : suspicious.map(r => `- **${r.name}** (\`${r.slug}\`) — ${perRegionCount[r.id]} listings (${((perRegionCount[r.id] / eligibleTotal) * 100).toFixed(1)}%). Possible polygon too broad.`).join('\n')}

### Listings with lat/lng outside mainland Australia bounds (lat -45..-10, lng 112..154)

${outOfAustralia.length === 0 ? '*None.*' : outOfAustralia.map(({ listing }) => `- \`${listing.slug}\` (${listing.vertical}) lat=${listing.lat} lng=${listing.lng}`).join('\n')}

*Note: these are not necessarily wrong — Lord Howe Island (159°E), Norfolk Island, and Cocos (Keeling) Islands can legitimately fall outside the mainland bounding box. But any cluster here worth spot-checking for geocoding errors.*

## Interpretation

Read this alongside \`${date}-phase2-backfill-dryrun-changes.csv\`. That CSV has one row per eligible listing with the proposed region assignment. Spot-check a handful — pick 10 listings where current \`region\` text doesn't match the proposed region name, confirm the proposed assignment is editorially correct.

**Questions this summary is designed to answer:**

1. **Is the distribution reasonable?** Eyeball the region counts against what you'd expect. Metro regions (Sydney, Melbourne, Brisbane, Adelaide, Perth) should dominate. Wine regions (Hunter Valley, Orange, Mudgee, Adelaide Hills, Byron Bay) should pull moderate counts. Composite tourism regions (Darwin & Top End, Hobart & Southern Tasmania) should pull smaller but non-zero counts.

2. **Is the projected quarantine batch size expected?** The 2026-04-25 SBA diagnostic predicted ~1,069 SBA listings would go to quarantine after the Hunter/Orange/Mudgee activation. Compare the NULL-per-vertical row for \`sba\` to that number.

3. **Are any regions attracting zero listings?** If yes, the polygon may be miss-scaled (e.g. pre-fix Perth was CBD-only and drew almost nothing).

4. **Are any regions attracting suspiciously many listings?** >25% flagged above. Indicates a polygon may be too broad.

5. **Spot-checks**: pick 10 listings from the CSV where \`current_region_text\` disagrees with \`proposed_region_name\` — is the proposed assignment editorially better?

If all four pass, trigger the apply run: \`node scripts/phase2-backfill.mjs --apply\`.

## Rollback (for apply run only)

\`\`\`sql
UPDATE listings SET region_computed_id = NULL;
\`\`\`

Safe to run; no downstream dependencies on \`region_computed_id\` yet (Phase 3 introduces them).
`
  writeFileSync(`docs/audits/${date}-phase2-backfill-dryrun-summary.md`, md)
}

function writeApplySummary({ date, regions, eligibleTotal, appliedMatched, appliedNull, predictedMatched, predictedNull, appliedDist, nonVisitableCount, missingCoordCount, durationMs }) {
  const distTable = appliedDist.sort((a, b) => b.count - a.count).map(r => {
    const drift = r.count - r.predicted
    const marker = drift === 0 ? '✓' : (drift > 0 ? `+${drift}` : `${drift}`)
    const pct = ((r.count / eligibleTotal) * 100).toFixed(2)
    return `| ${r.name} | \`${r.slug}\` | ${r.status} | ${r.count} | ${pct}% | ${r.predicted} | ${marker} |`
  }).join('\n')
  const md = `# Phase 2 Backfill — Apply Run

**Date:** ${date}
**Mode:** APPLY
**Duration:** ${(durationMs / 1000).toFixed(1)}s

## Summary

| Metric | Value |
|---|---|
| Eligible listings processed | ${eligibleTotal} |
| Listings matched to a region | ${appliedMatched} |
| Listings with region_computed_id = NULL | ${appliedNull} |
| Predicted matched (from dry-run) | ${predictedMatched} |
| Predicted NULL (from dry-run) | ${predictedNull} |
| Non-visitable active listings skipped | ${nonVisitableCount} |
| Active listings missing lat/lng (ineligible) | ${missingCoordCount} |

Drift between dry-run prediction and actual result: **${Math.abs(appliedMatched - predictedMatched)} rows**. ${appliedMatched === predictedMatched ? 'Zero drift — client-side PIP replicates the trigger exactly.' : 'Non-zero drift should be investigated; ST_Contains boundary handling or floating-point differences can cause small gaps.'}

## Distribution by region

| Region | Slug | Status | Actual | Share | Predicted | Drift |
|---|---|---|---|---|---|---|
${distTable}

## Rollback

\`\`\`sql
UPDATE listings SET region_computed_id = NULL;
\`\`\`

Safe to run; no downstream dependencies on \`region_computed_id\` yet.
`
  writeFileSync(`docs/audits/${date}-phase2-backfill-applied.md`, md)
}

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
