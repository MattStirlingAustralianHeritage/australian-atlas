#!/usr/bin/env node
/**
 * Re-push all failed Table Atlas listings.
 * These have source_id starting with 'candidate-' meaning the initial push
 * to the vertical DB failed (due to website_url column not existing — it's called 'website').
 *
 * Usage:
 *   node scripts/repush-failed-table.mjs           # dry-run
 *   node scripts/repush-failed-table.mjs --push    # actually re-push
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const tableUrl = process.env.TABLE_SUPABASE_URL
const tableKey = process.env.TABLE_SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey || !tableUrl || !tableKey) {
  console.error('Missing required env vars')
  process.exit(1)
}

const sb = createClient(supabaseUrl, supabaseServiceKey)
const tableSb = createClient(tableUrl, tableKey)

const doPush = process.argv.includes('--push')

const TABLE_CATEGORIES = ['restaurant', 'bakery', 'market', 'farm_gate', 'artisan_producer', 'specialty_retail', 'destination', 'cooking_school', 'providore', 'food_trail']
const TABLE_DEFAULT = 'restaurant'

function validateCategory(cat) {
  if (cat && TABLE_CATEGORIES.includes(cat)) return cat
  if (cat) {
    const n = cat.toLowerCase().replace(/[\s-]+/g, '_')
    if (TABLE_CATEGORIES.includes(n)) return n
  }
  return TABLE_DEFAULT
}

async function main() {
  console.log(`\n=== Re-push failed Table Atlas listings ===`)
  console.log(`Mode: ${doPush ? 'PUSH' : 'DRY RUN'}\n`)

  const { data: failed, error } = await sb
    .from('listings')
    .select('id, name, slug, description, state, region, lat, lng, website, phone, address, hero_image_url, sub_type, source_id')
    .eq('vertical', 'table')
    .like('source_id', 'candidate-%')

  if (error) { console.error('Query error:', error.message); process.exit(1) }
  console.log(`Found ${failed.length} failed listings\n`)
  if (failed.length === 0) return

  let ok = 0, fail = 0

  for (const l of failed) {
    const cat = validateCategory(l.sub_type)
    console.log(`[${l.id}] ${l.name} — cat: ${cat} (was: ${l.sub_type || 'null'})`)

    if (!doPush) continue

    if (!l.lat || !l.lng) {
      console.log(`  ⚠ SKIP — no coordinates`)
      fail++
      continue
    }

    const row = {
      name: l.name,
      slug: l.slug,
      description: l.description || null,
      state: l.state || null,
      phone: l.phone || null,
      address: l.address || null,
      hero_image_url: l.hero_image_url || null,
      suburb: l.region || null,
      lat: l.lat,
      lng: l.lng,
      website: l.website || null,
      category: cat,
      published: true,
    }

    const { data: inserted, error: insertErr } = await tableSb
      .from('listings')
      .insert(row)
      .select('id')
      .single()

    if (insertErr) {
      console.log(`  ✗ FAILED — ${insertErr.message}`)
      fail++
      continue
    }

    const vid = String(inserted.id)
    console.log(`  ✓ Pushed → listings.id = ${vid}`)

    const { error: upErr } = await sb
      .from('listings')
      .update({ source_id: vid })
      .eq('id', l.id)

    if (upErr) console.log(`  ⚠ source_id update failed: ${upErr.message}`)
    else console.log(`  ✓ Master source_id updated`)

    ok++
    await new Promise(r => setTimeout(r, 200))
  }

  if (doPush) {
    console.log(`\n=== Results: ${ok} success, ${fail} failed, ${failed.length} total ===`)
  } else {
    console.log(`\nRun with --push to execute.`)
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
