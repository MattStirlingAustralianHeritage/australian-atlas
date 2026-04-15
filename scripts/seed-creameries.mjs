#!/usr/bin/env node
/**
 * Seed ~50 Australian creameries as Table Atlas candidates.
 *
 * These are artisan cheese/dairy producers that welcome visitors —
 * creameries, fromageries, and cheese-focused farm gates with
 * national geographic spread.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-creameries.mjs
 *   node --env-file=.env.local scripts/seed-creameries.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Parse .env.local manually
try {
  const envText = readFileSync('.env.local', 'utf-8')
  for (const line of envText.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.substring(0, eqIdx)
    const val = trimmed.substring(eqIdx + 1)
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* .env.local may not exist */ }

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(MASTER_URL, MASTER_KEY)
const dryRun = process.argv.includes('--dry-run')

// ─── Creamery data ──────────────────────────────────────────
// Each entry: [name, region, website_url, confidence]
// gate_results.category will be set to 'creamery' for all
const CREAMERIES = [
  // === VIC (12) ===
  ['Maffra Cheese Company', 'Gippsland, VIC', 'https://www.maffracgeese.com.au', 0.92],
  ['Holy Goat Cheese', 'Sutton Grange, VIC', 'https://www.holygoat.com.au', 0.94],
  ['Yarra Valley Dairy', 'Yering, VIC', 'https://www.yvd.com.au', 0.93],
  ['That\'s Amore Cheese', 'Thomastown, VIC', 'https://www.thatsamorecheese.com.au', 0.91],
  ['Prom Country Cheese', 'Moyarra, VIC', 'https://www.promcountrycheese.com.au', 0.88],
  ['Berrys Creek Gourmet Cheese', 'Drouin South, VIC', 'https://www.berryscreekgourmetcheese.com.au', 0.89],
  ['Apostle Whey Cheese', 'Cooriemungle, VIC', 'https://www.apostlewheycheese.com.au', 0.87],
  ['Tarago River Cheese Company', 'Neerim South, VIC', 'https://www.taragorivercheese.com.au', 0.86],
  ['L\'Artisan Cheese', 'Mornington Peninsula, VIC', 'https://www.lartisancheese.com.au', 0.90],
  ['Sutton Grange Organic Farm', 'Sutton Grange, VIC', 'https://www.suttongrangeorganicfarm.com.au', 0.82],
  ['Goldfields Farmhouse Cheese', 'Kyneton, VIC', 'https://www.goldfieldsfarmhouse.com.au', 0.84],
  ['Main Ridge Dairy', 'Main Ridge, VIC', 'https://www.mainridgedairy.com.au', 0.85],

  // === TAS (8) ===
  ['Bruny Island Cheese Company', 'Bruny Island, TAS', 'https://www.brunyislandcheese.com.au', 0.95],
  ['Pyengana Dairy Company', 'Pyengana, TAS', 'https://www.pyenganadairy.com.au', 0.93],
  ['Coal River Farm', 'Cambridge, TAS', 'https://www.coalriverfarm.com.au', 0.91],
  ['Heidi Farm', 'Granton, TAS', 'https://www.heidifarm.com.au', 0.86],
  ['Ashgrove Cheese', 'Elizabeth Town, TAS', 'https://www.ashgrovecheese.com.au', 0.88],
  ['Tongola', 'Evandale, TAS', 'https://www.tongola.com.au', 0.85],
  ['Wicked Cheese Company', 'Richmond, TAS', 'https://www.wickedcheese.com.au', 0.87],
  ['King Island Dairy', 'King Island, TAS', 'https://www.kingislanddairy.com.au', 0.90],

  // === NSW (8) ===
  ['Pecora Dairy', 'Robertson, NSW', 'https://www.pecoradairy.com.au', 0.91],
  ['Binnorie Dairy', 'Lovedale, NSW', 'https://www.binnorie.com.au', 0.89],
  ['Tilba Real Dairy', 'Central Tilba, NSW', 'https://www.tilbarealdairy.com', 0.90],
  ['Jannei Goat Dairy', 'Lovedale, NSW', 'https://www.jannei.com.au', 0.87],
  ['Harper & Blohm', 'Orange, NSW', 'https://www.harperandblohm.com.au', 0.85],
  ['Bodalla Dairy', 'Bodalla, NSW', 'https://www.bodalladairy.com.au', 0.86],
  ['Nimbin Valley Dairy', 'Nimbin, NSW', 'https://www.nimbinvalleydairy.com.au', 0.82],
  ['High Valley Cheese', 'Tumbarumba, NSW', 'https://www.highvalleycheese.com.au', 0.83],

  // === SA (7) ===
  ['Woodside Cheese Wrights', 'Woodside, SA', 'https://www.woodsidecheese.com.au', 0.93],
  ['Udder Delights', 'Hahndorf, SA', 'https://www.udderdelights.com.au', 0.91],
  ['Alexandrina Cheese Company', 'Mount Jagged, SA', 'https://www.alexandrinacheese.com.au', 0.88],
  ['Section 28', 'Adelaide Hills, SA', 'https://www.section28.com.au', 0.90],
  ['Kingswood Cheese', 'Kingswood, SA', 'https://www.kingswoodcheese.com.au', 0.84],
  ['The Smelly Cheese Shop', 'Adelaide, SA', 'https://www.thesmellycheeseshop.com.au', 0.86],
  ['Barossa Cheese Company', 'Angaston, SA', 'https://www.barossacheese.com.au', 0.87],

  // === QLD (5) ===
  ['Witches Chase Cheese Company', 'Tamborine Mountain, QLD', 'https://www.witcheschasecheese.com.au', 0.89],
  ['Kenilworth Country Foods', 'Kenilworth, QLD', 'https://www.kenilworthcountryfoods.com.au', 0.88],
  ['Maleny Cheese', 'Maleny, QLD', 'https://www.malenycheese.com.au', 0.87],
  ['Gympie Cheese Company', 'Gympie, QLD', 'https://www.gympiecheese.com.au', 0.82],
  ['Scenic Rim Cheese', 'Scenic Rim, QLD', 'https://www.scenicrimbrew.com.au', 0.84],

  // === WA (5) ===
  ['Margaret River Dairy Company', 'Margaret River, WA', 'https://www.mrdc.com.au', 0.91],
  ['Cambray Cheese', 'Nannup, WA', 'https://www.cambraycheese.com.au', 0.87],
  ['Harvey Cheese', 'Harvey, WA', 'https://www.harveycheese.com.au', 0.86],
  ['Ha\'Penny Cheeses', 'Nannup, WA', 'https://www.hapennycheeses.com.au', 0.83],
  ['Mundella Foods', 'Mundijong, WA', 'https://www.mundella.com.au', 0.82],

  // === NT (1) ===
  ['Litchfield Cheese Co', 'Litchfield, NT', 'https://www.litchfieldcheese.com.au', 0.78],

  // === ACT/surrounds (1) ===
  ['Capital Region Farmers Market Cheese Stall', 'Canberra, ACT', null, 0.72],

  // === Multi-region / iconic (3) ===
  ['Tas Heritage Cheese', 'Launceston, TAS', 'https://www.tasheritagecheese.com.au', 0.84],
  ['Meredith Dairy', 'Meredith, VIC', 'https://www.meredithdairy.com', 0.92],
  ['Shaw River Buffalo Cheese', 'Timboon, VIC', 'https://www.shawriver.com.au', 0.88],
]

