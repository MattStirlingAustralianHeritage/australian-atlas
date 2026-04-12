#!/usr/bin/env node
// ============================================================
// Bulk re-geocode: fix inaccurate map pins across all listings
// Usage: node --env-file=.env.local scripts/bulk-regeocode.mjs [--dry-run]
// ============================================================

import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN

const DRY_RUN = process.argv.includes('--dry-run')
const MIN_ERROR_M = 500          // Only fix if off by more than 500m
const MAX_AUTO_FIX_KM = 100      // Auto-fix up to 100km; beyond = flagged for review
const MIN_ADDRESS_LEN = 10       // Skip vague addresses
const BATCH_SIZE = 500            // Supabase fetch batch size
const DELAY_MS = 80               // Mapbox rate limit (~12 req/s)
const MIN_RELEVANCE = 0.6         // Mapbox relevance threshold (0–1)
const HIGH_DIST_RELEVANCE = 0.9   // Relevance needed for corrections >50km

// ── Haversine distance (km) ─────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Geocode via Mapbox ──────────────────────────────────────
async function geocode(address, state) {
  const query = [address, state, 'Australia'].filter(Boolean).join(', ')
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=au&limit=1&access_token=${MAPBOX_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const feat = data.features?.[0]
  if (!feat) return null
  return {
    lat: feat.center[1],
    lng: feat.center[0],
    relevance: feat.relevance || 0,
    place_name: feat.place_name || '',
  }
}

// ── Fetch all regions for nearest-region assignment ──────────
async function loadRegions() {
  const { data } = await sb
    .from('regions')
    .select('name, state, center_lat, center_lng')
    .not('center_lat', 'is', null)
    .not('center_lng', 'is', null)
  return data || []
}

function nearestRegion(lat, lng, regions) {
  let nearest = null, minDist = Infinity
  for (const r of regions) {
    const dist = haversine(lat, lng, r.center_lat, r.center_lng)
    if (dist < minDist) { minDist = dist; nearest = r }
  }
  return minDist < 150 ? { name: nearest.name, dist: minDist } : null
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  if (!MAPBOX_TOKEN) { console.error('Missing MAPBOX_TOKEN'); process.exit(1) }

  console.log(DRY_RUN ? '=== DRY RUN (no writes) ===' : '=== LIVE RUN ===')
  console.log(`Threshold: ${MIN_ERROR_M}m | Min relevance: ${MIN_RELEVANCE}\n`)

  const regions = await loadRegions()
  console.log(`Loaded ${regions.length} regions for re-assignment\n`)

  // Fetch all active listings with addresses and coordinates
  let allListings = []
  let offset = 0
  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, slug, address, state, region, lat, lng, vertical')
      .eq('status', 'active')
      .not('address', 'is', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('name')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) { console.error('Fetch error:', error.message); break }
    if (!data || data.length === 0) break
    allListings = allListings.concat(data)
    offset += data.length
    if (data.length < BATCH_SIZE) break
  }

  console.log(`Fetched ${allListings.length} listings with addresses + coordinates\n`)

  // Filter to listings with meaningful addresses
  const eligible = allListings.filter(l => l.address && l.address.length >= MIN_ADDRESS_LEN)
  console.log(`${eligible.length} with addresses >= ${MIN_ADDRESS_LEN} chars\n`)

  let checked = 0, fixed = 0, skippedLowRelevance = 0, skippedSmallError = 0, errors = 0
  let skippedStateMismatch = 0, skippedTooFar = 0
  const fixes = []
  const flagged = [] // Large corrections that need manual review

  // Extract state from Mapbox place_name (e.g. "... Victoria 3071, Australia")
  const AU_STATES = {
    'New South Wales': 'NSW', 'Victoria': 'VIC', 'Queensland': 'QLD',
    'South Australia': 'SA', 'Western Australia': 'WA', 'Tasmania': 'TAS',
    'Northern Territory': 'NT', 'Australian Capital Territory': 'ACT',
  }
  function extractState(placeName) {
    if (!placeName) return null
    for (const [full, abbr] of Object.entries(AU_STATES)) {
      if (placeName.includes(full)) return abbr
    }
    return null
  }

  for (const l of eligible) {
    checked++
    if (checked % 200 === 0) {
      console.log(`  ... ${checked}/${eligible.length} checked, ${fixed} fixed so far`)
    }

    try {
      const geo = await geocode(l.address, l.state)
      if (!geo) { errors++; continue }

      // Skip low-confidence results
      if (geo.relevance < MIN_RELEVANCE) {
        skippedLowRelevance++
        continue
      }

      const distKm = haversine(l.lat, l.lng, geo.lat, geo.lng)
      const distM = distKm * 1000

      if (distM <= MIN_ERROR_M) {
        skippedSmallError++
        continue
      }

      // ── Safety: state mismatch check ──
      // If the listing has a state, verify the geocoded result is in the same state.
      // This prevents Mapbox returning a same-named street in a different state.
      if (l.state) {
        const geoState = extractState(geo.place_name)
        if (geoState && geoState !== l.state) {
          skippedStateMismatch++
          continue
        }
      }

      // ── Safety: distance-based relevance gating ──
      // Large corrections need very high confidence to avoid catastrophic moves
      if (distKm > 50 && geo.relevance < HIGH_DIST_RELEVANCE) {
        skippedLowRelevance++
        continue
      }

      // ── Safety: flag corrections >100km for manual review instead of auto-fixing ──
      if (distKm > MAX_AUTO_FIX_KM) {
        flagged.push({
          name: l.name, vertical: l.vertical, address: l.address,
          oldLat: l.lat, oldLng: l.lng, newLat: geo.lat, newLng: geo.lng,
          errorKm: distKm.toFixed(1), relevance: geo.relevance, place_name: geo.place_name,
        })
        skippedTooFar++
        continue
      }

      // This listing needs fixing
      const update = { lat: geo.lat, lng: geo.lng, updated_at: new Date().toISOString() }

      // Check if region should change too — only for corrections <50km
      // (large moves risk assigning completely wrong regions)
      const regionMatch = distKm < 50 ? nearestRegion(geo.lat, geo.lng, regions) : null
      let regionChanged = false
      if (regionMatch && regionMatch.name !== l.region) {
        update.region = regionMatch.name
        regionChanged = true
      }

      const fixRecord = {
        name: l.name,
        vertical: l.vertical,
        address: l.address,
        oldLat: l.lat, oldLng: l.lng,
        newLat: geo.lat, newLng: geo.lng,
        errorKm: distKm.toFixed(1),
        relevance: geo.relevance,
        place_name: geo.place_name,
        regionChanged: regionChanged ? `${l.region} → ${update.region}` : null,
      }

      if (!DRY_RUN) {
        const { error: updateErr } = await sb
          .from('listings')
          .update(update)
          .eq('id', l.id)

        if (updateErr) {
          console.error(`  WRITE ERROR: ${l.name} — ${updateErr.message}`)
          errors++
          continue
        }
      }

      fixed++
      fixes.push(fixRecord)

      const regionNote = regionChanged ? ` | region: ${fixRecord.regionChanged}` : ''
      console.log(`  FIXED ${distKm.toFixed(1)}km: ${l.name} [${l.vertical}]${regionNote}`)

    } catch (err) {
      errors++
    }

    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  // ── Summary ───────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log(DRY_RUN ? 'DRY RUN SUMMARY' : 'SUMMARY')
  console.log('═'.repeat(60))
  console.log(`Checked:                ${checked}`)
  console.log(`Fixed (>${MIN_ERROR_M}m off):     ${fixed}`)
  console.log(`Skipped (close enough):  ${skippedSmallError}`)
  console.log(`Skipped (low relevance): ${skippedLowRelevance}`)
  console.log(`Skipped (state mismatch): ${skippedStateMismatch}`)
  console.log(`Skipped (>${MAX_AUTO_FIX_KM}km, flagged): ${skippedTooFar}`)
  console.log(`Errors/no result:        ${errors}`)

  if (fixes.length > 0) {
    console.log(`\n── Fixes by distance ──`)
    const brackets = [
      { label: '>10km', min: 10 },
      { label: '5–10km', min: 5, max: 10 },
      { label: '2–5km', min: 2, max: 5 },
      { label: '1–2km', min: 1, max: 2 },
      { label: '0.5–1km', min: 0.5, max: 1 },
    ]
    for (const b of brackets) {
      const count = fixes.filter(f => {
        const d = parseFloat(f.errorKm)
        return d >= b.min && (!b.max || d < b.max)
      }).length
      if (count > 0) console.log(`  ${b.label}: ${count}`)
    }

    console.log(`\n── Worst offenders ──`)
    fixes.sort((a, b) => parseFloat(b.errorKm) - parseFloat(a.errorKm))
    for (const f of fixes.slice(0, 20)) {
      console.log(`  ${f.errorKm}km — ${f.name} [${f.vertical}]`)
      console.log(`    ${f.oldLat},${f.oldLng} → ${f.newLat},${f.newLng}`)
      console.log(`    Mapbox: ${f.place_name} (relevance ${f.relevance})`)
    }
  }

  if (flagged.length > 0) {
    console.log(`\n── Flagged for manual review (>${MAX_AUTO_FIX_KM}km) ──`)
    flagged.sort((a, b) => parseFloat(b.errorKm) - parseFloat(a.errorKm))
    for (const f of flagged) {
      console.log(`  ${f.errorKm}km — ${f.name} [${f.vertical}] (${f.address})`)
    }
  }

  console.log('\nDone.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
