#!/usr/bin/env node
/**
 * Audit hero images across ALL vertical Supabase projects.
 *
 * Reports:
 *   - Total unclaimed listings with non-null hero_image per vertical
 *   - How many point to external domains (not Supabase Storage / GCS)
 *   - Top external domains by frequency
 *   - Sample URLs for manual inspection
 *
 * Usage:
 *   node --env-file=.env.local scripts/audit-hero-images.mjs
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

// ─── Approved domains whitelist ─────────────────────────────
const APPROVED_HOSTS = ['supabase.co', 'storage.googleapis.com']

function isApprovedSource(url) {
  if (!url) return true // null = no image = OK
  try {
    const hostname = new URL(url).hostname
    return APPROVED_HOSTS.some(h => hostname.endsWith(h))
  } catch {
    return false
  }
}

function getDomain(url) {
  try { return new URL(url).hostname } catch { return 'invalid-url' }
}

// ─── Vertical configs ───────────────────────────────────────
const VERTICALS = [
  {
    name: 'Rest Atlas',
    key: 'rest',
    url: process.env.REST_SUPABASE_URL || process.env.NEXT_PUBLIC_REST_SUPABASE_URL,
    serviceKey: process.env.REST_SUPABASE_SERVICE_KEY || process.env.REST_SERVICE_ROLE_KEY,
    table: 'properties',
    heroCol: 'hero_image_url',
    claimedCheck: 'vendor_profiles', // Join table
    statusFilter: { col: 'status', val: 'published' },
  },
  {
    name: 'Small Batch Atlas',
    key: 'sba',
    url: process.env.SBA_SUPABASE_URL || process.env.NEXT_PUBLIC_SBA_SUPABASE_URL,
    serviceKey: process.env.SBA_SUPABASE_SERVICE_KEY || process.env.SBA_SERVICE_ROLE_KEY,
    table: 'venues',
    heroCol: 'hero_image_url',
    statusFilter: null, // No status column — all rows are published
  },
  {
    name: 'Collection Atlas',
    key: 'collection',
    url: process.env.COLLECTION_SUPABASE_URL || process.env.NEXT_PUBLIC_COLLECTION_SUPABASE_URL,
    serviceKey: process.env.COLLECTION_SUPABASE_SERVICE_KEY || process.env.COLLECTION_SERVICE_ROLE_KEY,
    table: 'venues',
    heroCol: 'hero_image_url',
    statusFilter: null,
  },
  {
    name: 'Craft Atlas',
    key: 'craft',
    url: process.env.CRAFT_SUPABASE_URL || process.env.NEXT_PUBLIC_CRAFT_SUPABASE_URL,
    serviceKey: process.env.CRAFT_SUPABASE_SERVICE_KEY || process.env.CRAFT_SERVICE_ROLE_KEY,
    table: 'venues',
    heroCol: 'hero_image_url',
    statusFilter: { col: 'published', val: true },
  },
  {
    name: 'Fine Grounds Atlas',
    key: 'fine_grounds',
    url: process.env.FINE_GROUNDS_SUPABASE_URL || process.env.NEXT_PUBLIC_FINE_GROUNDS_SUPABASE_URL,
    serviceKey: process.env.FINE_GROUNDS_SUPABASE_SERVICE_KEY || process.env.FINE_GROUNDS_SERVICE_ROLE_KEY,
    table: 'cafes',
    heroCol: 'hero_image_url',
    statusFilter: null,
    extra_tables: ['roasters'],
  },
  {
    name: 'Field Atlas',
    key: 'field',
    url: process.env.FIELD_SUPABASE_URL || process.env.NEXT_PUBLIC_FIELD_SUPABASE_URL,
    serviceKey: process.env.FIELD_SUPABASE_SERVICE_KEY || process.env.FIELD_SERVICE_ROLE_KEY,
    table: 'places',
    heroCol: 'hero_image_url',
    statusFilter: { col: 'published', val: true },
  },
  {
    name: 'Corner Atlas',
    key: 'corner',
    url: process.env.CORNER_SUPABASE_URL || process.env.NEXT_PUBLIC_CORNER_SUPABASE_URL,
    serviceKey: process.env.CORNER_SUPABASE_SERVICE_KEY || process.env.CORNER_SERVICE_ROLE_KEY,
    table: 'shops',
    heroCol: 'hero_image_url',
    statusFilter: { col: 'published', val: true },
  },
  {
    name: 'Found Atlas',
    key: 'found',
    url: process.env.FOUND_SUPABASE_URL || process.env.NEXT_PUBLIC_FOUND_SUPABASE_URL,
    serviceKey: process.env.FOUND_SUPABASE_SERVICE_KEY || process.env.FOUND_SERVICE_ROLE_KEY,
    table: 'shops',
    heroCol: 'hero_image_url',
    statusFilter: { col: 'published', val: true },
  },
  {
    name: 'Table Atlas',
    key: 'table',
    url: process.env.TABLE_SUPABASE_URL || process.env.NEXT_PUBLIC_TABLE_SUPABASE_URL,
    serviceKey: process.env.TABLE_SUPABASE_SERVICE_KEY || process.env.TABLE_SERVICE_ROLE_KEY,
    table: 'listings',
    heroCol: 'hero_image_url',
    statusFilter: { col: 'published', val: true },
  },
]

// ─── Master portal audit ────────────────────────────────────
async function auditMaster() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.log('\n⚠️  Master portal: missing credentials, skipping')
    return
  }

  const sb = createClient(url, key)
  console.log('\n━━━ MASTER PORTAL (listings table) ━━━')

  const { data: all, count: totalCount } = await sb
    .from('listings')
    .select('hero_image_url, is_claimed, vertical, name', { count: 'exact' })
    .eq('status', 'active')
    .not('hero_image_url', 'is', null)
    .limit(10000)

  const listings = all || []
  const withHero = listings.length
  const externalHero = listings.filter(l => !isApprovedSource(l.hero_image_url))
  const unclaimedExternal = externalHero.filter(l => !l.is_claimed)

  console.log(`  Total active listings with hero_image: ${withHero}`)
  console.log(`  External domain hero_image:            ${externalHero.length}`)
  console.log(`  Unclaimed + external hero:             ${unclaimedExternal.length}`)

  // Domain breakdown
  const domains = {}
  for (const l of externalHero) {
    const d = getDomain(l.hero_image_url)
    domains[d] = (domains[d] || 0) + 1
  }
  if (Object.keys(domains).length > 0) {
    console.log('  Top external domains:')
    for (const [d, c] of Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`    ${d}: ${c}`)
    }
  }

  // Per-vertical breakdown
  const byVertical = {}
  for (const l of externalHero) {
    byVertical[l.vertical] = (byVertical[l.vertical] || 0) + 1
  }
  if (Object.keys(byVertical).length > 0) {
    console.log('  By vertical:')
    for (const [v, c] of Object.entries(byVertical).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${v}: ${c}`)
    }
  }

  // Samples
  if (unclaimedExternal.length > 0) {
    console.log('  Sample unclaimed + external hero images:')
    for (const l of unclaimedExternal.slice(0, 5)) {
      console.log(`    "${l.name}" (${l.vertical}): ${l.hero_image_url}`)
    }
  }
}

// ─── Vertical audit ─────────────────────────────────────────
async function auditVertical(config) {
  if (!config.url || !config.serviceKey) {
    console.log(`\n⚠️  ${config.name}: missing credentials, skipping`)
    return
  }

  const sb = createClient(config.url, config.serviceKey)
  console.log(`\n━━━ ${config.name.toUpperCase()} (${config.table}) ━━━`)

  const tables = [config.table, ...(config.extra_tables || [])]

  for (const table of tables) {
    let query = sb.from(table).select(`id, name, ${config.heroCol}`, { count: 'exact' }).not(config.heroCol, 'is', null)

    if (config.statusFilter) {
      query = query.eq(config.statusFilter.col, config.statusFilter.val)
    }

    const { data, count, error } = await query.limit(5000)

    if (error) {
      console.log(`  ❌ ${table}: ${error.message}`)
      continue
    }

    const listings = data || []
    const external = listings.filter(l => !isApprovedSource(l[config.heroCol]))

    console.log(`  ${table}: ${listings.length} with hero_image | ${external.length} external domain`)

    // Domain breakdown for external
    const domains = {}
    for (const l of external) {
      const d = getDomain(l[config.heroCol])
      domains[d] = (domains[d] || 0) + 1
    }
    if (Object.keys(domains).length > 0) {
      console.log(`  Top external domains:`)
      for (const [d, c] of Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
        console.log(`    ${d}: ${c}`)
      }
    }

    // Samples
    if (external.length > 0) {
      console.log(`  Samples:`)
      for (const l of external.slice(0, 3)) {
        console.log(`    "${l.name}": ${l[config.heroCol]}`)
      }
    }
  }
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log('🔍 Hero Image Audit — All Atlas Verticals')
  console.log('═'.repeat(50))
  console.log(`Approved domains: ${APPROVED_HOSTS.join(', ')}`)

  await auditMaster()

  for (const v of VERTICALS) {
    await auditVertical(v)
  }

  console.log('\n═'.repeat(50))
  console.log('✅ Audit complete')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
