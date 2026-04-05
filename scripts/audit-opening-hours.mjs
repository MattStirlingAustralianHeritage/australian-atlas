#!/usr/bin/env node
/**
 * Audit Opening Hours Data Quality
 *
 * Queries each vertical's source database to categorise listings by hours data state:
 *   - all_closed:  opening_hours is an object where every day is null, empty, or "Closed"
 *   - no_data:     opening_hours is null, undefined, or empty object
 *   - partial:     some days have real hours, some are null/empty
 *   - complete:    all 7 days have a value (either real hours or explicit "Closed")
 *
 * Usage:
 *   node --env-file=.env.local scripts/audit-opening-hours.mjs
 *   node --env-file=.env.local scripts/audit-opening-hours.mjs --vertical=corner
 */
import { createClient } from '@supabase/supabase-js'

// ── Env check ─────────────────────────────────────────────
const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing ${key}`)
    process.exit(1)
  }
}

// ── CLI flags ─────────────────────────────────────────────
const args = process.argv.slice(2)
const verticalFlag = args.find(a => a.startsWith('--vertical='))?.split('=')[1] || null

// ── Vertical DB config ────────────────────────────────────
const VERTICALS = {
  corner: {
    url: process.env.CORNER_SUPABASE_URL,
    key: process.env.CORNER_SUPABASE_SERVICE_KEY,
    table: 'shops',
    publishedCol: 'published',
    hoursCol: 'opening_hours',
    nameCol: 'name',
    label: 'Corner Atlas',
  },
  found: {
    url: process.env.FOUND_SUPABASE_URL,
    key: process.env.FOUND_SUPABASE_SERVICE_KEY,
    table: 'shops',
    publishedCol: 'published',
    hoursCol: 'opening_hours',
    nameCol: 'name',
    label: 'Found Atlas',
  },
  sba: {
    url: process.env.SBA_SUPABASE_URL,
    key: process.env.SBA_SUPABASE_SERVICE_KEY,
    table: 'venues',
    publishedCol: 'status',
    publishedVal: 'published',
    hoursCol: 'opening_hours',
    nameCol: 'name',
    label: 'Small Batch Atlas',
  },
  fine_grounds_cafes: {
    url: process.env.FINE_GROUNDS_SUPABASE_URL,
    key: process.env.FINE_GROUNDS_SUPABASE_SERVICE_KEY,
    table: 'cafes',
    publishedCol: 'status',
    publishedVal: 'published',
    hoursCol: 'opening_hours',
    nameCol: 'name',
    label: 'Fine Grounds (Cafes)',
  },
  fine_grounds_roasters: {
    url: process.env.FINE_GROUNDS_SUPABASE_URL,
    key: process.env.FINE_GROUNDS_SUPABASE_SERVICE_KEY,
    table: 'roasters',
    publishedCol: 'status',
    publishedVal: 'published',
    hoursCol: 'opening_hours',
    nameCol: 'name',
    label: 'Fine Grounds (Roasters)',
  },
  table: {
    url: process.env.TABLE_SUPABASE_URL,
    key: process.env.TABLE_SUPABASE_SERVICE_KEY,
    table: 'listings',
    publishedCol: 'published',
    hoursCol: 'opening_hours',
    nameCol: 'name',
    label: 'Table Atlas',
  },
  rest: {
    url: process.env.REST_SUPABASE_URL,
    key: process.env.REST_SUPABASE_SERVICE_KEY,
    table: 'properties',
    publishedCol: 'status',
    publishedVal: 'published',
    hoursCol: 'opening_hours',
    nameCol: 'name',
    label: 'Rest Atlas',
  },
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function classifyHours(openingHours) {
  // No data at all
  if (!openingHours || typeof openingHours !== 'object') return 'no_data'

  const keys = Object.keys(openingHours)
  if (keys.length === 0) return 'no_data'

  let filledDays = 0
  let closedDays = 0
  let emptyDays = 0

  for (const day of DAYS) {
    const val = openingHours[day]
    if (val === null || val === undefined || val === '') {
      emptyDays++
    } else if (val === 'Closed' || val === 'closed') {
      closedDays++
    } else {
      filledDays++
    }
  }

  // All days are null/empty — no data was entered
  if (filledDays === 0 && closedDays === 0) return 'no_data'
  // All days are either "Closed" or empty — but at least some say "Closed"
  if (filledDays === 0 && closedDays > 0) return 'all_closed'
  // Some days have real hours, some don't
  if (filledDays > 0 && filledDays < 7) return 'partial'
  // All 7 days have real hours or explicit "Closed"
  return 'complete'
}

async function auditVertical(key, config) {
  if (!config.url || !config.key) {
    console.log(`  ${config.label}: ⚠ No credentials — skipping`)
    return null
  }

  const sb = createClient(config.url, config.key)

  // Fetch all published listings with opening_hours and name
  const publishedValue = config.publishedVal || true
  const { data, error } = await sb
    .from(config.table)
    .select(`id, ${config.nameCol}, ${config.hoursCol}`)
    .eq(config.publishedCol, publishedValue)

  if (error) {
    console.error(`  ${config.label}: Error — ${error.message}`)
    return null
  }

  if (!data || data.length === 0) {
    console.log(`  ${config.label}: 0 published listings`)
    return null
  }

  const results = { no_data: [], all_closed: [], partial: [], complete: [] }

  for (const row of data) {
    const category = classifyHours(row[config.hoursCol])
    results[category].push({
      id: row.id,
      name: row[config.nameCol],
      hours: row[config.hoursCol],
    })
  }

  return { total: data.length, results }
}

async function main() {
  console.log('\n════════════════════════════════════════════')
  console.log('  OPENING HOURS DATA AUDIT')
  console.log('════════════════════════════════════════════\n')

  const verticalsToAudit = verticalFlag
    ? Object.entries(VERTICALS).filter(([k]) => k === verticalFlag || k.startsWith(verticalFlag))
    : Object.entries(VERTICALS)

  const summaryRows = []

  for (const [key, config] of verticalsToAudit) {
    const audit = await auditVertical(key, config)
    if (!audit) continue

    const { total, results } = audit
    const noDataPct = ((results.no_data.length / total) * 100).toFixed(1)
    const allClosedPct = ((results.all_closed.length / total) * 100).toFixed(1)
    const partialPct = ((results.partial.length / total) * 100).toFixed(1)
    const completePct = ((results.complete.length / total) * 100).toFixed(1)

    console.log(`  ${config.label} (${total} published listings)`)
    console.log(`  ┌─────────────────────────────────────────────`)
    console.log(`  │ No data (null/empty):     ${String(results.no_data.length).padStart(5)}  (${noDataPct}%)`)
    console.log(`  │ All "Closed":             ${String(results.all_closed.length).padStart(5)}  (${allClosedPct}%)`)
    console.log(`  │ Partial hours:            ${String(results.partial.length).padStart(5)}  (${partialPct}%)`)
    console.log(`  │ Complete hours:           ${String(results.complete.length).padStart(5)}  (${completePct}%)`)
    console.log(`  └─────────────────────────────────────────────`)

    // Show sample "all_closed" listings (likely the bug pattern)
    if (results.all_closed.length > 0) {
      console.log(`\n    ⚠ Sample "all closed" listings (likely display bug):`)
      for (const item of results.all_closed.slice(0, 5)) {
        console.log(`      • ${item.name} (id: ${item.id})`)
        if (item.hours) {
          const vals = DAYS.map(d => item.hours[d]).filter(Boolean)
          console.log(`        Values: ${JSON.stringify(vals.slice(0, 3))}${vals.length > 3 ? '...' : ''}`)
        }
      }
      if (results.all_closed.length > 5) {
        console.log(`      ... and ${results.all_closed.length - 5} more`)
      }
    }

    console.log()

    summaryRows.push({
      vertical: config.label,
      total,
      no_data: results.no_data.length,
      all_closed: results.all_closed.length,
      partial: results.partial.length,
      complete: results.complete.length,
    })
  }

  // ── Network summary ─────────────────────────────────────
  if (summaryRows.length > 1) {
    console.log('────────────────────────────────────────────')
    console.log('  NETWORK SUMMARY')
    console.log('────────────────────────────────────────────')
    console.log(`  ${'Vertical'.padEnd(26)} ${'Total'.padStart(6)} ${'No Data'.padStart(8)} ${'All Closed'.padStart(11)} ${'Partial'.padStart(8)} ${'Complete'.padStart(9)}`)
    console.log(`  ${'─'.repeat(26)} ${'─'.repeat(6)} ${'─'.repeat(8)} ${'─'.repeat(11)} ${'─'.repeat(8)} ${'─'.repeat(9)}`)
    for (const r of summaryRows) {
      console.log(`  ${r.vertical.padEnd(26)} ${String(r.total).padStart(6)} ${String(r.no_data).padStart(8)} ${String(r.all_closed).padStart(11)} ${String(r.partial).padStart(8)} ${String(r.complete).padStart(9)}`)
    }
    const totals = summaryRows.reduce((acc, r) => ({
      total: acc.total + r.total,
      no_data: acc.no_data + r.no_data,
      all_closed: acc.all_closed + r.all_closed,
      partial: acc.partial + r.partial,
      complete: acc.complete + r.complete,
    }), { total: 0, no_data: 0, all_closed: 0, partial: 0, complete: 0 })
    console.log(`  ${'─'.repeat(26)} ${'─'.repeat(6)} ${'─'.repeat(8)} ${'─'.repeat(11)} ${'─'.repeat(8)} ${'─'.repeat(9)}`)
    console.log(`  ${'TOTAL'.padEnd(26)} ${String(totals.total).padStart(6)} ${String(totals.no_data).padStart(8)} ${String(totals.all_closed).padStart(11)} ${String(totals.partial).padStart(8)} ${String(totals.complete).padStart(9)}`)
  }

  console.log('\nDone.\n')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
