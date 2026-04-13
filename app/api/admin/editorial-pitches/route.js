import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'

const VERTICAL_GUIDANCE = {
  sba: 'Small Batch Atlas — distilleries, breweries, cideries, wineries, bottle shops. Stories about makers, process, place, provenance.',
  collection: 'Culture Atlas — museums, galleries, heritage sites. Stories about collections, curators, the buildings themselves, overlooked institutions.',
  craft: 'Craft Atlas — studios, makers, artisans. Stories about practice, material, the relationship between maker and place.',
  fine_grounds: 'Fine Grounds Atlas — specialty roasters and independent cafes. Stories about coffee culture, sourcing, the cafe as community anchor.',
  rest: 'Rest Atlas — boutique accommodation, farm stays, glamping. Stories about escape, landscape, the hosts themselves.',
  field: 'Field Atlas — swimming holes, waterfalls, lookouts, natural places. Stories about access, seasons, the experience of being there.',
  found: 'Found Atlas — antique shops, vintage dealers, markets. Stories about objects, provenance, the hunt.',
  corner: 'Corner Atlas — bookshops, record stores, vinyl. Stories about curation, community, the shop as cultural institution.',
  table: 'Table Atlas — farm gates, food producers, providores. Stories about growing, making, the paddock-to-plate relationship.',
  portal: 'Australian Atlas portal — cross-vertical stories about regions, journeys, the experience of independent Australia.',
}

const VERTICAL_MAP = {
  sba: 'sba',
  collection: 'collection',
  craft: 'craft',
  fine_grounds: 'fine_grounds',
  rest: 'rest',
  field: 'field',
  found: 'found',
  corner: 'corner',
  table: 'table',
  portal: null,
}

/**
 * Fetch 3 random active listings for a vertical to use as context.
 */
async function getListingContext(sb, vertical) {
  const verticalFilter = VERTICAL_MAP[vertical]

  let query = sb
    .from('listings')
    .select('name, region, state, description')
    .eq('status', 'active')
    .not('description', 'is', null)
    .limit(20)

  if (verticalFilter) {
    query = query.eq('vertical', verticalFilter)
  }

  const { data } = await query

  if (!data || data.length === 0) return ''

  // Pick 3 random listings from the results
  const shuffled = data.sort(() => 0.5 - Math.random())
  const sample = shuffled.slice(0, 3)

  return sample
    .map((l, i) => `${i + 1}. ${l.name}${l.region ? ` (${l.region}, ${l.state || 'Australia'})` : ''}\n   ${(l.description || '').slice(0, 200)}`)
    .join('\n\n')
}

/**
 * Generate a new editorial pitch for a vertical using Anthropic API.
 */
async function generatePitch(sb, vertical) {
  const guidance = VERTICAL_GUIDANCE[vertical]
  if (!guidance) throw new Error(`Unknown vertical: ${vertical}`)

  const listingContext = await getListingContext(sb, vertical)

  const systemPrompt = `You are the editorial director of the Australian Atlas Network, a premium travel and culture publication covering independent Australia. Generate a single article pitch for ${guidance}

The pitch must be:
- Specific to a real, named Australian place, venue, producer, maker, or natural feature
- Story-led with a narrative angle — never a listicle or "10 best..." format
- Written in the style of Monocle or a quality travel publication
- Relevant to Australian tourism infrastructure and independent operators

${listingContext ? `Here are some real listings from this vertical to inspire your pitch (you may reference one directly or use them as inspiration):\n${listingContext}` : ''}

Respond in this exact JSON format:
{
  "headline": "A compelling, specific headline",
  "angle": "Two to three sentences explaining what makes this story worth writing and the narrative approach",
  "suggested_venue": "The name of a real venue or place to anchor the story",
  "estimated_read_time": "X min"
}`

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [
      { role: 'user', content: 'Generate an editorial pitch.' },
    ],
    system: systemPrompt,
  })

  // Extract text from the response
  const text = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')

  // Parse JSON from the response — handle markdown code fences
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Failed to parse pitch JSON from response')

  const pitch = JSON.parse(jsonMatch[0])

  // Insert into the database
  const { data: inserted, error } = await sb
    .from('editorial_pitches')
    .insert({
      vertical,
      headline: pitch.headline,
      angle: pitch.angle,
      suggested_venue: pitch.suggested_venue || null,
      estimated_read_time: pitch.estimated_read_time || '6 min',
      status: 'active',
    })
    .select()
    .single()

  if (error) throw new Error(`DB insert failed: ${error.message}`)

  return inserted
}

