import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { checkAdmin } from '@/lib/admin-auth'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'

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

const LISTING_FIELDS = [
  'id', 'name', 'slug', 'description', 'region', 'state', 'lat', 'lng',
  'website', 'phone', 'address', 'street_address', 'suburb', 'postcode',
  'vertical', 'sub_type', 'sub_type_secondary', 'sub_types',
  'hero_image_url', 'is_claimed', 'founded_year', 'heritage_significance',
  'best_season', 'hours', 'data_source', 'quality_score', 'completeness_score',
  'verified', 'verified_at', 'humanised', 'editors_pick',
]

const MIN_DATA_RICHNESS = 4

/**
 * Phase 1: Score listing data richness for editorial potential.
 * Returns an integer score based on how many useful fields are populated.
 */
function scoreDataRichness(listing) {
  let score = 0
  if (listing.description && listing.description.length > 80) score += 3
  if (listing.description && listing.description.length > 250) score += 2
  if (listing.website) score += 2
  if (listing.address || listing.street_address) score += 1
  if (listing.phone) score += 1
  if (listing.founded_year) score += 3
  if (listing.heritage_significance) score += 3
  if (listing.best_season) score += 1
  if (listing.hours) score += 1
  if (listing.sub_type) score += 1
  if (listing.sub_types?.length > 0) score += 1
  if (listing.hero_image_url) score += 1
  if (listing.is_claimed) score += 2
  if (listing.verified) score += 2
  if (listing.humanised) score += 1
  if (listing.editors_pick) score += 2
  if (getListingRegion(listing)) score += 1
  if (listing.lat && listing.lng) score += 1
  return score
}

/**
 * Phase 1: Deterministic candidate selection.
 * Queries the database for data-rich listings, scores them, and returns the best candidate
 * that hasn't been pitched recently.
 */
