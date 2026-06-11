#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// add-gap-regions-2026-06-11.mjs
//
// Seed 15 NEW regions that fill significant gaps in Atlas's coverage. Each maps
// 1:1 to an official ABS Tourism Region (ASGS 2021), so its spatial polygon can
// be sourced from a real boundary in the companion script — never hand-drawn
// (project provenance discipline: no fabricated geography).
//
// Gap selection: the live regions table was compared against the full ABS
// Tourism Regions 2021 list (76 regions). These 15 are the well-known
// Australian tourism regions that had NO row at all. Existing NULL-polygon
// stubs (eyre-peninsula, whitsundays, etc.) are deliberately left untouched.
//
// Companion: source-gap-region-polygons.mjs — sources each region's polygon
//   from ABS Tourism Regions, sanity-gates it, writes it, runs a NULL-only
//   re-backfill, then flips status 'draft' → 'live' for regions that adopt a
//   meaningful number of listings.
//
// Rows are created status='draft' (the regions table default). Editorial fields
// (generated_intro / long_description) are deliberately NOT set — no verified
// listings to ground them on yet (no-hallucination rule).
//
// Usage:
//   node scripts/add-gap-regions-2026-06-11.mjs --dry-run   # print rows, no write
//   node scripts/add-gap-regions-2026-06-11.mjs             # upsert (idempotent on slug)
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const DRY_RUN = process.argv.includes('--dry-run')

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)

const MAPBOX_TOKEN = env.NEXT_PUBLIC_MAPBOX_TOKEN
const MAPBOX_STYLE = 'mapbox/light-v11'
const staticUrl = (lng, lat, zoom, w, h) =>
  `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${lng},${lat},${zoom},0/${w}x${h}@2x?access_token=${MAPBOX_TOKEN}`

// name, slug, state, abs_tr (for the polygon companion), center [lat,lng], zoom, description.
// Descriptions are geographic/cultural facts in the established region voice — no
// venue-specific claims.
const REGIONS = [
  { name: 'Snowy Mountains', slug: 'snowy-mountains', state: 'NSW', abs_tr: '1R050',
    lat: -36.42, lng: 148.62, zoom: 8,
    description: "Australia's alpine heart, in the Kosciuszko high country — the ski towns of Thredbo and Jindabyne, mountain huts, trout streams, and summer trails to the country's highest peaks." },
  { name: 'Riverina', slug: 'riverina', state: 'NSW', abs_tr: '1R080',
    lat: -34.9, lng: 146.6, zoom: 7,
    description: 'A fertile inland region around Wagga Wagga and Griffith, shaped by irrigation and Italian migration — wineries, citrus and rice country, and a strong regional food culture.' },
  { name: 'New England North West', slug: 'new-england', state: 'NSW', abs_tr: '1R140',
    lat: -30.5, lng: 151.5, zoom: 7,
    description: 'A high tableland region from Tamworth to Tenterfield, with heritage towns, cool-climate gardens, antique trails, and the granite country of the northern ranges.' },
  { name: 'Outback NSW', slug: 'outback-nsw', state: 'NSW', abs_tr: '1R150',
    lat: -31.95, lng: 141.47, zoom: 6,
    description: 'The far west around Broken Hill — a mining town turned arts capital, with desert galleries, historic pubs, and the silver heritage of the Barrier Ranges.' },
  { name: 'Fleurieu Peninsula', slug: 'fleurieu-peninsula', state: 'SA', abs_tr: '4R030',
    lat: -35.45, lng: 138.55, zoom: 9,
    description: 'A coastal peninsula south of Adelaide, from Victor Harbor to Goolwa and the Murray Mouth — surf beaches, whale watching, farm gates, and cellar doors beyond McLaren Vale.' },
  { name: 'Yorke Peninsula', slug: 'yorke-peninsula', state: 'SA', abs_tr: '4R120',
    lat: -34.6, lng: 137.6, zoom: 8,
    description: "A boot-shaped peninsula of wheat country and coastline, with Cornish mining heritage in the 'Copper Triangle', quiet fishing towns, and long uncrowded beaches." },
  { name: 'Murray River, Lakes & Coorong', slug: 'murray-river-lakes-coorong', state: 'SA', abs_tr: '4R020',
    lat: -35.4, lng: 139.3, zoom: 8,
    description: "South Australia's lower Murray — river towns, the lakes around Murray Bridge, and the Coorong's wetlands and dunes stretching along the Southern Ocean." },
  { name: "Australia's Coral Coast", slug: 'coral-coast', state: 'WA', abs_tr: '5R170',
    lat: -27.5, lng: 114.6, zoom: 6,
    description: "Western Australia's mid-west coast, from Cervantes and Geraldton to Shark Bay, Kalbarri and the Ningaloo Reef — wildflower country, pink lakes, and whale-shark waters." },
  { name: "Australia's Golden Outback", slug: 'golden-outback', state: 'WA', abs_tr: '5R130',
    lat: -31.5, lng: 122.0, zoom: 5,
    description: "WA's vast interior and south-east coast — the goldfields around Kalgoorlie, Wave Rock and the wheatbelt, and the white beaches of Esperance and the Recherche coast." },
  { name: 'Bundaberg', slug: 'bundaberg', state: 'QLD', abs_tr: '3R070',
    lat: -24.87, lng: 152.35, zoom: 8,
    description: 'A coastal Queensland region known for rum, sugar cane, and the turtle beaches of Mon Repos — gateway to the southern Great Barrier Reef at Lady Elliot and Lady Musgrave.' },
  { name: 'Capricorn Coast', slug: 'capricorn', state: 'QLD', abs_tr: '3R170',
    lat: -23.2, lng: 150.6, zoom: 7,
    description: 'Central Queensland on the Tropic of Capricorn — the beef city of Rockhampton, the seaside towns around Yeppoon, and the reef islands of the Keppels and the Capricornia Cays.' },
  { name: 'Fraser Coast', slug: 'fraser-coast', state: 'QLD', abs_tr: '3R040',
    lat: -25.4, lng: 152.7, zoom: 7,
    description: "The gateway to K'gari (Fraser Island), the world's largest sand island — Hervey Bay's winter whales, the heritage streets of Maryborough, and quiet Coral Sea beaches." },
  { name: 'Phillip Island', slug: 'phillip-island', state: 'VIC', abs_tr: '2R210',
    lat: -38.48, lng: 145.23, zoom: 10,
    description: 'A compact island off the Gippsland coast, famous for its nightly penguin parade, surf beaches, the Grand Prix circuit, and the seal colony at the Nobbies.' },
  { name: 'Goulburn Valley', slug: 'goulburn-valley', state: 'VIC', abs_tr: '2R090',
    lat: -36.4, lng: 145.4, zoom: 8,
    description: "Central Victoria's fruit bowl along the Goulburn River — orchards and food producers around Shepparton, the wineries of Nagambie Lakes, and historic river towns." },
  { name: 'Mildura & the Mallee', slug: 'mildura-mallee', state: 'VIC', abs_tr: '2R030',
    lat: -34.3, lng: 142.2, zoom: 7,
    description: "Victoria's sun-soaked north-west on the Murray — Mildura's river culture and dryland wineries, Wentworth's river junction, and the dunes and lakes of Mungo and the Mallee." },
]

