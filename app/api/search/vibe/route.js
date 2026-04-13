import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const maxDuration = 60

const MODEL = 'claude-sonnet-4-20250514'

const VERTICAL_LABELS = {
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
 * Call Claude with timeout + single retry on 529.
 */
async function callClaude(client, params) {
  const TIMEOUT_MS = 25000

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await Promise.race([
        client.messages.create(params),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('CLAUDE_TIMEOUT')), TIMEOUT_MS)
        ),
      ])
      return result
    } catch (err) {
      if (err.message === 'CLAUDE_TIMEOUT' && attempt === 0) continue
      if (err.status === 529 && attempt === 0) continue
      throw err
    }
  }
}

/**
 * Generate a query embedding using Voyage-3 for cosine similarity search.
 * Returns null if VOYAGE_API_KEY is not set or the call fails.
 */
async function generateQueryEmbedding(text) {
  if (!process.env.VOYAGE_API_KEY) return null
  try {
    const { VoyageAIClient } = await import('voyageai')
    const client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY })
    const result = await client.embed({
      model: 'voyage-3',
      input: [text],
      inputType: 'query',
    })
    return result.data?.[0]?.embedding || null
  } catch (err) {
    console.warn('[vibe-search] Embedding generation failed:', err.message)
    return null
  }
}

/**
 * POST /api/search/vibe
 *
 * Semantic "vibe" search: takes a mood/feeling/scenario and finds matching listings.
 *
 * Strategy:
 * 1. Try pgvector cosine similarity if embeddings + Voyage key available
 * 2. Fallback: Claude expands the vibe into search phrases, text search against listings
 * 3. Claude generates a one-line "vibe reason" for each result
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const query = (body.query || '').trim()

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI search not configured' }, { status: 503 })
    }

    const sb = getSupabaseAdmin()
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    let results = []

    // Strategy 1: Vector similarity search via pgvector
    const queryEmbedding = await generateQueryEmbedding(query)

    if (queryEmbedding) {
      // Use Supabase RPC for cosine similarity search
      const { data: vectorResults, error: vecError } = await sb.rpc(
        'match_listings_by_embedding',
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.3,
          match_count: 12,
        }
      )

      if (!vecError && vectorResults && vectorResults.length > 0) {
        results = vectorResults.map(r => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          vertical: r.vertical,
          region: r.region,
          state: r.state,
          hero_image_url: r.hero_image_url,
          description: r.description,
          similarity: r.similarity,
        }))
      }
    }

    // Strategy 2: Fallback — Claude expands the vibe + text search
    if (results.length < 6) {
      const expandResponse = await callClaude(anthropic, {
        model: MODEL,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: `Given this mood/vibe: "${query}"

What kind of place is the user looking for? Return exactly 5 short descriptive phrases that would match listing descriptions for independent Australian venues. Think about atmosphere, setting, activities, and feeling.

Return ONLY a JSON array of 5 strings, no other text. Example: ["cozy fireplace reading nook", "quiet garden courtyard", "rustic country retreat", "peaceful waterside setting", "intimate candlelit atmosphere"]`,
          },
        ],
      })

      let searchPhrases = []
      try {
        const expandText = expandResponse.content[0]?.text || '[]'
        const jsonMatch = expandText.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          searchPhrases = JSON.parse(jsonMatch[0])
        }
      } catch {
        searchPhrases = [query]
      }

      if (searchPhrases.length > 0) {
        // Build OR query across all phrases
        const orConditions = searchPhrases.map(phrase => {
          const words = phrase.toLowerCase().split(/\s+/).filter(w => w.length > 3)
          return words.map(w => `description.ilike.%${w}%`).join(',')
        }).filter(Boolean)

        if (orConditions.length > 0) {
          const { data: textResults, error: textError } = await sb
            .from('listings')
            .select('id, name, slug, vertical, region, state, hero_image_url, description')
            .eq('status', 'active')
            .or(orConditions.join(','))
            .order('quality_score', { ascending: false, nullsFirst: false })
            .limit(50)

          if (!textError && textResults) {
            // Merge with any vector results (deduplicate)
            const existingIds = new Set(results.map(r => r.id))
            const newResults = textResults.filter(r => !existingIds.has(r.id))
            results = [...results, ...newResults].slice(0, 12)
          }
        }
      }

      // If still no results, try a broader approach with quality_score ordering
      if (results.length < 3) {
        const { data: fallbackData } = await sb
          .from('listings')
          .select('id, name, slug, vertical, region, state, hero_image_url, description')
          .eq('status', 'active')
          .not('description', 'is', null)
          .order('quality_score', { ascending: false, nullsFirst: false })
          .limit(50)

        if (fallbackData && fallbackData.length > 0) {
          const existingIds = new Set(results.map(r => r.id))
          // Take a random sample from top-quality listings
          const shuffled = fallbackData
            .filter(r => !existingIds.has(r.id))
            .sort(() => Math.random() - 0.5)
            .slice(0, 12 - results.length)
          results = [...results, ...shuffled]
        }
      }
    }

    // Step 3: Generate vibe reasons for results using Claude
    if (results.length > 0) {
      const listingSummaries = results.map((r, i) => {
        const desc = (r.description || '').slice(0, 150)
        const vLabel = VERTICAL_LABELS[r.vertical] || r.vertical
        return `${i + 1}. ${r.name} (${vLabel}, ${r.region || r.state || 'Australia'}): ${desc}`
      }).join('\n')

      try {
        const reasonResponse = await callClaude(anthropic, {
          model: MODEL,
          max_tokens: 800,
          messages: [
            {
              role: 'user',
              content: `The user searched for a vibe: "${query}"

Here are the matching places:
${listingSummaries}

For each place, write a one-sentence explanation (max 15 words) of why it matches the vibe. Be warm, specific, and evocative. Don't repeat the place name.

Return ONLY a JSON array of ${results.length} strings, one per place in order. Example: ["The quiet courtyard invites slow afternoons with a book", "A makers space where creativity flows freely"]`,
            },
          ],
        })

        let vibeReasons = []
        try {
          const reasonText = reasonResponse.content[0]?.text || '[]'
          const jsonMatch = reasonText.match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            vibeReasons = JSON.parse(jsonMatch[0])
          }
        } catch {
          vibeReasons = []
        }

        // Attach reasons to results
        results = results.map((r, i) => ({
          ...r,
          vibe_reason: vibeReasons[i] || null,
          description: undefined, // Don't send full description to client
        }))
      } catch (err) {
        console.warn('[vibe-search] Reason generation failed:', err.message)
        results = results.map(r => ({
          ...r,
          vibe_reason: null,
          description: undefined,
        }))
      }
    }

    return NextResponse.json({
      results: results.slice(0, 12),
      query,
    })
  } catch (err) {
    console.error('[vibe-search] Error:', err)
    return NextResponse.json(
      { error: 'Vibe search failed. Please try again.' },
      { status: 500 }
    )
  }
}
