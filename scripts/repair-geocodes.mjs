#!/usr/bin/env node
// ============================================================================
// repair-geocodes — find and fix listings whose map pin contradicts their
// address (the "Montague Island" class: a far-south-coast venue pinned up in
// the Northern Rivers because an old geocode matched a same-named street).
//
// Strategy (per listing, in increasing cost):
//   1. Cheap pre-gate: how far is the stored pin from its postcode/suburb
//      anchor? Within CANDIDATE_KM → obviously fine, skip. (Anchors are cached
//      by postcode, so this is a handful of Mapbox calls for the whole table.)
//   2. Corroboration: geocode the literal full address. If that independently
//      lands within AGREE_KM of the stored pin, the address backs the pin up —
//      keep it, even for a venue far from its (large rural) postcode centroid.
//   3. Anchored re-geocode (lib/geo/anchoredGeocode): the validated best
//      estimate. If the stored pin is more than AUTO_FIX_KM from it, the pin is
//      grossly wrong → fix lat/lng + region. In between → flag for review.
//
// Region: on fix we set the FK columns the detail page actually reads. The
// trigger recomputes region_computed_id from the new lat/lng; for points
// outside every polygon (e.g. the far south coast) we set region_override_id
// to the nearest region so the label still shows. The legacy text column is
// mirrored for the vertical push only.
//
// SAFE BY DEFAULT: dry-run unless --apply is passed.
//
// Usage:
//   node --env-file=.env.local scripts/repair-geocodes.mjs            # dry run
//   node --env-file=.env.local scripts/repair-geocodes.mjs --apply    # write
//   node --env-file=.env.local scripts/repair-geocodes.mjs --limit 50 # sample
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { anchoredGeocode, haversineKm, extractPostcode } from '../lib/geo/anchoredGeocode.js'
import { resolveRegionForCoords } from '../lib/geo/resolveRegionForCoords.js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN

const APPLY = process.argv.includes('--apply')
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit')
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity
})()

// ── Thresholds (km) ─────────────────────────────────────────────────────────
const CANDIDATE_KM = 50   // stored pin must be >this from its anchor to investigate
const AGREE_KM = 25       // literal-address geocode within this of stored pin → keep
const AUTO_FIX_KM = 75    // stored pin >this from the anchored estimate → auto-fix
const DELAY_MS = 60

// Slugs to never auto-move — the ADDRESS is wrong/misleading, not the pin, so a
// "fix" would relocate an already-correct pin. Flagged for human review instead.
//   jewel-cave-wa: address says "Cape Naturaliste Rd, Dunsborough" but Jewel
//     Cave is at Augusta (~76km south), where the stored pin already sits.
const REVIEW_SLUGS = new Set(['jewel-cave-wa'])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Cached locality anchor (postcode → suburb), keyed to limit Mapbox calls ──
// Returns { lat, lng, kind: 'postcode' | 'suburb' } | null. The kind matters:
// a postcode anchor is nationally unambiguous; a suburb anchor can be ambiguous
// (Richmond TAS vs VIC), so the fix gate trusts it less.
const anchorCache = new Map()
async function cachedAnchor(postcode, suburb, state) {
  const key = `${postcode || ''}|${suburb || ''}|${state || ''}`
  if (anchorCache.has(key)) return anchorCache.get(key)
  let anchor = null
  if (postcode) {
    const r = await mapbox(`${postcode}${state ? `, ${state}` : ''}, Australia`, 'postcode')
    if (r) anchor = { ...r, kind: 'postcode' }
  }
  if (!anchor && suburb) {
    const r = await mapbox(`${suburb}${state ? `, ${state}` : ''}, Australia`, 'place,locality,neighborhood')
    if (r) anchor = { ...r, kind: 'suburb' }
  }
  anchorCache.set(key, anchor)
  await sleep(DELAY_MS) // throttle cache-miss Mapbox calls under the rate limit
  return anchor
}

// Best-effort suburb + state parse from a free-text address, used only when the
// suburb column is empty so a listing still gets a (weak) anchor for detection.
// e.g. "59 Leonards Hill Rd, Bullarto VIC" → { suburb: 'Bullarto', state: 'VIC' }.
const STATE_RE = /\b(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\b/i
function deriveLocalityFromAddress(address) {
  if (!address) return { suburb: null, state: null }
  const segs = address.replace(/,?\s*Australia\s*$/i, '').split(',').map((s) => s.trim()).filter(Boolean)
  let state = null
  const sm = address.match(STATE_RE)
  if (sm) state = sm[1].toUpperCase()
  // Walk segments from the end; the last segment that isn't pure postcode is the
  // locality. Strip a trailing state code and postcode from it.
  for (let i = segs.length - 1; i >= 0; i--) {
    let seg = segs[i].replace(STATE_RE, '').replace(/\b\d{4}\b/, '').trim()
    if (seg && !/^\d+/.test(seg)) return { suburb: seg, state }
  }
  return { suburb: null, state }
}

// ── Raw (unanchored) Mapbox forward geocode — for the corroboration check ────
async function mapbox(query, types) {
  const t = types ? `&types=${encodeURIComponent(types)}` : ''
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=au&limit=1${t}&access_token=${MAPBOX_TOKEN}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    const f = data.features?.[0]
    return f ? { lat: f.center[1], lng: f.center[0], relevance: f.relevance ?? 0, placeName: f.place_name } : null
  } catch {
    return null
  }
}

