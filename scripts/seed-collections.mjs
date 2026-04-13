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
    vertical: null,   // Cross-vertical: pull from multiple verticals
    crossVertical: true,
    targetVerticals: ['craft', 'found', 'corner', 'fine_grounds', 'collection'],
    region: null,
    state: 'NSW',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
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

  // ── Night 3 additions: 10 new cross-vertical collections ────────

  {
    title: "Adelaide's Creative Quarter",
    slug: 'adelaides-creative-quarter',
    description: 'From the studios of the West End to the cellar doors of the Hills, Adelaide\'s independent creative economy runs deeper than most cities twice its size. Makers, galleries, cafes, and shops that prove small cities do it better.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['craft', 'collection', 'corner', 'fine_grounds', 'table'],
    region: 'Adelaide',
    state: 'SA',
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 3,
  },
  {
    title: 'Brisbane Hidden Gems',
    slug: 'brisbane-hidden-gems',
    description: 'Beyond the South Bank crowds, Brisbane\'s independent scene is scattered across former industrial pockets and quiet suburban corners. Roasters in converted warehouses, vintage stores in heritage laneways, makers who open their studios on weekends.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['fine_grounds', 'craft', 'found', 'corner', 'table', 'collection'],
    region: 'Brisbane',
    state: 'QLD',
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 3,
  },
  {
    title: 'Perth Independents',
    slug: 'perth-independents',
    description: 'Perth\'s isolation has bred self-reliance. From Fremantle\'s port-side artisans to Leederville\'s specialty coffee, the west has built a fiercely independent scene that owes nothing to the eastern states.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['craft', 'fine_grounds', 'corner', 'found', 'sba', 'table'],
    region: null,
    state: 'WA',
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 3,
  },
  {
    title: 'The Makers Trail',
    slug: 'the-makers-trail',
    description: 'A nationwide survey of Australia\'s best studio spaces, workshop doors, and maker-owned retail. Ceramicists, woodworkers, glassblowers, and textile artists who open their practice to the public.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['craft', 'collection', 'corner', 'found'],
    region: null,
    state: null,
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 4,
  },
  {
    title: 'Weekend Food & Wine',
    slug: 'weekend-food-and-wine',
    description: 'The cellar doors, farm gates, and regional restaurants that justify a two-hour drive and an overnight stay. Independent producers and chefs working with what grows around them.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'table', 'rest', 'fine_grounds'],
    region: null,
    state: null,
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 4,
  },
  {
    title: 'Daylesford & Hepburn Springs',
    slug: 'daylesford-hepburn-springs',
    description: 'Victoria\'s spa country has become a quiet capital for independent makers, producers, and operators. The mineral springs are the draw, but the community of creators is the reason people stay.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'craft', 'fine_grounds', 'rest', 'table', 'corner'],
    region: 'Daylesford',
    state: 'VIC',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Blue Mountains Independents',
    slug: 'blue-mountains-independents',
    description: 'Two hours from Sydney and a world apart. The Blue Mountains\' villages are strung along the ridge like beads on a wire, each with its own character, its own makers, its own reasons to stop.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['craft', 'fine_grounds', 'corner', 'found', 'collection', 'table'],
    region: 'Blue Mountains',
    state: 'NSW',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Vintage & Found Across Australia',
    slug: 'vintage-and-found',
    description: 'The antique dealers, vintage curators, secondhand book shops, and found-object artists keeping the past in circulation. Places where the stock tells a story and nothing\'s mass-produced.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['found', 'corner', 'craft', 'collection'],
    region: null,
    state: null,
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 4,
  },
  {
    title: 'Sustainable & Ethical',
    slug: 'sustainable-and-ethical',
    description: 'Operators who have made sustainability a practice, not a marketing line. Zero-waste producers, regenerative farmers, ethical makers, and the shops that stock their work.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'craft', 'corner', 'field', 'table'],
    region: null,
    state: null,
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 3,
  },
  {
    title: 'Mornington Peninsula Circuit',
    slug: 'mornington-peninsula-circuit',
    description: 'A day-trip loop that takes in the peninsula\'s wineries, makers, cafes, galleries, and farm gates. Start at Dromana, wind through Red Hill, finish at Flinders. Every stop independent.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'craft', 'fine_grounds', 'table', 'collection', 'rest'],
    region: 'Mornington',
    state: 'VIC',
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 3,
  },
]

