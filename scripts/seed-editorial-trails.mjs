#!/usr/bin/env node

/**
 * Seed two editorial trails into Australian Atlas.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-editorial-trails.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 *
 * The script queries the listings table to find real venues for each trail,
 * then inserts the trails and their stops.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local', override: true })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(supabaseUrl, supabaseKey)

// ── Helper: search listings by region/name pattern ─────────────────
async function findListings(searchTerms, limit = 10) {
  const results = []

  for (const term of searchTerms) {
    // Try region match first
    let { data } = await sb
      .from('listings')
      .select('id, name, vertical, slug, lat, lng, region, state, hero_image_url')
      .eq('status', 'active')
      .or('address_on_request.eq.false,address_on_request.is.null')
      .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .ilike('region', `%${term}%`)
      .limit(limit)

    if (data && data.length > 0) {
      results.push(...data)
      continue
    }

    // Fallback: try name match
    const nameRes = await sb
      .from('listings')
      .select('id, name, vertical, slug, lat, lng, region, state, hero_image_url')
      .eq('status', 'active')
      .or('address_on_request.eq.false,address_on_request.is.null')
      .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .ilike('name', `%${term}%`)
      .limit(limit)

    if (nameRes.data && nameRes.data.length > 0) {
      results.push(...nameRes.data)
    }
  }

  // Deduplicate by id
  const seen = new Set()
  return results.filter(r => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })
}

// ── Helper: pick diverse venues across verticals ───────────────────
function pickDiverse(listings, count = 6) {
  // Group by vertical
  const byVertical = {}
  for (const l of listings) {
    if (!byVertical[l.vertical]) byVertical[l.vertical] = []
    byVertical[l.vertical].push(l)
  }

  const picked = []
  const verticals = Object.keys(byVertical)

  // Round-robin across verticals
  let vi = 0
  while (picked.length < count && picked.length < listings.length) {
    const vertical = verticals[vi % verticals.length]
    const remaining = byVertical[vertical].filter(l => !picked.find(p => p.id === l.id))
    if (remaining.length > 0) {
      picked.push(remaining[0])
    }
    vi++
    // Safety: if we've gone through all verticals without adding, break
    if (vi > verticals.length * count) break
  }

  // If still short, fill from whatever is left
  if (picked.length < count) {
    for (const l of listings) {
      if (picked.length >= count) break
      if (!picked.find(p => p.id === l.id)) picked.push(l)
    }
  }

  return picked.slice(0, count)
}

// ── Helper: generate short code ────────────────────────────────────
function shortCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// ── Trail 1: Melbourne to Yarra Valley ─────────────────────────────
async function seedTrail1() {
  console.log('\n--- Trail 1: Melbourne to the Yarra Valley ---')

  // Search for venues in the Yarra Valley / Melbourne area
  const candidates = await findListings([
    'Yarra Valley',
    'Yarra',
    'Melbourne',
    'Healesville',
    'Coldstream',
    'Lilydale',
  ], 20)

  console.log(`  Found ${candidates.length} candidate listings in Yarra Valley/Melbourne area`)

  if (candidates.length === 0) {
    // Fallback: try VIC state
    console.log('  Falling back to VIC state listings...')
    const { data } = await sb
      .from('listings')
      .select('id, name, vertical, slug, lat, lng, region, state, hero_image_url')
      .eq('status', 'active')
      .or('address_on_request.eq.false,address_on_request.is.null')
      .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
      .eq('state', 'VIC')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .limit(20)
    if (data) candidates.push(...data)
    console.log(`  Found ${candidates.length} VIC listings`)
  }

  const stops = pickDiverse(candidates, 6)
  console.log(`  Selected ${stops.length} stops:`)
  stops.forEach((s, i) => console.log(`    ${i + 1}. ${s.name} (${s.vertical}, ${s.region || s.state})`))

  if (stops.length === 0) {
    console.log('  WARNING: No listings found. Skipping trail 1.')
    return
  }

  // Editorial notes keyed by stop index
  const editorialNotes = [
    'Start in the inner suburbs where the independent streak runs deep. This is a neighbourhood defined by what it makes, not what it imports.',
    'The transition from city fringe to valley floor happens fast. Within thirty minutes the landscape opens up and the cellar doors begin.',
    'A mid-morning stop that rewards the early starter. Come before the weekend crowds arrive and you will have the place almost to yourself.',
    'This is the kind of place that does not advertise. Word of mouth built it, and the quality keeps people returning.',
    'Afternoon light hits different in the valley. Take the slow route between stops and you will understand why people settle here.',
    'A fitting final stop before the drive home. Everything here is made within a short radius, and the people behind the counter can tell you exactly where.',
  ]

  const trail = {
    title: "Melbourne to the Yarra Valley: A Day in Victoria's Independent Scene",
    slug: 'melbourne-yarra-valley-independent-scene',
    type: 'editorial',
    published: true,
    visibility: 'public',
    region: 'Yarra Valley',
    vertical_focus: null,
    duration_hours: 'Full day',
    best_season: 'Autumn (March\u2013May) for harvest season and cellar door releases',
    curator_name: 'Australian Atlas Editorial',
    curator_note: null,
    cover_image_url: null,
    hero_intro: `The road from Melbourne to the Yarra Valley is one of those rare drives that feels shorter than it is. Within forty minutes of leaving the city, the landscape shifts from warehouse conversions and terrace-lined streets to rolling green hills ribbed with vine rows. This is not wine country in the corporate sense\u2014there are no bus tours pulling into branded tasting rooms. The Yarra Valley\u2019s independent producers work at a scale that keeps them close to what they make, and that closeness is the entire point.\n\nThis trail follows the thread that connects Melbourne\u2019s inner-suburban makers to the valley\u2019s artisan corridor. It moves through neighbourhoods where small-batch is not a marketing term but a constraint born of care, into a landscape where distillers, brewers, ceramicists, and growers operate within sight of one another. Each stop on this route was chosen because the people behind it are doing something that cannot be replicated at scale.\n\nBring a cooler bag. You will want to take things home.`,
    stop_count: stops.length,
    short_code: shortCode(),
  }

  // Check if trail already exists
  const { data: existing } = await sb
    .from('trails')
    .select('id')
    .eq('slug', trail.slug)
    .single()

  if (existing) {
    console.log('  Trail already exists. Deleting and re-creating...')
    await sb.from('trail_stops').delete().eq('trail_id', existing.id)
    await sb.from('trails').delete().eq('id', existing.id)
  }

  const { data: inserted, error } = await sb
    .from('trails')
    .insert(trail)
    .select()
    .single()

  if (error) {
    console.error('  ERROR inserting trail:', error.message)
    return
  }
  console.log(`  Inserted trail: ${inserted.id}`)

  // Insert stops
  const stopRows = stops.map((s, i) => ({
    trail_id: inserted.id,
    listing_id: s.id,
    vertical: s.vertical,
    venue_name: s.name,
    venue_lat: s.lat,
    venue_lng: s.lng,
    venue_image_url: s.hero_image_url || null,
    order_index: i,
    notes: editorialNotes[i] || null,
  }))

  const { error: stopsErr } = await sb.from('trail_stops').insert(stopRows)
  if (stopsErr) {
    console.error('  ERROR inserting stops:', stopsErr.message)
  } else {
    console.log(`  Inserted ${stopRows.length} stops`)
  }
}

// ── Trail 2: Barossa to Adelaide Hills ─────────────────────────────
async function seedTrail2() {
  console.log('\n--- Trail 2: The Barossa to Adelaide Hills ---')

  const candidates = await findListings([
    'Barossa',
    'Barossa Valley',
    'Adelaide Hills',
    'Tanunda',
    'Angaston',
    'Hahndorf',
    'Stirling',
    'Nuriootpa',
  ], 20)

  console.log(`  Found ${candidates.length} candidate listings in Barossa/Adelaide Hills area`)

  if (candidates.length === 0) {
    console.log('  Falling back to SA state listings...')
    const { data } = await sb
      .from('listings')
      .select('id, name, vertical, slug, lat, lng, region, state, hero_image_url')
      .eq('status', 'active')
      .or('address_on_request.eq.false,address_on_request.is.null')
      .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
      .eq('state', 'SA')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .limit(20)
    if (data) candidates.push(...data)
    console.log(`  Found ${candidates.length} SA listings`)
  }

  const stops = pickDiverse(candidates, 6)
  console.log(`  Selected ${stops.length} stops:`)
  stops.forEach((s, i) => console.log(`    ${i + 1}. ${s.name} (${s.vertical}, ${s.region || s.state})`))

  if (stops.length === 0) {
    console.log('  WARNING: No listings found. Skipping trail 2.')
    return
  }

  const editorialNotes = [
    'The Barossa announces itself gradually. By the time you reach the first stop, the suburban fringe has given way to stone walls and old plantings.',
    'Sixth-generation land. The vines here predate most Australian wine regions and the approach reflects that continuity\u2014patient, unhurried, low-intervention.',
    'Step out of wine country for a moment. This stop is a reminder that the Barossa sustains more than grapes\u2014the craft tradition here runs across materials and disciplines.',
    'The road up into the Adelaide Hills is one of the best short drives in the country. The temperature drops, the canopy closes in, and everything slows down.',
    'A Hills institution that has earned its reputation through consistency rather than reinvention. The kind of place where regulars outnumber tourists ten to one.',
    'End the trail here, where the hills give way to orchards and the afternoon light is worth staying for. Pack something for the drive home.',
  ]

  const trail = {
    title: "The Barossa to Adelaide Hills: South Australia's Artisan Corridor",
    slug: 'barossa-adelaide-hills-artisan-corridor',
    type: 'editorial',
    published: true,
    visibility: 'public',
    region: 'Barossa Valley',
    vertical_focus: null,
    duration_hours: '2 days',
    best_season: 'Spring (September\u2013November) when the hills are green and cellar doors are quiet',
    curator_name: 'Australian Atlas Editorial',
    curator_note: null,
    cover_image_url: null,
    hero_intro: `South Australia\u2019s artisan corridor does not exist on any official map, but anyone who has driven from the Barossa Valley up through the Adelaide Hills knows the route by feel. It follows old coach roads past stone churches and century-old plantings, climbs through eucalypt forest, and descends into townships where the main street still closes on Sundays. The producers along this corridor\u2014winemakers, brewers, cheesemakers, potters, roasters\u2014share a geography and a disposition: they are not interested in scaling up.\n\nThe Barossa itself is Australia\u2019s most storied wine region, but the version most visitors encounter\u2014the cellar doors with coach parking and branded merchandise\u2014is only one layer. Beneath it is a network of independent operators whose vineyards are too small for export, whose production runs are measured in hundreds rather than thousands, and whose reputations are built on handshake relationships with local restaurants and bottle shops.\n\nThis two-day trail connects the Barossa\u2019s independent producers with the Adelaide Hills\u2019 makers and growers. It rewards the kind of traveller who would rather have a long conversation at a cellar door than a quick tasting at a branded counter. Take it slowly. The corridor was built for that.`,
    stop_count: stops.length,
    short_code: shortCode(),
  }

  const { data: existing } = await sb
    .from('trails')
    .select('id')
    .eq('slug', trail.slug)
    .single()

  if (existing) {
    console.log('  Trail already exists. Deleting and re-creating...')
    await sb.from('trail_stops').delete().eq('trail_id', existing.id)
    await sb.from('trails').delete().eq('id', existing.id)
  }

  const { data: inserted, error } = await sb
    .from('trails')
    .insert(trail)
    .select()
    .single()

  if (error) {
    console.error('  ERROR inserting trail:', error.message)
    return
  }
  console.log(`  Inserted trail: ${inserted.id}`)

  const stopRows = stops.map((s, i) => ({
    trail_id: inserted.id,
    listing_id: s.id,
    vertical: s.vertical,
    venue_name: s.name,
    venue_lat: s.lat,
    venue_lng: s.lng,
    venue_image_url: s.hero_image_url || null,
    order_index: i,
    notes: editorialNotes[i] || null,
  }))

  const { error: stopsErr } = await sb.from('trail_stops').insert(stopRows)
  if (stopsErr) {
    console.error('  ERROR inserting stops:', stopsErr.message)
  } else {
    console.log(`  Inserted ${stopRows.length} stops`)
  }
}

// ── Run ────────────────────────────────────────────────────────────
async function main() {
  console.log('Seeding editorial trails...')
  console.log(`Supabase: ${supabaseUrl}`)

  await seedTrail1()
  await seedTrail2()

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
