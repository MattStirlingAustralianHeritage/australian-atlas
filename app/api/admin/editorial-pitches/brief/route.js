import { NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

const VERTICAL_GUIDANCE = {
  sba: 'Small Batch Atlas — distilleries, breweries, cideries, wineries, bottle shops',
  collection: 'Culture Atlas — museums, galleries, heritage sites',
  craft: 'Craft Atlas — studios, makers, artisans',
  fine_grounds: 'Fine Grounds Atlas — specialty roasters and independent cafes',
  rest: 'Rest Atlas — boutique accommodation, farm stays, glamping',
  field: 'Field Atlas — swimming holes, waterfalls, lookouts, natural places',
  found: 'Found Atlas — antique shops, vintage dealers, markets',
  corner: 'Corner Atlas — bookshops, record stores, vinyl',
  table: 'Table Atlas — farm gates, food producers, providores',
  portal: 'Australian Atlas portal — cross-vertical regional stories',
}

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas', collection: 'Culture Atlas', craft: 'Craft Atlas',
  fine_grounds: 'Fine Grounds Atlas', rest: 'Rest Atlas', field: 'Field Atlas',
  found: 'Found Atlas', corner: 'Corner Atlas', table: 'Table Atlas', portal: 'Australian Atlas',
}

/**
 * POST: Generate or return cached brief for a pitch
 */
export async function POST(request) {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pitchId } = await request.json()
  if (!pitchId) return NextResponse.json({ error: 'pitchId required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Fetch the pitch
  const { data: pitch, error: pitchErr } = await sb
    .from('editorial_pitches')
    .select('*')
    .eq('id', pitchId)
    .single()

  if (pitchErr || !pitch) return NextResponse.json({ error: 'Pitch not found' }, { status: 404 })

  // Return cached brief if it exists
  if (pitch.brief) {
    return NextResponse.json({ brief: pitch.brief, cached: true })
  }

  // Fetch venue data if we have a suggested_venue_id
  let venueContext = ''
  let venueData = null
  if (pitch.suggested_venue_id) {
    const { data: venue } = await sb
      .from('listings')
      .select('name, description, region, state, lat, lng, vertical, sub_type, address, website')
      .eq('id', pitch.suggested_venue_id)
      .single()
    if (venue) {
      venueData = venue
      venueContext = `\n\nAnchor venue details:\nName: ${venue.name}\nRegion: ${venue.region || 'Unknown'}, ${venue.state || 'Australia'}\nType: ${venue.sub_type || venue.vertical || 'Unknown'}\nDescription: ${(venue.description || '').slice(0, 500)}\nAddress: ${venue.address || 'Not listed'}\nWebsite: ${venue.website || 'Not listed'}`
    }
  }

  // If no venue ID but we have a name, try to find it
  if (!venueData && pitch.suggested_venue) {
    const { data: venues } = await sb
      .from('listings')
      .select('name, description, region, state, lat, lng, vertical, sub_type, address, website')
      .ilike('name', `%${pitch.suggested_venue}%`)
      .eq('status', 'active')
      .limit(1)
    if (venues?.[0]) {
      venueData = venues[0]
      venueContext = `\n\nAnchor venue details:\nName: ${venueData.name}\nRegion: ${venueData.region || 'Unknown'}, ${venueData.state || 'Australia'}\nType: ${venueData.sub_type || venueData.vertical || 'Unknown'}\nDescription: ${(venueData.description || '').slice(0, 500)}\nAddress: ${venueData.address || 'Not listed'}\nWebsite: ${venueData.website || 'Not listed'}`
    }
  }

  // Fetch nearby listings for the "weave in" section
  let nearbyListings = []
  if (venueData?.lat && venueData?.lng) {
    const { data: nearby } = await sb
      .from('listings')
      .select('id, name, slug, vertical, region, state, description, hero_image_url')
      .eq('status', 'active')
      .not('name', 'eq', venueData.name)
      .gte('lat', venueData.lat - 0.5)
      .lte('lat', venueData.lat + 0.5)
      .gte('lng', venueData.lng - 0.5)
      .lte('lng', venueData.lng + 0.5)
      .limit(20)

    if (nearby?.length) {
      // Diversify by vertical, pick up to 5
      const seen = new Set()
      nearbyListings = nearby.filter(l => {
        if (seen.has(l.vertical) && seen.size < 5) return false
        seen.add(l.vertical)
        return true
      }).slice(0, 5)
    }
  }

  const verticalName = VERTICAL_LABELS[pitch.vertical] || pitch.vertical
  const guidance = VERTICAL_GUIDANCE[pitch.vertical] || ''

  const systemPrompt = `You are the editorial director of the Australian Atlas Network, a premium travel and culture publication covering independent Australia. You write in the style of Monocle, Kinfolk, or a quality broadsheet travel section — precise, observational, warm but never effusive.

Generate a comprehensive editorial writing brief for this pitch:

Vertical: ${verticalName} (${guidance})
Headline: ${pitch.headline}
Angle: ${pitch.angle}
Suggested venue: ${pitch.suggested_venue || 'None specified'}
Estimated read time: ${pitch.estimated_read_time}${venueContext}

${nearbyListings.length > 0 ? `\nNearby listings that could be woven into the story:\n${nearbyListings.map(l => `- ${l.name} (${VERTICAL_LABELS[l.vertical] || l.vertical}, ${l.region || l.state || 'Australia'})`).join('\n')}` : ''}

Respond in this exact JSON format:
{
  "deck": "A single sentence subheading summarising the story angle — punchy, specific, editorial",
  "the_story": "2-3 paragraphs expanding the pitch angle. What makes this story worth telling, the emotional or cultural hook, why now, why this venue or place specifically. Write as narrative prose, not bullet points.",
  "suggested_angles": [
    { "title": "Angle title", "description": "2-3 sentences describing this alternative narrative frame" },
    { "title": "Angle title", "description": "2-3 sentences" },
    { "title": "Angle title", "description": "2-3 sentences" }
  ],
  "key_questions": [
    "Specific, researched question tailored to this story — not generic",
    "Another specific question that could only apply to this venue/person/place"
  ],
  "research_notes": "2-3 paragraphs of relevant context — history, industry context, similar stories told elsewhere and how this differs, publicly available info worth knowing",
  "structural_suggestion": {
    "opening": "Suggested opening scene or lede approach",
    "sections": ["Section 1 description", "Section 2 description", "Section 3 description"],
    "closing": "Suggested ending approach"
  },
  "tone_reference": "1-2 sentences describing the suggested tone and voice, referencing the Atlas Network editorial positioning"
}

Generate 8-10 key questions. Make every element specific to THIS story — never generic journalism advice.`

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: 'Generate the full editorial brief for this pitch.' }],
      system: systemPrompt,
    })

    const text = message.content[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const brief = JSON.parse(jsonMatch[0])

    // Add nearby listings to the brief
    brief.nearby_listings = nearbyListings.map(l => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      vertical: l.vertical,
      vertical_label: VERTICAL_LABELS[l.vertical] || l.vertical,
      region: l.region,
      state: l.state,
      description: (l.description || '').slice(0, 150),
      hero_image_url: l.hero_image_url,
    }))

    // Cache in DB
    await sb
      .from('editorial_pitches')
      .update({ brief, updated_at: new Date().toISOString() })
      .eq('id', pitchId)

    return NextResponse.json({ brief, cached: false })
  } catch (err) {
    console.error('Brief generation error:', err)
    return NextResponse.json({ error: 'Failed to generate brief', detail: err.message }, { status: 500 })
  }
}
