#!/usr/bin/env node
/**
 * Coordinate Audit — verifies geocoded coordinates against stated state/region.
 *
 * Checks every active listing for:
 *   - Coordinates outside their stated Australian state
 *   - Coordinates outside Australia entirely
 *   - Missing coordinates
 *
 * Can auto-fix by re-geocoding the full address via Mapbox.
 *
 * Modes:
 *   --report   (default) Print report only, change nothing
 *   --fix      Re-geocode and fix listings where address is unambiguous
 *   --vertical=fine_grounds  Audit a single vertical only
 *   --name="Seven Seeds"     Fix a specific listing by name
 *
 * Usage:
 *   node --env-file=.env.local scripts/audit-coordinates.mjs
 *   node --env-file=.env.local scripts/audit-coordinates.mjs --fix
 *   node --env-file=.env.local scripts/audit-coordinates.mjs --fix --name="Seven Seeds"
 *   node --env-file=.env.local scripts/audit-coordinates.mjs --fix --vertical=fine_grounds
 */
import { createClient } from '@supabase/supabase-js'

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!MAPBOX_TOKEN) {
  console.error('Missing MAPBOX_ACCESS_TOKEN or NEXT_PUBLIC_MAPBOX_TOKEN')
  process.exit(1)
}

const sb = createClient(MASTER_URL, MASTER_KEY)

// ── Config ────────────────────────────────────────────────────

// Generous bounding boxes — slightly wider than strict state borders
// to avoid false positives for border towns (Byron Bay, Tweed Heads, etc.)
const STATE_BOUNDS = {
  NSW: { minLat: -37.6, maxLat: -28.1, minLng: 140.9, maxLng: 153.7 },
  VIC: { minLat: -39.3, maxLat: -33.9, minLng: 140.8, maxLng: 150.1 },
  QLD: { minLat: -29.3, maxLat: -10.0, minLng: 137.9, maxLng: 153.6 },
  SA:  { minLat: -38.2, maxLat: -25.9, minLng: 128.9, maxLng: 141.1 },
  WA:  { minLat: -35.3, maxLat: -13.6, minLng: 112.8, maxLng: 129.1 },
  TAS: { minLat: -43.8, maxLat: -39.5, minLng: 143.7, maxLng: 148.5 },
  ACT: { minLat: -36.0, maxLat: -35.0, minLng: 148.6, maxLng: 149.5 },
  NT:  { minLat: -26.1, maxLat: -10.0, minLng: 128.9, maxLng: 138.1 },
}

const AUSTRALIA_BOUNDS = { minLat: -44.0, maxLat: -10.0, minLng: 112.0, maxLng: 154.0 }

// Map common city/region names to expected state
const REGION_STATE_MAP = {
  'sydney': 'NSW', 'newcastle': 'NSW', 'wollongong': 'NSW', 'byron bay': 'NSW',
  'blue mountains': 'NSW', 'hunter valley': 'NSW', 'central coast': 'NSW',
  'coffs harbour': 'NSW', 'orange': 'NSW', 'armidale': 'NSW', 'wagga wagga': 'NSW',
  'port macquarie': 'NSW', 'tamworth': 'NSW', 'shoalhaven': 'NSW',
  'melbourne': 'VIC', 'geelong': 'VIC', 'ballarat': 'VIC', 'bendigo': 'VIC',
  'mornington peninsula': 'VIC', 'yarra valley': 'VIC', 'daylesford': 'VIC',
  'lorne': 'VIC', 'great ocean road': 'VIC', 'gippsland': 'VIC',
  'carlton': 'VIC', 'fitzroy': 'VIC', 'collingwood': 'VIC', 'brunswick': 'VIC',
  'richmond': 'VIC', 'south melbourne': 'VIC', 'st kilda': 'VIC',
  'footscray': 'VIC', 'northcote': 'VIC', 'preston': 'VIC',
  'brisbane': 'QLD', 'gold coast': 'QLD', 'sunshine coast': 'QLD',
  'cairns': 'QLD', 'townsville': 'QLD', 'noosa': 'QLD', 'toowoomba': 'QLD',
  'adelaide': 'SA', 'barossa valley': 'SA', 'mclaren vale': 'SA',
  'clare valley': 'SA', 'flinders ranges': 'SA', 'kangaroo island': 'SA',
  'perth': 'WA', 'fremantle': 'WA', 'margaret river': 'WA', 'broome': 'WA',
  'albany': 'WA', 'bunbury': 'WA', 'swan valley': 'WA',
  'hobart': 'TAS', 'launceston': 'TAS', 'cradle mountain': 'TAS',
  'devonport': 'TAS', 'burnie': 'TAS',
  'canberra': 'ACT',
  'darwin': 'NT', 'alice springs': 'NT', 'katherine': 'NT',
}

