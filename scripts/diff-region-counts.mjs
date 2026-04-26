#!/usr/bin/env node
// ============================================================
// Phase 3 step 1, Batch 7 — pre-flight delta report
//
// Compares OLD vs NEW listing-count semantics for every region:
//   OLD = legacy ilike + alias map (current updateRegionCounts.js)
//   NEW = FK-based count via region_computed_id OR region_override_id
//
// Writes a markdown report to docs/audits/2026-04-26-batch7-count-delta.md
// and exits non-zero if any LIVE region's |delta/old| > 50% (or, when
// old=0, |new| > 20 — using the same materiality threshold as the SBA
// region-mismatch diagnostic).
//
// Read-only. No DB writes. Safe to run multiple times.
//
// Usage:
//   node --env-file=.env.local scripts/diff-region-counts.mjs
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORT_PATH = resolve(__dirname, '..', 'docs', 'audits', '2026-04-26-batch7-count-delta.md')

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Mirror of REGION_ALIASES from lib/sync/updateRegionCounts.js (frozen
// snapshot — this script measures the current production behaviour).
const REGION_ALIASES = {
  'Hobart': 'Hobart & Southern Tasmania',
  'Southern Tasmania': 'Hobart & Southern Tasmania',
  'Daylesford': 'Daylesford & Hepburn Springs',
  'Hepburn Springs': 'Daylesford & Hepburn Springs',
  'Hepburn': 'Daylesford & Hepburn Springs',
  'Fremantle': 'Fremantle & Swan Valley',
  'Swan Valley': 'Fremantle & Swan Valley',
  'Launceston': 'Launceston & Tamar Valley',
  'Tamar Valley': 'Launceston & Tamar Valley',
  'Byron Bay': 'Byron Hinterland',
  'Canberra': 'Canberra District',
  'Alice Springs': 'Alice Springs & Red Centre',
  'Red Centre': 'Alice Springs & Red Centre',
  'Darwin': 'Darwin & Top End',
  'Top End': 'Darwin & Top End',
  'Fitzroy': 'Melbourne',
  'Collingwood': 'Melbourne',
  'Carlton': 'Melbourne',
  'South Melbourne': 'Melbourne',
  'Richmond': 'Melbourne',
  'Prahran': 'Melbourne',
  'St Kilda': 'Melbourne',
  'Brunswick': 'Melbourne',
  'Northcote': 'Melbourne',
  'Elsternwick': 'Melbourne',
  'South Yarra': 'Melbourne',
  'Footscray': 'Melbourne',
  'Surry Hills': 'Sydney',
  'Newtown': 'Sydney',
  'Paddington': 'Sydney',
  'Marrickville': 'Sydney',
  'Redfern': 'Sydney',
  'Glebe': 'Sydney',
  'Darlinghurst': 'Sydney',
  'Bondi': 'Sydney',
  'Fortitude Valley': 'Brisbane',
  'West End': 'Brisbane',
  'New Farm': 'Brisbane',
  'South Brisbane': 'Brisbane',
  'Leederville': 'Perth',
  'Northbridge': 'Perth',
  'Mount Lawley': 'Perth',
  'Subiaco': 'Perth',
}

const PCT_THRESHOLD = 0.5
const ZERO_BASE_ABS_THRESHOLD = 20

async function oldCount(region, aliasReverse) {
  const { count: primaryCount, error: e1 } = await sb
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .ilike('region', `%${region.name}%`)
  if (e1) throw new Error(`OLD primary count error for ${region.slug}: ${e1.message}`)

  let aliasCount = 0
  for (const alias of (aliasReverse[region.name] || [])) {
    if (region.name.toLowerCase().includes(alias.toLowerCase())) continue
    const { count, error: e2 } = await sb
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .ilike('region', `%${alias}%`)
    if (e2) throw new Error(`OLD alias count error for ${region.slug} (${alias}): ${e2.message}`)
    aliasCount += (count || 0)
  }
  return (primaryCount || 0) + aliasCount
}

async function newCount(region) {
  const { count, error } = await sb
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .or(`region_computed_id.eq.${region.id},region_override_id.eq.${region.id}`)
  if (error) throw new Error(`NEW count error for ${region.slug}: ${error.message}`)
  return count || 0
}

function classify(oldN, newN) {
  const delta = newN - oldN
  if (oldN === 0 && newN === 0) return { delta, pct: 0, breached: false, note: '' }
  if (oldN === 0) {
    const breached = newN > ZERO_BASE_ABS_THRESHOLD
    return { delta, pct: null, breached, note: breached ? `gain from 0 → ${newN} exceeds ${ZERO_BASE_ABS_THRESHOLD}-listing zero-base threshold` : '' }
  }
  const pct = delta / oldN
  const breached = Math.abs(pct) > PCT_THRESHOLD
  return { delta, pct, breached, note: breached ? `${(pct * 100).toFixed(1)}% change exceeds ±${PCT_THRESHOLD * 100}%` : '' }
}

function fmtPct(pct) {
  if (pct === null) return 'n/a'
  const v = pct * 100
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

function fmtDelta(d) {
  if (d === 0) return '0'
  return d > 0 ? `+${d}` : `${d}`
}

async function main() {
  const aliasReverse = {}
  for (const [alias, canonical] of Object.entries(REGION_ALIASES)) {
    if (!aliasReverse[canonical]) aliasReverse[canonical] = []
    aliasReverse[canonical].push(alias)
  }

  const { data: regions, error } = await sb
    .from('regions')
    .select('id, name, slug, status, listing_count, min_listing_threshold')
    .order('status', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw new Error(`regions fetch failed: ${error.message}`)

  const rows = []
  for (const region of regions) {
    const oldN = await oldCount(region, aliasReverse)
    const newN = await newCount(region)
    const cls = classify(oldN, newN)
    rows.push({ region, oldN, newN, ...cls })
    process.stdout.write(`  ${region.status.padEnd(5)} ${region.slug.padEnd(36)} old=${String(oldN).padStart(4)}  new=${String(newN).padStart(4)}  delta=${fmtDelta(cls.delta).padStart(5)} ${cls.breached ? '  *** BREACH ***' : ''}\n`)
  }

  const live = rows.filter(r => r.region.status === 'live')
  const draft = rows.filter(r => r.region.status === 'draft')
  const breachedLive = live.filter(r => r.breached)

  const md = []
  md.push('# Batch 7 — Region Count Delta (pre-flight)')
  md.push('')
  md.push('**Date:** 2026-04-26')
  md.push('**Mode:** READ-ONLY (no DB writes)')
  md.push(`**Trigger script:** \`scripts/diff-region-counts.mjs\``)
  md.push('')
  md.push('## Method')
  md.push('')
  md.push('For every region in the `regions` table, compare two count semantics:')
  md.push('')
  md.push('- **OLD** — current production logic from `lib/sync/updateRegionCounts.js`:')
  md.push('  - Primary: `count(*) FROM listings WHERE status=\'active\' AND region ILIKE \'%<region.name>%\'`')
  md.push('  - Plus aliases: same `ilike` against each entry in the alias map (skipping aliases whose value substring-includes the canonical name).')
  md.push('- **NEW** — FK-based per Decision 3:')
  md.push('  - `count(*) FROM listings WHERE status=\'active\' AND (region_computed_id = $id OR region_override_id = $id)`')
  md.push('')
  md.push(`Halt threshold (live regions only): \`|delta / old| > ${PCT_THRESHOLD * 100}%\`. For zero-base regions (\`old = 0\`), uses an absolute threshold of \`new > ${ZERO_BASE_ABS_THRESHOLD}\` listings (matches the materiality cut from the 2026-04-25 SBA region-mismatch diagnostic — region activations >20 listings count as magnitude shifts).`)
  md.push('')
  md.push('## Summary')
  md.push('')
  md.push('| Metric | Value |')
  md.push('|---|---:|')
  md.push(`| Total regions scanned | ${rows.length} |`)
  md.push(`| Live regions | ${live.length} |`)
  md.push(`| Draft regions | ${draft.length} |`)
  md.push(`| Live regions with breach (halt-worthy) | **${breachedLive.length}** |`)
  md.push(`| Live regions with any non-zero delta | ${live.filter(r => r.delta !== 0).length} |`)
  md.push(`| Live regions with positive delta (gainers) | ${live.filter(r => r.delta > 0).length} |`)
  md.push(`| Live regions with negative delta (losers) | ${live.filter(r => r.delta < 0).length} |`)
  md.push(`| Live regions unchanged (delta = 0) | ${live.filter(r => r.delta === 0).length} |`)
  md.push(`| Live OLD total | ${live.reduce((s, r) => s + r.oldN, 0)} |`)
  md.push(`| Live NEW total | ${live.reduce((s, r) => s + r.newN, 0)} |`)
  md.push('')

  if (breachedLive.length > 0) {
    md.push('## ⚠ Halt-threshold breaches (live regions)')
    md.push('')
    md.push('| Region | Slug | OLD | NEW | Δ | Δ% | Note |')
    md.push('|---|---|---:|---:|---:|---:|---|')
    for (const r of breachedLive) {
      md.push(`| ${r.region.name} | \`${r.region.slug}\` | ${r.oldN} | ${r.newN} | ${fmtDelta(r.delta)} | ${fmtPct(r.pct)} | ${r.note} |`)
    }
    md.push('')
  } else {
    md.push('## ✅ No halt-threshold breaches in live regions')
    md.push('')
    md.push(`All ${live.length} live regions are within ±${PCT_THRESHOLD * 100}% of their old count (or, for zero-base regions, the new count is ≤ ${ZERO_BASE_ABS_THRESHOLD}). Safe to proceed with apply.`)
    md.push('')
  }

  const liveSorted = [...live].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const top10 = liveSorted.slice(0, 10)
  if (top10.some(r => r.delta !== 0)) {
    md.push('## Biggest live-region movers (by |Δ|)')
    md.push('')
    md.push('| Region | Slug | OLD | NEW | Δ | Δ% |')
    md.push('|---|---|---:|---:|---:|---:|')
    for (const r of top10) {
      if (r.delta === 0) continue
      md.push(`| ${r.region.name} | \`${r.region.slug}\` | ${r.oldN} | ${r.newN} | ${fmtDelta(r.delta)} | ${fmtPct(r.pct)} |`)
    }
    md.push('')
  }

  md.push('## Per-region delta — live regions')
  md.push('')
  md.push('| Region | Slug | OLD | NEW | Δ | Δ% | Notes |')
  md.push('|---|---|---:|---:|---:|---:|---|')
  for (const r of [...live].sort((a, b) => a.region.name.localeCompare(b.region.name))) {
    md.push(`| ${r.region.name} | \`${r.region.slug}\` | ${r.oldN} | ${r.newN} | ${fmtDelta(r.delta)} | ${fmtPct(r.pct)} | ${r.note} |`)
  }
  md.push('')

  md.push('## Per-region delta — draft regions (informational)')
  md.push('')
  md.push('Draft regions are not subject to the halt threshold. A draft going from non-zero (legacy ilike text matches) to zero (no polygon → no FK match) is expected; activation requires polygon work, not a count migration.')
  md.push('')
  md.push('| Region | Slug | OLD | NEW | Δ |')
  md.push('|---|---|---:|---:|---:|')
  for (const r of [...draft].sort((a, b) => a.region.name.localeCompare(b.region.name))) {
    md.push(`| ${r.region.name} | \`${r.region.slug}\` | ${r.oldN} | ${r.newN} | ${fmtDelta(r.delta)} |`)
  }
  md.push('')

  md.push('## Interpretation')
  md.push('')
  md.push('Deltas are not bugs. They reflect the architectural shift from text-substring matching to FK precision:')
  md.push('')
  md.push('- **Positive delta (gainers)** — listings whose legacy `region` text did not contain the region name verbatim, but whose lat/lng falls inside the region polygon (so the Phase 1.5 trigger populated `region_computed_id`). The OLD ilike missed them; the NEW FK count picks them up.')
  md.push('- **Negative delta (losers)** — listings whose legacy `region` text contained an alias-mapped substring but whose lat/lng falls outside the polygon. Most commonly: SBA listings tagged with broader region names (e.g. "Hunter Valley") whose actual coordinates resolve to a different live region (or to quarantine).')
  md.push('- **Zero delta** — text and FK agree.')
  md.push('')
  md.push('Both gain and loss are correct under the post-Decision-3 architecture. The FK-based count is the single authoritative source.')
  md.push('')

  writeFileSync(REPORT_PATH, md.join('\n'))
  console.log(`\nReport written to ${REPORT_PATH}\n`)
  console.log(`Live: ${live.length}, breaches: ${breachedLive.length}`)
  if (breachedLive.length > 0) {
    console.log('HALT — live region(s) exceed delta threshold:')
    for (const r of breachedLive) {
      console.log(`  ${r.region.slug}: old=${r.oldN} new=${r.newN} delta=${r.delta} (${r.note})`)
    }
    process.exit(1)
  }
  console.log('OK — no live-region delta exceeds threshold. Safe to apply.')
}

main().catch(err => {
  console.error(err)
  process.exit(2)
})
