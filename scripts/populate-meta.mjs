#!/usr/bin/env node
/**
 * Populate extension meta tables in the master DB.
 * Reads listings from the master DB, fetches source data from vertical DBs,
 * and upserts the meta records.
 *
 * Usage: node --env-file=.env.local scripts/populate-meta.mjs
 */

import { createClient } from '@supabase/supabase-js'

const master = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Vertical configs
const VERTICALS = {
  sba: {
    url: process.env.SBA_SUPABASE_URL,
    key: process.env.SBA_SUPABASE_SERVICE_KEY,
    table: 'venues',
    metaTable: 'sba_meta',
    typeFilter: ['winery', 'distillery', 'brewery', 'cidery', 'non_alcoholic', 'meadery', 'sake_brewery', 'cellar_door', 'sour_brewery'],
    mapMeta: (row) => ({
      producer_type: row.type,
      subtype: row.subtype || null,
    }),
  },
  collection: {
    url: process.env.COLLECTION_SUPABASE_URL,
    key: process.env.COLLECTION_SUPABASE_SERVICE_KEY,
    table: 'venues',
    typeFilter: ['archive', 'cultural_centre', 'gallery', 'botanical_garden', 'heritage_site', 'museum'],
    metaTable: 'collection_meta',
    mapMeta: (row) => ({
      institution_type: row.type,
      subtype: row.subtype || null,
    }),
  },
  craft: {
    url: process.env.CRAFT_SUPABASE_URL,
    key: process.env.CRAFT_SUPABASE_SERVICE_KEY,
    table: 'venues',
    metaTable: 'craft_meta',
    mapMeta: (row) => ({
      discipline: row.category,
    }),
  },
  fine_grounds: {
    url: process.env.FINE_GROUNDS_SUPABASE_URL,
    key: process.env.FINE_GROUNDS_SUPABASE_SERVICE_KEY,
    tables: ['roasters', 'cafes'],
    metaTable: 'fine_grounds_meta',
    // handled specially below
  },
  rest: {
    url: process.env.REST_SUPABASE_URL,
    key: process.env.REST_SUPABASE_SERVICE_KEY,
    table: 'properties',
    metaTable: 'rest_meta',
    mapMeta: (row) => ({
      accommodation_type: row.property_type || row.type,
    }),
  },
  field: {
    url: process.env.FIELD_SUPABASE_URL,
    key: process.env.FIELD_SUPABASE_SERVICE_KEY,
    table: 'places',
    metaTable: 'field_meta',
    mapMeta: (row) => ({
      feature_type: row.place_type || row.type,
    }),
  },
  corner: {
    url: process.env.CORNER_SUPABASE_URL,
    key: process.env.CORNER_SUPABASE_SERVICE_KEY,
    table: 'shops',
    metaTable: 'corner_meta',
    mapMeta: (row) => ({
      shop_type: row.category,
    }),
  },
  found: {
    url: process.env.FOUND_SUPABASE_URL,
    key: process.env.FOUND_SUPABASE_SERVICE_KEY,
    table: 'shops',
    metaTable: 'found_meta',
    mapMeta: (row) => ({
      shop_type: row.category,
    }),
  },
  table: {
    url: process.env.TABLE_SUPABASE_URL,
    key: process.env.TABLE_SUPABASE_SERVICE_KEY,
    table: 'listings',
    metaTable: 'table_meta',
    mapMeta: (row) => ({
      food_type: row.category,
    }),
  },
}

async function fetchAllRows(client, table, filter) {
  let all = []
  let page = 0
  const PAGE = 1000
  while (true) {
    let query = client.from(table).select('*').range(page * PAGE, (page + 1) * PAGE - 1)
    if (filter) query = query.in('type', filter)
    const { data, error } = await query
    if (error) { console.error(`  fetch error ${table}:`, error.message); break }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    page++
  }
  return all
}

async function processVertical(vertical) {
  const config = VERTICALS[vertical]
  console.log(`\n[${vertical}] Starting...`)

  const source = createClient(config.url, config.key)

  // Get all master listings for this vertical (paginated)
  let masterListings = []
  let mPage = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await master
      .from('listings')
      .select('id, source_id')
      .eq('vertical', vertical)
      .eq('status', 'active')
      .range(mPage * PAGE, (mPage + 1) * PAGE - 1)
    if (error) { console.error(`  master listings fetch error:`, error.message); break }
    if (!data || data.length === 0) break
    masterListings = masterListings.concat(data)
    if (data.length < PAGE) break
    mPage++
  }

  if (masterListings.length === 0) {
    console.log(`  No master listings found for ${vertical}`)
    return 0
  }

  const masterMap = {} // source_id → master listing id
  masterListings.forEach(l => { masterMap[l.source_id] = l.id })
  console.log(`  ${masterListings.length} master listings`)

  // Handle Fine Grounds specially (two tables)
  if (vertical === 'fine_grounds') {
    let count = 0
    // Roasters
    const roasters = await fetchAllRows(source, 'roasters')
    for (const row of roasters) {
      const sourceId = `roaster_${row.id}`
      const listingId = masterMap[sourceId]
      if (!listingId) continue
      const { error } = await master.from(config.metaTable).upsert({
        listing_id: listingId,
        entity_type: 'roaster',
        is_roaster: true,
        is_cafe: false,
      }, { onConflict: 'listing_id' })
      if (!error) count++
    }
    // Cafes
    const cafes = await fetchAllRows(source, 'cafes')
    for (const row of cafes) {
      const sourceId = `cafe_${row.id}`
      const listingId = masterMap[sourceId]
      if (!listingId) continue
      const { error } = await master.from(config.metaTable).upsert({
        listing_id: listingId,
        entity_type: 'cafe',
        is_roaster: false,
        is_cafe: true,
      }, { onConflict: 'listing_id' })
      if (!error) count++
    }
    console.log(`  ${count} meta records upserted`)
    return count
  }

  // Standard verticals
  const sourceRows = await fetchAllRows(source, config.table, config.typeFilter)
  console.log(`  ${sourceRows.length} source rows fetched`)

  let count = 0
  let errors = 0
  for (const row of sourceRows) {
    const sourceId = String(row.id)
    const listingId = masterMap[sourceId]
    if (!listingId) continue

    const metaData = config.mapMeta(row)
    const { error } = await master.from(config.metaTable).upsert({
      listing_id: listingId,
      ...metaData,
    }, { onConflict: 'listing_id' })

    if (error) {
      errors++
      if (errors <= 3) console.error(`  meta upsert error for ${row.name}:`, error.message)
    } else {
      count++
    }
  }

  console.log(`  ${count} meta records upserted, ${errors} errors`)
  return count
}

async function main() {
  console.log('=== Populating extension meta tables ===')
  let total = 0
  for (const vertical of Object.keys(VERTICALS)) {
    total += await processVertical(vertical)
  }
  console.log(`\n=== Done: ${total} total meta records ===`)
}

main().catch(console.error)
