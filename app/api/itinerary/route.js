import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

// Map natural-language category hints to vertical keys
const CATEGORY_KEYWORDS = {
  sba: ['wine', 'winery', 'wineries', 'brewery', 'breweries', 'distillery', 'distilleries', 'cellar door', 'gin', 'whisky', 'cider', 'craft beer', 'natural wine', 'spirits', 'drink', 'drinks', 'small batch'],
  fine_grounds: ['coffee', 'cafe', 'cafes', 'roaster', 'espresso'],
  rest: ['accommodation', 'stay', 'stays', 'hotel', 'hotels', 'glamping', 'farmstay', 'cottage', 'boutique stay', 'bnb', 'b&b', 'bed and breakfast', 'sleep'],
  collection: ['art', 'gallery', 'galleries', 'museum', 'museums', 'heritage', 'cultural', 'exhibition'],
  craft: ['maker', 'makers', 'studio', 'studios', 'pottery', 'ceramics', 'woodwork', 'textiles', 'jewellery'],
  field: ['nature', 'hiking', 'waterfall', 'swimming hole', 'lookout', 'walking', 'outdoor', 'national park'],
  corner: ['shop', 'shops', 'bookshop', 'record store', 'homewares', 'indie'],
  found: ['vintage', 'op shop', 'antique', 'antiques', 'secondhand', 'thrift', 'retro'],
  table: ['food', 'bakery', 'farm gate', 'providore', 'cheese', 'olive oil', 'produce', 'sourdough'],
}

// Region keyword detection (reused from search API pattern)
const REGION_KEYWORDS = {
  'barossa': 'Barossa', 'yarra valley': 'Yarra Valley', 'mornington': 'Mornington Peninsula',
  'mornington peninsula': 'Mornington Peninsula', 'blue mountains': 'Blue Mountains',
  'byron': 'Byron', 'byron bay': 'Byron', 'adelaide hills': 'Adelaide Hills',
  'hunter valley': 'Hunter Valley', 'margaret river': 'Margaret River',
  'daylesford': 'Daylesford', 'macedon': 'Macedon Ranges', 'macedon ranges': 'Macedon Ranges',
  'dandenong': 'Dandenong Ranges', 'goldfields': 'Goldfields', 'bellarine': 'Bellarine',
  'gippsland': 'Gippsland', 'southern highlands': 'Southern Highlands',
  'central coast': 'Central Coast', 'sunshine coast': 'Sunshine Coast',
  'gold coast': 'Gold Coast', 'noosa': 'Noosa', 'kangaroo island': 'Kangaroo Island',
  'tasmania': 'TAS', 'melbourne': 'Melbourne', 'sydney': 'Sydney', 'brisbane': 'Brisbane',
  'adelaide': 'Adelaide', 'perth': 'Perth', 'hobart': 'Hobart', 'canberra': 'ACT',
  'darwin': 'Darwin', 'fremantle': 'Fremantle', 'bendigo': 'Bendigo', 'ballarat': 'Ballarat',
  'orange': 'Orange', 'mudgee': 'Mudgee', 'mclaren vale': 'McLaren Vale',
  'clare valley': 'Clare Valley', 'great ocean road': 'Great Ocean Road',
  'grampians': 'Grampians', 'beechworth': 'Beechworth', 'bright': 'Bright',
  'healesville': 'Healesville', 'red hill': 'Red Hill', 'hepburn': 'Hepburn',
  'launceston': 'Launceston', 'cradle mountain': 'Cradle Mountain',
  'bruny island': 'Bruny Island', 'south coast': 'South Coast',
  'north coast': 'North Coast', 'mid north coast': 'Mid North Coast',
}

// Duration extraction from query
const DURATION_PATTERNS = [
  { pattern: /(\d+)\s*nights?/i, extract: m => ({ nights: parseInt(m[1]) }) },
  { pattern: /(\d+)\s*days?/i, extract: m => ({ days: parseInt(m[1]) }) },
  { pattern: /weekend/i, extract: () => ({ days: 2 }) },
  { pattern: /long\s*weekend/i, extract: () => ({ days: 3 }) },
  { pattern: /day\s*trip/i, extract: () => ({ days: 1 }) },
  { pattern: /overnight/i, extract: () => ({ nights: 1 }) },
]

