import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const excludeParam = searchParams.get('exclude') || ''
  const lastVertical = searchParams.get('last_vertical') || ''

  const excludeIds = excludeParam.split(',').filter(Boolean)
  const sb = getSupabaseAdmin()

  // Build base query for counting eligible listings
  let countQuery = sb
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
    .gte('quality_score', 40)

  // Try to pick a different vertical to avoid filter bubbles
  if (lastVertical) {
    countQuery = countQuery.neq('vertical', lastVertical)
  }

  if (excludeIds.length > 0) {
    // Supabase doesn't support NOT IN directly on uuid arrays easily,
    // so we'll filter after fetch if needed. For count, we accept slight over-count.
  }

  const { count, error: countError } = await countQuery

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }

  if (!count || count === 0) {
    // Fallback: if filtering by vertical yields nothing, try any vertical
    if (lastVertical) {
      return retryWithoutVerticalFilter(sb, excludeIds)
    }
    return NextResponse.json({ listing: null, exhausted: true })
  }

  // Pick a random offset
  const offset = Math.floor(Math.random() * count)

  let query = sb
    .from('listings')
    .select('id, name, slug, vertical, description, region, state, suburb, hero_image_url, quality_score')
    .eq('status', 'active')
    .gte('quality_score', 40)

  if (lastVertical) {
    query = query.neq('vertical', lastVertical)
  }

  const { data, error } = await query.range(offset, offset)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If the picked listing is in the exclude list, try a few more random picks
  let listing = data?.[0] || null

  if (listing && excludeIds.includes(String(listing.id))) {
    // Try up to 5 more random offsets
    for (let attempt = 0; attempt < 5; attempt++) {
      const newOffset = Math.floor(Math.random() * count)
      let retryQuery = sb
        .from('listings')
        .select('id, name, slug, vertical, description, region, state, suburb, hero_image_url, quality_score')
        .eq('status', 'active')
        .gte('quality_score', 40)

      if (lastVertical) {
        retryQuery = retryQuery.neq('vertical', lastVertical)
      }

      const { data: retryData } = await retryQuery.range(newOffset, newOffset)
      if (retryData?.[0] && !excludeIds.includes(String(retryData[0].id))) {
        listing = retryData[0]
        break
      }
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

  if (!count || count === 0) {
    return NextResponse.json({ listing: null, exhausted: true })
  }

  const offset = Math.floor(Math.random() * count)
  const { data } = await sb
    .from('listings')
    .select('id, name, slug, vertical, description, region, state, suburb, hero_image_url, quality_score')
    .eq('status', 'active')
    .gte('quality_score', 40)
    .range(offset, offset)

  let listing = data?.[0] || null

  if (listing && excludeIds.includes(String(listing.id))) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const newOffset = Math.floor(Math.random() * count)
      const { data: retryData } = await sb
        .from('listings')
        .select('id, name, slug, vertical, description, region, state, suburb, hero_image_url, quality_score')
        .eq('status', 'active')
        .gte('quality_score', 40)
        .range(newOffset, newOffset)

      if (retryData?.[0] && !excludeIds.includes(String(retryData[0].id))) {
        listing = retryData[0]
        break
      }
    }
  }

  if (!listing) {
    return NextResponse.json({ listing: null, exhausted: true })
  }

  return NextResponse.json({ listing })
}
