#!/usr/bin/env node
/**
 * Re-push ALL failed vertical listings across every vertical.
 * Fixes candidate- source_ids left behind by pushToVertical failures.
 *
 * Uses upsert (on slug conflict) and column stripping for resilience.
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

const VERTICALS = {
  sba: {
    env: ['SBA_SUPABASE_URL', 'SBA_SUPABASE_SERVICE_KEY'],
    table: 'venues',
    categories: ['brewery', 'winery', 'distillery', 'cidery', 'meadery', 'cellar_door', 'sour_brewery', 'non_alcoholic'],
    defaultCat: 'winery',
    metaTable: 'sba_meta', metaKey: 'producer_type',
    mapRow: (l, cat) => ({
      name: l.name, slug: l.slug, description: l.description || null, state: l.state || null,
      phone: l.phone || null, address: l.address || null, address_on_request: l.address_on_request || false,
      visitable: l.visitable ?? true, presence_type: l.presence_type || 'permanent',
      hero_image_url: l.hero_image_url || null,
      sub_region: l.region || null, suburb: l.suburb || l.region || null, postcode: l.postcode || null,
      latitude: l.lat, longitude: l.lng, website: l.website || null,
      opening_hours: l.hours || null, type: cat, listing_tier: 'basic', status: 'published',
    }),
  },
  collection: {
    env: ['COLLECTION_SUPABASE_URL', 'COLLECTION_SUPABASE_SERVICE_KEY'],
    table: 'venues',
    categories: ['museum', 'gallery', 'heritage_site', 'cultural_centre', 'botanical_garden', 'sculpture_park'],
    defaultCat: 'museum',
    metaTable: 'collection_meta', metaKey: 'institution_type',
    mapRow: (l, cat) => ({
      name: l.name, slug: l.slug, description: l.description || null, state: l.state || null,
      phone: l.phone || null, address: l.address || null, address_on_request: l.address_on_request || false,
      visitable: l.visitable ?? true, presence_type: l.presence_type || 'permanent',
      hero_image_url: l.hero_image_url || null,
      opening_hours: l.hours || null, sub_region: l.region || null,
      suburb: l.suburb || l.region || null, postcode: l.postcode || null,
      latitude: l.lat, longitude: l.lng, website: l.website || null,
      type: cat, listing_tier: 'basic', status: 'published',
    }),
  },
  craft: {
    env: ['CRAFT_SUPABASE_URL', 'CRAFT_SUPABASE_SERVICE_KEY'],
    table: 'venues',
    categories: ['ceramics_clay', 'visual_art', 'jewellery_metalwork', 'textile_fibre', 'wood_furniture', 'glass', 'printmaking'],
    defaultCat: 'ceramics_clay',
    metaTable: 'craft_meta', metaKey: 'discipline',
    mapRow: (l, cat) => ({
      name: l.name, slug: l.slug, description: l.description || null, state: l.state || null,
      phone: l.phone || null, address: l.address || null, address_on_request: l.address_on_request || false,
      visitable: l.visitable ?? true, presence_type: l.presence_type || 'permanent',
      hero_image_url: l.hero_image_url || null,
      opening_hours: l.hours || null, suburb: l.suburb || l.region || null,
      postcode: l.postcode || null, latitude: l.lat, longitude: l.lng,
      website: l.website || null, category: cat, offers_classes: false, classes: null, published: true,
    }),
  },
  fine_grounds: {
    env: ['FINE_GROUNDS_SUPABASE_URL', 'FINE_GROUNDS_SUPABASE_SERVICE_KEY'],
    categories: ['roaster', 'cafe'],
    defaultCat: 'roaster',
    metaTable: 'fine_grounds_meta', metaKey: 'entity_type',
    tableForCat: (cat) => cat === 'cafe' ? 'cafes' : 'roasters',
    mapRow: (l, cat) => ({
      name: l.name, slug: l.slug, description: l.description || null, state: l.state || null,
      phone: l.phone || null, address: l.address || null, address_on_request: l.address_on_request || false,
      visitable: l.visitable ?? true, presence_type: l.presence_type || 'permanent',
      hero_image_url: l.hero_image_url || null,
      email: null || null, opening_hours: l.hours || null,
      sub_region: l.region || null, latitude: l.lat, longitude: l.lng,
      website: l.website || null, status: 'published', needs_review: false,
    }),
  },
  rest: {
    env: ['REST_SUPABASE_URL', 'REST_SUPABASE_SERVICE_KEY'],
    table: 'properties',
    categories: ['boutique_hotel', 'guesthouse', 'bnb', 'farm_stay', 'glamping', 'cottage', 'self_contained', 'eco_resort'],
    defaultCat: 'boutique_hotel',
    metaTable: 'rest_meta', metaKey: 'accommodation_type',
    mapRow: (l, cat) => ({
      name: l.name, slug: l.slug, description: l.description || null, state: l.state || null,
      phone: l.phone || null, address: l.address || null, address_on_request: l.address_on_request || false,
      visitable: l.visitable ?? true, presence_type: l.presence_type || 'permanent',
      hero_image_url: l.hero_image_url || null,
      email: null || null, opening_hours: l.hours || null,
      sub_region: l.region || null, postcode: l.postcode || null,
      latitude: l.lat, longitude: l.lng, website: l.website || null,
      type: cat, listing_tier: 'free', status: 'published',
    }),
  },
  field: {
    env: ['FIELD_SUPABASE_URL', 'FIELD_SUPABASE_SERVICE_KEY'],
    table: 'places',
    categories: ['swimming_hole', 'waterfall', 'lookout', 'gorge', 'coastal_walk', 'hot_spring', 'cave', 'national_park', 'wildlife_zoo', 'bush_walk', 'botanic_garden', 'nature_reserve'],
    defaultCat: 'lookout',
    metaTable: 'field_meta', metaKey: 'feature_type',
    mapRow: (l, cat) => ({
      name: l.name, slug: l.slug, description: l.description || null, state: l.state || null,
      address: l.address || null, address_on_request: l.address_on_request || false,
      visitable: l.visitable ?? true, presence_type: l.presence_type || 'permanent',
      hero_image_url: l.hero_image_url || null,
      region: l.region || null, suburb: l.suburb || l.region || null,
      postcode: l.postcode || null, latitude: l.lat, longitude: l.lng,
      place_type: cat, published: true,
    }),
  },
  corner: {
    env: ['CORNER_SUPABASE_URL', 'CORNER_SUPABASE_SERVICE_KEY'],
    table: 'shops',
    categories: ['bookshop', 'records', 'homewares', 'stationery', 'jewellery', 'toys', 'general', 'clothing', 'food_drink', 'plants', 'other'],
    defaultCat: 'general',
    metaTable: 'corner_meta', metaKey: 'shop_type',
    mapRow: (l, cat) => ({
      name: l.name, slug: l.slug, description: l.description || null, state: l.state || null,
      address: l.address || null, address_on_request: l.address_on_request || false,
      visitable: l.visitable ?? true, presence_type: l.presence_type || 'permanent',
      email: null || null, opening_hours: l.hours || null,
      suburb: l.suburb || l.region || null, lat: l.lat, lng: l.lng,
      website_url: l.website || null, category: cat, published: true,
    }),
  },
  found: {
    env: ['FOUND_SUPABASE_URL', 'FOUND_SUPABASE_SERVICE_KEY'],
    table: 'shops',
    categories: ['vintage_clothing', 'vintage_furniture', 'vintage_store', 'antiques', 'op_shop', 'books_ephemera', 'art_objects', 'market'],
    defaultCat: 'vintage_clothing',
    metaTable: 'found_meta', metaKey: 'shop_type',
    mapRow: (l, cat) => ({
      name: l.name, slug: l.slug, description: l.description || null, state: l.state || null,
      phone: l.phone || null, address: l.address || null, address_on_request: l.address_on_request || false,
      visitable: l.visitable ?? true, presence_type: l.presence_type || 'permanent',
      hero_image_url: l.hero_image_url || null,
      email: null || null, opening_hours: l.hours || null,
      suburb: l.suburb || l.region || null, lat: l.lat, lng: l.lng,
      website: l.website || null, category: cat, published: true,
    }),
  },
  table: {
    env: ['TABLE_SUPABASE_URL', 'TABLE_SUPABASE_SERVICE_KEY'],
    table: 'listings',
    categories: ['restaurant', 'bakery', 'market', 'farm_gate', 'artisan_producer', 'specialty_retail', 'destination', 'cooking_school', 'providore', 'food_trail', 'cafe', 'creamery'],
    defaultCat: 'restaurant',
    metaTable: 'table_meta', metaKey: 'food_type',
    mapRow: (l, cat) => ({
      name: l.name, slug: l.slug, description: l.description || null, state: l.state || null,
      phone: l.phone || null, address: l.address || null, address_on_request: l.address_on_request || false,
      visitable: l.visitable ?? true, presence_type: l.presence_type || 'permanent',
      hero_image_url: l.hero_image_url || null,
      email: null || null, opening_hours: l.hours || null,
      suburb: l.suburb || l.region || null, lat: l.lat, lng: l.lng,
      website: l.website || null, category: cat, published: true,
    }),
  },
}

const _columnCache = new Map()

async function getTableColumns(client, url, table) {
  const cacheKey = `${url}:${table}`
  if (_columnCache.has(cacheKey)) return _columnCache.get(cacheKey)
  try {
    const { data } = await client.from(table).select('*').limit(1)
    if (data && data.length > 0) {
      const cols = Object.keys(data[0])
      _columnCache.set(cacheKey, cols)
      return cols
    }
  } catch {}
  return null
}

function stripUnknownColumns(payload, columns, vertical, table) {
  if (!columns) return payload
  const safe = {}
  let stripped = []
  for (const [key, value] of Object.entries(payload)) {
    if (columns.includes(key)) {
      safe[key] = value
    } else {
      stripped.push(key)
    }
  }
  if (stripped.length > 0) {
    console.log(`    Stripped: ${stripped.join(', ')}`)
  }
  return safe
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
      .select('id, name, slug, description, state, region, suburb, postcode, lat, lng, website, phone, address, hero_image_url, sub_type, sub_types, source_id, hours, address_on_request, visitable, presence_type')
      .eq('vertical', vertical)
      .like('source_id', 'candidate-%')

    if (error || !failed || failed.length === 0) {
      if (failed?.length === 0) console.log(`${vertical}: 0 failed — skip`)
      continue
    }

    console.log(`\n--- ${vertical} (${failed.length} failed) ---`)
    let ok = 0, fail = 0, skip = 0

    // Batch-fetch meta categories for this vertical
    const metaCats = {}
    if (config.metaTable) {
      const ids = failed.map(l => l.id)
      const { data: metaRows } = await sb
        .from(config.metaTable)
        .select(`listing_id, ${config.metaKey}`)
        .in('listing_id', ids)
      if (metaRows) {
        for (const m of metaRows) metaCats[m.listing_id] = m[config.metaKey]
      }
    }

    // Get target table columns for stripping
    const defaultTable = config.table || config.tableForCat?.(config.defaultCat) || 'venues'

    for (const l of failed) {
      const rawCat = metaCats[l.id]
        || (Array.isArray(l.sub_types) && l.sub_types.length > 0 ? l.sub_types[0] : null)
        || l.sub_type
      const cat = validateCat(config.categories, config.defaultCat, rawCat)

      const table = config.tableForCat ? config.tableForCat(cat) : config.table

      if (!l.lat || !l.lng) {
        console.log(`  [${l.name}] SKIP — no coordinates`)
        skip++; totalSkip++
        continue
      }

      console.log(`  [${l.name}] cat: ${cat} → ${table}`)

      if (!doPush) continue

      let row = config.mapRow(l, cat)

      // Strip columns that don't exist on the target table
      const columns = await getTableColumns(vertClient, url, table)
      row = stripUnknownColumns(row, columns, vertical, table)

      const { data: upserted, error: upsertErr } = await vertClient
        .from(table)
        .upsert(row, { onConflict: 'slug' })
        .select('id')
        .single()

      if (upsertErr) {
        console.log(`    ✗ ${upsertErr.message}`)
        fail++; totalFail++
        continue
      }

      const vid = String(upserted.id)
      const { error: upErr } = await sb.from('listings').update({ source_id: vid }).eq('id', l.id)
      console.log(`    ✓ → ${table}.id = ${vid}${upErr ? ' (source_id update failed)' : ''}`)
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
