#!/usr/bin/env node
/**
 * Re-push ALL failed vertical listings across every vertical.
 * Fixes candidate- source_ids left behind by pushToVertical failures.
 *
 * Usage:
 *   node scripts/repush-failed-all.mjs          # dry-run
 *   node scripts/repush-failed-all.mjs --push   # actually re-push
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseServiceKey) { console.error('Missing master env vars'); process.exit(1) }
const sb = createClient(supabaseUrl, supabaseServiceKey)

const doPush = process.argv.includes('--push')

// Vertical configs — mirrors pushToVertical.js mapToVerticalSchema
const VERTICALS = {
  sba: {
    env: ['SBA_SUPABASE_URL', 'SBA_SUPABASE_SERVICE_KEY'],
    table: 'venues',
    categories: ['brewery', 'winery', 'distillery', 'cidery', 'meadery', 'cellar_door', 'sour_brewery', 'non_alcoholic'],
    defaultCat: 'winery',
    mapRow: (l, cat) => ({
      name: l.name, slug: l.slug, description: l.description || null, state: l.state || null,
      phone: l.phone || null, address: l.address || null, hero_image_url: l.hero_image_url || null,
      sub_region: l.region || null, latitude: l.lat, longitude: l.lng,
      website: l.website || null, type: cat, listing_tier: 'basic', status: 'published',
    }),
  },
  collection: {
    env: ['COLLECTION_SUPABASE_URL', 'COLLECTION_SUPABASE_SERVICE_KEY'],
    table: 'venues',
    categories: ['museum', 'gallery', 'heritage_site', 'cultural_centre', 'botanical_garden'],
    defaultCat: 'museum',
    mapRow: (l, cat) => ({
      name: l.name, slug: l.slug, description: l.description || null, state: l.state || null,
      phone: l.phone || null, address: l.address || null, hero_image_url: l.hero_image_url || null,
      sub_region: l.region || null, latitude: l.lat, longitude: l.lng,
      website: l.website || null, type: cat, listing_tier: 'basic', status: 'published',
    }),
  },
  field: {
    env: ['FIELD_SUPABASE_URL', 'FIELD_SUPABASE_SERVICE_KEY'],
    table: 'places',
    categories: ['swimming_hole', 'waterfall', 'lookout', 'gorge', 'coastal_walk', 'hot_spring', 'cave', 'national_park'],
    defaultCat: 'lookout',
    mapRow: (l, cat) => ({
      name: l.name, slug: l.slug, description: l.description || null, state: l.state || null,
      address: l.address || null, hero_image_url: l.hero_image_url || null,
      region: l.region || null, latitude: l.lat, longitude: l.lng,
      place_type: cat, published: true,
    }),
  },
  corner: {
    env: ['CORNER_SUPABASE_URL', 'CORNER_SUPABASE_SERVICE_KEY'],
    table: 'shops',
    categories: ['bookshop', 'records', 'homewares', 'stationery', 'jewellery', 'toys', 'general', 'clothing', 'food_drink', 'plants', 'art_supplies', 'other'],
    defaultCat: 'general',
    mapRow: (l, cat) => ({
      name: l.name, slug: l.slug, description: l.description || null, state: l.state || null,
      phone: l.phone || null, address: l.address || null,
      suburb: l.region || null, lat: l.lat, lng: l.lng,
      website_url: l.website || null, category: cat, published: true,
    }),
  },
}

function validateCat(cats, defaultCat, val) {
  if (val && cats.includes(val)) return val
  if (val) {
    const n = val.toLowerCase().replace(/[\s-]+/g, '_')
    if (cats.includes(n)) return n
  }
  return defaultCat
}

async function main() {
  console.log(`\n=== Re-push failed listings (all verticals) ===`)
  console.log(`Mode: ${doPush ? 'PUSH' : 'DRY RUN'}\n`)

  let totalOk = 0, totalFail = 0, totalSkip = 0

  for (const [vertical, config] of Object.entries(VERTICALS)) {
    const url = process.env[config.env[0]]
    const key = process.env[config.env[1]]
    if (!url || !key) { console.log(`${vertical}: env vars missing, skip\n`); continue }

    const vertClient = createClient(url, key)

    const { data: failed, error } = await sb
      .from('listings')
      .select('id, name, slug, description, state, region, lat, lng, website, phone, address, hero_image_url, sub_type, source_id')
      .eq('vertical', vertical)
      .like('source_id', 'candidate-%')

    if (error || !failed || failed.length === 0) {
      if (failed?.length === 0) console.log(`${vertical}: 0 failed — skip`)
      continue
    }

    console.log(`\n--- ${vertical} (${failed.length} failed) ---`)
    let ok = 0, fail = 0, skip = 0

    for (const l of failed) {
      const cat = validateCat(config.categories, config.defaultCat, l.sub_type)

      if (!l.lat || !l.lng) {
        console.log(`  [${l.name}] SKIP — no coordinates`)
        skip++; totalSkip++
        continue
      }

      console.log(`  [${l.name}] cat: ${cat}`)

      if (!doPush) continue

      const row = config.mapRow(l, cat)
      const { data: inserted, error: insertErr } = await vertClient
        .from(config.table)
        .insert(row)
        .select('id')
        .single()

      if (insertErr) {
        console.log(`    ✗ ${insertErr.message}`)
        fail++; totalFail++
        continue
      }

      const vid = String(inserted.id)
      const { error: upErr } = await sb.from('listings').update({ source_id: vid }).eq('id', l.id)
      console.log(`    ✓ → ${config.table}.id = ${vid}${upErr ? ' (source_id update failed)' : ''}`)
      ok++; totalOk++

      await new Promise(r => setTimeout(r, 150))
    }

    if (doPush) console.log(`  ${vertical} results: ${ok} ok, ${fail} fail, ${skip} skip`)
  }

  if (doPush) {
    console.log(`\n=== TOTAL: ${totalOk} ok, ${totalFail} fail, ${totalSkip} skip (no coords) ===`)
  } else {
    console.log(`\nRun with --push to execute.`)
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