const ALL_VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']

// ── CLI Args ──────────────────────────────────────────────────

const args = process.argv.slice(2)
const doFix = args.includes('--fix')
const verticalArg = args.find(a => a.startsWith('--vertical='))?.split('=')[1] || null
const nameArg = args.find(a => a.startsWith('--name='))?.split('=')[1] || null

// ── Helpers ───────────────────────────────────────────────────

function extractState(region, state) {
  // 1. If state column is set, use it
  if (state) {
    const s = state.toUpperCase().trim()
    if (STATE_BOUNDS[s]) return s
  }
  // 2. Check region for explicit state code
  if (region) {
    const match = region.match(/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b/i)
    if (match) return match[1].toUpperCase()
    // 3. Check region against city/region map
    const lower = region.toLowerCase().trim()
    for (const [key, st] of Object.entries(REGION_STATE_MAP)) {
      if (lower.includes(key)) return st
    }
  }
  return null
}

function getStateForCoords(lat, lng) {
  for (const [state, b] of Object.entries(STATE_BOUNDS)) {
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
      return state
    }
  }
  return null
}

function isInAustralia(lat, lng) {
  return lat >= AUSTRALIA_BOUNDS.minLat && lat <= AUSTRALIA_BOUNDS.maxLat &&
         lng >= AUSTRALIA_BOUNDS.minLng && lng <= AUSTRALIA_BOUNDS.maxLng
}

function isInState(lat, lng, state) {
  const b = STATE_BOUNDS[state]
  if (!b) return true // unknown state, can't check
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng
}

