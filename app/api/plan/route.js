import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import Anthropic from '@anthropic-ai/sdk'
import { guardedAnthropicMessage } from '@/lib/ai/guardedAnthropic'
import { embedQuery } from '@/lib/embeddings/voyage'
import { logSearchEvent } from '@/lib/search/log'
import { checkRateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

const HAIKU = 'claude-haiku-4-5-20251001'
const SONNET = 'claude-sonnet-4-6'

const VERTICAL_LABELS = {
  sba: 'Small Batch Atlas (wineries, distilleries, breweries, artisan producers)',
  collection: 'Culture Atlas (galleries, museums, heritage sites)',
  craft: 'Craft Atlas (makers, studios, workshops)',
  fine_grounds: 'Fine Grounds Atlas (specialty coffee, roasters)',
  rest: 'Rest Atlas (boutique stays, accommodation)',
  field: 'Field Atlas (national parks, walks, swimming holes)',
  corner: 'Corner Atlas (independent shops, bookshops)',
  found: 'Found Atlas (vintage, antique, secondhand)',
  table: 'Table Atlas (restaurants, farm gates, providores)',
}

const SYSTEM_PROMPT = `You are the Australian Atlas Concierge — an expert on independent Australia. You help travellers plan trips using verified venues from the Australian Atlas network: ten curated directories covering artisan producers, specialty coffee, galleries, makers, boutique stays, natural places, independent shops, vintage stores, and restaurants.

Your personality: knowledgeable but conversational, opinionated but not pushy. You speak like a well-travelled local friend — you know the back roads, the unlisted cellar doors, the cafe that's only open Thursday to Sunday. You never sound like a tourism brochure.

RULES:
- Only recommend venues from the VENUE DATA provided in each turn. Never invent venue names, addresses, or details.
- If asked about a region or type with no matching venues in the data, say so honestly rather than making something up.
- Keep responses concise — 2-4 paragraphs max for general advice, structured lists for itineraries.
- When building an itinerary, consider: day rhythm (coffee first, producers/culture midday, breweries/wine afternoon), geographic clustering (don't zigzag), seasonal relevance, and mix of verticals.
- For accommodation, suggest Rest Atlas venues when available.
- Always mention the region and vertical type naturally in your recommendations.
- If the user's request is vague, ask one clarifying question (don't ask more than one at a time).
- You can suggest collections and trails on Australian Atlas when relevant.`

function buildClaudeClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

async function callClaude(client, params) {
  const TIMEOUT_MS = 30000
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await Promise.race([
        guardedAnthropicMessage(client, params),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('CLAUDE_TIMEOUT')), TIMEOUT_MS)
        ),
      ])
    } catch (err) {
      if ((err.message === 'CLAUDE_TIMEOUT' || err.status === 529) && attempt === 0) continue
      throw err
    }
  }
}

async function generateQueryEmbedding(text) {
  if (!process.env.VOYAGE_API_KEY) return null
  try {
    return await embedQuery(text)
  } catch (e) {
    console.warn('[plan] query embed failed:', e.message)
    return null
  }
}

// Stage 1: Extract intent and entities using Haiku
async function extractIntent(client, messages) {
  const lastMessage = messages[messages.length - 1].content
  const conversationContext = messages.length > 1
    ? messages.slice(-4, -1).map(m => `${m.role}: ${m.content}`).join('\n')
    : ''

  const res = await callClaude(client, {
    model: HAIKU,
    max_tokens: 500,
    system: `Extract travel planning intent from the user's message. Return valid JSON only, no markdown.

JSON schema:
{
  "intent": "plan_trip" | "ask_recommendation" | "refine_plan" | "general_question" | "greeting",
  "regions": ["region names mentioned or implied"],
  "verticals": ["sba", "collection", "craft", "fine_grounds", "rest", "field", "corner", "found", "table"],
  "duration_days": number or null,
  "preferences": ["specific interests like 'wine', 'coffee', 'hiking', 'family-friendly'"],
  "search_query": "a natural language description of what venues to search for",
  "needs_venues": true/false
}

Only include verticals that match the user's interests. If they mention wine → sba, coffee → fine_grounds, galleries → collection, etc.
If this is a greeting or general question that doesn't need venue data, set needs_venues to false.`,
    messages: [
      { role: 'user', content: conversationContext
        ? `Previous conversation:\n${conversationContext}\n\nLatest message: ${lastMessage}`
        : lastMessage
      }
    ],
  })

  try {
    const text = res.content[0].text.trim()
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return {
      intent: 'general_question',
      regions: [],
      verticals: [],
      duration_days: null,
      preferences: [],
      search_query: lastMessage,
      needs_venues: true,
    }
  }
}

