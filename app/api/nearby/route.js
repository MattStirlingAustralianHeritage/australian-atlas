import { getSupabaseAdmin } from '@/lib/supabase/clients'
import { NextResponse } from 'next/server'

// Haversine distance in km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Vertical URL mappings
const VERTICAL_URLS = {
  sba: 'https://smallbatchatlas.com.au',
  collection: 'https://collectionatlas.com.au',
  craft: 'https://craftatlas.com.au',
  fine_grounds: 'https://finegroundsatlas.com.au',
  rest: 'https://restatlas.com.au',
  field: 'https://fieldatlas.com.au',
  corner: 'https://corneratlas.com.au',
  found: 'https://foundatlas.com.au',
  table: 'https://tableatlas.com.au',
}

// Vertical slug paths for venue pages
const VERTICAL_PATHS = {
  sba: '/venue',
  collection: '/venue',
  craft: '/venue',
  fine_grounds: '/venue',
  rest: '/stay',
  field: '/places',
  corner: '/shops',
  found: '/shops',
  table: '/listings',
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat'))
  const lng = parseFloat(searchParams.get('lng'))
  const radiusParam = parseInt(searchParams.get('radius')) || 50
  const excludeVertical = searchParams.get('exclude_vertical') || ''
  const vertical = searchParams.get('vertical') || ''
  const limit = Math.min(parseInt(searchParams.get('limit')) || 6, 12)

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  const excludeList = excludeVertical.split(',').filter(Boolean)

  // Calculate a bounding box for the initial query (rough filter)
  // 1 degree lat ~ 111km, 1 degree lng varies by latitude
  const maxRadius = 100
  const latDelta = maxRadius / 111
  const lngDelta = maxRadius / (111 * Math.cos(lat * Math.PI / 180))

  let query = sb
    .from('listings')
    .select('id, name, slug, description, region, state, lat, lng, hero_image_url, vertical, sub_type')
    .eq('status', 'active')
    .gte('lat', lat - latDelta)
    .lte('lat', lat + latDelta)
    .gte('lng', lng - lngDelta)
    .lte('lng', lng + lngDelta)
    .limit(200)

  if (vertical) {
    query = query.eq('vertical', vertical)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Calculate distances and filter
  let results = (data || [])
    .filter(item => {
      if (excludeList.includes(item.vertical)) return false
      if (!item.lat || !item.lng) return false
      return true
    })
    .map(item => ({
      ...item,
      distance_km: Math.round(haversineKm(lat, lng, item.lat, item.lng) * 10) / 10,
      venue_url: `${VERTICAL_URLS[item.vertical] || ''}${VERTICAL_PATHS[item.vertical] || '/venue'}/${item.slug}`,
      image_url: item.hero_image_url,
    }))
    .sort((a, b) => a.distance_km - b.distance_km)

  // Try radius expansion: start with requested radius, expand to 100km if sparse
  let radiusUsed = radiusParam
  let filtered = results.filter(r => r.distance_km <= radiusParam)

  if (filtered.length < 3 && radiusParam < 100) {
    radiusUsed = 100
    filtered = results.filter(r => r.distance_km <= 100)
  }

  // If still < 3, return empty (don't show sparse blocks)
  if (filtered.length < 3) {
    return NextResponse.json({ listings: [], total: 0, radius_used: radiusUsed }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  const finalListings = filtered.slice(0, limit).map(({ lat: _lat, lng: _lng, hero_image_url, ...rest }) => rest)

  return NextResponse.json({
    listings: finalListings,
    total: filtered.length,
    radius_used: radiusUsed,
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    }
  })
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
