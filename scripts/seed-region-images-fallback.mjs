#!/usr/bin/env node

/**
 * Seed region hero images from the curated Unsplash URLs that were
 * previously hardcoded in the regions index page.
 *
 * This is the zero-API-key fallback. For new regions without a curated
 * image, it uses a high-quality Australian landscape fallback.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-region-images-fallback.mjs
 *
 * Or:
 *   cd australian-atlas && /usr/local/bin/node scripts/seed-region-images-fallback.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Curated Unsplash images — these were previously hardcoded in app/regions/page.js
// Using the full URL format for reliable rendering
const CURATED_IMAGES = {
  // Victoria
  'bellarine-peninsula':         { url: 'https://images.unsplash.com/photo-1583683684573-YADNaktouBs?w=1600&q=80', credit: 'Unsplash' },
  'central-victoria':            { url: 'https://images.unsplash.com/photo-1584267385494-9fdd9a71ad75?w=1600&q=80', credit: 'Unsplash' },
  'daylesford':                  { url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1600&q=80', credit: 'Unsplash' },
  'grampians':                   { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=80', credit: 'Unsplash' },
  'great-ocean-road':            { url: 'https://images.unsplash.com/photo-1529108190281-9a4f620bc2d8?w=1600&q=80', credit: 'Unsplash' },
  'macedon-ranges':              { url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80', credit: 'Unsplash' },
  'mornington-peninsula':        { url: 'https://images.unsplash.com/photo-1507699622108-4be3abd695ad?w=1600&q=80', credit: 'Unsplash' },
  'yarra-valley':                { url: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=1600&q=80', credit: 'Unsplash' },
  'gippsland':                   { url: 'https://images.unsplash.com/photo-1530569673472-307dc017a82d?w=1600&q=80', credit: 'Unsplash' },
  'murray-river':                { url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80', credit: 'Unsplash' },
  // NSW
  'blue-mountains':              { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=80', credit: 'Unsplash' },
  'byron-hinterland':            { url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=80', credit: 'Unsplash' },
  'hunter-valley':               { url: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1600&q=80', credit: 'Unsplash' },
  'northern-rivers':             { url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80', credit: 'Unsplash' },
  'shoalhaven':                  { url: 'https://images.unsplash.com/photo-1520942702018-0862200e6873?w=1600&q=80', credit: 'Unsplash' },
  'southern-highlands':          { url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1600&q=80', credit: 'Unsplash' },
  'central-coast':               { url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=80', credit: 'Unsplash' },
  'orange-central-west':         { url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80', credit: 'Unsplash' },
  'south-coast-nsw':             { url: 'https://images.unsplash.com/photo-1520942702018-0862200e6873?w=1600&q=80', credit: 'Unsplash' },
  // Queensland
  'gold-coast-hinterland':       { url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1600&q=80', credit: 'Unsplash' },
  'noosa-hinterland':            { url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80', credit: 'Unsplash' },
  'sunshine-coast-hinterland':   { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=80', credit: 'Unsplash' },
  'cairns-tropical-north':       { url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1600&q=80', credit: 'Unsplash' },
  'scenic-rim':                  { url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1600&q=80', credit: 'Unsplash' },
  'toowoomba-darling-downs':     { url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80', credit: 'Unsplash' },
  // South Australia
  'adelaide-hills':              { url: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1600&q=80', credit: 'Unsplash' },
  'barossa-valley':              { url: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1600&q=80', credit: 'Unsplash' },
  'clare-valley':                { url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80', credit: 'Unsplash' },
  'flinders-ranges':             { url: 'https://images.unsplash.com/photo-1462275646964-a0e3c11f18a6?w=1600&q=80', credit: 'Unsplash' },
  'kangaroo-island':             { url: 'https://images.unsplash.com/photo-1530569673472-307dc017a82d?w=1600&q=80', credit: 'Unsplash' },
  'mclaren-vale':                { url: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1600&q=80', credit: 'Unsplash' },
  'limestone-coast':             { url: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1600&q=80', credit: 'Unsplash' },
  'riverland':                   { url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80', credit: 'Unsplash' },
  // Western Australia
  'fremantle-swan-valley':       { url: 'https://images.unsplash.com/photo-1514395462725-fb4566210144?w=1600&q=80', credit: 'Unsplash' },
  'margaret-river':              { url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=80', credit: 'Unsplash' },
  'great-southern':              { url: 'https://images.unsplash.com/photo-1530569673472-307dc017a82d?w=1600&q=80', credit: 'Unsplash' },
  'broome-kimberley':            { url: 'https://images.unsplash.com/photo-1462275646964-a0e3c11f18a6?w=1600&q=80', credit: 'Unsplash' },
  // Tasmania
  'bruny-island':                { url: 'https://images.unsplash.com/photo-1530569673472-307dc017a82d?w=1600&q=80', credit: 'Unsplash' },
  'cradle-country':              { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=80', credit: 'Unsplash' },
  'hobart':                      { url: 'https://images.unsplash.com/photo-1514395462725-fb4566210144?w=1600&q=80', credit: 'Unsplash' },
  'tamar-valley':                { url: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1600&q=80', credit: 'Unsplash' },
  'east-coast-tasmania':         { url: 'https://images.unsplash.com/photo-1530569673472-307dc017a82d?w=1600&q=80', credit: 'Unsplash' },
  'launceston-tamar-valley':     { url: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1600&q=80', credit: 'Unsplash' },
  // ACT
  'canberra-district':           { url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1600&q=80', credit: 'Unsplash' },
  // NT
  'darwin-top-end':              { url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1600&q=80', credit: 'Unsplash' },
  'alice-springs-red-centre':    { url: 'https://images.unsplash.com/photo-1462275646964-a0e3c11f18a6?w=1600&q=80', credit: 'Unsplash' },
}

const FALLBACK = {
  url: 'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=1600&q=80',
  credit: 'Unsplash',
}

async function main() {
  console.log('Fetching regions...')
  const { data: regions, error } = await supabase
    .from('regions')
    .select('id, name, slug, hero_image_url')
    .order('name')

  if (error) {
    console.error('Failed to fetch regions:', error)
    process.exit(1)
  }

  const toSeed = regions.filter(r => !r.hero_image_url)
  console.log(`Found ${regions.length} regions, ${toSeed.length} need hero images\n`)

  let success = 0

  for (const region of toSeed) {
    const img = CURATED_IMAGES[region.slug] || FALLBACK

    const { error: updateError } = await supabase
      .from('regions')
      .update({
        hero_image_url: img.url,
        hero_image_credit: img.credit,
      })
      .eq('id', region.id)

    if (updateError) {
      console.log(`  ✗ [${region.slug}] ${updateError.message}`)
    } else {
      console.log(`  ✓ [${region.slug}] ${region.name}`)
      success++
    }
  }

  console.log(`\nDone: ${success} images seeded, ${regions.length - toSeed.length} already had images`)
}

main()
