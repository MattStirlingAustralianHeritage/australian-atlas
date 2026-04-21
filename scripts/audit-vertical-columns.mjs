#!/usr/bin/env node
/**
 * Compare portal push payload columns against each vertical's actual table schema.
 * Identifies columns that the push sends but don't exist on the target table.
 *
 * Usage: node scripts/audit-vertical-columns.mjs
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const VERTICALS = {
  sba:          { url: process.env.SBA_SUPABASE_URL,          key: process.env.SBA_SUPABASE_SERVICE_KEY,          table: 'venues' },
  collection:   { url: process.env.COLLECTION_SUPABASE_URL,   key: process.env.COLLECTION_SUPABASE_SERVICE_KEY,   table: 'venues' },
  craft:        { url: process.env.CRAFT_SUPABASE_URL,        key: process.env.CRAFT_SUPABASE_SERVICE_KEY,        table: 'venues' },
  fine_grounds: { url: process.env.FINE_GROUNDS_SUPABASE_URL, key: process.env.FINE_GROUNDS_SUPABASE_SERVICE_KEY, tables: ['roasters', 'cafes'] },
  rest:         { url: process.env.REST_SUPABASE_URL,         key: process.env.REST_SUPABASE_SERVICE_KEY,         table: 'properties' },
  field:        { url: process.env.FIELD_SUPABASE_URL,        key: process.env.FIELD_SUPABASE_SERVICE_KEY,        table: 'places' },
  corner:       { url: process.env.CORNER_SUPABASE_URL,       key: process.env.CORNER_SUPABASE_SERVICE_KEY,       table: 'shops' },
  found:        { url: process.env.FOUND_SUPABASE_URL,        key: process.env.FOUND_SUPABASE_SERVICE_KEY,        table: 'shops' },
  table:        { url: process.env.TABLE_SUPABASE_URL,        key: process.env.TABLE_SUPABASE_SERVICE_KEY,        table: 'listings' },
}

// Columns that mapToVerticalSchema sends per vertical (from pushToVertical.js)
const PUSH_COLUMNS = {
  sba: ['name', 'slug', 'description', 'state', 'phone', 'address', 'address_on_request', 'visitable', 'presence_type', 'hero_image_url', 'sub_region', 'suburb', 'postcode', 'latitude', 'longitude', 'website', 'opening_hours', 'type', 'listing_tier', 'status'],
  collection: ['name', 'slug', 'description', 'state', 'phone', 'address', 'address_on_request', 'visitable', 'presence_type', 'hero_image_url', 'opening_hours', 'sub_region', 'suburb', 'postcode', 'latitude', 'longitude', 'website', 'type', 'listing_tier', 'status'],
  craft: ['name', 'slug', 'description', 'state', 'phone', 'address', 'address_on_request', 'visitable', 'presence_type', 'hero_image_url', 'opening_hours', 'suburb', 'postcode', 'latitude', 'longitude', 'website', 'category', 'offers_classes', 'classes', 'published'],
  fine_grounds: ['name', 'slug', 'description', 'state', 'phone', 'address', 'address_on_request', 'visitable', 'presence_type', 'hero_image_url', 'email', 'opening_hours', 'sub_region', 'latitude', 'longitude', 'website', 'status', 'needs_review'],
  rest: ['name', 'slug', 'description', 'state', 'phone', 'address', 'address_on_request', 'visitable', 'presence_type', 'hero_image_url', 'email', 'opening_hours', 'sub_region', 'postcode', 'latitude', 'longitude', 'website', 'type', 'listing_tier', 'status'],
  field: ['name', 'slug', 'description', 'state', 'address', 'address_on_request', 'visitable', 'presence_type', 'hero_image_url', 'region', 'suburb', 'postcode', 'latitude', 'longitude', 'place_type', 'published'],
  corner: ['name', 'slug', 'description', 'state', 'address', 'address_on_request', 'visitable', 'presence_type', 'email', 'opening_hours', 'suburb', 'lat', 'lng', 'website_url', 'category', 'published'],
  found: ['name', 'slug', 'description', 'state', 'phone', 'address', 'address_on_request', 'visitable', 'presence_type', 'hero_image_url', 'email', 'opening_hours', 'suburb', 'lat', 'lng', 'website', 'category', 'published'],
  table: ['name', 'slug', 'description', 'state', 'phone', 'address', 'address_on_request', 'visitable', 'presence_type', 'hero_image_url', 'email', 'opening_hours', 'suburb', 'lat', 'lng', 'website', 'category', 'published'],
}

async function getTableColumns(client, tableName) {
  // Use a dummy select to inspect columns via error-free approach:
  // Fetch 1 row, get the keys. If empty table, insert+rollback won't work,
  // so fall back to information_schema via RPC.
  const { data, error } = await client.from(tableName).select('*').limit(1)
  if (error) return { columns: null, error: error.message }
  if (data && data.length > 0) {
    return { columns: Object.keys(data[0]), error: null }
  }
  // Empty table — try information_schema via rpc or raw SQL
  // Supabase doesn't expose information_schema directly, but we can try
  // inserting an empty object to get column list from error
  return { columns: null, error: 'empty_table_no_rows' }
}

async function main() {
  console.log('\n=== Vertical Column Audit ===\n')

  for (const [vertical, cfg] of Object.entries(VERTICALS)) {
    if (!cfg.url || !cfg.key) {
      console.log(`[${vertical}] SKIP — no credentials\n`)
      continue
    }

    const client = createClient(cfg.url, cfg.key)
    const tables = cfg.tables || [cfg.table]

    for (const table of tables) {
      const { columns, error } = await getTableColumns(client, table)

      if (error || !columns) {
        console.log(`[${vertical}] ${table}: ERROR getting columns — ${error}`)
        continue
      }

      const pushCols = PUSH_COLUMNS[vertical] || []
      const missing = pushCols.filter(c => !columns.includes(c))
      const extra = columns.filter(c => !pushCols.includes(c))

      console.log(`[${vertical}] ${table} (${columns.length} columns)`)

      if (missing.length > 0) {
        console.log(`  MISSING from vertical (push will CRASH):`)
        for (const m of missing) console.log(`    - ${m}`)
      } else {
        console.log(`  All push columns exist ✓`)
      }

      if (extra.length > 0) {
        console.log(`  Extra on vertical (not pushed, OK):`)
        for (const e of extra) console.log(`    + ${e}`)
      }
      console.log()
    }
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