async function geocode(query) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=au&limit=1&access_token=${MAPBOX_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) return null
  // Extract state from Mapbox context
  const stateCtx = feature.context?.find(c => c.id?.startsWith('region.'))
  const stateText = stateCtx?.short_code?.replace('AU-', '') || stateCtx?.text || null
  return {
    lat: feature.center[1],
    lng: feature.center[0],
    relevance: feature.relevance || 0,
    placeName: feature.place_name || '',
    state: stateText,
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('\n=== COORDINATE AUDIT ===\n')
  console.log(`Mode: ${doFix ? 'FIX' : 'REPORT ONLY'}`)
  if (verticalArg) console.log(`Vertical: ${verticalArg}`)
  if (nameArg) console.log(`Name filter: ${nameArg}`)
  console.log('')

  // Fetch all active listings
  let query = sb.from('listings')
    .select('id, name, slug, vertical, region, state, address, lat, lng, source_id')
    .eq('status', 'active')
    .order('vertical')
    .order('name')

  if (verticalArg) query = query.eq('vertical', verticalArg)
  if (nameArg) query = query.ilike('name', `%${nameArg}%`)

  // Paginate to get ALL listings (Supabase max 1000 per query)
  let listings = []
  let offset = 0
  const PAGE = 1000
  while (true) {
    const { data, error: pageErr } = await query.range(offset, offset + PAGE - 1)
    if (pageErr) { console.error('Query error:', pageErr.message); process.exit(1) }
    if (!data || data.length === 0) break
    listings = listings.concat(data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  const error = null
  if (error) {
    console.error('Query error:', error.message)
    process.exit(1)
  }

  console.log(`Found ${listings.length} listings to audit\n`)

  const issues = {
    missing_coords: [],
    outside_australia: [],
    wrong_state: [],
    no_state_known: [],
  }

  const fixed = []
  const needsManualReview = []

  for (const listing of listings) {
    const lat = listing.lat ? parseFloat(listing.lat) : null
    const lng = listing.lng ? parseFloat(listing.lng) : null
    const expectedState = extractState(listing.region, listing.state)

    // Missing coordinates
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
      issues.missing_coords.push(listing)
      continue
    }

    // Outside Australia
    if (!isInAustralia(lat, lng)) {
      issues.outside_australia.push({ ...listing, actualState: null })
      if (doFix) await attemptFix(listing, fixed, needsManualReview)
      continue
    }

    // No expected state — can't verify
    if (!expectedState) {
      issues.no_state_known.push(listing)
      continue
    }

    // Wrong state
    if (!isInState(lat, lng, expectedState)) {
      const actualState = getStateForCoords(lat, lng)
      issues.wrong_state.push({ ...listing, expectedState, actualState })
      if (doFix) await attemptFix(listing, fixed, needsManualReview)
    }
  }

  // ── Report ───────────────────────────────────────────────
  console.log('─── RESULTS ───────────────────────────────────\n')

  if (issues.wrong_state.length > 0) {
    console.log(`\n  WRONG STATE (${issues.wrong_state.length}):`)
    for (const l of issues.wrong_state) {
      console.log(`    ${l.vertical.padEnd(14)} ${l.name}`)
      console.log(`      Region: ${l.region || '—'} | State field: ${l.state || '—'} | Expected: ${l.expectedState}`)
      console.log(`      Coords: ${l.lat}, ${l.lng} → Actually in: ${l.actualState || 'unknown'}`)
      console.log(`      Address: ${l.address || '—'}`)
    }
  }

  if (issues.outside_australia.length > 0) {
    console.log(`\n  OUTSIDE AUSTRALIA (${issues.outside_australia.length}):`)
    for (const l of issues.outside_australia) {
      console.log(`    ${l.vertical.padEnd(14)} ${l.name} — ${l.lat}, ${l.lng}`)
    }
  }

  if (issues.missing_coords.length > 0) {
    console.log(`\n  MISSING COORDINATES (${issues.missing_coords.length}):`)
    for (const l of issues.missing_coords) {
      console.log(`    ${l.vertical.padEnd(14)} ${l.name} — ${l.region || '—'}`)
    }
  }

  // Summary by vertical
  console.log('\n─── SUMMARY BY VERTICAL ───────────────────────\n')
  const verticals = [...new Set(listings.map(l => l.vertical))]
  for (const v of verticals.sort()) {
    const vListings = listings.filter(l => l.vertical === v)
    const vWrong = issues.wrong_state.filter(l => l.vertical === v)
    const vOutside = issues.outside_australia.filter(l => l.vertical === v)
    const vMissing = issues.missing_coords.filter(l => l.vertical === v)
    const vNoState = issues.no_state_known.filter(l => l.vertical === v)
    const issueCount = vWrong.length + vOutside.length + vMissing.length
    const marker = issueCount > 0 ? ' !!!' : ''
    console.log(`  ${v.padEnd(14)} ${vListings.length} listings | ${vWrong.length} wrong state | ${vOutside.length} outside AU | ${vMissing.length} no coords | ${vNoState.length} no state${marker}`)
  }

  const totalIssues = issues.wrong_state.length + issues.outside_australia.length + issues.missing_coords.length
  console.log(`\n  TOTAL: ${listings.length} listings audited, ${totalIssues} issues found`)

  if (doFix && fixed.length > 0) {
    console.log(`\n─── FIXED (${fixed.length}) ─────────────────────────────────\n`)
    for (const f of fixed) {
      console.log(`  ${f.vertical.padEnd(14)} ${f.name}`)
      console.log(`    Old: ${f.oldLat}, ${f.oldLng}`)
      console.log(`    New: ${f.newLat}, ${f.newLng} (${f.placeName})`)
    }
  }

  if (needsManualReview.length > 0) {
    console.log(`\n─── NEEDS MANUAL REVIEW (${needsManualReview.length}) ──────────────\n`)
    for (const f of needsManualReview) {
      console.log(`  ${f.vertical.padEnd(14)} ${f.name} — ${f.reason}`)
    }
  }

  console.log('\nDone.\n')
}

/** Extract a state abbreviation from an address string (e.g., "QLD 4218" → "QLD") */
function extractStateFromAddress(address) {
  if (!address) return null
  const match = address.match(/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b/i)
  return match ? match[1].toUpperCase() : null
}

async function attemptFix(listing, fixed, needsManualReview) {
  const lat = parseFloat(listing.lat)
  const lng = parseFloat(listing.lng)
  const coordState = getStateForCoords(lat, lng)
  const addressState = extractStateFromAddress(listing.address)
  const statedState = (listing.state || '').toUpperCase().trim()
  const expectedState = extractState(listing.region, listing.state)

  // CASE 1: Coordinates are correct for the address, but state field is wrong
  // e.g., Gold Coast listing with state:"NSW" but address says "QLD" and coords are in QLD
  if (addressState && coordState === addressState && coordState !== statedState) {
    const updates = { state: addressState }
    // Also fix region if it's a street address
    const regionLooksLikeAddress = /^\d+[\s/]/.test(listing.region || '') || /\b(St|Rd|Ave|Dr|Hwy|Blvd|Pl|Cres)\b/i.test(listing.region || '')
    if (regionLooksLikeAddress && listing.address) {
      // Try to extract suburb from the address (e.g., "87 W Burleigh Rd, Burleigh Heads QLD 4220")
      const suburbMatch = listing.address.match(/,\s*([A-Z][a-z][\w\s]+?)(?:\s+(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT))/i)
      if (suburbMatch) updates.region = suburbMatch[1].trim()
    }

    const { error } = await sb.from('listings').update(updates).eq('id', listing.id)
    if (error) {
      needsManualReview.push({ ...listing, reason: `State fix failed: ${error.message}` })
      return
    }
    fixed.push({
      ...listing, fixType: 'state_field',
      oldLat: lat, oldLng: lng, newLat: lat, newLng: lng,
      placeName: `State: ${statedState} → ${addressState}${updates.region ? `, Region: ${listing.region} → ${updates.region}` : ''}`,
    })
    console.log(`  FIXED STATE: ${listing.name} (${listing.vertical}) — ${statedState} → ${addressState}`)
    return
  }

  // CASE 2: Coordinates are wrong — re-geocode from address
  const queries = []
  if (listing.address) queries.push(listing.address + ', Australia')
  if (listing.name && listing.region && !/^\d+[\s/]/.test(listing.region)) {
    queries.push(`${listing.name}, ${listing.region}, Australia`)
  }
  if (listing.name && listing.state) queries.push(`${listing.name}, ${listing.state}, Australia`)

  if (queries.length === 0) {
    needsManualReview.push({ ...listing, reason: 'No address or region to geocode from' })
    return
  }

  for (const q of queries) {
    await sleep(200) // Rate limit
    const result = await geocode(q)
    if (!result || result.relevance < 0.7) continue

    // Verify the new coords are in the right state (if we know it)
    if (expectedState && !isInState(result.lat, result.lng, expectedState)) {
      continue
    }

    if (!isInAustralia(result.lat, result.lng)) continue

    const oldLat = lat
    const oldLng = lng
    const updates = { lat: result.lat, lng: result.lng }

    // Fix address if geocode gave a better one
    if (result.placeName && (!listing.address || listing.address.length < result.placeName.length)) {
      updates.address = result.placeName
    }
    // Fix state if we got it from Mapbox
    if (result.state) {
      updates.state = result.state
    }
    // Fix region if it's a street address
    const regionLooksLikeAddress = /^\d+[\s/]/.test(listing.region || '') || /\b(St|Rd|Ave|Dr|Hwy|Blvd|Pl|Cres)\b/i.test(listing.region || '')
    if (regionLooksLikeAddress && result.placeName) {
      const suburbMatch = result.placeName.match(/,\s*([A-Z][a-z][\w\s]+?)(?:\s+(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT))/i)
      if (suburbMatch) updates.region = suburbMatch[1].trim()
    }

    const { error } = await sb.from('listings').update(updates).eq('id', listing.id)
    if (error) {
      needsManualReview.push({ ...listing, reason: `DB update failed: ${error.message}` })
      return
    }

    fixed.push({
      ...listing, fixType: 'coordinates',
      oldLat, oldLng, newLat: result.lat, newLng: result.lng,
      placeName: result.placeName,
    })
    console.log(`  FIXED COORDS: ${listing.name} (${listing.vertical}) — ${oldLat},${oldLng} → ${result.lat},${result.lng}`)
    return
  }

  needsManualReview.push({ ...listing, reason: 'Re-geocoding did not produce a confident result in the expected state' })
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