async function seed() {
  console.log(`\n🧀 Seeding ${CREAMERIES.length} creameries as Table Atlas candidates...`)
  if (dryRun) console.log('  (dry run — no database writes)\n')

  let inserted = 0
  let skipped = 0
  let errored = 0

  for (const [name, region, website_url, confidence] of CREAMERIES) {
    // Only include columns known to exist in production schema
    const row = {
      name,
      region,
      website_url: website_url || null,
      vertical: 'table',
      confidence,
      source: 'coverage_gap',
      source_detail: 'Curated Australian creamery seed — artisan cheese/dairy producers with visitor experiences',
      status: 'pending',
    }
    // gate_results and description may not exist if migrations haven't been applied
    // Try adding them but fall back if schema cache rejects them

    if (dryRun) {
      console.log(`  [DRY] ${name} — ${region} (${confidence})`)
      inserted++
      continue
    }

    // Try insert with gate_results first, fall back without if column missing
    let { data, error } = await sb
      .from('listing_candidates')
      .insert({ ...row, gate_results: { category: 'creamery' } })
      .select('id')

    // If gate_results column doesn't exist in schema, retry without it
    if (error && error.message.includes('schema cache')) {
      const retry = await sb
        .from('listing_candidates')
        .insert(row)
        .select('id')
      data = retry.data
      error = retry.error
    }

    if (error) {
      if (error.code === '23505') {
        console.log(`  ⊘ SKIP ${name} — already in queue`)
        skipped++
      } else {
        console.error(`  ✗ ERROR ${name}: ${error.message}`)
        errored++
      }
    } else {
      console.log(`  ✓ ${name} — ${region}`)
      inserted++
    }
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped (dupes), ${errored} errors`)
}

seed().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
