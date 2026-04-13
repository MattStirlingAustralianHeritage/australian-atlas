import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const maxDuration = 60

const MODEL = 'claude-sonnet-4-20250514'

// ── Departure city coordinates ───────────────────────────────
const CITY_COORDS = {
  'Sydney':     { lat: -33.8688, lng: 151.2093 },
  'Melbourne':  { lat: -37.8136, lng: 144.9631 },
  'Brisbane':   { lat: -27.4698, lng: 153.0251 },
  'Adelaide':   { lat: -34.9285, lng: 138.6007 },
  'Perth':      { lat: -31.9505, lng: 115.8605 },
  'Hobart':     { lat: -42.8821, lng: 147.3272 },
  'Canberra':   { lat: -35.2809, lng: 149.1300 },
  'Darwin':     { lat: -12.4634, lng: 130.8456 },
  'Gold Coast': { lat: -28.0167, lng: 153.4000 },
  'Newcastle':  { lat: -32.9283, lng: 151.7817 },
  'Wollongong': { lat: -34.4278, lng: 150.8931 },
}

// ── Radius mapping (drive time → km) ────────────────────────
const RADIUS_KM = {
  '1h': 80,
  '2h': 160,
  '3h': 250,
  'anywhere': null, // no limit
}

// ── Vertical display names ───────────────────────────────────
const VERTICAL_NAMES = {
  sba: 'Small Batch',
  collection: 'Culture Atlas',
  craft: 'Maker Studios',
  fine_grounds: 'Fine Grounds',
  rest: 'Boutique Stays',
  field: 'Field Atlas',
  corner: 'Corner Atlas',
  found: 'Found Atlas',
  table: 'Table Atlas',
}

