#!/usr/bin/env node
// ============================================================
// Parse listing addresses into structured components
// Usage: node --env-file=.env.local scripts/parse-addresses.mjs [--dry-run]
// ============================================================

import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const DRY_RUN = process.argv.includes('--dry-run')
const BATCH_SIZE = 500

// Australian state abbreviations
const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']
const STATE_FULL = {
  'new south wales': 'NSW', 'victoria': 'VIC', 'queensland': 'QLD',
  'south australia': 'SA', 'western australia': 'WA', 'tasmania': 'TAS',
  'northern territory': 'NT', 'australian capital territory': 'ACT',
}

/**
 * Parse an Australian address string into components.
 * Handles formats like:
 *   "123 Main St, Fitzroy VIC 3065"
 *   "123 Main Street, Fitzroy, Victoria 3065, Australia"
 *   "Shop 5/42 Collins St, Melbourne VIC 3000"
 */
function parseAddress(address, listingState) {
  if (!address || address.length < 5) return null

  let cleaned = address
    .replace(/,?\s*Australia$/i, '')
    .replace(/,?\s*AU$/i, '')
    .trim()

  // Extract postcode (4 digits at end)
  let postcode = null
  const pcMatch = cleaned.match(/\b(\d{4})\s*$/)
  if (pcMatch) {
    postcode = pcMatch[1]
    cleaned = cleaned.replace(/\b\d{4}\s*$/, '').trim()
  }

  // Extract state (abbreviation or full name at end)
  let state = listingState || null
  for (const abbr of AU_STATES) {
    const regex = new RegExp(`\\b${abbr}\\s*$`, 'i')
    if (regex.test(cleaned)) {
      state = abbr
      cleaned = cleaned.replace(regex, '').trim()
      break
    }
  }
  if (!state) {
    for (const [full, abbr] of Object.entries(STATE_FULL)) {
      const regex = new RegExp(`\\b${full}\\s*$`, 'i')
      if (regex.test(cleaned)) {
        state = abbr
        cleaned = cleaned.replace(regex, '').trim()
        break
      }
    }
  }

  // Remove trailing comma
  cleaned = cleaned.replace(/,\s*$/, '').trim()

  // Split by comma — last part is likely suburb, rest is street
  const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean)

  let street_address = null
  let suburb = null

  if (parts.length >= 2) {
    suburb = parts[parts.length - 1]
    street_address = parts.slice(0, -1).join(', ')
  } else if (parts.length === 1) {
    // Single part — could be just suburb or just street
    // If it contains a number, it's likely a street address
    if (/\d/.test(parts[0])) {
      street_address = parts[0]
    } else {
      suburb = parts[0]
    }
  }

  // Clean suburb — remove trailing state/postcode artifacts
  if (suburb) {
    suburb = suburb.replace(/\b\d{4}\b/, '').trim()
    for (const abbr of AU_STATES) {
      suburb = suburb.replace(new RegExp(`\\b${abbr}\\b`, 'i'), '').trim()
    }
    suburb = suburb.replace(/,\s*$/, '').trim()
  }

  // Reject if suburb looks like a full address (contains numbers except unit-style)
  if (suburb && /^\d+\s/.test(suburb) && suburb.length > 20) {
    street_address = suburb
    suburb = null
  }

  const confidence = (street_address ? 1 : 0) + (suburb ? 1 : 0) + (state ? 1 : 0) + (postcode ? 1 : 0)

  return {
    street_address: street_address || null,
    suburb: suburb || null,
    state: state || null,
    postcode: postcode || null,
    confidence, // 0-4, higher = more components parsed
  }
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===')

  let allListings = []
  let offset = 0

  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, address, state, suburb, street_address, postcode')
      .not('address', 'is', null)
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('Fetch error:', error.message); break }
    if (!data || data.length === 0) break
    allListings = allListings.concat(data)
    offset += data.length
    if (data.length < BATCH_SIZE) break
  }

  console.log(`Fetched ${allListings.length} listings with addresses\n`)

  // Only process listings that don't already have parsed components
  const needsParsing = allListings.filter(l => !l.suburb && !l.street_address)
  console.log(`${needsParsing.length} need address parsing (${allListings.length - needsParsing.length} already parsed)\n`)

  let parsed = 0, failed = 0, errors = 0
  const confidenceDist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }

  for (const listing of needsParsing) {
    const result = parseAddress(listing.address, listing.state)
    if (!result || result.confidence === 0) {
      failed++
      continue
    }

    confidenceDist[result.confidence]++

    const update = {}
    if (result.street_address) update.street_address = result.street_address
    if (result.suburb) update.suburb = result.suburb
    if (result.postcode) update.postcode = result.postcode
    // Only update state if listing doesn't have one
    if (result.state && !listing.state) update.state = result.state

    if (Object.keys(update).length === 0) continue

    if (!DRY_RUN) {
      const { error: err } = await sb
        .from('listings')
        .update(update)
        .eq('id', listing.id)
      if (err) { errors++; continue }
    }

    parsed++
    if (parsed % 500 === 0) {
      console.log(`  ... ${parsed} parsed`)
    }
  }

  console.log('\n' + '═'.repeat(50))
  console.log(DRY_RUN ? 'DRY RUN SUMMARY' : 'SUMMARY')
  console.log('═'.repeat(50))
  console.log(`Total with addresses: ${allListings.length}`)
  console.log(`Needed parsing:       ${needsParsing.length}`)
  console.log(`Successfully parsed:  ${parsed}`)
  console.log(`Failed to parse:      ${failed}`)
  console.log(`DB errors:            ${errors}`)
  console.log(`\nConfidence distribution:`)
  for (const [conf, count] of Object.entries(confidenceDist)) {
    if (count > 0) console.log(`  ${conf}/4 components: ${count}`)
  }

  // Show samples of parsed addresses
  console.log(`\nSample parsed addresses:`)
  const samples = needsParsing.slice(0, 10)
  for (const s of samples) {
    const result = parseAddress(s.address, s.state)
    console.log(`  "${s.address}"`)
    console.log(`    → street: ${result?.street_address || '—'} | suburb: ${result?.suburb || '—'} | state: ${result?.state || '—'} | postcode: ${result?.postcode || '—'} (confidence: ${result?.confidence || 0}/4)`)
  }

  console.log('\nDone.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
