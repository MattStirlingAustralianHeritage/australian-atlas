#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// activate-regions-batch-2026-04-25.mjs
//
// Batch activation of 39 regions per the 2026-04-25 polygon-based candidate
// analysis. Each region is either UPDATEd (existing draft) or INSERTed (new
// row), both with polygon populated and status='live'.
//
// Polygon sources: ABS Tourism Regions 2021 where clean, OSM LGA aggregate
// otherwise. Retry policy: 3-attempt exponential backoff (2s, 5s, 15s) with
// variant-name fallback for Nominatim queries. Halt threshold: 6 failures.
//
// Usage:
//   node scripts/activate-regions-batch-2026-04-25.mjs          # dry-run
//   node scripts/activate-regions-batch-2026-04-25.mjs --apply  # writes to DB
//
// Rollback:
//   UPDATE regions SET polygon = NULL, status = 'draft' WHERE slug = '<slug>';
//   DELETE FROM regions WHERE slug = '<slug>';  -- for INSERT rows
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

const APPLY = process.argv.includes('--apply')
const HALT_THRESHOLD = 6

const envText = readFileSync('.env.local', 'utf-8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const UA = 'AustralianAtlas/1.0 region-batch-activation (matt@australianatlas.com.au)'
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const ABS_TR = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/TR/MapServer/0/query'
const RATE_MS = 2000
const BACKOFFS = [2000, 5000, 15000]
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Candidate config (39 regions) ───────────────────────────────────────────
// Format:
//   abs_tr: { tr_code }                          — single ABS TR
//   osm_lga: { lgas: [[variant1, variant2,…], …] } — each LGA with variant fallback, aggregated
const CANDIDATES = [
  // UPDATE-to-live (existing drafts — 30)
  { slug: 'launceston-tamar-valley', name: 'Launceston & Tamar Valley', state: 'TAS', source: { abs_tr: '6R110' } },
  { slug: 'cairns-tropical-north', name: 'Cairns & Tropical North', state: 'QLD', source: { abs_tr: '3R120' } },
  { slug: 'margaret-river', name: 'Margaret River', state: 'WA', source: { osm_lga: { lgas: [['Shire of Augusta-Margaret River, Western Australia', 'Augusta-Margaret River Shire, Western Australia'], ['City of Busselton, Western Australia', 'Shire of Busselton, Western Australia']] } } },
  { slug: 'sunshine-coast-hinterland', name: 'Sunshine Coast Hinterland', state: 'QLD', source: { osm_lga: { lgas: [['Sunshine Coast, Queensland', 'Sunshine Coast Region, Queensland']] } } },
  { slug: 'toowoomba-darling-downs', name: 'Toowoomba & Darling Downs', state: 'QLD', source: { abs_tr: '3R060' } },
  { slug: 'newcastle', name: 'Newcastle', state: 'NSW', source: { osm_lga: { lgas: [['City of Newcastle, New South Wales'], ['City of Lake Macquarie, New South Wales', 'Lake Macquarie, New South Wales'], ['Port Stephens Council, New South Wales', 'Port Stephens, New South Wales']] } } },
  { slug: 'barossa-valley', name: 'Barossa Valley', state: 'SA', source: { abs_tr: '4R050' } },
  { slug: 'gippsland', name: 'Gippsland', state: 'VIC', source: { abs_tr: '2R120' } },
  { slug: 'wollongong', name: 'Wollongong', state: 'NSW', source: { osm_lga: { lgas: [['Wollongong City Council, New South Wales', 'City of Wollongong, New South Wales'], ['Shellharbour City Council, New South Wales', 'City of Shellharbour, New South Wales']] } } },
  { slug: 'great-southern', name: 'Great Southern', state: 'WA', source: { osm_lga: { lgas: [['City of Albany, Western Australia'], ['Shire of Plantagenet, Western Australia'], ['Shire of Denmark, Western Australia'], ['Shire of Cranbrook, Western Australia']] } } },
  { slug: 'bellarine-peninsula', name: 'Bellarine Peninsula', state: 'VIC', source: { abs_tr: '2R140' } },
  { slug: 'cradle-country', name: 'Cradle Country', state: 'TAS', source: { abs_tr: '6R060' } },
  { slug: 'daylesford', name: 'Daylesford & Hepburn Springs', state: 'VIC', source: { abs_tr: '2R160' } },
  { slug: 'geelong-city', name: 'Geelong', state: 'VIC', source: { osm_lga: { lgas: [['City of Greater Geelong, Victoria']] } } },
  { slug: 'mclaren-vale', name: 'McLaren Vale', state: 'SA', source: { abs_tr: '4R030' } },
  { slug: 'great-ocean-road', name: 'Great Ocean Road', state: 'VIC', source: { abs_tr: '2R040' } },
  { slug: 'limestone-coast', name: 'Limestone Coast', state: 'SA', source: { abs_tr: '4R010' } },
  { slug: 'macedon-ranges', name: 'Macedon Ranges', state: 'VIC', source: { abs_tr: '2R150' } },
  { slug: 'scenic-rim', name: 'Scenic Rim', state: 'QLD', source: { osm_lga: { lgas: [['Scenic Rim, Queensland', 'Scenic Rim Region, Queensland']] } } },
  { slug: 'northern-rivers', name: 'Northern Rivers', state: 'NSW', source: { osm_lga: { lgas: [['Tweed Shire Council, New South Wales'], ['Ballina Shire Council, New South Wales'], ['Lismore City Council, New South Wales'], ['Richmond Valley Council, New South Wales'], ['Kyogle Council, New South Wales']] } } },
  { slug: 'clare-valley', name: 'Clare Valley', state: 'SA', source: { abs_tr: '4R080' } },
  { slug: 'south-coast-nsw', name: 'South Coast NSW', state: 'NSW', source: { osm_lga: { lgas: [['Municipality of Kiama, New South Wales', 'Kiama Municipality, New South Wales'], ['Shoalhaven City Council, New South Wales', 'City of Shoalhaven, New South Wales']] } } },
  { slug: 'southern-highlands', name: 'Southern Highlands', state: 'NSW', source: { osm_lga: { lgas: [['Wingecarribee Shire Council, New South Wales', 'Wingecarribee Shire, New South Wales']] } } },
  { slug: 'central-coast', name: 'Central Coast', state: 'NSW', source: { osm_lga: { lgas: [['Central Coast Council, New South Wales']] } } },
  { slug: 'mornington-peninsula', name: 'Mornington Peninsula', state: 'VIC', source: { abs_tr: '2R070' } },
  { slug: 'yarra-valley', name: 'Yarra Valley', state: 'VIC', source: { abs_tr: '2R220' } },
  { slug: 'blue-mountains', name: 'Blue Mountains', state: 'NSW', source: { osm_lga: { lgas: [['Blue Mountains City Council, New South Wales', 'City of Blue Mountains, New South Wales']] } } },
  { slug: 'kangaroo-island', name: 'Kangaroo Island', state: 'SA', source: { abs_tr: '4R130' } },
  { slug: 'grampians', name: 'Grampians', state: 'VIC', source: { osm_lga: { lgas: [['Northern Grampians Shire, Victoria', 'Shire of Northern Grampians, Victoria'], ['Southern Grampians Shire, Victoria', 'Shire of Southern Grampians, Victoria'], ['Rural City of Ararat, Victoria', 'Ararat Rural City, Victoria']] } } },
  { slug: 'alice-springs-red-centre', name: 'Alice Springs & Red Centre', state: 'NT', source: { osm_lga: { lgas: [['Alice Springs, Northern Territory'], ['MacDonnell, Northern Territory', 'MacDonnell Regional Council, Northern Territory'], ['Petermann, Northern Territory']] } } },

  // INSERT-new (9)
  { slug: 'sunshine-coast', name: 'Sunshine Coast', state: 'QLD', source: { abs_tr: '3R030' } },
  { slug: 'bendigo', name: 'Bendigo', state: 'VIC', source: { abs_tr: '2R060' } },
  { slug: 'ballarat', name: 'Ballarat & Goldfields', state: 'VIC', source: { abs_tr: '2R170' } },
  { slug: 'victorian-high-country', name: 'Victorian High Country', state: 'VIC', source: { abs_tr: '2R100' } },
  { slug: 'coffs-coast', name: 'Coffs Coast', state: 'NSW', source: { osm_lga: { lgas: [['Coffs Harbour City Council, New South Wales', 'City of Coffs Harbour, New South Wales'], ['Bellingen Shire Council, New South Wales', 'Bellingen Shire, New South Wales']] } } },
  { slug: 'port-macquarie', name: 'Port Macquarie & Hastings', state: 'NSW', source: { osm_lga: { lgas: [['Port Macquarie-Hastings Council, New South Wales']] } } },
  { slug: 'canberra-wine', name: 'Canberra Wine District', state: 'NSW', source: { osm_lga: { lgas: [['Yass Valley Council, New South Wales', 'Yass Valley, New South Wales']] } } },
  { slug: 'townsville', name: 'Townsville', state: 'QLD', source: { abs_tr: '3R110' } },
  { slug: 'granite-belt', name: 'Granite Belt', state: 'QLD', source: { osm_lga: { lgas: [['Southern Downs, Queensland', 'Southern Downs Region, Queensland']] } } },
]

// ── Resilient fetchers ──────────────────────────────────────────────────────
async function resilientNominatim(q) {
  let lastErr
  for (let attempt = 0; attempt < BACKOFFS.length; attempt++) {
    try {
      await sleep(RATE_MS)
      const url = new URL(NOMINATIM)
      url.searchParams.set('q', q); url.searchParams.set('format', 'json')
      url.searchParams.set('polygon_geojson', '1'); url.searchParams.set('limit', '5')
      url.searchParams.set('countrycodes', 'au')
      const r = await fetch(url.toString(), { headers: { 'User-Agent': UA } })
      if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`)
      return await r.json()
    } catch (e) {
      lastErr = e
      if (attempt < BACKOFFS.length - 1) await sleep(BACKOFFS[attempt])
    }
  }
  throw lastErr
}

async function resilientAbsTr(code) {
  let lastErr
  for (let attempt = 0; attempt < BACKOFFS.length; attempt++) {
    try {
      const url = new URL(ABS_TR)
      url.searchParams.set('where', `tr_code_2021='${code}'`)
      url.searchParams.set('outFields', 'tr_code_2021,tr_name_2021')
      url.searchParams.set('returnGeometry', 'true')
      url.searchParams.set('outSR', '4326')
      url.searchParams.set('f', 'geojson')
      const r = await fetch(url.toString())
      if (!r.ok) throw new Error(`ABS HTTP ${r.status}`)
      const d = await r.json()
      if (!d.features?.length) throw new Error(`ABS TR ${code} empty`)
      return d.features[0].geometry
    } catch (e) {
      lastErr = e
      if (attempt < BACKOFFS.length - 1) await sleep(BACKOFFS[attempt])
    }
  }
  throw lastErr
}

async function fetchOsmLgaWithVariants(variants) {
  for (const q of variants) {
    try {
      const hits = await resilientNominatim(q)
      const clean = hits.filter(h =>
        h.osm_type === 'relation' && h.geojson &&
        (h.geojson.type === 'Polygon' || h.geojson.type === 'MultiPolygon') &&
        h.class === 'boundary' && h.type === 'administrative')
      if (clean.length) return { query_used: q, osm_id: clean[0].osm_id, geom: clean[0].geojson }
    } catch { /* try next */ }
  }
  return null
}

// ── Geometry utilities ──────────────────────────────────────────────────────
function toMP(g) {
  if (g.type === 'MultiPolygon') return g
  if (g.type === 'Polygon') return { type: 'MultiPolygon', coordinates: [g.coordinates] }
  throw new Error(`bad geom: ${g.type}`)
}
function combineMP(geoms) {
  const out = { type: 'MultiPolygon', coordinates: [] }
  for (const g of geoms) out.coordinates.push(...toMP(g).coordinates)
  return out
}
function hashGeom(g) { return createHash('sha256').update(JSON.stringify(g)).digest('hex').slice(0, 16) }
function bbox(mp) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const poly of mp.coordinates) for (const ring of poly) for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  return { minX: +minX.toFixed(4), minY: +minY.toFixed(4), maxX: +maxX.toFixed(4), maxY: +maxY.toFixed(4) }
}
function validate(mp) {
  const issues = []
  if (mp.type !== 'MultiPolygon') { issues.push(`type=${mp.type}`); return issues }
  mp.coordinates.forEach((poly, pi) => {
    poly.forEach((ring, ri) => {
      if (ring.length < 4) issues.push(`poly[${pi}].ring[${ri}] ${ring.length}pts<4`)
      const [x0, y0] = ring[0], [xL, yL] = ring[ring.length - 1]
      if (x0 !== xL || y0 !== yL) issues.push(`poly[${pi}].ring[${ri}] unclosed`)
    })
  })
  return issues
}
function pipRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
function pip(x, y, mp) {
  for (const poly of mp.coordinates) {
    if (!pipRing(x, y, poly[0])) continue
    let inHole = false
    for (let i = 1; i < poly.length; i++) { if (pipRing(x, y, poly[i])) { inHole = true; break } }
    if (!inHole) return true
  }
  return false
}

// ── CSV load for sample verification ────────────────────────────────────────
function parseCsv(text) {
  const rows = [], lines = text.split('\n')
  const header = splitCsvRow(lines[0])
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]; if (!line.trim()) continue
    const cols = splitCsvRow(line)
    const row = {}; for (let j = 0; j < header.length; j++) row[header[j]] = cols[j]
    rows.push(row)
  }
  return rows
}
function splitCsvRow(line) {
  const out = []; let cur = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (inQuote && line[i + 1] === '"') { cur += '"'; i++ } else inQuote = !inQuote }
    else if (c === ',' && !inQuote) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur); return out
}
const CSV_ROWS = parseCsv(readFileSync('docs/audits/2026-04-25-phase2-backfill-dryrun-changes.csv', 'utf-8'))
console.log(`CSV loaded: ${CSV_ROWS.length} dry-run listings\n`)

// ── Fetch existing region rows ──────────────────────────────────────────────
const { data: existingRows } = await sb.from('regions').select('id, slug, name, state, status')
  .in('slug', CANDIDATES.map(c => c.slug)).order('slug')
const existing = Object.fromEntries((existingRows || []).map(r => [r.slug, r]))

// ── Main loop ───────────────────────────────────────────────────────────────
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)
const results = []
let failCount = 0

for (const c of CANDIDATES) {
  console.log(`── ${c.slug} (${c.state}) ──`)
  const row = existing[c.slug]
  const path = row ? 'UPDATE' : 'INSERT'

  // ── Fetch polygon ────────────────────────────────────────────────────────
  let polygon = null, sourceDesc = '', sourceIds = [], failReason = null
  try {
    if (c.source.abs_tr) {
      const g = await resilientAbsTr(c.source.abs_tr)
      polygon = toMP(g)
      sourceDesc = `ABS TR ${c.source.abs_tr}`
      sourceIds = [c.source.abs_tr]
    } else {
      const parts = []
      for (const variants of c.source.osm_lga.lgas) {
        const r = await fetchOsmLgaWithVariants(variants)
        if (!r) { failReason = `OSM LGA unresolved: ${variants[0]}`; throw new Error(failReason) }
        parts.push(r)
      }
      polygon = combineMP(parts.map(p => p.geom))
      sourceDesc = `OSM LGAs: ${parts.map(p => `rel ${p.osm_id}`).join(' + ')}`
      sourceIds = parts.map(p => p.osm_id)
    }
  } catch (e) {
    console.log(`  ✗ polygon fetch failed: ${e.message}`)
    results.push({ slug: c.slug, path, status: 'fail-fetch', reason: e.message })
    failCount++
    if (failCount >= HALT_THRESHOLD) { console.log(`\n⚠ halt threshold ${HALT_THRESHOLD} reached — stopping batch`); break }
    continue
  }

  // ── Validate ────────────────────────────────────────────────────────────
  const issues = validate(polygon)
  if (issues.length) {
    console.log(`  ✗ validity issues: ${issues.slice(0, 3).join('; ')}`)
    results.push({ slug: c.slug, path, status: 'fail-validity', reason: issues.join('; ') })
    failCount++
    if (failCount >= HALT_THRESHOLD) break
    continue
  }

  const h = hashGeom(polygon)
  const b = bbox(polygon)
  console.log(`  polygon: ${polygon.coordinates.length} rings, bbox=[${b.minX},${b.minY}]→[${b.maxX},${b.maxY}], hash=${h}`)

  // ── Apply ───────────────────────────────────────────────────────────────
  if (APPLY) {
    try {
      if (path === 'UPDATE') {
        const { error } = await sb.from('regions').update({
          status: 'live', polygon, updated_at: new Date().toISOString()
        }).eq('slug', c.slug)
        if (error) throw error
      } else {
        const { error } = await sb.from('regions').insert({
          name: c.name, slug: c.slug, state: c.state, status: 'live', polygon,
          min_listing_threshold: 15,
        })
        if (error) throw error
      }
      console.log(`  ✓ ${path} applied`)
    } catch (e) {
      console.log(`  ✗ DB apply failed: ${e.message}`)
      results.push({ slug: c.slug, path, status: 'fail-apply', reason: e.message, polygon_hash: h, source: sourceDesc })
      failCount++
      if (failCount >= HALT_THRESHOLD) break
      continue
    }
  }

  // ── Sample verification (client-side PIP against CSV) ───────────────────
  const candidatesInBbox = CSV_ROWS.filter(r => {
    const la = +r.lat, ln = +r.lng
    return la >= b.minY && la <= b.maxY && ln >= b.minX && ln <= b.maxX
  })
  const sampleSize = Math.min(5, candidatesInBbox.length)
  const picks = []
  for (let i = 0; i < sampleSize; i++) {
    picks.push(candidatesInBbox[Math.floor(Math.random() * candidatesInBbox.length)])
  }
  let sampleHits = 0
  for (const p of picks) if (pip(+p.lng, +p.lat, polygon)) sampleHits++
  console.log(`  sample verify: ${sampleHits}/${sampleSize} inside polygon`)

  results.push({
    slug: c.slug, name: c.name, state: c.state, path, status: 'ok',
    polygon_hash: h, polygon_rings: polygon.coordinates.length,
    bbox: b, source: sourceDesc, source_ids: sourceIds,
    sample_hits: `${sampleHits}/${sampleSize}`,
  })
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n── Summary ──`)
const ok = results.filter(r => r.status === 'ok')
const failed = results.filter(r => r.status !== 'ok')
console.log(`  Success: ${ok.length} / ${CANDIDATES.length}`)
console.log(`  Failed: ${failed.length}`)
for (const f of failed) console.log(`    ${f.slug}: ${f.status} — ${f.reason}`)

if (APPLY && ok.length) {
  // ── Emit VERIFY.sql ──
  const slugs = ok.map(r => `'${r.slug}'`).join(', ')
  const verify = `-- Run in Supabase SQL editor to validate the ${ok.length} polygons.
-- Expected: all rows return is_valid=true, polygon_type='ST_MultiPolygon'.

SELECT slug, status, ST_IsValid(polygon) AS is_valid,
       ST_IsValidReason(polygon) AS invalidity_reason,
       GeometryType(polygon) AS polygon_type,
       ST_NumGeometries(polygon) AS component_polygons,
       ROUND((ST_Area(polygon::geography) / 1e6)::numeric, 1) AS area_km2
FROM regions
WHERE slug IN (${slugs})
ORDER BY slug;
`
  writeFileSync('tmp-verify-batch-activation.sql', verify)
  console.log(`\nVerification SQL: tmp-verify-batch-activation.sql (${ok.length} slugs)`)
}

writeFileSync('tmp-batch-results.json', JSON.stringify(results, null, 2))
console.log(`\nResults JSON: tmp-batch-results.json`)
