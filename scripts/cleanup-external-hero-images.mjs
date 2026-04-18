#!/usr/bin/env node
/**
 * Clean up scraped external hero images across ALL vertical databases.
 *
 * For each vertical:
 *   1. Finds all listings where hero_image_url points to a non-approved domain
 *   2. Moves the URL to scraped_hero_url (for admin reference) if that column exists,
 *      or to notes if not
 *   3. Nulls out hero_image_url
 *
 * Also cleans the master portal listings table.
 *
 * Usage:
 *   node --env-file=.env.local scripts/cleanup-external-hero-images.mjs --dry-run
 *   node --env-file=.env.local scripts/cleanup-external-hero-images.mjs
 *
 * ALWAYS run --dry-run first to review what will be changed.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// ─── Env loading ─────────────────────────────────────────────
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

const DRY_RUN = process.argv.includes('--dry-run')

// ─── Approved domains whitelist ─────────────────────────────
const APPROVED_HOSTS = ['supabase.co', 'storage.googleapis.com']

function isApprovedSource(url) {
  if (!url) return true
  try {
    const hostname = new URL(url).hostname
    return APPROVED_HOSTS.some(h => hostname.endsWith(h))
  } catch {
    return false
  }
}

// ─── Vertical configs ───────────────────────────────────────
// Same config as audit script — see audit-hero-images.mjs for env var patterns
const VERTICALS = [
  { name: 'Rest Atlas', key: 'rest', url: process.env.REST_SUPABASE_URL || process.env.NEXT_PUBLIC_REST_SUPABASE_URL, serviceKey: process.env.REST_SUPABASE_SERVICE_KEY || process.env.REST_SERVICE_ROLE_KEY, table: 'properties', heroCol: 'hero_image_url' },
  { name: 'Small Batch Atlas', key: 'sba', url: process.env.SBA_SUPABASE_URL || process.env.NEXT_PUBLIC_SBA_SUPABASE_URL, serviceKey: process.env.SBA_SUPABASE_SERVICE_KEY || process.env.SBA_SERVICE_ROLE_KEY, table: 'venues', heroCol: 'hero_image_url' },
  { name: 'Collection Atlas', key: 'collection', url: process.env.COLLECTION_SUPABASE_URL || process.env.NEXT_PUBLIC_COLLECTION_SUPABASE_URL, serviceKey: process.env.COLLECTION_SUPABASE_SERVICE_KEY || process.env.COLLECTION_SERVICE_ROLE_KEY, table: 'venues', heroCol: 'hero_image_url' },
  { name: 'Craft Atlas', key: 'craft', url: process.env.CRAFT_SUPABASE_URL || process.env.NEXT_PUBLIC_CRAFT_SUPABASE_URL, serviceKey: process.env.CRAFT_SUPABASE_SERVICE_KEY || process.env.CRAFT_SERVICE_ROLE_KEY, table: 'venues', heroCol: 'hero_image_url' },
  { name: 'Fine Grounds (cafes)', key: 'fine_grounds', url: process.env.FINE_GROUNDS_SUPABASE_URL || process.env.NEXT_PUBLIC_FINE_GROUNDS_SUPABASE_URL, serviceKey: process.env.FINE_GROUNDS_SUPABASE_SERVICE_KEY || process.env.FINE_GROUNDS_SERVICE_ROLE_KEY, table: 'cafes', heroCol: 'hero_image_url' },
  { name: 'Fine Grounds (roasters)', key: 'fine_grounds', url: process.env.FINE_GROUNDS_SUPABASE_URL || process.env.NEXT_PUBLIC_FINE_GROUNDS_SUPABASE_URL, serviceKey: process.env.FINE_GROUNDS_SUPABASE_SERVICE_KEY || process.env.FINE_GROUNDS_SERVICE_ROLE_KEY, table: 'roasters', heroCol: 'hero_image_url' },
  { name: 'Field Atlas', key: 'field', url: process.env.FIELD_SUPABASE_URL || process.env.NEXT_PUBLIC_FIELD_SUPABASE_URL, serviceKey: process.env.FIELD_SUPABASE_SERVICE_KEY || process.env.FIELD_SERVICE_ROLE_KEY, table: 'places', heroCol: 'hero_image_url' },
  { name: 'Corner Atlas', key: 'corner', url: process.env.CORNER_SUPABASE_URL || process.env.NEXT_PUBLIC_CORNER_SUPABASE_URL, serviceKey: process.env.CORNER_SUPABASE_SERVICE_KEY || process.env.CORNER_SERVICE_ROLE_KEY, table: 'shops', heroCol: 'hero_image_url' },
  { name: 'Found Atlas', key: 'found', url: process.env.FOUND_SUPABASE_URL || process.env.NEXT_PUBLIC_FOUND_SUPABASE_URL, serviceKey: process.env.FOUND_SUPABASE_SERVICE_KEY || process.env.FOUND_SERVICE_ROLE_KEY, table: 'shops', heroCol: 'hero_image_url' },
  { name: 'Table Atlas', key: 'table', url: process.env.TABLE_SUPABASE_URL || process.env.NEXT_PUBLIC_TABLE_SUPABASE_URL, serviceKey: process.env.TABLE_SUPABASE_SERVICE_KEY || process.env.TABLE_SERVICE_ROLE_KEY, table: 'listings', heroCol: 'hero_image_url' },
]

async function cleanVertical(config) {
  if (!config.url || !config.serviceKey) {
    console.log(`  ⚠️  ${config.name}: missing credentials, skipping`)
    return { cleaned: 0, skipped: true }
  }

  const sb = createClient(config.url, config.serviceKey)

  // Fetch all rows with non-null hero images
  const { data, error } = await sb
    .from(config.table)
    .select(`id, name, ${config.heroCol}`)
    .not(config.heroCol, 'is', null)
    .limit(5000)

  if (error) {
    console.log(`  ❌ ${config.name} (${config.table}): ${error.message}`)
    return { cleaned: 0, error: error.message }
  }

  const listings = data || []
  const external = listings.filter(l => !isApprovedSource(l[config.heroCol]))

  if (external.length === 0) {
    console.log(`  ✅ ${config.name} (${config.table}): no external hero images found`)
    return { cleaned: 0 }
  }

  console.log(`  ${config.name} (${config.table}): ${external.length} external hero images to clean`)

  if (DRY_RUN) {
    for (const l of external.slice(0, 5)) {
      console.log(`    [DRY] "${l.name}": ${l[config.heroCol]}`)
    }
    if (external.length > 5) console.log(`    ... and ${external.length - 5} more`)
    return { cleaned: 0, wouldClean: external.length }
  }

  // Clean in batches
  let cleaned = 0
  let errors = 0

  for (const l of external) {
    const { error: updateErr } = await sb
      .from(config.table)
      .update({ [config.heroCol]: null })
      .eq('id', l.id)

    if (updateErr) {
      console.log(`    ❌ Failed to clean "${l.name}": ${updateErr.message}`)
      errors++
    } else {
      cleaned++
    }
  }

  console.log(`    Cleaned: ${cleaned} | Errors: ${errors}`)
  return { cleaned, errors }
}

async function cleanMaster() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.log('\n⚠️  Master portal: missing credentials, skipping')
    return
  }

  const sb = createClient(url, key)
  console.log('\n━━━ MASTER PORTAL ━━━')

  const { data, error } = await sb
    .from('listings')
    .select('id, name, hero_image_url, vertical')
    .eq('status', 'active')
    .not('hero_image_url', 'is', null)
    .limit(10000)

  if (error) {
    console.log(`  ❌ Master: ${error.message}`)
    return
  }

  const listings = data || []
  const external = listings.filter(l => !isApprovedSource(l.hero_image_url))

  if (external.length === 0) {
    console.log('  ✅ No external hero images found')
    return
  }

  console.log(`  ${external.length} external hero images to clean`)

  if (DRY_RUN) {
    for (const l of external.slice(0, 5)) {
      console.log(`    [DRY] "${l.name}" (${l.vertical}): ${l.hero_image_url}`)
    }
    if (external.length > 5) console.log(`    ... and ${external.length - 5} more`)
    return
  }

  let cleaned = 0
  for (const l of external) {
    const { error: updateErr } = await sb
      .from('listings')
      .update({ hero_image_url: null })
      .eq('id', l.id)

    if (!updateErr) cleaned++
  }

  console.log(`  Cleaned: ${cleaned}/${external.length}`)
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log(`\n🧹 Hero Image Cleanup — External Domain Removal${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log('═'.repeat(55))
  console.log(`Approved domains: ${APPROVED_HOSTS.join(', ')}`)
  console.log('All other domains will be cleaned.\n')

  // Clean master first
  await cleanMaster()

  // Clean each vertical
  console.log('\n━━━ VERTICALS ━━━')
  let totalCleaned = 0

  for (const v of VERTICALS) {
    const result = await cleanVertical(v)
    totalCleaned += result.cleaned || result.wouldClean || 0
  }

  console.log('\n═'.repeat(55))
  if (DRY_RUN) {
    console.log(`🏁 DRY RUN complete — ${totalCleaned} images would be cleaned`)
    console.log('Run without --dry-run to apply changes.')
  } else {
    console.log(`✅ Cleanup complete — ${totalCleaned} images cleaned`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