function parseItineraryQuery(rawQuery) {
  const q = rawQuery.toLowerCase().trim()
  let region = null
  let verticals = []
  let duration = { days: 1 }

  // Extract region (longest match first)
  const regionEntries = Object.entries(REGION_KEYWORDS).sort((a, b) => b[0].length - a[0].length)
  for (const [kw, regionValue] of regionEntries) {
    if (q.includes(kw)) {
      region = regionValue
      break
    }
  }

  // Extract category/vertical hints
  for (const [vKey, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const sorted = [...keywords].sort((a, b) => b.length - a.length)
    for (const kw of sorted) {
      if (q.includes(kw)) {
        if (!verticals.includes(vKey)) verticals.push(vKey)
        break
      }
    }
  }

  // Extract duration
  for (const { pattern, extract } of DURATION_PATTERNS) {
    const match = q.match(pattern)
    if (match) {
      const d = extract(match)
      if (d.nights) duration = { days: d.nights + 1 }
      else if (d.days) duration = { days: d.days }
      break
    }
  }

  return { region, verticals, duration }
}

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas', collection: 'Collection Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  if (!q || q.trim().length < 3) {
    return NextResponse.json({ error: 'Query parameter "q" is required (min 3 characters)' }, { status: 400 })
  }

  try {
    const { region, verticals, duration } = parseItineraryQuery(q)

    // Query candidate venues from master listings
    const sb = getSupabaseAdmin()

    let query = sb
      .from('listings')
      .select('id, name, vertical, sub_type, lat, lng, region, state, description, hero_image_url, slug')
      .eq('status', 'active')
      .not('lat', 'is', null)
      .not('lng', 'is', null)

    // Filter by region if detected
    if (region) {
      if (region.length <= 3 && region === region.toUpperCase()) {
        // State abbreviation
        query = query.eq('state', region)
      } else {
        query = query.or(`region.ilike.%${region}%,name.ilike.%${region}%,state.ilike.%${region}%`)
      }
    }

    // If specific verticals detected, filter to those + rest (for accommodation)
    if (verticals.length > 0) {
      const allVerticals = [...new Set([...verticals, 'rest'])]
      query = query.in('vertical', allVerticals)
    }

    query = query.limit(50)

    const { data: candidates, error } = await query

    if (error) {
      console.error('[itinerary] DB query error:', error.message)
      return NextResponse.json({ error: 'Failed to fetch venues' }, { status: 500 })
    }

    if (!candidates || candidates.length < 4) {
      return NextResponse.json({
        error: 'insufficient_venues',
        message: `Not enough venues found${region ? ` in ${region}` : ''}. Try a different region or broader search.`,
        venue_count: candidates?.length || 0,
      }, { status: 200 })
    }

    // Prepare venue data for Claude (trim descriptions, limit to 30)
    const venueData = candidates.slice(0, 30).map(v => ({
      id: v.id,
      name: v.name,
      vertical: v.vertical,
      vertical_label: VERTICAL_LABELS[v.vertical] || v.vertical,
      sub_type: v.sub_type || null,
      lat: v.lat,
      lng: v.lng,
      region: v.region,
      state: v.state,
      description: v.description ? v.description.slice(0, 200) : null,
      slug: v.slug,
      hero_image_url: v.hero_image_url || null,
    }))

    const candidateIds = new Set(venueData.map(v => v.id))

    // Build the Anthropic API call
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const systemPrompt = `You are the Australian Atlas editorial voice — warm, knowledgeable, and passionate about independent Australian makers, producers, and cultural spaces. You build travel itineraries that feel like recommendations from a well-connected local friend.

HARD CONSTRAINTS:
- You may ONLY include venues from the provided candidate list. Never invent venues.
- Every listing_id in your response MUST exist in the candidate list.
- Each stop must reference a real venue by its exact id, name, vertical, lat, and lng from the candidates.
- For multi-day trips, include at least one "rest" vertical venue as overnight accommodation per night.
- Keep notes concise (1-2 sentences) — evocative but practical.
- Title should be catchy and specific to the region/theme.
- Intro should be 2-3 sentences setting the scene.

Respond with valid JSON only. No markdown, no code fences, just the JSON object.`

    const userPrompt = `Build a ${duration.days}-day itinerary for this request: "${q}"

Here are the candidate venues (JSON array). You MUST only use venues from this list:
${JSON.stringify(venueData, null, 2)}

Return this exact JSON structure:
{
  "title": "string — catchy itinerary title",
  "intro": "string — 2-3 sentence editorial intro",
  "days": [
    {
      "day_number": 1,
      "label": "string — e.g. 'Morning in the Barossa'",
      "stops": [
        {
          "listing_id": "number — must match a candidate id",
          "venue_name": "string",
          "vertical": "string",
          "lat": "number",
          "lng": "number",
          "note": "string — 1-2 sentence editorial note"
        }
      ],
      "overnight": null or {
        "listing_id": "number",
        "venue_name": "string",
        "vertical": "rest",
        "lat": "number",
        "lng": "number",
        "note": "string"
      }
    }
  ]
}

Aim for 3-5 stops per day. Make it flow geographically. Mix verticals where possible for variety.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })

    // Extract text response
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    // Parse JSON from response (strip any accidental markdown fences)
    let rawText = textBlock.text.trim()
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    let itinerary
    try {
      itinerary = JSON.parse(rawText)
    } catch (parseErr) {
      console.error('[itinerary] JSON parse error:', parseErr.message, 'Raw:', rawText.slice(0, 500))
      return NextResponse.json({ error: 'Failed to parse itinerary response' }, { status: 500 })
    }

    // Validate: ensure every listing_id exists in candidates
    let valid = true
    const enrichedDays = (itinerary.days || []).map(day => {
      const enrichedStops = (day.stops || []).map(stop => {
        const candidate = venueData.find(v => v.id === stop.listing_id)
        if (!candidate) {
          console.warn(`[itinerary] listing_id ${stop.listing_id} not found in candidates`)
          valid = false
        }
        return {
          ...stop,
          slug: candidate?.slug || null,
          hero_image_url: candidate?.hero_image_url || null,
          region: candidate?.region || null,
        }
      })

      let enrichedOvernight = day.overnight
      if (enrichedOvernight?.listing_id) {
        const candidate = venueData.find(v => v.id === enrichedOvernight.listing_id)
        if (!candidate) {
          console.warn(`[itinerary] overnight listing_id ${enrichedOvernight.listing_id} not found`)
          valid = false
        }
        enrichedOvernight = {
          ...enrichedOvernight,
          slug: candidate?.slug || null,
          hero_image_url: candidate?.hero_image_url || null,
          region: candidate?.region || null,
        }
      }

      return { ...day, stops: enrichedStops, overnight: enrichedOvernight }
    })

    if (!valid) {
      console.warn('[itinerary] Some venue IDs did not match candidates — returning anyway with available data')
    }

    return NextResponse.json({
      title: itinerary.title,
      intro: itinerary.intro,
      days: enrichedDays,
      query: q,
      region: region || null,
      duration,
      venue_count: venueData.length,
    })
  } catch (err) {
    console.error('[itinerary] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