async function fetchAllListings() {
  let all = []
  let offset = 0
  while (true) {
    const { data, error } = await sb
      .from('listings')
      .select('id, name, slug, vertical, address, suburb, state, region, region_override_id, lat, lng')
      .eq('status', 'active')
      .not('address', 'is', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('name')
      .range(offset, offset + 999)
    if (error) { console.error('Fetch error:', error.message); break }
    if (!data?.length) break
    all = all.concat(data)
    offset += data.length
    if (data.length < 1000) break
  }
  return all
}

async function main() {
  if (!MAPBOX_TOKEN) { console.error('Missing MAPBOX_TOKEN'); process.exit(1) }
  console.log(APPLY ? '=== LIVE RUN (writing fixes) ===' : '=== DRY RUN (no writes; pass --apply to write) ===')
  console.log(`candidate>${CANDIDATE_KM}km · agree≤${AGREE_KM}km · autofix>${AUTO_FIX_KM}km\n`)

  const listings = await fetchAllListings()
  console.log(`Fetched ${listings.length} active listings with address + coords\n`)

  const fixes = []      // auto-applied (or would-apply in dry run)
  const flagged = []    // moderate disagreement → manual review
  const unresolvable = []
  let kept = 0, investigated = 0, processed = 0

  for (const l of listings) {
    if (processed >= LIMIT) break
    processed++

    const postcode = extractPostcode(l.address)
    // Fall back to a suburb/state parsed from the address when the column is empty.
    const derived = l.suburb ? { suburb: l.suburb, state: l.state } : deriveLocalityFromAddress(l.address)
    const anchorSuburb = l.suburb || derived.suburb
    const anchorState = l.state || derived.state
    const anchor = await cachedAnchor(postcode, anchorSuburb, anchorState)

    // No anchor → can't validate cheaply; only flag, never auto-move.
    if (!anchor) { unresolvable.push({ ...pick(l), reason: 'no anchor (no postcode/suburb resolved)' }); continue }

    const storedToAnchor = haversineKm(l.lat, l.lng, anchor.lat, anchor.lng)
    if (storedToAnchor <= CANDIDATE_KM) { kept++; continue }

    // Stored pin is far from its own locality → investigate.
    investigated++
    await sleep(DELAY_MS)

    // (2) Corroboration: does the literal address back up the stored pin?
    const rawPrecise = await mapbox(`${l.address}${l.state ? `, ${l.state}` : ''}, Australia`)
    if (rawPrecise && haversineKm(rawPrecise.lat, rawPrecise.lng, l.lat, l.lng) <= AGREE_KM) {
      kept++
      continue
    }

    // (3) Anchored best estimate.
    await sleep(DELAY_MS)
    const anchored = await anchoredGeocode({ address: l.address, suburb: l.suburb, state: l.state }, { token: MAPBOX_TOKEN })
    if (!anchored || anchored.precision === 'address_unverified') {
      flagged.push({ ...pick(l), storedToAnchor: storedToAnchor.toFixed(0), reason: 'could not anchor a reliable estimate' })
      continue
    }

    const storedToAnchored = haversineKm(l.lat, l.lng, anchored.lat, anchored.lng)
    if (storedToAnchored <= AGREE_KM) { kept++; continue }

    // Only auto-move on STRONG evidence: we resolved the actual street address
    // (precision 'address'). A 'suburb'/'postcode' fallback means we only know
    // the town — not enough to overrule a precise-looking stored pin that might
    // be correct (e.g. Arkaba Station, genuinely remote, address just a road
    // name). Those, and moderate disagreements, are flagged for a human.
    const strongEvidence = anchored.precision === 'address'
    if (storedToAnchored <= AUTO_FIX_KM || !strongEvidence) {
      flagged.push({
        ...pick(l),
        storedToAnchored: storedToAnchored.toFixed(0),
        newLat: anchored.lat, newLng: anchored.lng,
        precision: anchored.precision, placeName: anchored.placeName,
        reason: !strongEvidence
          ? `weak evidence — only resolved to ${anchored.precision} (town-level)`
          : 'moderate disagreement',
      })
      continue
    }

    // Strong address evidence + gross disagreement → fix — subject to two guards.
    const region = await resolveRegionForCoords(sb, anchored.lat, anchored.lng, { state: l.state })

    // Guard 1: never auto-move a known address-content exception.
    if (REVIEW_SLUGS.has(l.slug)) {
      flagged.push({ ...pick(l), storedToAnchored: storedToAnchored.toFixed(0), newLat: anchored.lat, newLng: anchored.lng, precision: anchored.precision, placeName: anchored.placeName, reason: 'excluded — address-content issue, verify manually' })
      continue
    }
    // Guard 2: a relocation that lands in NO region is suspect — usually a vague
    // address (e.g. a 600km-long road) geocoding to the middle of nowhere. The
    // original pin is more likely correct, so flag rather than scatter it.
    if (!region) {
      flagged.push({ ...pick(l), storedToAnchored: storedToAnchored.toFixed(0), newLat: anchored.lat, newLng: anchored.lng, precision: anchored.precision, placeName: anchored.placeName, reason: 'new location resolves to no region — likely vague/wrong address' })
      continue
    }

    const rec = {
      ...pick(l),
      oldLat: l.lat, oldLng: l.lng,
      newLat: anchored.lat, newLng: anchored.lng,
      errorKm: storedToAnchored.toFixed(0),
      precision: anchored.precision,
      placeName: anchored.placeName,
      region: region ? `${region.name} (${region.source})` : 'NONE',
    }
    fixes.push(rec)

    if (APPLY) {
      const update = {
        lat: anchored.lat,
        lng: anchored.lng,
        updated_at: new Date().toISOString(),
      }
      if (region) {
        update.region = region.name
        // nearest → polygon doesn't cover the point, so the FK override carries
        // the label. computed → trigger sets region_computed_id; clear any stale
        // override so the corrected computed region wins.
        update.region_override_id = region.source === 'nearest' ? region.id : null
      }
      const { error } = await sb.from('listings').update(update).eq('id', l.id)
      if (error) { rec.writeError = error.message; console.error(`  WRITE ERROR ${l.name}: ${error.message}`) }
    }

    console.log(`  ${APPLY ? 'FIXED' : 'WOULD FIX'} ${storedToAnchored.toFixed(0)}km — ${l.name} [${l.vertical}] → ${rec.region}`)
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70))
  console.log(APPLY ? 'APPLIED' : 'DRY RUN')
  console.log('='.repeat(70))
  console.log(`Processed:        ${processed}`)
  console.log(`Kept (pin OK):    ${kept}`)
  console.log(`Investigated:     ${investigated}`)
  console.log(`Fixed:            ${fixes.length}`)
  console.log(`Flagged (review): ${flagged.length}`)
  console.log(`Unresolvable:     ${unresolvable.length}`)

  if (fixes.length) {
    console.log(`\n── Fixes (worst first) ──`)
    fixes.sort((a, b) => parseFloat(b.errorKm) - parseFloat(a.errorKm))
    for (const f of fixes) {
      console.log(`  ${f.errorKm}km  ${f.name} [${f.vertical}]  ${f.slug}`)
      console.log(`     ${f.oldLat},${f.oldLng} → ${f.newLat.toFixed(4)},${f.newLng.toFixed(4)} [${f.precision}] · ${f.region}`)
      console.log(`     addr: ${f.address}`)
    }
  }
  if (flagged.length) {
    console.log(`\n── Flagged for manual review ──`)
    flagged.sort((a, b) => parseFloat(b.storedToAnchored || b.storedToAnchor || 0) - parseFloat(a.storedToAnchored || a.storedToAnchor || 0))
    for (const f of flagged) {
      console.log(`  ${f.name} [${f.vertical}] — ${f.reason}${f.storedToAnchored ? ` (${f.storedToAnchored}km off)` : ''}  ${f.slug}`)
      if (f.placeName) console.log(`     suggested: ${f.newLat?.toFixed(4)},${f.newLng?.toFixed(4)} (${f.placeName})`)
    }
  }
  if (unresolvable.length) {
    console.log(`\n── Unresolvable (no anchor) ── ${unresolvable.length} listings`)
    for (const f of unresolvable.slice(0, 30)) console.log(`  ${f.name} [${f.vertical}] — ${f.address}`)
    if (unresolvable.length > 30) console.log(`  … and ${unresolvable.length - 30} more`)
  }

  console.log(APPLY ? '\nDone — fixes written.' : '\nDone — dry run, no writes. Re-run with --apply to write.')
}

function pick(l) {
  return { id: l.id, name: l.name, slug: l.slug, vertical: l.vertical, address: l.address, suburb: l.suburb, state: l.state }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1) })
