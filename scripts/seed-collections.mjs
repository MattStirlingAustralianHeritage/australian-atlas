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
    region: 'Barossa Valley',
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
    region: 'Byron Hinterland',
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
    region: 'Daylesford & Hepburn Springs',
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
    region: 'Mornington Peninsula',
    state: 'VIC',
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 3,
  },

  // ── Night 4 additions: Regional cross-vertical collections ────

  {
    title: 'Hunter Valley Weekend',
    slug: 'hunter-valley-weekend',
    description: 'Two hours north of Sydney, the Hunter delivers beyond Semillon. Cellar doors that pour wines you can\'t buy in shops, cafes fuelled by local roasters, and stays where the only noise is the kookaburras.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'fine_grounds', 'rest', 'table', 'craft'],
    region: 'Hunter Valley',
    state: 'NSW',
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 3,
  },
  {
    title: 'Yarra Valley Circuit',
    slug: 'yarra-valley-circuit',
    description: 'Melbourne\'s backyard wine region has grown past cellar doors into a proper independent economy. Cideries, craft breweries, farm gates, and accommodation that\'s worth the drive even without the wine.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'fine_grounds', 'craft', 'table', 'rest'],
    region: 'Yarra Valley',
    state: 'VIC',
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 3,
  },
  {
    title: 'Margaret River Trail',
    slug: 'margaret-river-trail',
    description: 'The south-west corner of Western Australia, where Cabernet and surf breaks coexist. Small-batch chocolate, craft breweries, and cellar doors run by families who planted the original vines.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'craft', 'fine_grounds', 'table', 'rest', 'corner'],
    region: 'Margaret River',
    state: 'WA',
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 3,
  },
  {
    title: 'Adelaide Hills Independents',
    slug: 'adelaide-hills-independents',
    description: 'Cool-climate wine country in the Mt Lofty Ranges, but also cideries, craft breweries, cheese dairies, and the kind of independent shops that only survive where locals are fierce about quality.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'craft', 'fine_grounds', 'table', 'corner', 'rest'],
    region: 'Adelaide Hills',
    state: 'SA',
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 3,
  },
  {
    title: 'Great Ocean Road',
    slug: 'great-ocean-road-independents',
    description: 'One of the world\'s great coastal drives is also one of its best independent-venue corridors. Breweries in former surf clubs, cafes in converted dairies, and stays with views that earn the premium.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'fine_grounds', 'rest', 'craft', 'table'],
    region: 'Great Ocean Road',
    state: 'VIC',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Kangaroo Island Producers',
    slug: 'kangaroo-island-producers',
    description: 'An island that takes its isolation seriously. Honey, spirits, sheep dairy, eucalyptus oil, and oysters — everything here is made from what the island grows, and the producers are proud of it.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'craft', 'table', 'rest', 'field'],
    region: 'Kangaroo Island',
    state: 'SA',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'McLaren Vale & Fleurieu',
    slug: 'mclaren-vale-fleurieu',
    description: 'Shiraz country forty minutes from Adelaide, but also home to Grenache revivalists, natural winemakers, and a farm-gate food trail that runs from the vineyards to the coast.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'table', 'fine_grounds', 'craft', 'rest'],
    region: 'McLaren Vale',
    state: 'SA',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Southern Highlands Escape',
    slug: 'southern-highlands-escape',
    description: 'A cool-climate escarpment south of Sydney where the bookshops, galleries, and antique dealers outnumber the chain stores. Weekend country at its most civilised.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['craft', 'corner', 'found', 'fine_grounds', 'collection', 'rest'],
    region: 'Southern Highlands',
    state: 'NSW',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Gippsland Farm & Coast',
    slug: 'gippsland-farm-coast',
    description: 'Victoria\'s south-east from Phillip Island to Wilsons Promontory. Artisan cheesemakers, coastal walks, craft breweries, and farm stays where the paddock meets the plate.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'craft', 'rest', 'field', 'table', 'fine_grounds'],
    region: 'Gippsland',
    state: 'VIC',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Newcastle & Hunter Independents',
    slug: 'newcastle-independents',
    description: 'A harbour city reinventing itself through independent operators. Craft breweries on the waterfront, specialty coffee along Darby Street, galleries in converted warehouses.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['fine_grounds', 'sba', 'craft', 'corner', 'collection', 'table'],
    region: 'Newcastle',
    state: 'NSW',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Noosa & Hinterland',
    slug: 'noosa-hinterland-independents',
    description: 'Behind the beach, the Noosa hinterland unfolds into subtropical farmland, craft breweries, and producer doors. The best of Queensland\'s independent scene in one compact corridor.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'fine_grounds', 'table', 'craft', 'rest'],
    region: 'Noosa Hinterland',
    state: 'QLD',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Bellarine & Geelong',
    slug: 'bellarine-geelong',
    description: 'The western side of Port Phillip Bay, where craft beer, wine, and farm-gate food have quietly built one of Victoria\'s most underrated independent strips.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'fine_grounds', 'craft', 'table', 'rest'],
    region: 'Bellarine Peninsula',
    state: 'VIC',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Central Victoria Heritage',
    slug: 'central-victoria-heritage',
    description: 'Goldfields architecture, maker studios in former banks, bookshops in old post offices. Bendigo, Castlemaine, and Ballarat have turned 19th-century bones into a 21st-century independent scene.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['craft', 'collection', 'corner', 'found', 'fine_grounds'],
    region: 'Central Victoria',
    state: 'VIC',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Cradle Country & North-West Tasmania',
    slug: 'cradle-country-tasmania',
    description: 'Tasmania\'s wild north-west, where wilderness lodges meet craft distilleries and farm stays. The roads are quieter, the produce is wilder, and the landscape does most of the talking.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['rest', 'sba', 'field', 'craft', 'table'],
    region: 'Cradle Country',
    state: 'TAS',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Macedon Ranges Day Trip',
    slug: 'macedon-ranges-day-trip',
    description: 'An hour north of Melbourne, the Macedon Ranges offer cool-climate wineries, heritage village shops, and cafes surrounded by gardens. A day trip that doesn\'t feel like one.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'fine_grounds', 'craft', 'corner', 'table'],
    region: 'Macedon Ranges',
    state: 'VIC',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Hobart Makers & Markets',
    slug: 'hobart-makers-markets',
    description: 'Salamanca\'s sandstone warehouses anchor a maker scene that runs from Battery Point to North Hobart. Glass, ceramics, textiles, and the Saturday market that ties it all together.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['craft', 'collection', 'corner', 'found', 'fine_grounds'],
    region: 'Hobart & Southern Tasmania',
    state: 'TAS',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },

  // ── Night 4 additions: Vertical-specific collections ──────────

  {
    title: 'Australia\'s Best Distilleries',
    slug: 'australias-best-distilleries',
    description: 'Gin, whisky, and spirits from producers who grow their own botanicals, malt their own grain, or simply refuse to cut corners. The country\'s most compelling distillery doors.',
    vertical: 'sba',
    region: null,
    state: null,
    author: 'Australian Atlas Editorial',
    limit: 12,
    subTypeFilter: ['distillery'],
  },
  {
    title: 'The Cellar Door Trail',
    slug: 'the-cellar-door-trail',
    description: 'Small-batch wineries where the person pouring is the person who made it. No bus tours, no corporate tasting rooms — just winemakers, their vineyards, and an open door.',
    vertical: 'sba',
    region: null,
    state: null,
    author: 'Australian Atlas Editorial',
    limit: 12,
    subTypeFilter: ['winery', 'cellar_door'],
  },
  {
    title: 'Contemporary Galleries',
    slug: 'contemporary-galleries',
    description: 'Artist-run spaces, regional galleries, and institutions that take risks. A nationwide survey of the galleries showing the most interesting work in Australian contemporary art.',
    vertical: 'collection',
    region: null,
    state: null,
    author: 'Australian Atlas Editorial',
    limit: 12,
  },
  {
    title: 'Boutique Stays',
    slug: 'boutique-stays',
    description: 'Owner-operated, independently designed, and never part of a chain. The stays across Australia that prove accommodation can be as thoughtful as the destination itself.',
    vertical: 'rest',
    region: null,
    state: null,
    author: 'Australian Atlas Editorial',
    limit: 12,
  },
  {
    title: 'Australia\'s Best Roasters',
    slug: 'australias-best-roasters',
    description: 'The roasters and cafes that define Australian specialty coffee. Single-origin obsessives, competition-winning baristas, and the neighbourhood institutions that have earned their following.',
    vertical: 'fine_grounds',
    region: null,
    state: null,
    author: 'Australian Atlas Editorial',
    limit: 12,
  },
  {
    title: 'National Parks & Wild Places',
    slug: 'national-parks-wild-places',
    description: 'The walks, lookouts, swimming holes, and wild spaces that make Australia\'s natural landscape so extraordinary. No entry fees, no bookings — just nature doing what it does.',
    vertical: 'field',
    region: null,
    state: null,
    author: 'Australian Atlas Editorial',
    limit: 12,
  },
  {
    title: 'Farm Gates & Providores',
    slug: 'farm-gates-providores',
    description: 'Buy direct from the people who grew it, cured it, smoked it, or pressed it. Farm-gate stalls, regional providores, and the independent food producers worth driving for.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['table', 'sba', 'corner'],
    region: null,
    state: null,
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 5,
  },

  // ── Night 4 additions: Thematic collections ───────────────────

  {
    title: 'Sydney Coffee',
    slug: 'sydney-coffee',
    description: 'From the laneways of Surry Hills to the waterfront of Manly, Sydney\'s specialty coffee scene runs deep. The roasters and cafes that locals rely on, not the ones tourists stumble into.',
    vertical: 'fine_grounds',
    region: 'Sydney',
    state: 'NSW',
    author: 'Australian Atlas Editorial',
    limit: 12,
  },
  {
    title: 'Coastal Independents',
    slug: 'coastal-independents',
    description: 'Australia\'s coastal towns have always attracted free spirits. A selection of the independent operators — cafes, breweries, makers, shops — that make the seaside towns worth visiting beyond the beach.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['fine_grounds', 'sba', 'craft', 'corner', 'found'],
    region: null,
    state: null,
    author: 'Australian Atlas Editorial',
    limit: 12,
    maxPerVertical: 3,
  },
  {
    title: 'Heritage & Historic Sites',
    slug: 'heritage-historic-sites',
    description: 'Homesteads, convict-era buildings, mining towns, and heritage-listed structures that have been preserved by communities who understand that history isn\'t a museum exhibit — it\'s a living place.',
    vertical: 'collection',
    region: null,
    state: null,
    author: 'Australian Atlas Editorial',
    limit: 12,
  },
  {
    title: 'Canberra Region',
    slug: 'canberra-region-independents',
    description: 'The national capital\'s independent side — cool-climate wineries, specialty coffee, galleries, and the growing maker scene that thrives in a city where government isn\'t the only employer.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['fine_grounds', 'sba', 'collection', 'craft', 'table'],
    region: 'Canberra District',
    state: 'ACT',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Scenic Rim & Gold Coast Hinterland',
    slug: 'scenic-rim-gold-coast-hinterland',
    description: 'Behind the Gold Coast\'s skyline, a green arc of mountain ranges harbours farm stays, boutique wineries, and craft producers. The hinterland that proves Queensland is more than beaches.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'rest', 'craft', 'table', 'field'],
    region: 'Gold Coast Hinterland',
    state: 'QLD',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Clare Valley Riesling Trail',
    slug: 'clare-valley-riesling-trail',
    description: 'Australia\'s Riesling heartland, where cellar doors are set among heritage stone cottages and the cycling trail between them is as good as the wine at the end of it.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['sba', 'rest', 'fine_grounds', 'craft'],
    region: 'Clare Valley',
    state: 'SA',
    author: 'Australian Atlas Editorial',
    limit: 10,
    maxPerVertical: 3,
  },
  {
    title: 'Northern Rivers & Hinterland',
    slug: 'northern-rivers-hinterland',
    description: 'The creative subtropical corridor from Lismore to Brunswick Heads. Artisan makers, vintage shops, farm-gate food, and the kind of independent cafes that explain why people move here.',
    vertical: null,
    crossVertical: true,
    targetVerticals: ['craft', 'fine_grounds', 'corner', 'found', 'sba', 'table'],
    region: 'Northern Rivers',
    state: 'NSW',
    author: 'Australian Atlas Editorial',
    limit: 10,
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

  // Sub-type filter (e.g. distillery, winery)
  if (collection.subTypeFilter && collection.subTypeFilter.length > 0) {
    query = query.in('sub_type', collection.subTypeFilter)
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