async function selectCandidate(sb, vertical) {
  const verticalFilter = VERTICAL_MAP[vertical]

  let query = sb
    .from('listings')
    .select(`${LISTING_FIELDS.join(', ')}, ${LISTING_REGION_SELECT}`)
    .eq('status', 'active')
    .not('description', 'is', null)

  if (verticalFilter) {
    query = query.eq('vertical', verticalFilter)
  }

  // Fetch a broad pool to score from
  const { data: listings, error } = await query.limit(100)

  if (error) throw new Error(`Candidate query failed: ${error.message}`)
  if (!listings || listings.length === 0) return null

  // Get recently pitched listing IDs to avoid duplicates
  const { data: recentPitches } = await sb
    .from('editorial_pitches')
    .select('listing_id')
    .not('listing_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200)

  const recentlyPitchedIds = new Set((recentPitches || []).map(p => p.listing_id))

  // Score and rank candidates
  const scored = listings
    .filter(l => !recentlyPitchedIds.has(l.id))
    .map(listing => ({
      listing,
      score: scoreDataRichness(listing),
    }))
    .filter(c => c.score >= MIN_DATA_RICHNESS)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null

  // Pick from top 5 with some randomness to avoid always pitching the same listing
  const topCandidates = scored.slice(0, 5)
  const pick = topCandidates[Math.floor(Math.random() * topCandidates.length)]

  return { listing: pick.listing, score: pick.score }
}

/**
 * Build the listing data block that gets passed to the LLM.
 * Only includes non-null fields so the LLM can see exactly what data exists.
 */
function buildListingDataBlock(listing) {
  const fields = []
  fields.push(`Name: ${listing.name}`)
  if (listing.vertical) fields.push(`Vertical: ${listing.vertical}`)
  if (listing.sub_type) fields.push(`Sub-type: ${listing.sub_type}`)
  if (listing.sub_type_secondary) fields.push(`Sub-type (secondary): ${listing.sub_type_secondary}`)
  if (listing.sub_types?.length > 0) fields.push(`Categories: ${listing.sub_types.join(', ')}`)
  const listingRegionName = getListingRegion(listing)?.name
  if (listingRegionName) fields.push(`Region: ${listingRegionName}`)
  if (listing.state) fields.push(`State: ${listing.state}`)
  if (listing.address) fields.push(`Address: ${listing.address}`)
  if (listing.street_address) fields.push(`Street address: ${listing.street_address}`)
  if (listing.suburb) fields.push(`Suburb: ${listing.suburb}`)
  if (listing.postcode) fields.push(`Postcode: ${listing.postcode}`)
  if (listing.description) fields.push(`Description: ${listing.description}`)
  if (listing.website) fields.push(`Website: ${listing.website}`)
  if (listing.phone) fields.push(`Phone: ${listing.phone}`)
  if (listing.founded_year) fields.push(`Founded: ${listing.founded_year}`)
  if (listing.heritage_significance) fields.push(`Heritage significance: yes`)
  if (listing.best_season) fields.push(`Best season: ${listing.best_season}`)
  if (listing.hours) fields.push(`Hours: ${JSON.stringify(listing.hours)}`)
  if (listing.is_claimed) fields.push(`Claimed by operator: yes`)
  if (listing.verified) fields.push(`Verified: yes`)
  if (listing.editors_pick) fields.push(`Editor's pick: yes`)
  if (listing.hero_image_url) fields.push(`Has hero image: yes`)
  return fields.join('\n')
}

/**
 * Phase 2: Generate an editorially framed pitch using the LLM,
 * strictly constrained to the provided listing data.
 */
async function generateGroundedPitch(listing, vertical, score) {
  const guidance = VERTICAL_GUIDANCE[vertical]
  const listingData = buildListingDataBlock(listing)

  const systemPrompt = `You are generating editorial article suggestions for the Atlas Network, a curated discovery platform for independent Australian venues.

CRITICAL RULES:
- You will be given the exact database record for a listing. Every factual claim in your pitch MUST come directly from this data.
- If a field is empty or null, you MUST NOT invent content for it.
- You may suggest an editorial ANGLE or FRAMING (e.g. "this could be a story about...") but the underlying facts must all be verifiable from the provided data.
- Do NOT invent operator names, founding dates, backstories, philosophies, or superlative claims.
- Do NOT use phrases like "likely", "probably", "perhaps they..." to smuggle in speculation as soft fact.
- If the listing data is too thin to support an interesting article, say so explicitly. "Insufficient data for editorial pitch" is a valid and preferred output.
- Your pitch should make clear what a human writer would need to research/verify before writing the actual article.

VERTICAL CONTEXT: ${guidance}

HERE IS THE EXACT LISTING DATA:
---
${listingData}
---

Respond in this exact JSON format:
{
  "headline": "A suggested editorial headline (make clear this is a framing, not a factual claim)",
  "editorial_angle": "1-2 sentences on why this listing is editorially interesting, grounded ONLY in the provided data",
  "pitch_summary": "3-4 sentences describing the potential article. All facts must come from the data above. Editorial framing should be clearly labelled as such (e.g. 'this could explore...')",
  "verified_facts": [
    { "claim": "The specific factual claim", "source_field": "Which database field this comes from" }
  ],
  "research_needed": ["What a human writer would need to verify or research before writing"],
  "confidence": "HIGH or MEDIUM or LOW",
  "estimated_read_time": "X min",
  "insufficient_data": false
}

If the data is too thin, respond with:
{ "insufficient_data": true, "reason": "Why the data is insufficient" }

CONFIDENCE GUIDE:
- HIGH: Rich description, multiple populated fields, clear narrative potential
- MEDIUM: Decent description, some gaps a writer could fill with research
- LOW: Thin data, angle is speculative, needs significant research`

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: 'Generate a grounded editorial pitch based on the listing data provided. Remember: every fact must come from the data. No invention.' },
    ],
    system: systemPrompt,
  })

  const text = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Failed to parse pitch JSON from response')

  return JSON.parse(jsonMatch[0])
}

/**
 * Fact-check: verify every claim in verified_facts against the actual listing data.
 * Returns the pitch with any unverifiable claims flagged.
 */