/**
 * POST /api/long-weekend
 *
 * Build a 3-day long weekend itinerary using nearby listings and Claude.
 * Body: { city, radius, group, vibes }
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const { city, radius, group, vibes } = body

    if (!city || !CITY_COORDS[city]) {
      return NextResponse.json({ error: 'Invalid departure city' }, { status: 400 })
    }
    if (!radius || !Object.keys(RADIUS_KM).includes(radius)) {
      return NextResponse.json({ error: 'Invalid radius' }, { status: 400 })
    }
    if (!group) {
      return NextResponse.json({ error: 'Travel group is required' }, { status: 400 })
    }
    if (!vibes || !Array.isArray(vibes) || vibes.length === 0) {
      return NextResponse.json({ error: 'At least one vibe is required' }, { status: 400 })
    }

    const cityCoords = CITY_COORDS[city]
    const radiusKm = RADIUS_KM[radius]

    // ── Step 1: Query listings within bounding box ─────────
    const sb = getSupabaseAdmin()
    let listings = await fetchListingsInRadius(sb, cityCoords, radiusKm)

    // If fewer than 10, expand radius by 50% and retry once
    if (listings.length < 10 && radiusKm) {
      const expandedKm = Math.round(radiusKm * 1.5)
      console.log(`[long-weekend] Only ${listings.length} listings within ${radiusKm}km, expanding to ${expandedKm}km`)
      listings = await fetchListingsInRadius(sb, cityCoords, expandedKm)
    }

    if (listings.length === 0) {
      return NextResponse.json({
        error: 'No listings found in this area. Try expanding your radius or choosing a different city.',
      }, { status: 404 })
    }

    // ── Step 2: Group by region, pick richest cluster ──────
    const regionGroups = {}
    for (const listing of listings) {
      const region = listing.region || 'Unknown'
      if (!regionGroups[region]) regionGroups[region] = []
      regionGroups[region].push(listing)
    }

    // Pick region with most vertical diversity (unique verticals), break ties by listing count
    let bestRegion = null
    let bestScore = -1
    for (const [region, regionListings] of Object.entries(regionGroups)) {
      const uniqueVerticals = new Set(regionListings.map(l => l.vertical)).size
      const score = uniqueVerticals * 1000 + regionListings.length
      if (score > bestScore) {
        bestScore = score
        bestRegion = region
      }
    }

    const regionListings = regionGroups[bestRegion] || []
    // Cap at 50 for the Claude prompt
    const listingsForPrompt = regionListings.slice(0, 50)

    // ── Step 3: Build Claude prompt ────────────────────────
    const listingsJson = listingsForPrompt.map(l => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      vertical: l.vertical,
      vertical_name: VERTICAL_NAMES[l.vertical] || l.vertical,
      sub_type: l.sub_type,
      description: l.description ? l.description.slice(0, 150) : null,
      region: l.region,
      suburb: l.suburb,
    }))

    const systemPrompt = 'You are an editorial travel writer for Australian Atlas, a curated guide to independent Australian places. You write with warmth and specificity, like a well-travelled friend sharing their favourites. Never generic. Always grounded in real place detail.'

    const userPrompt = `Build a 3-day long weekend itinerary for ${group} with a ${vibes.join(', ')} vibe, departing from ${city}, staying in the ${bestRegion} area.

Available listings:
${JSON.stringify(listingsJson, null, 2)}

Requirements:
- Day 1 arrives Friday afternoon — start gentle. One or two easy stops to settle in.
- Day 2 is the full day — the best of what the area offers. 3-5 stops.
- Day 3 departs Sunday — morning activity then head home. 1-2 stops.
- Include at least one accommodation listing (vertical "rest") if available. If none available, set accommodation to null.
- Each stop needs a one-sentence reason that reads like editorial copy, not a template.
- Use ONLY listing IDs from the provided list. Do not invent listings.
- Arrival times should be realistic (Day 1 starts no earlier than 2pm, Day 2 from 9am, Day 3 from 8:30am).

Return ONLY valid JSON with no markdown formatting, no code fences:
{
  "title": "string — evocative editorial title for this trip",
  "region": "string — the region name",
  "summary": "string — 2-3 sentence editorial summary of what makes this weekend special",
  "days": [
    {
      "day_number": 1,
      "theme": "string — short theme for the day, e.g. 'Arrive & unwind'",
      "stops": [
        {
          "listing_id": "uuid string from the available listings",
          "listing_name": "string",
          "arrival_time": "string like '2:30pm'",
          "duration_minutes": 60,
          "notes": "string — one editorial sentence about why this stop"
        }
      ]
    }
  ],
  "accommodation": {
    "listing_id": "uuid string",
    "listing_name": "string",
    "notes": "string — one sentence about the stay"
  }
}`

    // ── Step 4: Call Anthropic Claude ───────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      console.error(`[long-weekend] Claude API error ${claudeRes.status}:`, errText)
      return NextResponse.json({ error: 'Failed to generate itinerary. Please try again.' }, { status: 502 })
    }

    const claudeData = await claudeRes.json()
    const rawText = claudeData.content?.[0]?.text || ''

    // ── Step 5: Parse Claude's JSON response ───────────────
    let itinerary
    try {
      // Strip any markdown code fences Claude might include despite instructions
      const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      itinerary = JSON.parse(cleaned)
    } catch (parseErr) {
      console.error('[long-weekend] Failed to parse Claude response:', parseErr.message)
      console.error('[long-weekend] Raw response:', rawText.slice(0, 500))
      return NextResponse.json({ error: 'Failed to parse itinerary. Please try again.' }, { status: 502 })
    }

    // ── Step 6: Enrich with full listing data ──────────────
    // Build a lookup map of all region listings by ID
    const listingMap = {}
    for (const l of regionListings) {
      listingMap[l.id] = l
    }

    // Attach full listing data to each stop
    if (itinerary.days) {
      for (const day of itinerary.days) {
        if (day.stops) {
          day.stops = day.stops.map(stop => ({
            ...stop,
            listing: listingMap[stop.listing_id] || null,
          }))
        }
      }
    }

    // Attach full listing data to accommodation
    if (itinerary.accommodation?.listing_id) {
      itinerary.accommodation.listing = listingMap[itinerary.accommodation.listing_id] || null
    }

    return NextResponse.json({
      itinerary,
      meta: {
        city,
        radius,
        group,
        vibes,
        region: bestRegion,
        total_listings_found: listings.length,
        region_listings_count: regionListings.length,
      },
    })
  } catch (err) {
    console.error('[long-weekend] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Fetch active, quality listings within a radius of the given coordinates.
 * Uses bounding box approximation (Haversine shortcut via degree offsets).
 * If radiusKm is null, fetches all listings (no geographic filter).
 */
async function fetchListingsInRadius(sb, center, radiusKm) {
  const select = 'id, name, slug, vertical, description, region, state, suburb, lat, lng, hero_image_url, quality_score, sub_type'

  let query = sb
    .from('listings')
    .select(select)
    .eq('status', 'active')
    .gte('quality_score', 40)
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (radiusKm) {
    const latOffset = radiusKm / 111
    const lngOffset = radiusKm / (111 * Math.cos(center.lat * Math.PI / 180))

    query = query
      .gte('lat', center.lat - latOffset)
      .lte('lat', center.lat + latOffset)
      .gte('lng', center.lng - lngOffset)
      .lte('lng', center.lng + lngOffset)
  }

  query = query.limit(200)

  const { data, error } = await query

  if (error) {
    console.error('[long-weekend] Supabase query error:', error.message)
    return []
  }

  return data || []
}
