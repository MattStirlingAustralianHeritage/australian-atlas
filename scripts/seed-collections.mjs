#!/usr/bin/env node

/**
 * Seed example collections into Australian Atlas.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-collections.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 *
 * For each collection, the script queries the listings table to find
 * real venues matching the collection's theme (vertical + region/state),
 * ordered by quality_score, and inserts the collection with their IDs.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(supabaseUrl, supabaseKey)

// ── Collection definitions ───────────────────────────────────────

const COLLECTIONS = [
  {
    title: "Melbourne's Best Coffee",
    slug: 'melbournes-best-coffee',
    description: 'The roasters and cafes that define Melbourne\'s specialty coffee culture. Independent operators, single-origin obsessives, and neighbourhood institutions that have earned their reputation one cup at a time.',
    vertical: 'fine_grounds',
    region: 'Melbourne',
    state: 'VIC',
    author: 'Australian Atlas Editorial',
    limit: 12,
  },
  {
    title: 'Barossa Wine Trail',
    slug: 'barossa-wine-trail',
    description: 'Small-batch winemakers, family-owned cellar doors, and sixth-generation vineyards in Australia\'s most storied wine region. Skip the bus tours — this is the Barossa the locals know.',
    vertical: 'sba',
    region: 'Barossa',
    state: 'SA',
    author: 'Australian Atlas Editorial',
    limit: 10,
  },
  {
    title: 'Sydney Makers',
    slug: 'sydney-makers',
    description: 'Ceramicists, jewellers, textile artists, and woodworkers keeping craft alive in Sydney. Studio doors that open to the public, makers\' markets worth crossing the city for, and workshops where you can see the work being made.',
    vertical: 'craft',
    region: null,
    state: 'NSW',
    author: 'Australian Atlas Editorial',
    limit: 10,
  },
  {
    title: 'Tasmanian Treasures',
    slug: 'tasmanian-treasures',
    description: 'The island state punches well above its weight. Distilleries, galleries, farm gates, makers, and wild places — a cross-vertical survey of what makes Tasmania one of Australia\'s most concentrated independent scenes.',
    vertical: null,
    region: null,
    state: 'TAS',
    author: 'Australian Atlas Editorial',
    limit: 12,
  },
  {
    title: 'Byron Bay Independents',
    slug: 'byron-bay-independents',
    description: 'Beyond the tourist strip, Byron and its hinterland harbour a network of independent operators who have built something quieter and more lasting. Coffee, craft, food, nature, and the shops in between.',
    vertical: null,
    region: 'Byron',
    state: 'NSW',
    author: 'Australian Atlas Editorial',
    limit: 10,
  },
]

// ── Fetch listings for a collection ──────────────────────────────

async function fetchListingIds(collection) {
  let query = sb
    .from('listings')
    .select('id, name, vertical, region, state, quality_score')
    .eq('status', 'active')

  // Vertical filter
  if (collection.vertical) {
    query = query.eq('vertical', collection.vertical)
  }

  // State filter
  if (collection.state) {
    query = query.eq('state', collection.state)
  }

  // Region filter (partial match)
  if (collection.region) {
    query = query.ilike('region', `%${collection.region}%`)
  }

  query = query
    .order('quality_score', { ascending: false, nullsFirst: false })
    .limit(collection.limit || 10)

  const { data, error } = await query

  if (error) {
    console.error(`  ERROR querying listings: ${error.message}`)
    return []
  }

  return data || []
}

// ── Seed one collection ──────────────────────────────────────────

async function seedCollection(def) {
  console.log(`\n--- ${def.title} ---`)

  const listings = await fetchListingIds(def)
  console.log(`  Found ${listings.length} listings`)

  if (listings.length === 0) {
    // Fallback: broaden search to just state without region
    if (def.region && def.state) {
      console.log(`  Broadening search to state=${def.state} without region filter...`)
      const fallback = await fetchListingIds({
        ...def,
        region: null,
      })
      console.log(`  Found ${fallback.length} listings (broadened)`)
      if (fallback.length === 0) {
        console.log('  WARNING: No listings found. Skipping.')
        return
      }
      listings.push(...fallback)
    } else {
      console.log('  WARNING: No listings found. Skipping.')
      return
    }
  }

  // Deduplicate
  const seen = new Set()
  const unique = listings.filter(l => {
    if (seen.has(l.id)) return false
    seen.add(l.id)
    return true
  })

  const listingIds = unique.map(l => l.id)

  console.log(`  Using ${listingIds.length} listing IDs`)
  unique.forEach((l, i) => console.log(`    ${i + 1}. ${l.name} (${l.vertical}, ${l.region || l.state}, qs=${l.quality_score ?? 'null'})`))

  // Check if collection already exists
  const { data: existing } = await sb
    .from('collections')
    .select('id')
    .eq('slug', def.slug)
    .single()

  if (existing) {
    console.log('  Collection already exists. Deleting and re-creating...')
    await sb.from('collections').delete().eq('id', existing.id)
  }

  const row = {
    title: def.title,
    slug: def.slug,
    description: def.description,
    author: def.author,
    vertical: def.vertical || null,
    region: def.region || null,
    listing_ids: listingIds,
    published: true,
    published_at: new Date().toISOString(),
  }

  const { data: inserted, error } = await sb
    .from('collections')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error(`  ERROR inserting collection: ${error.message}`)
    return
  }

  console.log(`  Inserted collection: id=${inserted.id}, slug=${inserted.slug}`)
}

// ── Run ──────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding collections...')
  console.log(`Supabase: ${supabaseUrl}`)

  for (const def of COLLECTIONS) {
    await seedCollection(def)
  }

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
