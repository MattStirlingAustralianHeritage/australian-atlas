#!/usr/bin/env node

/**
 * Seed region hero images from Unsplash API.
 *
 * Usage:
 *   UNSPLASH_ACCESS_KEY=xxx node scripts/seed-region-images.mjs
 *
 * Or with .env:
 *   node --env-file=.env.local scripts/seed-region-images.mjs
 *
 * This script:
 *   1. Fetches all regions from the database
 *   2. For each without a hero_image_url, queries Unsplash for a landscape photo
 *   3. Stores the URL and photographer credit in the DB
 *
 * The Unsplash API free tier allows 50 requests/hour. With ~47 regions,
 * this will complete in a single run. Rate limiting is built in.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY

if (!UNSPLASH_KEY) {
  console.error('Missing UNSPLASH_ACCESS_KEY environment variable')
  process.exit(1)
}

// Curated search terms per region for better results
// Falls back to "{name} Australia landscape" if not specified
const SEARCH_OVERRIDES = {
  'mornington-peninsula': 'Mornington Peninsula coast Victoria',
  'barossa-valley': 'Barossa Valley vineyards South Australia',
  'yarra-valley': 'Yarra Valley hills Victoria wine',
  'byron-hinterland': 'Byron Bay hinterland rainforest',
  'blue-mountains': 'Blue Mountains Three Sisters NSW',
  'adelaide-hills': 'Adelaide Hills vineyard',
  'margaret-river': 'Margaret River Western Australia coast',
  'hunter-valley': 'Hunter Valley vineyards NSW',
  'daylesford': 'Daylesford Victoria lake autumn',
  'hobart': 'Hobart Tasmania harbour mountain',
  'grampians': 'Grampians Victoria sandstone ranges',
  'flinders-ranges': 'Flinders Ranges outback South Australia',
  'noosa-hinterland': 'Noosa hinterland Queensland green',
  'sunshine-coast-hinterland': 'Glass House Mountains Queensland',
  'kangaroo-island': 'Kangaroo Island Remarkable Rocks',
  'bruny-island': 'Bruny Island Tasmania the Neck',
  'tamar-valley': 'Tamar Valley Tasmania vineyard',
  'central-victoria': 'Bendigo goldfields Victoria',
  'great-ocean-road': 'Twelve Apostles Great Ocean Road',
  'mclaren-vale': 'McLaren Vale vineyard South Australia',
  'bellarine-peninsula': 'Bellarine Peninsula Queenscliff coast',
  'southern-highlands': 'Southern Highlands NSW countryside',
  'shoalhaven': 'Jervis Bay white sand NSW',
  'gold-coast-hinterland': 'Springbrook National Park Queensland',
  'macedon-ranges': 'Macedon Ranges Victoria hills',
  'clare-valley': 'Clare Valley Riesling trail vineyard',
  'cradle-country': 'Cradle Mountain Tasmania lake',
  'fremantle-swan-valley': 'Fremantle port Western Australia',
  'canberra-district': 'Parliament House Canberra autumn',
  'northern-rivers': 'Northern Rivers NSW Lismore hinterland',
  'east-coast-tasmania': 'Freycinet National Park Wineglass Bay',
  'launceston-tamar-valley': 'Cataract Gorge Launceston Tasmania',
  'darwin-top-end': 'Darwin sunset harbour tropical',
  'alice-springs-red-centre': 'Uluru red centre landscape',
  'central-coast': 'Central Coast NSW Bouddi National Park',
  'orange-central-west': 'Orange NSW autumn countryside',
  'south-coast-nsw': 'South Coast NSW beach cliffs',
  'gippsland': 'Wilsons Promontory Victoria coast',
  'murray-river': 'Murray River paddle steamer Echuca',
  'cairns-tropical-north': 'Cairns tropical reef Queensland',
  'scenic-rim': 'Scenic Rim Queensland mountains',
  'toowoomba-darling-downs': 'Toowoomba garden city Queensland',
  'limestone-coast': 'Coonawarra vineyards South Australia',
  'riverland': 'Riverland South Australia Murray sunset',
  'great-southern': 'Albany Western Australia coast',
  'broome-kimberley': 'Broome Cable Beach Western Australia',
}

async function searchUnsplash(query) {
  const url = new URL('https://api.unsplash.com/search/photos')
  url.searchParams.set('query', query)
  url.searchParams.set('orientation', 'landscape')
  url.searchParams.set('per_page', '3')
  url.searchParams.set('order_by', 'relevant')

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Unsplash API error ${res.status}: ${text}`)
  }

  return res.json()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  let failed = 0

  for (const region of toSeed) {
    const query = SEARCH_OVERRIDES[region.slug] || `${region.name} Australia landscape`
    console.log(`[${region.slug}] Searching: "${query}"`)

    try {
      const result = await searchUnsplash(query)

      if (!result.results || result.results.length === 0) {
        console.log(`  ⚠ No results — trying fallback query`)
        const fallback = await searchUnsplash(`${region.name} Australia`)
        if (!fallback.results?.length) {
          console.log(`  ✗ No images found`)
          failed++
          continue
        }
        result.results = fallback.results
      }

      // Pick the first (most relevant) result
      const photo = result.results[0]
      const imageUrl = `${photo.urls.regular}&w=1600&q=80`
      const credit = `${photo.user.name} on Unsplash`
      const creditUrl = `${photo.user.links.html}?utm_source=australian_atlas&utm_medium=referral`

      // Update database
      const { error: updateError } = await supabase
        .from('regions')
        .update({
          hero_image_url: imageUrl,
          hero_image_credit: `${credit} (${creditUrl})`,
        })
        .eq('id', region.id)

      if (updateError) {
        console.log(`  ✗ DB update failed: ${updateError.message}`)
        failed++
      } else {
        console.log(`  ✓ ${photo.user.name} — ${photo.description || photo.alt_description || 'no description'}`)
        success++
      }

      // Trigger Unsplash download endpoint (required by API guidelines)
      fetch(photo.links.download_location, {
        headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
      }).catch(() => {})

    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`)
      failed++
    }

    // Rate limit: ~1 request per 1.5 seconds (well within 50/hour)
    await sleep(1500)
  }

  console.log(`\nDone: ${success} seeded, ${failed} failed, ${regions.length - toSeed.length} already had images`)
}

main()
