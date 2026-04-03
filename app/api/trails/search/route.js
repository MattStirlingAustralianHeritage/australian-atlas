import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'

/**
 * GET /api/trails/search?q=...&vertical=...&limit=20
 *
 * Search active listings across all verticals for adding as trail stops.
 * Uses service-role client for unrestricted server-side queries.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')
    const vertical = searchParams.get('vertical')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)

    if (!q || q.trim().length < 2) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required (min 2 characters)' },
        { status: 400 }
      )
    }

    const sb = getSupabaseAdmin()

    let query = sb
      .from('listings')
      .select('id, name, vertical, slug, lat, lng, region, hero_image_url')
      .eq('status', 'active')
      .ilike('name', `%${q.trim()}%`)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .limit(limit)

    if (vertical) {
      query = query.eq('vertical', vertical)
    }

    const { data: listings, error } = await query

    if (error) {
      console.error('[trails/search] Query error:', error.message)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    // Fetch sub_types from meta tables for matched listings
    const META_CONFIG = {
      sba:          { table: 'sba_meta',          col: 'producer_type' },
      collection:   { table: 'collection_meta',   col: 'institution_type' },
      craft:        { table: 'craft_meta',        col: 'discipline' },
      fine_grounds: { table: 'fine_grounds_meta', col: 'entity_type' },
      rest:         { table: 'rest_meta',         col: 'accommodation_type' },
      field:        { table: 'field_meta',        col: 'feature_type' },
      corner:       { table: 'corner_meta',       col: 'shop_type' },
      found:        { table: 'found_meta',        col: 'shop_type' },
      table:        { table: 'table_meta',        col: 'food_type' },
    }

    const listingIds = listings.map(l => l.id)
    const subTypeMap = {}

    if (listingIds.length > 0) {
      // Group listings by vertical to only query relevant meta tables
      const verticals = [...new Set(listings.map(l => l.vertical))]

      await Promise.all(
        verticals
          .filter(v => META_CONFIG[v])
          .map(async (v) => {
            const { table, col } = META_CONFIG[v]
            const verticalIds = listings.filter(l => l.vertical === v).map(l => l.id)
            const { data: meta } = await sb
              .from(table)
              .select(`listing_id, ${col}`)
              .in('listing_id', verticalIds)
            if (meta) {
              for (const row of meta) {
                if (row[col]) subTypeMap[row.listing_id] = row[col]
              }
            }
          })
      )
    }

    const results = listings.map(l => ({
      id: l.id,
      name: l.name,
      vertical: l.vertical,
      sub_type: subTypeMap[l.id] || null,
      latitude: l.lat,
      longitude: l.lng,
      region: l.region,
      image_url: l.hero_image_url || null,
    }))

    return NextResponse.json({ results, total: results.length })
  } catch (err) {
    console.error('[trails/search] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
