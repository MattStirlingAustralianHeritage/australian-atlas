#!/usr/bin/env node
/**
 * First sync — run directly to populate the master DB.
 * Usage: node scripts/first-sync.mjs
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!MASTER_URL || !MASTER_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const master = createClient(MASTER_URL, MASTER_KEY)

const VERTICALS = {
  sba: {
    url: process.env.SBA_SUPABASE_URL,
    key: process.env.SBA_SUPABASE_SERVICE_KEY,
    table: 'venues',
    statusField: 'published',
    statusValue: true,
  },
  collection: {
    url: process.env.COLLECTION_SUPABASE_URL,
    key: process.env.COLLECTION_SUPABASE_SERVICE_KEY,
    table: 'venues',
    statusField: 'published',
    statusValue: true,
  },
  craft: {
    url: process.env.CRAFT_SUPABASE_URL,
    key: process.env.CRAFT_SUPABASE_SERVICE_KEY,
    table: 'venues',
    statusField: 'published',
    statusValue: true,
  },
  rest: {
    url: process.env.REST_SUPABASE_URL,
    key: process.env.REST_SUPABASE_SERVICE_KEY,
    table: 'properties',
    statusField: 'status',
    statusValue: 'published',
  },
  field: {
    url: process.env.FIELD_SUPABASE_URL,
    key: process.env.FIELD_SUPABASE_SERVICE_KEY,
    table: 'places',
    statusField: 'published',
    statusValue: true,
  },
  corner: {
    url: process.env.CORNER_SUPABASE_URL,
    key: process.env.CORNER_SUPABASE_SERVICE_KEY,
    table: 'shops',
    statusField: 'published',
    statusValue: true,
  },
  found: {
    url: process.env.FOUND_SUPABASE_URL,
    key: process.env.FOUND_SUPABASE_SERVICE_KEY,
    table: 'shops',
    statusField: 'published',
    statusValue: true,
  },
  table: {
    url: process.env.TABLE_SUPABASE_URL,
    key: process.env.TABLE_SUPABASE_SERVICE_KEY,
    table: 'listings',
    statusField: 'published',
    statusValue: true,
  },
}

function mapRow(vertical, row) {
  // Normalize common fields across all verticals
  const name = row.name || row.title || 'Untitled'
  const slug = row.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const source_id = String(row.id)
  const description = row.description || row.story || row.tagline || ''
  const region = row.region || row.sub_region || null
  const state = row.state || null
  const lat = row.lat || row.latitude || null
  const lng = row.lng || row.longitude || null
  const website = row.website || row.website_url || null
  const phone = row.phone || null
  const address = row.address || null
  const hero_image_url = row.hero_image_url || row.image_url || null
  const is_claimed = row.claimed || row.is_claimed || false
  const is_featured = row.featured || row.is_featured || (row.listing_tier === 'premium') || false

  return {
    source_id, name, slug, description, region, state,
    lat, lng, website, phone, address, hero_image_url,
    is_claimed, is_featured, status: 'active',
  }
}

async function syncVertical(vertical) {
  const config = VERTICALS[vertical]
  if (!config.url || !config.key) {
    console.log(`  [${vertical}] SKIP — missing env vars`)
    return 0
  }

  const source = createClient(config.url, config.key)

  // Fetch all published rows (paginate for large tables)
  let allRows = []
  let from = 0
  const pageSize = 1000
  while (true) {
    let query = source.from(config.table).select('*').range(from, from + pageSize - 1)
    if (config.statusField === 'published') {
      query = query.eq('published', config.statusValue)
    } else if (config.statusField === 'status') {
      query = query.eq('status', config.statusValue)
    }
    const { data, error } = await query
    if (error) { console.error(`  [${vertical}] fetch error:`, error.message); break }
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }

  console.log(`  [${vertical}] fetched ${allRows.length} rows`)

  let synced = 0
  let errors = 0

  // Batch upsert in chunks of 50
  const chunks = []
  for (let i = 0; i < allRows.length; i += 50) {
    chunks.push(allRows.slice(i, i + 50))
  }

  for (const chunk of chunks) {
    const listings = chunk.map(row => ({
      vertical,
      ...mapRow(vertical, row),
      synced_at: new Date().toISOString(),
    }))

    const { data, error } = await master
      .from('listings')
      .upsert(listings, { onConflict: 'vertical,source_id' })
      .select('id')

    if (error) {
      console.error(`  [${vertical}] batch upsert error:`, error.message)
      errors += chunk.length
    } else {
      synced += (data?.length || 0)
    }
  }

  console.log(`  [${vertical}] synced: ${synced}, errors: ${errors}`)
  return synced
}

// Fine Grounds special case
async function syncFineGrounds() {
  const config = VERTICALS.rest // Using rest config as template
  const url = process.env.FINE_GROUNDS_SUPABASE_URL
  const key = process.env.FINE_GROUNDS_SUPABASE_SERVICE_KEY
  if (!url || !key) { console.log('  [fine_grounds] SKIP — missing env vars'); return 0 }

  const source = createClient(url, key)
  let synced = 0

  // Roasters
  const { data: roasters } = await source.from('roasters').select('*').eq('status', 'published')
  if (roasters) {
    const listings = roasters.map(row => ({
      vertical: 'fine_grounds',
      source_id: `roaster_${row.id}`,
      name: row.name || 'Untitled',
      slug: row.slug || row.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '',
      description: row.description || '',
      region: row.region || row.sub_region || null,
      state: row.state || null,
      lat: row.lat || row.latitude || null,
      lng: row.lng || row.longitude || null,
      website: row.website || null,
      phone: row.phone || null,
      address: row.address || null,
      hero_image_url: row.hero_image_url || null,
      is_featured: row.featured || row.listing_tier === 'premium' || false,
      status: 'active',
      synced_at: new Date().toISOString(),
    }))

    const { data, error } = await master
      .from('listings')
      .upsert(listings, { onConflict: 'vertical,source_id' })
      .select('id')
    if (!error) synced += (data?.length || 0)
    else console.error('  [fine_grounds] roasters error:', error.message)
    console.log(`  [fine_grounds] roasters: ${data?.length || 0}`)
  }

  // Cafes
  const { data: cafes } = await source.from('cafes').select('*').eq('status', 'published')
  if (cafes) {
    const listings = cafes.map(row => ({
      vertical: 'fine_grounds',
      source_id: `cafe_${row.id}`,
      name: row.name || 'Untitled',
      slug: row.slug || row.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '',
      description: row.description || '',
      region: row.region || row.sub_region || null,
      state: row.state || null,
      lat: row.lat || row.latitude || null,
      lng: row.lng || row.longitude || null,
      website: row.website || null,
      phone: row.phone || null,
      address: row.address || null,
      hero_image_url: row.hero_image_url || null,
      is_featured: row.featured || row.listing_tier === 'premium' || false,
      status: 'active',
      synced_at: new Date().toISOString(),
    }))

    const { data, error } = await master
      .from('listings')
      .upsert(listings, { onConflict: 'vertical,source_id' })
      .select('id')
    if (!error) synced += (data?.length || 0)
    else console.error('  [fine_grounds] cafes error:', error.message)
    console.log(`  [fine_grounds] cafes: ${data?.length || 0}`)
  }

  console.log(`  [fine_grounds] total synced: ${synced}`)
  return synced
}

// Run
async function main() {
  console.log('🔄 Starting first sync to master DB...\n')
  let total = 0

  for (const vertical of Object.keys(VERTICALS)) {
    total += await syncVertical(vertical)
  }
  total += await syncFineGrounds()

  // Update region counts
  const { count } = await master.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active')
  console.log(`\n✅ First sync complete! ${count || total} active listings in master DB`)
}

main().catch(console.error)
