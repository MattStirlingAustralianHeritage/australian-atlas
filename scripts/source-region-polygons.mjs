#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// source-region-polygons.mjs
//
// Source MultiPolygon boundaries for regions where polygon IS NULL.
// Primary source: Nominatim (OSM-backed). Strict filter — only accepts
// admin-boundary relations OR place=city/town/suburb relations with valid
// Polygon/MultiPolygon geometry.
//
// Usage:
//   node scripts/source-region-polygons.mjs           # dry-run, prints plan
//   node scripts/source-region-polygons.mjs --apply   # applies writes
//
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// Rate limits Nominatim to 1 request per 2 seconds per the usage policy.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const APPLY = process.argv.includes('--apply')

const envText = readFileSync('.env.local', 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const UA = 'AustralianAtlas/1.0 polygon-sourcing (matt@australianatlas.com.au)'
const SLEEP_MS = 2000
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Per-region query strategies. For cities, featuretype=city hits the OSM
// place=city relation (often matches Greater-scale boundaries). For LGAs
// and editorial regions, the direct "<Proper Name>, <State>" query works.
// Known semantically-mismatched regions (composite tourism areas like
// "Darwin & Top End" or "Hobart & Southern Tasmania") are listed in
// MANUAL_HAND_DRAW — script skips them and logs for human review.
const STRATEGIES = {
  'Adelaide':           [{ q: 'Adelaide, South Australia, Australia', featuretype: 'city' }],
  'Adelaide Hills':     [{ q: 'Adelaide Hills Council, South Australia' }],
  'Brisbane':           [{ q: 'City of Brisbane, Queensland' }],
  'Byron Bay':          [{ q: 'Byron Shire, New South Wales' }],
  'Canberra District':  [{ q: 'Australian Capital Territory, Australia' }],
  'Hobart City':        [{ q: 'City of Hobart, Tasmania' }],
  'Melbourne':          [{ q: 'Greater Melbourne, Victoria' }, { q: 'Melbourne, Victoria, Australia', featuretype: 'city' }],
  'Perth':              [{ q: 'City of Perth, Western Australia' }],
  'Sydney':             [{ q: 'Sydney, New South Wales, Australia', featuretype: 'city' }],
}

const MANUAL_HAND_DRAW = new Set([
  'Darwin & Top End',           // OSM has Darwin LGA, not "Top End" tourism region
  'Hobart & Southern Tasmania', // OSM has Hobart, not "Southern Tasmania" tourism region
])

async function nominatim({ q, featuretype }) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'json')
  url.searchParams.set('polygon_geojson', '1')
  url.searchParams.set('limit', '5')
  url.searchParams.set('countrycodes', 'au')
  if (featuretype) url.searchParams.set('featuretype', featuretype)
  const res = await fetch(url.toString(), { headers: { 'User-Agent': UA } })
  return res.ok ? await res.json() : []
}

function isAdminOrPlace(hit) {
  if (!hit.geojson) return false
  if (hit.geojson.type !== 'Polygon' && hit.geojson.type !== 'MultiPolygon') return false
  if (hit.osm_type !== 'relation') return false
  if (hit.class === 'boundary' && hit.type === 'administrative') return true
  if (hit.class === 'place' && ['city', 'town', 'suburb'].includes(hit.type)) return true
  return false
}

function toMultiPolygon(g) {
  if (g.type === 'MultiPolygon') return g
  if (g.type === 'Polygon') return { type: 'MultiPolygon', coordinates: [g.coordinates] }
  throw new Error(`unsupported geometry type: ${g.type}`)
}

const { data: targets, error } = await sb
  .from('regions')
  .select('id, name, slug, state')
  .eq('status', 'live')
  .is('polygon', null)
  .order('name')

if (error) { console.error('ERR fetching regions:', error.message); process.exit(1) }

if (!targets?.length) {
  console.log('No live regions without polygons. Nothing to do.')
  process.exit(0)
}

console.log(`${targets.length} live regions missing polygons. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

const report = { applied: [], skipped_manual: [], no_match: [], errors: [] }

for (const r of targets) {
  if (MANUAL_HAND_DRAW.has(r.name)) {
    console.log(`[skip manual] ${r.name} (${r.state}) — composite tourism region, OSM has no matching relation`)
    report.skipped_manual.push({ slug: r.slug, name: r.name, state: r.state })
    continue
  }

  const strategies = STRATEGIES[r.name] || [{ q: `${r.name}, ${r.state}, Australia` }]
  let matched = null
  for (const s of strategies) {
    await sleep(SLEEP_MS)
    const hits = await nominatim(s)
    const clean = hits.filter(isAdminOrPlace)
    if (clean.length > 0) {
      matched = { strategy: s.q, hit: clean[0] }
      break
    }
  }

  if (!matched) {
    console.log(`[no match] ${r.name} (${r.state})`)
    report.no_match.push({ slug: r.slug, name: r.name, state: r.state })
    continue
  }

  const { hit } = matched
  const source = `nominatim osm_relation:${hit.osm_id} (${hit.class}=${hit.type})`
  console.log(`[match] ${r.name} → ${source}`)

  if (APPLY) {
    try {
      const mp = toMultiPolygon(hit.geojson)
      const { error: updErr } = await sb.from('regions').update({ polygon: mp }).eq('id', r.id)
      if (updErr) {
        console.log(`  write ERROR: ${updErr.message}`)
        report.errors.push({ slug: r.slug, name: r.name, error: updErr.message })
      } else {
        report.applied.push({ slug: r.slug, name: r.name, source })
      }
    } catch (e) {
      report.errors.push({ slug: r.slug, name: r.name, error: e.message })
    }
  } else {
    report.applied.push({ slug: r.slug, name: r.name, source, dry_run: true })
  }
}

console.log('\n─── SUMMARY ───')
console.log(`${APPLY ? 'Applied' : 'Would apply'}: ${report.applied.length}`)
console.log(`Skipped (manual hand-draw): ${report.skipped_manual.length}`)
console.log(`No match found: ${report.no_match.length}`)
console.log(`Errors: ${report.errors.length}`)
if (report.errors.length) console.log(JSON.stringify(report.errors, null, 2))
