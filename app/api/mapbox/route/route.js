import { NextResponse } from 'next/server'

/**
 * GET /api/mapbox/route?coordinates=lng,lat;lng,lat;lng,lat
 *
 * Server-side proxy for the Mapbox Directions API.
 * Avoids CORS issues from client-side fetches to api.mapbox.com.
 * Returns the GeoJSON route geometry, or { geometry: null } on failure.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const coordinates = searchParams.get('coordinates')

  if (!coordinates) {
    return NextResponse.json({ geometry: null, error: 'Missing coordinates parameter' }, { status: 400 })
  }

  // Validate format: semicolon-separated lng,lat pairs
  const pairs = coordinates.split(';')
  if (pairs.length < 2 || pairs.length > 25) {
    return NextResponse.json({ geometry: null, error: 'Need 2-25 coordinate pairs' }, { status: 400 })
  }

  for (const pair of pairs) {
    const parts = pair.split(',')
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      return NextResponse.json({ geometry: null, error: 'Invalid coordinate format' }, { status: 400 })
    }
  }

  const token = process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) {
    console.error('[mapbox/route] No Mapbox token configured')
    return NextResponse.json({ geometry: null })
  }

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&overview=full&access_token=${token}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) {
      console.warn(`[mapbox/route] Directions API returned ${res.status}`)
      return NextResponse.json({ geometry: null })
    }

    const data = await res.json()
    const geometry = data.routes?.[0]?.geometry ?? null

    return NextResponse.json({ geometry })
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[mapbox/route] Directions API timed out (10s)')
    } else {
      console.warn('[mapbox/route] Directions API error:', err.message)
    }
    return NextResponse.json({ geometry: null })
  }
}
