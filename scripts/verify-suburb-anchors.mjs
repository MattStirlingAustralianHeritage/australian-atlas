#!/usr/bin/env node
/**
 * Verify every metro-suburb anchor coordinate against Mapbox, two ways.
 *
 * Hand-typed suburb coordinates are the weakest link in a pack file: a
 * transposed digit silently moves a whole bbox, and same-named suburbs across
 * states (Kingston TAS vs Kingston ACT, Manly NSW vs Manly QLD, Newtown VIC vs
 * Newtown NSW) are a real trap. So each anchor gets checked twice:
 *
 *   FORWARD — geocode the bare suburb name (proximity-biased to the anchor,
 *   never ", STATE, Australia" appended: that fuzzy-matches, per the
 *   localityCentroid comment in lib/geo/anchoredGeocode.js). Confirms the named
 *   suburb really sits where the pack says.
 *
 *   REVERSE — look up what Mapbox thinks is AT the coordinate. Confirms the
 *   state, independently of the name.
 *
 * Reports drift and never edits the pack file. Read-only.
 *
 *   node --env-file=.env.local scripts/verify-suburb-anchors.mjs
 */
import { SUBURB_PACKS } from './metro-suburb-packs.js'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
if (!TOKEN) { console.error('Missing NEXT_PUBLIC_MAPBOX_TOKEN'); process.exit(1) }

const TOLERANCE_KM = 6   // suburb centroids legitimately differ by a few km

const STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', SA: 'South Australia',
  WA: 'Western Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory',
  NT: 'Northern Territory',
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

async function mb(path, params) {
  const qs = new URLSearchParams({ access_token: TOKEN, country: 'au', ...params })
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(path)}.json?${qs}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Mapbox ${res.status}`)
  return res.json()
}

const issues = []
const ok = []

for (const [slug, pack] of Object.entries(SUBURB_PACKS)) {
  const stateFull = STATE_NAMES[pack.state]
  for (const a of pack.anchors) {
    let forwardNote = '', reverseNote = '', status = 'OK'

    // ── FORWARD: bare name, proximity-biased ──
    try {
      const j = await mb(a.name, {
        types: 'locality,place,neighborhood',
        proximity: `${a.lng},${a.lat}`,
        limit: '5',
      })
      let inState = (j.features || []).filter(f => (f.place_name || '').includes(stateFull))
      // Prefer an EXACT name match before the proximity-ranked first result:
      // "Currumbin" otherwise scores behind "Currumbin Valley" (12km inland)
      // and reads as drift when the anchor is in fact correct.
      const exact = inState.filter(f => (f.text || '').toLowerCase() === a.name.toLowerCase())
      if (exact.length) inState = exact
      if (!inState.length) {
        status = 'FAIL'
        const got = (j.features || []).slice(0, 2).map(f => f.place_name).join(' | ') || 'no results'
        forwardNote = `no "${a.name}" in ${stateFull}; got: ${got}`
      } else {
        const [flng, flat] = inState[0].center
        const d = haversineKm(a.lat, a.lng, flat, flng)
        if (d > TOLERANCE_KM) {
          status = 'DRIFT'
          forwardNote = `${d.toFixed(1)}km from geocoded "${inState[0].place_name.split(',').slice(0, 2).join(',')}" → suggest ${flat.toFixed(4)}, ${flng.toFixed(4)}`
        } else {
          forwardNote = `${d.toFixed(1)}km`
        }
      }
    } catch (err) { status = 'ERR'; forwardNote = err.message }

    await new Promise(r => setTimeout(r, 120))

    // ── REVERSE: what is at this coordinate? ──
    try {
      // Mapbox v5 reverse geocoding accepts exactly ONE type per request
      // (multiple types → 422), so ask for the enclosing "place" and read the
      // state out of its place_name / context.
      const j = await mb(`${a.lng},${a.lat}`, { types: 'place', limit: '1' })
      const names = (j.features || []).map(f => f.place_name)
      const stateHit = names.some(n => n.includes(stateFull))
      const here = names[0]?.split(',').slice(0, 2).join(',') || 'unknown'
      if (!stateHit) {
        status = status === 'OK' ? 'FAIL' : status
        reverseNote = `coordinate is NOT in ${stateFull} — reverse says: ${here}`
      } else {
        reverseNote = here
      }
    } catch (err) { if (status === 'OK') status = 'ERR'; reverseNote = err.message }

    const line = `${status.padEnd(6)} ${(pack.state + ' ' + a.name).padEnd(30)} fwd:${forwardNote.padEnd(46)} rev:${reverseNote}`
    if (status === 'OK') { ok.push(line) } else { issues.push(line); console.log(line) }

    await new Promise(r => setTimeout(r, 120))
  }
}

const total = ok.length + issues.length
console.log(`\n=== ${total} anchors checked ===`)
console.log(`  OK:     ${ok.length}`)
console.log(`  Issues: ${issues.length}`)
if (issues.length) {
  console.log('\nAnchors needing attention:\n')
  for (const i of issues) console.log('  ' + i)
} else {
  console.log('\nEvery anchor resolves to its named suburb in its named state.')
}
