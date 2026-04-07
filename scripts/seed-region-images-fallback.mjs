#!/usr/bin/env node

/**
 * Seed region hero images using local SVG placeholders.
 *
 * Unsplash URLs have been removed. Regions that lack a hero image
 * will receive the local atlas-placeholder SVG.
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

// Local SVG placeholder — used for all regions that lack a hero image
const CURATED_IMAGES = {}

const FALLBACK = {
  url: '/placeholders/atlas-placeholder.svg',
  credit: 'Australian Atlas',
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