function factCheckPitch(pitch, listing) {
  if (!pitch.verified_facts || !Array.isArray(pitch.verified_facts)) return pitch

  const listingStr = JSON.stringify(listing).toLowerCase()

  const checked = pitch.verified_facts.filter(fact => {
    const field = fact.source_field?.toLowerCase()
    if (!field) return false
    // Check the referenced field actually exists and has data
    const fieldKey = field.replace(/\s+/g, '_')
    const value = listing[fieldKey] ?? listing[field]
    return value !== null && value !== undefined
  })

  pitch.verified_facts = checked
  return pitch
}

/**
 * Find cross-vertical listings near the candidate for cluster potential.
 */
async function findCrossVerticalConnections(sb, listing) {
  if (!listing.lat || !listing.lng) return []

  const { data: nearby } = await sb
    .from('listings')
    .select(`id, name, slug, vertical, region, state, sub_type, ${LISTING_REGION_SELECT}`)
    .eq('status', 'active')
    .neq('id', listing.id)
    .neq('vertical', listing.vertical)
    .gte('lat', listing.lat - 0.3)
    .lte('lat', listing.lat + 0.3)
    .gte('lng', listing.lng - 0.3)
    .lte('lng', listing.lng + 0.3)
    .limit(20)

  if (!nearby?.length) return []

  // Deduplicate by vertical, keep up to 6
  const seen = new Set()
  return nearby.filter(l => {
    if (seen.has(l.vertical)) return false
    seen.add(l.vertical)
    return true
  }).slice(0, 6).map(l => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    vertical: l.vertical,
    region: getListingRegion(l)?.name ?? null,
    state: l.state,
    sub_type: l.sub_type,
  }))
}

/**
 * Full pipeline: select candidate, generate pitch, fact-check, find connections, store.
 */
async function generatePitch(sb, vertical) {
  const guidance = VERTICAL_GUIDANCE[vertical]
  if (!guidance) throw new Error(`Unknown vertical: ${vertical}`)

  // Phase 1: Deterministic candidate selection
  const candidate = await selectCandidate(sb, vertical)
  if (!candidate) {
    throw new Error(`No suitable candidates found for ${vertical}. All data-rich listings may have been recently pitched.`)
  }

  const { listing, score } = candidate

  // Phase 2: Constrained LLM pitch generation
  const rawPitch = await generateGroundedPitch(listing, vertical, score)

  if (rawPitch.insufficient_data) {
    throw new Error(`Listing "${listing.name}" has insufficient data: ${rawPitch.reason}`)
  }

  // Quality gate: fact-check
  const checkedPitch = factCheckPitch(rawPitch, listing)

  // Cross-vertical connections
  const connections = await findCrossVerticalConnections(sb, listing)

  // Build snapshot of listing data used
  const snapshot = {}
  for (const field of LISTING_FIELDS) {
    if (listing[field] !== null && listing[field] !== undefined) {
      snapshot[field] = listing[field]
    }
  }

  // Store in database
  const { data: inserted, error } = await sb
    .from('editorial_pitches')
    .insert({
      vertical,
      headline: checkedPitch.headline,
      angle: checkedPitch.editorial_angle || checkedPitch.pitch_summary,
      suggested_venue: listing.name,
      suggested_venue_id: listing.id,
      listing_id: listing.id,
      estimated_read_time: checkedPitch.estimated_read_time || '6 min',
      status: 'active',
      confidence: checkedPitch.confidence || 'MEDIUM',
      verified_facts: checkedPitch.verified_facts || [],
      research_needed: checkedPitch.research_needed || [],
      cross_vertical_connections: connections,
      data_richness_score: score,
      listing_data_snapshot: snapshot,
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
      .select('id, vertical, headline, angle, suggested_venue, suggested_venue_id, listing_id, estimated_read_time, status, brief, confidence, verified_facts, research_needed, cross_vertical_connections, data_richness_score, created_at, updated_at')
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

      const newStatus = action === 'approve' ? 'approved' : 'rejected'
      const { data: updated, error: updateError } = await sb
        .from('editorial_pitches')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', pitchId)
        .select()
        .single()

      if (updateError) throw updateError

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
