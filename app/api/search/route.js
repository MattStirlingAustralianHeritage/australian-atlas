import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

let openai = null
function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openai) {
    const OpenAI = require('openai').default
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openai
}

async function generateQueryEmbedding(query) {
  const client = getOpenAI()
  if (!client) return null
  try {
    const res = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    })
    return res.data[0].embedding
  } catch (e) {
    console.error('[search] embedding generation error:', e.message)
    return null
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const vertical = searchParams.get('vertical') || null
  const state = searchParams.get('state') || null
  const region = searchParams.get('region') || null
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10), 100)
  const offset = (page - 1) * limit

  const sb = getSupabaseAdmin()

  try {
    // If there's a text query, use full-text search (+ optional semantic)
    if (q && q.trim()) {
      const query = q.trim()

      // Always run FTS
      const ftsPromise = Promise.all([
        sb.rpc('search_listings', {
          query,
          vertical_filter: vertical || null,
          state_filter: state || null,
          result_limit: limit,
          result_offset: offset,
        }),
        sb.rpc('search_listings_count', {
          query,
          vertical_filter: vertical || null,
          state_filter: state || null,
        }),
      ])

      // Optionally run semantic search in parallel (only on page 1)
      let semanticPromise = Promise.resolve(null)
      if (page === 1 && process.env.OPENAI_API_KEY) {
        semanticPromise = (async () => {
          const embedding = await generateQueryEmbedding(query)
          if (!embedding) return null
          const { data, error } = await sb.rpc('search_listings_semantic', {
            query_embedding: JSON.stringify(embedding),
            vertical_filter: vertical || null,
            state_filter: state || null,
            match_threshold: 0.3,
            limit_count: limit,
          })
          if (error) {
            console.error('[search] semantic error:', error.message)
            return null
          }
          return data
        })()
      }

      const [[{ data: ftsData, error: ftsError }, { data: countData, error: countError }], semanticData] =
        await Promise.all([ftsPromise, semanticPromise])

      if (ftsError) {
        console.error('[search] FTS error:', ftsError.message)
        return NextResponse.json({ error: ftsError.message }, { status: 500 })
      }

      let listings = ftsData || []
      const total = countError ? listings.length : (countData ?? 0)

      // Merge semantic results if available (deduplicate, append new ones)
      if (semanticData && semanticData.length > 0 && page === 1) {
        const ftsIds = new Set(listings.map(l => l.id))
        const newSemantic = semanticData.filter(l => !ftsIds.has(l.id))
        if (newSemantic.length > 0) {
          listings = [...listings, ...newSemantic.slice(0, Math.max(0, limit - listings.length))]
        }
      }

      return NextResponse.json({
        listings,
        total: Math.max(total, listings.length),
        page,
        limit,
        totalPages: Math.ceil(Math.max(total, listings.length) / limit),
      })
    }

    // No text query — standard listing fetch with filters
    let query = sb
      .from('listings')
      .select('id, vertical, name, slug, description, region, state, lat, lng, hero_image_url, is_featured, is_claimed, website', { count: 'exact' })
      .eq('status', 'active')
      .order('is_featured', { ascending: false })
      .order('name')
      .range(offset, offset + limit - 1)

    if (vertical) query = query.eq('vertical', vertical)
    if (state) query = query.eq('state', state)
    if (region) query = query.eq('region', region)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      listings: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    })
  } catch (err) {
    console.error('[search] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
