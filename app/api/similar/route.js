import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

export const revalidate = 3600

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const listingId = searchParams.get('listing_id')

  if (!listingId) {
    return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })
  }

  try {
    const sb = getSupabaseAdmin()

    // Fetch the listing's embedding, vertical, and suburb
    const { data: listing, error: listingError } = await sb
      .from('listings')
      .select('id, vertical, suburb, embedding')
      .eq('id', listingId)
      .maybeSingle()

    if (listingError || !listing) {
      return NextResponse.json({ results: [] })
    }

    if (!listing.embedding) {
      return NextResponse.json({ results: [] })
    }

    // Call the pgvector RPC to find similar listings
    const { data: similar, error: rpcError } = await sb.rpc('match_similar_listings', {
      query_embedding: listing.embedding,
      exclude_vertical: listing.vertical,
      exclude_suburb: listing.suburb || '__none__',
      match_count: 6,
    })

    if (rpcError) {
      console.error('match_similar_listings RPC error:', rpcError)
      // Fallback: return top-quality listings from other verticals
      return await fallbackSimilar(sb, listing)
    }

    const results = (similar || []).map(s => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      vertical: s.vertical,
      region: s.region,
      state: s.state,
      hero_image_url: s.hero_image_url,
      similarity: Math.round(s.similarity * 1000) / 1000,
    }))

    return NextResponse.json({ results }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (err) {
    console.error('Similar listings error:', err)
    return NextResponse.json({ results: [] })
  }
}

/**
 * Fallback when the RPC is not available — returns high-quality listings
 * from different verticals, sorted by quality_score.
 */
async function fallbackSimilar(sb, listing) {
  const { data } = await sb
    .from('listings')
    .select('id, name, slug, vertical, region, state, hero_image_url, quality_score')
    .eq('status', 'active')
    .neq('vertical', listing.vertical)
    .not('hero_image_url', 'is', null)
    .gte('quality_score', 60)
    .order('quality_score', { ascending: false })
    .limit(30)

  // Filter out same suburb and pick top 6 with vertical diversity
  const pool = (data || []).filter(l =>
    !listing.suburb || l.suburb !== listing.suburb
  )

  const result = []
  const vertCounts = {}
  for (const l of pool) {
    if (result.length >= 6) break
    const vc = vertCounts[l.vertical] || 0
    if (vc >= 2) continue
    vertCounts[l.vertical] = vc + 1
    result.push({
      id: l.id,
      name: l.name,
      slug: l.slug,
      vertical: l.vertical,
      region: l.region,
      state: l.state,
      hero_image_url: l.hero_image_url,
      similarity: null,
    })
  }

  return NextResponse.json({ results: result }, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
