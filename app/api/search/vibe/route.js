import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { embedQueryCached } from '@/lib/embeddings/queryCache'
import { logSearchEvent } from '@/lib/search/log'
import { isVerticalPublic } from '@/lib/verticalUrl'
import { parseQueryLocation } from '@/lib/search/parseQuery'
import { resolveQueryRegion } from '@/lib/search/resolveQueryRegion'

export const maxDuration = 60

const MODEL = 'claude-sonnet-4-20250514'
const SIMILARITY_FLOOR = 0.48

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture Atlas', craft: 'Maker Studios',
  fine_grounds: 'Fine Grounds', rest: 'Boutique Stays', field: 'Field Atlas',
  corner: 'Corner Atlas', found: 'Found Atlas', table: 'Table Atlas',
}

/** Call Claude with timeout + single retry on 529. */
async function callClaude(client, params) {
  const TIMEOUT_MS = 25000
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await Promise.race([
        client.messages.create(params),
        new Promise((_, reject) => setTimeout(() => reject(new Error('CLAUDE_TIMEOUT')), TIMEOUT_MS)),
      ])
    } catch (err) {
      if ((err.message === 'CLAUDE_TIMEOUT' || err.status === 529) && attempt === 0) continue
      throw err
    }
  }
}

/**
 * POST /api/search/vibe
 *
 * Semantic "vibe" search. Ranking is the canonical search_listings_hybrid RPC —
 * the semantic arm is the vibe embedding, the lexical arm is the text. Claude is
 * used ONLY as optional enrichment (OR-expanding the lexical query_text) and to
 * write a one-line "vibe reason" per result. If nothing clears the similarity
 * floor the result set is honestly empty — never padded with random listings.
 */
export async function POST(request) {
  const t0 = Date.now()
  try {
    const body = await request.json()
    const query = (body.query || '').trim()
    if (!query) return NextResponse.json({ error: 'Query is required' }, { status: 400 })

    const sb = getSupabaseAdmin()

    // Hard location constraint so the vibe arms rank within-location instead of
    // nationwide (the cross-state bug). A region NAMED in the query ("...in the
    // Mornington Peninsula") binds that region; otherwise fall back to its state.
    let filterRegion = null
    let filterState = null
    let cleaned
    {
      const qr = await resolveQueryRegion(sb, query)
      if (qr.region) {
        filterRegion = qr.region.id
        cleaned = qr.cleaned
      } else {
        const parsed = parseQueryLocation(query)
        filterState = parsed.state
        cleaned = parsed.cleaned
      }
    }

    // Semantic arm: embed the (location-stripped) vibe. null on Voyage failure -> lexical-only.
    const { lit: queryEmbedding, error: voyageError } = await embedQueryCached(sb, cleaned)

    // Optional Claude client (enrichment + reasons). No key -> skip both, search still works.
    let anthropic = null
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const mod = await import('@anthropic-ai/sdk')
        anthropic = new mod.default({ apiKey: process.env.ANTHROPIC_API_KEY })
      } catch { anthropic = null }
    }

    // Optional enrichment: OR-expand the lexical query_text with vibe phrases.
    let queryText = cleaned
    if (anthropic) {
      try {
        const exp = await callClaude(anthropic, {
          model: MODEL,
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `Mood/vibe: "${cleaned}". Return ONLY a JSON array of 4 short noun phrases (2-3 words each) describing the kind of independent Australian venue this evokes. Example: ["pottery studio","rustic retreat","quiet garden","wood fired"]`,
          }],
        })
        const m = (exp?.content?.[0]?.text || '').match(/\[[\s\S]*\]/)
        if (m) {
          const phrases = JSON.parse(m[0]).filter((p) => typeof p === 'string' && p.trim()).slice(0, 5)
          if (phrases.length) queryText = `${cleaned} OR ${phrases.map((p) => `"${p.replace(/"/g, '')}"`).join(' OR ')}`
        }
      } catch (e) {
        console.warn('[vibe-search] expansion skipped:', e.message)
      }
    }

    // Rank in Postgres via the canonical hybrid RPC.
    const { data, error } = await sb.rpc('search_listings_hybrid', {
      query_embedding: queryEmbedding,
      query_text: queryText,
      filter_state: filterState,
      filter_region: filterRegion,
      match_count: 12,
      similarity_floor: SIMILARITY_FLOOR,
      include_way: isVerticalPublic('way'),
    })

    if (error) {
      console.error('[vibe-search] hybrid error:', error.message)
      logSearchEvent(sb, { query_text: query, surface: 'vibe', result_count: 0, latency_ms: Date.now() - t0, vector_arm_fired: !!queryEmbedding, fell_back: !queryEmbedding, voyage_error: voyageError || error.message, zero_result: true })
      return NextResponse.json({ results: [], query })
    }

    let results = (data || []).map((r) => ({
      id: r.id, name: r.name, slug: r.slug, vertical: r.vertical,
      region: r.region, state: r.state, hero_image_url: r.hero_image_url,
      similarity: r.similarity, _description: r.description || '',
    }))

    // Honest empty — never pad.
    if (results.length === 0) {
      logSearchEvent(sb, { query_text: query, surface: 'vibe', result_count: 0, latency_ms: Date.now() - t0, vector_arm_fired: !!queryEmbedding, fell_back: !queryEmbedding, voyage_error: voyageError, zero_result: true })
      return NextResponse.json({ results: [], query })
    }

    // Vibe reasons (optional UX).
    if (anthropic) {
      try {
        const summaries = results.map((r, i) => {
          const desc = (r._description || '').slice(0, 150)
          const vLabel = VERTICAL_LABELS[r.vertical] || r.vertical
          return `${i + 1}. ${r.name} (${vLabel}, ${r.region || r.state || 'Australia'}): ${desc}`
        }).join('\n')
        const reasonResponse = await callClaude(anthropic, {
          model: MODEL,
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `The user searched for a vibe: "${query}"\n\nHere are the matching places:\n${summaries}\n\nFor each place, write a one-sentence explanation (max 15 words) of why it matches the vibe. Be warm, specific, evocative. Don't repeat the place name.\n\nReturn ONLY a JSON array of ${results.length} strings, one per place in order.`,
          }],
        })
        const m = (reasonResponse?.content?.[0]?.text || '').match(/\[[\s\S]*\]/)
        const reasons = m ? JSON.parse(m[0]) : []
        results = results.map((r, i) => ({ ...r, vibe_reason: reasons[i] || null }))
      } catch (e) {
        console.warn('[vibe-search] reasons skipped:', e.message)
        results = results.map((r) => ({ ...r, vibe_reason: null }))
      }
    } else {
      results = results.map((r) => ({ ...r, vibe_reason: null }))
    }

    const out = results.map(({ _description, ...rest }) => rest)
    logSearchEvent(sb, { query_text: query, surface: 'vibe', result_count: out.length, latency_ms: Date.now() - t0, vector_arm_fired: !!queryEmbedding, fell_back: !queryEmbedding, voyage_error: voyageError, zero_result: false })

    return NextResponse.json({ results: out, query })
  } catch (err) {
    console.error('[vibe-search] Error:', err)
    return NextResponse.json({ error: 'Vibe search failed. Please try again.' }, { status: 500 })
  }
}
