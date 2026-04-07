#!/usr/bin/env node

/**
 * Seed region hero images with the local SVG placeholder.
 *
 * Previously this script called the Unsplash API. It now assigns the
 * local atlas-placeholder SVG to any region that lacks a hero image.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-region-images.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PLACEHOLDER_URL = '/placeholders/atlas-placeholder.svg'

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
    const { error: updateError } = await supabase
      .from('regions')
      .update({
        hero_image_url: PLACEHOLDER_URL,
        hero_image_credit: 'Australian Atlas',
      })
      .eq('id', region.id)

    if (updateError) {
      console.log(`  x [${region.slug}] ${updateError.message}`)
    } else {
      console.log(`  + [${region.slug}] ${region.name}`)
      success++
    }
  }

  console.log(`\nDone: ${success} images seeded, ${regions.length - toSeed.length} already had images`)
}

main()
