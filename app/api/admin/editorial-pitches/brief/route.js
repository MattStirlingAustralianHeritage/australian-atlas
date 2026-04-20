import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
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
 * POST: Generate or return cached brief for a pitch.
 * Now uses the listing_data_snapshot stored with the pitch for grounding.
 */
export async function POST(request) {
  const cookieStore = await cookies()
  const admin = await checkAdmin(cookieStore)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pitchId } = await request.json()
  if (!pitchId) return NextResponse.json({ error: 'pitchId required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  const { data: pitch, error: pitchErr } = await sb
    .from('editorial_pitches')
    .select('id, vertical, headline, angle, suggested_venue, suggested_venue_id, listing_id, estimated_read_time, status, brief, confidence, verified_facts, research_needed, listing_data_snapshot, created_at, updated_at')
    .eq('id', pitchId)
    .single()

  if (pitchErr || !pitch) return NextResponse.json({ error: 'Pitch not found' }, { status: 404 })

  if (pitch.brief) {
    return NextResponse.json({ brief: pitch.brief, cached: true })
  }

  // Use the listing data snapshot if available, otherwise fetch fresh
  let venueData = null
  let venueContext = ''
  const listingId = pitch.listing_id || pitch.suggested_venue_id

  if (pitch.listing_data_snapshot) {
    venueData = pitch.listing_data_snapshot
  } else if (listingId) {
    const { data: venue } = await sb
      .from('listings')
      .select('name, description, region, state, lat, lng, vertical, sub_type, address, website, founded_year, heritage_significance, best_season, is_claimed, phone')
      .eq('id', listingId)
      .single()
    if (venue) venueData = venue
  }

  if (!venueData && pitch.suggested_venue) {
    const { data: venues } = await sb
      .from('listings')
      .select('name, description, region, state, lat, lng, vertical, sub_type, address, website, founded_year, heritage_significance, best_season, is_claimed, phone')
      .ilike('name', `%${pitch.suggested_venue}%`)
      .eq('status', 'active')
      .limit(1)
    if (venues?.[0]) venueData = venues[0]
  }

  if (venueData) {
    const lines = [`Name: ${venueData.name}`]
    if (venueData.region) lines.push(`Region: ${venueData.region}, ${venueData.state || 'Australia'}`)
    if (venueData.sub_type || venueData.vertical) lines.push(`Type: ${venueData.sub_type || venueData.vertical}`)
    if (venueData.description) lines.push(`Description: ${venueData.description}`)
    if (venueData.address) lines.push(`Address: ${venueData.address}`)
    if (venueData.website) lines.push(`Website: ${venueData.website}`)
    if (venueData.phone) lines.push(`Phone: ${venueData.phone}`)
    if (venueData.founded_year) lines.push(`Founded: ${venueData.founded_year}`)
    if (venueData.heritage_significance) lines.push(`Heritage significance: yes`)
    if (venueData.best_season) lines.push(`Best season: ${venueData.best_season}`)
    if (venueData.is_claimed) lines.push(`Claimed by operator: yes`)
    venueContext = `\n\nANCHOR VENUE DATA (all facts must come from this):\n---\n${lines.join('\n')}\n---`
  }

  // Fetch nearby listings for cross-vertical weaving
  let nearbyListings = []
  const lat = venueData?.lat
  const lng = venueData?.lng
  if (lat && lng) {
    const { data: nearby } = await sb
      .from('listings')
      .select('id, name, slug, vertical, region, state, description, hero_image_url')
      .eq('status', 'active')
      .neq('name', venueData.name)
      .gte('lat', lat - 0.5)
      .lte('lat', lat + 0.5)
      .gte('lng', lng - 0.5)
      .lte('lng', lng + 0.5)
      .limit(20)

    if (nearby?.length) {
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

  const verifiedFactsContext = pitch.verified_facts?.length > 0
    ? `\n\nVERIFIED FACTS FROM PITCH (use these as your factual foundation):\n${pitch.verified_facts.map(f => `- ${f.claim} [source: ${f.source_field}]`).join('\n')}`
    : ''

  const researchContext = pitch.research_needed?.length > 0
    ? `\n\nIDENTIFIED RESEARCH GAPS:\n${pitch.research_needed.map(r => `- ${r}`).join('\n')}`
    : ''

  const systemPrompt = `You are the editorial director of the Australian Atlas Network, a premium travel and culture publication covering independent Australia. You write in the style of Monocle, Kinfolk, or a quality broadsheet travel section — precise, observational, warm but never effusive.

CRITICAL GROUNDING RULES:
- Every factual claim in the brief MUST come from the venue data provided below.
- Do NOT invent operator names, founding dates, backstories, philosophies, or superlative claims.
- If information is not in the data, say what a writer would need to research — do not fill gaps with speculation.
- Clearly separate FACTS (from data) from EDITORIAL FRAMING (your suggested angle/approach).

Generate a comprehensive editorial writing brief for this pitch:

Vertical: ${verticalName} (${guidance})
Headline: ${pitch.headline}
Angle: ${pitch.angle}
Suggested venue: ${pitch.suggested_venue || 'None specified'}
Confidence: ${pitch.confidence || 'MEDIUM'}
Estimated read time: ${pitch.estimated_read_time}${venueContext}${verifiedFactsContext}${researchContext}

${nearbyListings.length > 0 ? `\nNearby verified listings that could be woven into the story:\n${nearbyListings.map(l => `- ${l.name} (${VERTICAL_LABELS[l.vertical] || l.vertical}, ${l.region || l.state || 'Australia'})`).join('\n')}` : ''}

Respond in this exact JSON format:
{
  "deck": "A single sentence subheading summarising the story angle — punchy, specific, editorial",
  "the_story": "2-3 paragraphs expanding the pitch angle. What makes this story worth telling, the emotional or cultural hook, why now, why this venue or place specifically. Write as narrative prose, not bullet points. ONLY reference facts from the provided data.",
  "suggested_angles": [
    { "title": "Angle title", "description": "2-3 sentences describing this alternative narrative frame" },
    { "title": "Angle title", "description": "2-3 sentences" },
    { "title": "Angle title", "description": "2-3 sentences" }
  ],
  "key_questions": [
    "Specific question tailored to this story that a writer would need to answer through reporting"
  ],
  "research_notes": "What is known from the data, what gaps exist, and what a writer should investigate. Be explicit about what is FACT vs what needs VERIFICATION.",
  "structural_suggestion": {
    "opening": "Suggested opening scene or lede approach",
    "sections": ["Section 1 description", "Section 2 description", "Section 3 description"],
    "closing": "Suggested ending approach"
  },
  "tone_reference": "1-2 sentences describing the suggested tone and voice"
}

Generate 8-10 key questions. Make every element specific to THIS story — never generic journalism advice.`

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    let brief = null
    let lastError = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 6000,
          messages: [{ role: 'user', content: 'Generate the full editorial brief for this pitch. Every fact must come from the provided data. Respond with ONLY valid JSON, no markdown fences.' }],
          system: systemPrompt,
        })

        const text = message.content[0]?.text || ''
        if (!text || text.trim().length < 10) {
          throw new Error(`Empty or too-short response on attempt ${attempt} (${text.length} chars)`)
        }

        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          throw new Error(`No JSON object found in response on attempt ${attempt}`)
        }

        brief = JSON.parse(jsonMatch[0])
        break
      } catch (attemptErr) {
        lastError = attemptErr
        console.error(`Brief generation attempt ${attempt}/3 failed:`, attemptErr.message)
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000 * attempt))
        }
      }
    }

    if (!brief) {
      throw lastError || new Error('Brief generation failed after 3 attempts')
    }

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
