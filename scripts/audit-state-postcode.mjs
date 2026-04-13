#!/usr/bin/env node

/**
 * Audit state/postcode mismatches.
 *
 * Extracts postcodes from listing addresses and verifies them against
 * the listing's stored state field using Australian postcode ranges.
 *
 * Modes:
 *   (default)   Report mismatches and auto-fix state to the correct value
 *   --dry-run   Report only, don't update anything
 *
 * Usage:
 *   node --env-file=.env.local scripts/audit-state-postcode.mjs
 *   node --env-file=.env.local scripts/audit-state-postcode.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js'

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(MASTER_URL, MASTER_KEY)
const dryRun = process.argv.includes('--dry-run')

// ── Australian postcode ranges by state ─────────────────────────

const POSTCODE_RANGES = [
  { state: 'NSW', ranges: [[1000, 2599], [2619, 2899], [2921, 2999]] },
  { state: 'VIC', ranges: [[3000, 3999], [8000, 8999]] },
  { state: 'QLD', ranges: [[4000, 4999], [9000, 9999]] },
  { state: 'SA',  ranges: [[5000, 5799], [5800, 5999]] },
  { state: 'WA',  ranges: [[6000, 6797], [6800, 6999]] },
  { state: 'TAS', ranges: [[7000, 7999]] },
  { state: 'NT',  ranges: [[800, 899], [900, 999]] },
  { state: 'ACT', ranges: [[200, 299], [2600, 2618], [2900, 2920]] },
]

/**
 * Given a 4-digit postcode number, return the expected state abbreviation.
 * Returns null if the postcode doesn't match any known range.
 */
export function stateFromPostcode(postcode) {
  const num = parseInt(postcode, 10)
  if (isNaN(num)) return null

  for (const { state, ranges } of POSTCODE_RANGES) {
    for (const [min, max] of ranges) {
      if (num >= min && num <= max) return state
    }
  }

  return null
}

/**
 * Extract the first Australian postcode (3-4 digit number near a state abbrev)
 * from an address string.
 */
function extractPostcode(address) {
  if (!address) return null
  // Match patterns like "VIC 3465", "NSW 2000", "QLD4000", "TAS 7000"
  const match = address.match(/\b(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s*(\d{4})\b/i)
  if (match) return match[1]

  // Fallback: match a 4-digit number at the end of the address
  const endMatch = address.match(/\b(\d{4})\s*$/i)
  if (endMatch) return endMatch[1]

  // Match 3-digit NT postcodes like "0800"
  const ntMatch = address.match(/\b(0\d{3})\b/)
  if (ntMatch) return ntMatch[1]

  return null
}

async function main() {
  console.log('\n=== STATE/POSTCODE MISMATCH AUDIT ===\n')
  console.log(`Mode: ${dryRun ? 'DRY RUN (report only)' : 'AUTO-FIX'}`)
  console.log('')

  // Fetch all active listings with addresses
  let listings = []
  let offset = 0
  const PAGE = 1000

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, slug, vertical, region, state, address')
      .eq('status', 'active')
      .not('address', 'is', null)
      .order('vertical')
      .order('name')
      .range(offset, offset + PAGE - 1)

    if (error) {
      console.error('Query error:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    listings = listings.concat(data)
    if (data.length < PAGE) break
    offset += PAGE
  }

  console.log(`Fetched ${listings.length} active listings with addresses\n`)

  const mismatches = []
  let noPostcode = 0
  let noState = 0
  let matched = 0
  let unknownPostcode = 0

  for (const listing of listings) {
    const postcode = extractPostcode(listing.address)

    if (!postcode) {
      noPostcode++
      continue
    }

    const expectedState = stateFromPostcode(postcode)

    if (!expectedState) {
      unknownPostcode++
      continue
    }

    const storedState = (listing.state || '').toUpperCase().trim()

    if (!storedState) {
      noState++
      // Auto-fix: set state from postcode
      mismatches.push({
        listing,
        postcode,
        storedState: '(empty)',
        expectedState,
        fixType: 'missing_state',
      })
      continue
    }

    if (storedState !== expectedState) {
      mismatches.push({
        listing,
        postcode,
        storedState,
        expectedState,
        fixType: 'wrong_state',
      })
    } else {
      matched++
    }
  }

  // ── Report ──────────────────────────────────────────────────
  console.log('─── MISMATCHES ─────────────────────────────────\n')

  if (mismatches.length === 0) {
    console.log('  No state/postcode mismatches found.\n')
  } else {
    for (const m of mismatches) {
      const l = m.listing
      console.log(`  ${l.vertical.padEnd(14)} ${l.name}`)
      console.log(`    Address:  ${l.address}`)
      console.log(`    Postcode: ${m.postcode} -> Expected state: ${m.expectedState}`)
      console.log(`    Stored:   ${m.storedState} ${m.fixType === 'missing_state' ? '(MISSING)' : '(WRONG)'}`)
      console.log('')
    }
  }

  // ── Auto-fix ────────────────────────────────────────────────
  let fixedCount = 0
  let failedCount = 0

  if (!dryRun && mismatches.length > 0) {
    console.log('─── FIXING ──────────────────────────────────────\n')

    for (const m of mismatches) {
      const { error } = await sb
        .from('listings')
        .update({ state: m.expectedState })
        .eq('id', m.listing.id)

      if (error) {
        console.error(`  FAILED: ${m.listing.name} — ${error.message}`)
        failedCount++
      } else {
        console.log(`  FIXED: ${m.listing.name} — ${m.storedState} -> ${m.expectedState}`)
        fixedCount++
      }
    }
    console.log('')
  }

  // ── Summary ─────────────────────────────────────────────────
  console.log('─── SUMMARY ─────────────────────────────────────\n')
  console.log(`  Total listings audited:  ${listings.length}`)
  console.log(`  State/postcode matched:  ${matched}`)
  console.log(`  No postcode in address:  ${noPostcode}`)
  console.log(`  Unknown postcode range:  ${unknownPostcode}`)
  console.log(`  No state stored:         ${noState}`)
  console.log(`  Mismatches found:        ${mismatches.length}`)

  if (!dryRun) {
    console.log(`  Fixed:                   ${fixedCount}`)
    console.log(`  Failed to fix:           ${failedCount}`)
  }

  console.log('\nDone.\n')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