/**
 * When a pitch is approved, create a draft article in the articles table.
 */
async function createArticleDraft(sb, pitch) {
  const verticalLabels = {
    sba: 'Small Batch',
    collection: 'Culture',
    craft: 'Craft',
    fine_grounds: 'Fine Grounds',
    rest: 'Rest',
    field: 'Field',
    found: 'Found',
    corner: 'Corner',
    table: 'Table',
    portal: 'Editorial',
  }

  const slug = pitch.headline
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)

  const cmsId = `pitch-${pitch.id}`

  const { error } = await sb
    .from('articles')
    .insert({
      cms_id: cmsId,
      vertical: pitch.vertical === 'portal' ? 'atlas' : pitch.vertical,
      title: pitch.headline,
      slug: `${slug}-${Date.now().toString(36)}`,
      excerpt: pitch.angle,
      body: null,
      status: 'draft',
      category: verticalLabels[pitch.vertical] || 'Editorial',
    })

  if (error) {
    console.error('[editorial-pitches] Article draft creation failed:', error.message)
    // Non-fatal — pitch approval still succeeds
  }
}

/**
 * GET /api/admin/editorial-pitches
 * Returns all active pitches, one per vertical.
 */
export async function GET() {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('editorial_pitches')
      .select('id, vertical, headline, angle, suggested_venue, suggested_venue_id, estimated_read_time, status, brief, created_at, updated_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Deduplicate: keep only the most recent active pitch per vertical
    const byVertical = {}
    for (const pitch of data || []) {
      if (!byVertical[pitch.vertical]) {
        byVertical[pitch.vertical] = pitch
      }
    }

    return NextResponse.json({ pitches: byVertical })
  } catch (err) {
    console.error('[editorial-pitches] GET error:', err.message)
    return NextResponse.json({ error: 'Failed to fetch pitches' }, { status: 500 })
  }
}

/**
 * POST /api/admin/editorial-pitches
 * Actions: approve, reject, generate
 */
export async function POST(request) {
  const cookieStore = await cookies()
  if (!(await checkAdmin(cookieStore))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action, vertical, pitchId } = body

    if (!action || !vertical) {
      return NextResponse.json({ error: 'Missing action or vertical' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    if (action === 'generate') {
      const pitch = await generatePitch(sb, vertical)
      return NextResponse.json({ pitch })
    }

    if (action === 'approve' || action === 'reject') {
      if (!pitchId) {
        return NextResponse.json({ error: 'Missing pitchId' }, { status: 400 })
      }

      // Update the pitch status
      const newStatus = action === 'approve' ? 'approved' : 'rejected'
      const { data: updated, error: updateError } = await sb
        .from('editorial_pitches')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', pitchId)
        .select()
        .single()

      if (updateError) throw updateError

      // If approved, create an article draft
      if (action === 'approve' && updated) {
        await createArticleDraft(sb, updated)
      }

      // Generate a replacement pitch for this vertical
      const newPitch = await generatePitch(sb, vertical)

      return NextResponse.json({ pitch: newPitch, previous: { id: pitchId, status: newStatus } })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('[editorial-pitches] POST error:', err.message)
    return NextResponse.json({ error: err.message || 'Failed to process pitch action' }, { status: 500 })
  }
}
