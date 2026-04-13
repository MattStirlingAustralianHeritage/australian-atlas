#!/usr/bin/env node
/**
 * Re-push all failed Rest Atlas listings.
 * These have source_id starting with 'candidate-' meaning the initial push
 * to the vertical DB failed (due to listing_tier CHECK constraint violation).
 *
 * Now that pushToVertical sets listing_tier: 'free', these should succeed.
 *
 * Usage:
 *   node scripts/repush-failed-rest.mjs           # dry-run (report only)
 *   node scripts/repush-failed-rest.mjs --push     # actually re-push
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sb = createClient(supabaseUrl, supabaseServiceKey)

// Rest Atlas vertical client
const restUrl = process.env.REST_SUPABASE_URL
const restKey = process.env.REST_SUPABASE_SERVICE_KEY

if (!restUrl || !restKey) {
  console.error('Missing REST_SUPABASE_URL or REST_SUPABASE_SERVICE_KEY in .env.local')
  process.exit(1)
}

const restClient = createClient(restUrl, restKey)

const doPush = process.argv.includes('--push')

// Valid categories for Rest Atlas (matches DB CHECK constraint)
const REST_CATEGORIES = ['boutique_hotel', 'guesthouse', 'bnb', 'farm_stay', 'glamping', 'cottage']
const REST_DEFAULT = 'boutique_hotel'

function validateRestCategory(cat) {
  if (cat && REST_CATEGORIES.includes(cat)) return cat
  if (cat) {
    const normalised = cat.toLowerCase().replace(/[\s-]+/g, '_')
    if (REST_CATEGORIES.includes(normalised)) return normalised
  }
  return REST_DEFAULT
}

async function main() {
  console.log(`\n=== Re-push failed Rest Atlas listings ===`)
  console.log(`Mode: ${doPush ? 'PUSH (live)' : 'DRY RUN (report only)'}`)

  // Find all rest listings with candidate- source_ids
  const { data: failed, error } = await sb
    .from('listings')
    .select('id, name, slug, description, state, region, lat, lng, website, phone, address, hero_image_url, sub_type, source_id')
    .eq('vertical', 'rest')
    .like('source_id', 'candidate-%')

  if (error) {
    console.error('Query error:', error.message)
    process.exit(1)
  }

  console.log(`Found ${failed.length} failed Rest Atlas listings\n`)

  if (failed.length === 0) {
    console.log('Nothing to re-push.')
    return
  }

  let successCount = 0
  let failCount = 0

  for (const listing of failed) {
    const category = validateRestCategory(listing.sub_type)
    console.log(`[${listing.id}] ${listing.name} — category: ${category} (was: ${listing.sub_type || 'null'})`)

    if (!doPush) continue

    // Build the vertical row
    const row = {
      name: listing.name,
      slug: listing.slug,
      description: listing.description || null,
      state: listing.state || null,
      phone: listing.phone || null,
      address: listing.address || null,
      hero_image_url: listing.hero_image_url || null,
      sub_region: listing.region || null,
      latitude: listing.lat || null,
      longitude: listing.lng || null,
      website: listing.website || null,
      type: category,
      listing_tier: 'free',
      status: 'published',
    }

    if (!listing.lat || !listing.lng) {
      console.log(`  ⚠ SKIP — missing coordinates`)
      failCount++
      continue
    }

    const { data: inserted, error: insertError } = await restClient
      .from('properties')
      .insert(row)
      .select('id')
      .single()

    if (insertError) {
      console.log(`  ✗ FAILED — ${insertError.message}`)
      failCount++
      continue
    }

    const verticalId = String(inserted.id)
    console.log(`  ✓ Pushed → properties.id = ${verticalId}`)

    // Update master source_id
    const { error: updateError } = await sb
      .from('listings')
      .update({ source_id: verticalId })
      .eq('id', listing.id)

    if (updateError) {
      console.log(`  ⚠ source_id update failed: ${updateError.message}`)
    } else {
      console.log(`  ✓ Master source_id updated`)
    }

    successCount++

    // Small delay to avoid hammering the DB
    await new Promise(r => setTimeout(r, 200))
  }

  if (doPush) {
    console.log(`\n=== Results ===`)
    console.log(`Success: ${successCount}`)
    console.log(`Failed:  ${failCount}`)
    console.log(`Total:   ${failed.length}`)
  } else {
    console.log(`\nRun with --push to execute.`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