// Fetch relevant venues based on extracted intent
async function fetchVenues(intent) {
  const sb = getSupabaseAdmin()
  const venues = []
  let vectorFired = false

  // Vector search if we have a search query
  if (intent.search_query && intent.needs_venues) {
    const embedding = await generateQueryEmbedding(intent.search_query)

    if (embedding) {
      // Canonical hybrid retrieval (lexical + semantic RRF). query_text feeds
      // the lexical arm; default similarity_floor (0.48) gates the semantic arm.
      const { data } = await sb.rpc('search_listings_hybrid', {
        query_embedding: `[${embedding.join(',')}]`,
        query_text: intent.search_query,
        match_count: 30,
      })
      if (data && data.length) { venues.push(...data); vectorFired = true }
    }
  }

  // Supplement with region + vertical queries if we have specific intent
  if (intent.regions.length > 0 || intent.verticals.length > 0) {
    let query = sb
      .from('listings')
      .select('id, name, slug, vertical, region, state, description, lat, lng, sub_type, hero_image_url, quality_score, website')
      .eq('status', 'active')
      .or('address_on_request.eq.false,address_on_request.is.null')
      .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
      .order('quality_score', { ascending: false, nullsFirst: false })
      .limit(40)

    if (intent.verticals.length > 0 && intent.verticals.length < 9) {
      query = query.in('vertical', intent.verticals)
    }

    if (intent.regions.length > 0) {
      const regionFilter = intent.regions.map(r => `region.ilike.%${r}%`).join(',')
      query = query.or(regionFilter)
    }

    const { data } = await query
    if (data) {
      const existingIds = new Set(venues.map(v => v.id))
      for (const v of data) {
        if (!existingIds.has(v.id)) venues.push(v)
      }
    }
  }

  // If we still have no venues but need them, do a broad quality-based fetch
  if (venues.length === 0 && intent.needs_venues) {
    const { data } = await sb
      .from('listings')
      .select('id, name, slug, vertical, region, state, description, lat, lng, sub_type, hero_image_url, quality_score, website')
      .eq('status', 'active')
      .or('address_on_request.eq.false,address_on_request.is.null')
      .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
      .order('quality_score', { ascending: false, nullsFirst: false })
      .limit(20)

    if (data) venues.push(...data)
  }

  const result = venues.slice(0, 50)
  logSearchEvent(sb, {
    query_text: intent.search_query || null, surface: 'plan',
    result_count: result.length, vector_arm_fired: vectorFired,
    fell_back: !vectorFired, zero_result: result.length === 0,
  })
  return result
}

// Fetch relevant collections for context
async function fetchCollections(intent) {
  if (!intent.needs_venues) return []
  const sb = getSupabaseAdmin()

  let query = sb
    .from('collections')
    .select('title, slug, description, region')
    .eq('published', true)
    .limit(5)

  if (intent.regions.length > 0) {
    const regionFilter = intent.regions.map(r => `region.ilike.%${r}%`).join(',')
    query = query.or(regionFilter)
  }

  const { data } = await query
  return data || []
}

// Stage 2: Generate response using Sonnet with venue data
async function generateResponse(client, messages, venues, collections, intent) {
  const venueContext = venues.length > 0
    ? `\n\nVENUE DATA (${venues.length} verified venues from Australian Atlas):\n${venues.map(v =>
        `- ${v.name} | ${VERTICAL_LABELS[v.vertical]?.split('(')[0]?.trim() || v.vertical} | ${v.region || 'Unknown'}, ${v.state || ''} | ${v.description ? v.description.slice(0, 120) : 'No description'}${v.lat && v.lng ? ` | (${v.lat}, ${v.lng})` : ''}`
      ).join('\n')}`
    : '\n\nNo venue data available for this query.'

  const collectionContext = collections.length > 0
    ? `\n\nRELATED COLLECTIONS on Australian Atlas:\n${collections.map(c =>
        `- "${c.title}" (/collections/${c.slug})${c.region ? ` — ${c.region}` : ''}`
      ).join('\n')}`
    : ''

  const systemWithData = SYSTEM_PROMPT + venueContext + collectionContext

  // Build message history for multi-turn conversation
  const claudeMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  const res = await callClaude(client, {
    model: SONNET,
    max_tokens: 1500,
    system: systemWithData,
    messages: claudeMessages,
  })

  const text = res.content[0].text

  // Extract any venue references for map pins
  const mentionedVenues = venues.filter(v =>
    text.toLowerCase().includes(v.name.toLowerCase())
  ).map(v => ({
    id: v.id,
    name: v.name,
    slug: v.slug,
    vertical: v.vertical,
    region: v.region,
    lat: v.lat,
    lng: v.lng,
    hero_image_url: v.hero_image_url,
  }))

  return { text, mentionedVenues }
}

export async function POST(request) {
  // Public + LLM-backed — throttle to protect the shared AI budget.
  const rl = checkRateLimit(request, { keyPrefix: 'plan', maxRequests: 15, windowMs: 60_000 })
  if (rl) return rl
  try {
    const { messages } = await request.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'API not configured' }, { status: 500 })
    }

    const client = buildClaudeClient()

    // Stage 1: Extract intent
    const intent = await extractIntent(client, messages)

    // Fetch venues and collections in parallel
    const [venues, collections] = await Promise.all([
      intent.needs_venues ? fetchVenues(intent) : Promise.resolve([]),
      fetchCollections(intent),
    ])

    // Stage 2: Generate response
    const { text, mentionedVenues } = await generateResponse(
      client, messages, venues, collections, intent
    )

    return NextResponse.json({
      response: text,
      venues: mentionedVenues,
      intent: intent.intent,
    })
  } catch (err) {
    console.error('[plan] Error:', err.message)

    if (err.message === 'CLAUDE_TIMEOUT') {
      return NextResponse.json({
        response: "I'm taking a moment to think about that — the system is a bit busy right now. Could you try again in a few seconds?",
        venues: [],
        intent: 'error',
      })
    }

    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
