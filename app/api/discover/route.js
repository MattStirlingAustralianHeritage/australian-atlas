import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { NextResponse } from 'next/server'

const SELECT_FIELDS = 'id, name, slug, vertical, sub_type, description, region, state, suburb, hero_image_url, quality_score'

/**
 * Base query builder with all data quality filters:
 * - status = 'active'
 * - quality_score >= 40
 * - geocode_confidence != 'low' (exclude bad geocoding)
 * - description word count > 20 (require meaningful descriptions)
 */
function baseQuery(sb, select = SELECT_FIELDS) {
  return sb
    .from('listings')
    .select(select)
    .eq('status', 'active')
    .gte('quality_score', 40)
    .or('geocode_confidence.is.null,geocode_confidence.neq.low')
}

/**
 * Post-fetch filter: ensure description has > 20 words.
 * Supabase can't do word-count in a WHERE clause, so we filter client-side.
 */
function hasGoodDescription(listing) {
  if (!listing?.description) return false
  const wordCount = listing.description.trim().split(/\s+/).length
  return wordCount > 20
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const excludeParam = searchParams.get('exclude') || ''
  const lastVertical = searchParams.get('last_vertical') || ''

  const excludeIds = excludeParam.split(',').filter(Boolean)
  const sb = getSupabaseAdmin()

  // Count eligible listings (with vertical diversity filter)
  let countQuery = sb
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
    .gte('quality_score', 40)
    .or('geocode_confidence.is.null,geocode_confidence.neq.low')

  if (lastVertical) {
    countQuery = countQuery.neq('vertical', lastVertical)
  }

  const { count, error: countError } = await countQuery

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }

  if (!count || count === 0) {
    if (lastVertical) {
      return retryWithoutVerticalFilter(sb, excludeIds)
    }
    return NextResponse.json({ listing: null, exhausted: true })
  }

  // Try up to 8 random picks to find a good listing
  // (one that's not excluded and has a meaningful description)
  let listing = null

  for (let attempt = 0; attempt < 8; attempt++) {
    const offset = Math.floor(Math.random() * count)

    let query = baseQuery(sb)
    if (lastVertical) {
      query = query.neq('vertical', lastVertical)
    }

    const { data, error } = await query.range(offset, offset)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const candidate = data?.[0]
    if (
      candidate &&
      !excludeIds.includes(String(candidate.id)) &&
      hasGoodDescription(candidate)
    ) {
      listing = candidate
      break
    }
  }

  if (!listing) {
    // Fallback without vertical filter
    if (lastVertical) {
      return retryWithoutVerticalFilter(sb, excludeIds)
    }
    return NextResponse.json({ listing: null, exhausted: true })
  }

  return NextResponse.json({ listing })
}

async function retryWithoutVerticalFilter(sb, excludeIds) {
  const { count } = await sb
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
    .gte('quality_score', 40)
    .or('geocode_confidence.is.null,geocode_confidence.neq.low')

  if (!count || count === 0) {
    return NextResponse.json({ listing: null, exhausted: true })
  }

  let listing = null

  for (let attempt = 0; attempt < 8; attempt++) {
    const offset = Math.floor(Math.random() * count)

    const { data } = await baseQuery(sb).range(offset, offset)
    const candidate = data?.[0]

    if (
      candidate &&
      !excludeIds.includes(String(candidate.id)) &&
      hasGoodDescription(candidate)
    ) {
      listing = candidate
      break
    }
  }

  if (!listing) {
    return NextResponse.json({ listing: null, exhausted: true })
  }

  return NextResponse.json({ listing })
}