function toRow(r) {
  return {
    name: r.name,
    slug: r.slug,
    state: r.state,
    description: r.description,
    center_lat: r.lat,
    center_lng: r.lng,
    map_zoom: r.zoom,
    hero_image_url: staticUrl(r.lng, r.lat, Math.max(r.zoom - 1, 4), 1280, 500),
    hero_image_card_url: staticUrl(r.lng, r.lat, r.zoom, 600, 400),
    hero_image_source: 'mapbox_static',
    status: 'draft',
  }
}

async function main() {
  if (!MAPBOX_TOKEN) { console.error('Missing NEXT_PUBLIC_MAPBOX_TOKEN'); process.exit(1) }
  const rows = REGIONS.map(toRow)

  if (DRY_RUN) {
    console.log(`[dry-run] would upsert ${rows.length} regions:\n`)
    for (const r of rows) console.log(`  ${r.state}  ${r.slug.padEnd(28)} ${r.name}`)
    console.log('\n[dry-run] sample row:')
    console.log(JSON.stringify(rows[0], null, 2))
    return
  }

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  // Guard: report any slug that already exists (we expect none — all are new).
  const slugs = rows.map(r => r.slug)
  const { data: existing } = await sb.from('regions').select('slug, status').in('slug', slugs)
  if (existing?.length) {
    console.log('Note — these slugs already exist and will be refreshed (not duplicated):')
    for (const e of existing) console.log(`  ${e.slug} (status=${e.status})`)
    console.log()
  }

  const { data, error } = await sb
    .from('regions')
    .upsert(rows, { onConflict: 'slug' })
    .select('id, name, slug, state, status, center_lat, center_lng, map_zoom, listing_count')

  if (error) { console.error('Upsert failed:', error.message); process.exit(1) }

  console.log(`Upserted ${data.length} regions:`)
  for (const d of data.sort((a, b) => a.state.localeCompare(b.state) || a.slug.localeCompare(b.slug))) {
    console.log(`  ${d.state}  ${d.slug.padEnd(28)} status=${d.status} lc=${d.listing_count}  ${d.name}`)
  }
  console.log('\nNext: node scripts/source-gap-region-polygons.mjs --apply')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
