import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { filterByVertical, relationHasVerticals } from '@/lib/listings/verticalFilter'
import { getListingRegion, LISTING_REGION_SELECT } from '@/lib/regions'

/**
 * GET /api/trails/search?q=...&vertical=...&region=<uuid>&limit=20
 *
 * Search active listings across all verticals for adding as trail stops.
 * Uses service-role client for unrestricted server-side queries.
 *
 * `lat`/`lng` (+ optional `radius`, default 100 km) are optional and additive.
 * When supplied, the search is scoped to a circle of that radius around the
 * point AND becomes spelling-tolerant via the hybrid RPC's pg_trgm fuzzy arm —
 * so "Mcclellen" surfaces "McClelland". This is the language-led path the
 * operator-suggested trail builder uses (a stop must be within `radius` km of
 * the operator's listing). Without `lat`/`lng` the original ILIKE behaviour is
 * unchanged (the consumer/admin builders are unaffected).
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')
    const vertical = searchParams.get('vertical')
    const lat = parseFloat(searchParams.get('lat'))
    const lng = parseFloat(searchParams.get('lng'))
    const radiusKm = Math.min(Math.max(parseFloat(searchParams.get('radius')) || 100, 1), 500)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const hasCenter = Number.isFinite(lat) && Number.isFinite(lng)

    if (!q || q.trim().length < 2) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required (min 2 characters)' },
        { status: 400 }
      )
    }

    const sb = getSupabaseAdmin()

    // ── Radius-scoped, spelling-tolerant path (operator trail builder) ────────
    if (hasCenter) {
      // Bounding box that encloses the radius circle (RPC pre-filter), then an
      // exact great-circle filter to the circle itself.
      const dLat = radiusKm / 111.045
      const dLng = radiusKm / (111.045 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01))
      const { data, error } = await sb.rpc('search_listings_hybrid', {
        query_text: q.trim(),
        query_embedding: null,
        filter_vertical: vertical || null,
        match_count: Math.min(limit * 3, 100),
        lat_min: lat - dLat,
        lat_max: lat + dLat,
        lng_min: lng - dLng,
        lng_max: lng + dLng,
      })
      if (error) {
        console.error('[trails/search] Hybrid RPC error:', error.message)
        return NextResponse.json({ error: 'Search failed' }, { status: 500 })
      }
      const results = (data || [])
        .filter(l => l.lat != null && l.lng != null && haversineKm(lat, lng, l.lat, l.lng) <= radiusKm)
        .slice(0, limit)
        .map(l => ({
          id: l.id,
          name: l.name,
          slug: l.slug,
          vertical: l.vertical,
          sub_type: l.sub_type || null,
          latitude: l.lat,
          longitude: l.lng,
          region: l.region || null,
          distance_km: Math.round(haversineKm(lat, lng, l.lat, l.lng) * 10) / 10,
          image_url: l.hero_image_url || null,
        }))
      return NextResponse.json({ results, total: results.length })
    }

    let query = sb
      .from('listings')
      .select(`id, name, vertical, slug, lat, lng, region, hero_image_url, ${LISTING_REGION_SELECT}`)
      .eq('status', 'active')
      .or('address_on_request.eq.false,address_on_request.is.null')
      .or('visitable.eq.true,visitable.is.null,presence_type.eq.by_appointment')
      .ilike('name', `%${q.trim()}%`)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .limit(limit)

    if (vertical) {
      query = filterByVertical(query, vertical, await relationHasVerticals(sb, 'listings'))
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
      way:          { table: 'way_meta',          col: 'primary_type' },
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
      slug: l.slug,
      vertical: l.vertical,
      sub_type: subTypeMap[l.id] || null,
      latitude: l.lat,
      longitude: l.lng,
      region: getListingRegion(l)?.name ?? null,
      image_url: l.hero_image_url || null,
    }))

    return NextResponse.json({ results, total: results.length })
  } catch (err) {
    console.error('[trails/search] Fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
