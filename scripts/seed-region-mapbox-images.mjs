#!/usr/bin/env node

/**
 * Generate Mapbox Static Images for all regions.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-region-mapbox-images.mjs
 *
 * Optional flags:
 *   --force    Overwrite existing hero_image_url values
 *   --dry-run  Print URLs without updating DB
 *
 * This script:
 *   1. Fetches all regions
 *   2. Generates Mapbox Static Image URLs using region center coordinates
 *   3. Stores URLs in hero_image_url with hero_image_source = 'mapbox_static'
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local', override: true })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const MAPBOX_STYLE = 'mapbox/outdoors-v12'

const args = process.argv.slice(2)
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')

// Region center coordinates and zoom levels
// Zoom 8-10 for regional areas, 7 for larger regions
const REGION_COORDS = {
  'mornington-peninsula':       { lat: -38.35, lng: 145.05, zoom: 10 },
  'barossa-valley':             { lat: -34.56, lng: 138.95, zoom: 10 },
  'yarra-valley':               { lat: -37.73, lng: 145.55, zoom: 10 },
  'byron-hinterland':           { lat: -28.65, lng: 153.45, zoom: 10 },
  'blue-mountains':             { lat: -33.72, lng: 150.31, zoom: 10 },
  'adelaide-hills':             { lat: -35.02, lng: 138.72, zoom: 10 },
  'margaret-river':             { lat: -33.95, lng: 115.07, zoom: 9 },
  'hunter-valley':              { lat: -32.78, lng: 151.28, zoom: 10 },
  'daylesford':                 { lat: -37.35, lng: 144.15, zoom: 10 },
  'hobart':                     { lat: -42.88, lng: 147.33, zoom: 9 },
  'grampians':                  { lat: -37.15, lng: 142.45, zoom: 9 },
  'flinders-ranges':            { lat: -31.75, lng: 138.60, zoom: 8 },
  'noosa-hinterland':           { lat: -26.38, lng: 152.88, zoom: 10 },
  'sunshine-coast-hinterland':  { lat: -26.72, lng: 152.85, zoom: 10 },
  'kangaroo-island':            { lat: -35.78, lng: 137.22, zoom: 9 },
  'bruny-island':               { lat: -43.28, lng: 147.33, zoom: 10 },
  'tamar-valley':               { lat: -41.28, lng: 146.95, zoom: 10 },
  'central-victoria':           { lat: -37.05, lng: 144.28, zoom: 9 },
  'great-ocean-road':           { lat: -38.68, lng: 143.55, zoom: 9 },
  'mclaren-vale':               { lat: -35.22, lng: 138.55, zoom: 10 },
  'bellarine-peninsula':        { lat: -38.25, lng: 144.55, zoom: 10 },
  'southern-highlands':         { lat: -34.48, lng: 150.42, zoom: 10 },
  'shoalhaven':                 { lat: -34.88, lng: 150.58, zoom: 9 },
  'gold-coast-hinterland':      { lat: -28.15, lng: 153.28, zoom: 10 },
  'macedon-ranges':             { lat: -37.35, lng: 144.58, zoom: 10 },
  'clare-valley':               { lat: -33.85, lng: 138.60, zoom: 10 },
  'cradle-country':             { lat: -41.65, lng: 145.95, zoom: 9 },
  'fremantle-swan-valley':      { lat: -31.95, lng: 115.88, zoom: 10 },
  'canberra-district':          { lat: -35.28, lng: 149.13, zoom: 10 },
  'northern-rivers':            { lat: -28.82, lng: 153.28, zoom: 9 },
  // Additional regions from migration 015
  'gippsland':                  { lat: -38.05, lng: 146.05, zoom: 8 },
  'geelong':                    { lat: -38.15, lng: 144.36, zoom: 10 },
  'rutherglen':                 { lat: -36.05, lng: 146.47, zoom: 10 },
  'king-valley':                { lat: -36.65, lng: 146.38, zoom: 10 },
  'beechworth':                 { lat: -36.36, lng: 146.69, zoom: 10 },
  'orange':                     { lat: -33.28, lng: 149.10, zoom: 10 },
  'mudgee':                     { lat: -32.59, lng: 149.59, zoom: 10 },
  'coffs-harbour':              { lat: -30.30, lng: 153.12, zoom: 10 },
  'port-stephens':              { lat: -32.72, lng: 152.10, zoom: 10 },
  'scenic-rim':                 { lat: -28.08, lng: 152.85, zoom: 9 },
  'atherton-tablelands':        { lat: -17.27, lng: 145.48, zoom: 9 },
  'granite-belt':               { lat: -28.65, lng: 151.85, zoom: 10 },
  'coonawarra':                 { lat: -37.28, lng: 140.82, zoom: 10 },
  'riverland':                  { lat: -34.18, lng: 140.75, zoom: 9 },
  'denmark-albany':             { lat: -34.95, lng: 117.85, zoom: 9 },
  'perth-hills':                { lat: -31.92, lng: 116.10, zoom: 10 },
  'launceston':                 { lat: -41.45, lng: 147.14, zoom: 10 },
  'east-coast-tasmania':        { lat: -41.88, lng: 148.28, zoom: 9 },
  'darwin-top-end':             { lat: -12.45, lng: 130.85, zoom: 8 },
  'alice-springs':              { lat: -23.70, lng: 133.88, zoom: 8 },
  // Additional regions from migration 015 (second batch)
  'alice-springs-red-centre':   { lat: -23.70, lng: 133.88, zoom: 7 },
  'broome-kimberley':           { lat: -17.95, lng: 122.24, zoom: 7 },
  'byron-bay':                  { lat: -28.64, lng: 153.61, zoom: 10 },
  'cairns-tropical-north':      { lat: -16.92, lng: 145.77, zoom: 8 },
  'central-coast':              { lat: -33.32, lng: 151.34, zoom: 10 },
  'great-southern':             { lat: -34.95, lng: 117.85, zoom: 8 },
  'launceston-tamar-valley':    { lat: -41.45, lng: 147.14, zoom: 9 },
  'limestone-coast':            { lat: -37.08, lng: 140.78, zoom: 9 },
  'murray-river':               { lat: -35.12, lng: 142.15, zoom: 8 },
  'orange-central-west':        { lat: -33.28, lng: 149.10, zoom: 9 },
  'south-coast-nsw':            { lat: -35.08, lng: 150.18, zoom: 9 },
  'toowoomba-darling-downs':    { lat: -27.56, lng: 151.95, zoom: 9 },
}

function mapboxStaticUrl(lng, lat, zoom, width, height) {
  return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/static/${lng},${lat},${zoom},0/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}`
}

async function main() {
  if (!MAPBOX_TOKEN) {
    console.error('Missing NEXT_PUBLIC_MAPBOX_TOKEN')
    process.exit(1)
  }

  console.log('Fetching regions...\n')
  const { data: regions, error } = await supabase
    .from('regions')
    .select('id, name, slug, hero_image_url')
    .order('name')

  if (error) {
    console.error('Failed to fetch regions:', error.message)
    process.exit(1)
  }

  console.log(`Found ${regions.length} regions`)
  if (dryRun) console.log('[DRY RUN MODE]\n')

  let updated = 0
  let skipped = 0
  let missing = 0

  for (const region of regions) {
    const coords = REGION_COORDS[region.slug]

    if (!coords) {
      console.log(`  ✗ ${region.slug} — no coordinates defined`)
      missing++
      continue
    }

    if (region.hero_image_url && !force) {
      // Check if it's already a mapbox static URL
      if (region.hero_image_url.includes('api.mapbox.com')) {
        console.log(`  ⊘ ${region.slug} — already has Mapbox static image`)
        skipped++
        continue
      }
    }

    // Generate URLs for card (600x400) and hero (1400x500)
    const cardUrl = mapboxStaticUrl(coords.lng, coords.lat, coords.zoom, 600, 400)
    const heroUrl = mapboxStaticUrl(coords.lng, coords.lat, coords.zoom - 1, 1400, 500)

    if (dryRun) {
      console.log(`  → ${region.slug}: card=${cardUrl.substring(0, 80)}...`)
      updated++
      continue
    }

    const { error: updateError } = await supabase
      .from('regions')
      .update({
        hero_image_url: heroUrl,
        hero_image_source: 'mapbox_static',
        hero_image_card_url: cardUrl,
        center_lat: coords.lat,
        center_lng: coords.lng,
        map_zoom: coords.zoom,
      })
      .eq('id', region.id)

    if (updateError) {
      console.log(`  ✗ ${region.slug} — DB error: ${updateError.message}`)
    } else {
      console.log(`  ✓ ${region.slug} (${coords.lat}, ${coords.lng}, z${coords.zoom})`)
      updated++
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${missing} missing coords`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