// ── Cross-vertical validation ────────────────────────────────────

const MAX_VERTICAL_PERCENT = 0.40
const MIN_VERTICALS = 3

function validateVerticalDiversity(listings) {
  if (listings.length < MIN_VERTICALS) return { pass: true, issues: [] }

  const verticalCounts = {}
  for (const l of listings) {
    const v = l.vertical || 'unknown'
    verticalCounts[v] = (verticalCounts[v] || 0) + 1
  }

  const uniqueVerticals = Object.keys(verticalCounts).length
  const issues = []

  for (const [vert, count] of Object.entries(verticalCounts)) {
    const pct = count / listings.length
    if (pct > MAX_VERTICAL_PERCENT) {
      issues.push(`${vert} is ${(pct * 100).toFixed(0)}% (${count}/${listings.length})`)
    }
  }

  if (uniqueVerticals < MIN_VERTICALS) {
    issues.push(`Only ${uniqueVerticals} vertical(s) — need at least ${MIN_VERTICALS}`)
  }

  return { pass: issues.length === 0, issues, verticalCounts }
}

// ── Fetch listings for a collection ──────────────────────────────

async function fetchListingIds(collection) {
  // Cross-vertical collection: fetch from multiple verticals and enforce diversity
  if (collection.crossVertical && collection.targetVerticals) {
    return fetchCrossVerticalListings(collection)
  }

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

async function fetchCrossVerticalListings(collection) {
  const targetVerticals = collection.targetVerticals
  const maxPerVertical = collection.maxPerVertical || 3
  const totalLimit = collection.limit || 10

  console.log(`  Cross-vertical fetch: ${targetVerticals.join(', ')} (max ${maxPerVertical} per vertical)`)

  // Fetch top listings from each vertical
  const byVertical = {}

  for (const vert of targetVerticals) {
    let query = sb
      .from('listings')
      .select('id, name, vertical, region, state, quality_score')
      .eq('status', 'active')
      .eq('vertical', vert)

    if (collection.state) {
      query = query.eq('state', collection.state)
    }
    if (collection.region) {
      query = query.ilike('region', `%${collection.region}%`)
    }

    query = query
      .order('quality_score', { ascending: false, nullsFirst: false })
      .limit(maxPerVertical * 2) // Fetch extra so we have backup options

    const { data, error } = await query

    if (error) {
      console.error(`  ERROR querying ${vert}: ${error.message}`)
      continue
    }

    byVertical[vert] = data || []
    console.log(`    ${vert}: ${(data || []).length} candidates`)
  }

  // Round-robin selection: pick from each vertical in turn
  const selected = []
  const verticalUsed = {}
  let round = 0

  while (selected.length < totalLimit && round < 10) {
    let addedThisRound = false

    for (const vert of targetVerticals) {
      if (selected.length >= totalLimit) break
      const used = verticalUsed[vert] || 0
      if (used >= maxPerVertical) continue
      const available = byVertical[vert] || []
      if (used >= available.length) continue

      selected.push(available[used])
      verticalUsed[vert] = used + 1
      addedThisRound = true
    }

    if (!addedThisRound) break
    round++
  }

  // Validate diversity
  const validation = validateVerticalDiversity(selected)
  if (!validation.pass) {
    console.log(`  WARNING: Cross-vertical selection still not diverse enough:`)
    for (const issue of validation.issues) {
      console.log(`    - ${issue}`)
    }
  }

  return selected
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

  // Post-selection validation for cross-vertical collections
  const validation = validateVerticalDiversity(unique)
  if (!validation.pass) {
    console.log(`  Vertical diversity check FAILED:`)
    for (const issue of validation.issues) {
      console.log(`    - ${issue}`)
    }
    console.log(`  Breakdown: ${Object.entries(validation.verticalCounts).map(([v,c]) => `${v}:${c}`).join(', ')}`)
  } else if (unique.length >= MIN_VERTICALS) {
    console.log(`  Vertical diversity check PASSED`)
  }

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
