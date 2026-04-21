import { NextResponse } from 'next/server'

/**
 * Proxy for Mapbox Geocoding API — keeps the access token server-side.
 *
 * Forward geocode: GET ?q=Melbourne
 * Reverse geocode: GET ?lat=-37.81&lng=144.96
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) {
    return NextResponse.json({ features: [] })
  }

  // ── Reverse geocode (lat/lng → place name) ──
  if (lat && lng) {
    const latF = parseFloat(lat)
    const lngF = parseFloat(lng)
    if (isNaN(latF) || isNaN(lngF)) {
      return NextResponse.json({ features: [] })
    }
    try {
      // Include neighborhood, locality, place, district for broad coverage
      // (suburb-level in cities, town-level in rural areas)
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lngF},${latF}.json?types=neighborhood,locality,place,district&limit=3&access_token=${token}`
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) {
        console.error('[geocode] Mapbox reverse geocode failed:', res.status)
        return NextResponse.json({ features: [] })
      }

      const data = await res.json()
      // Pick the most specific result: prefer neighborhood/locality over place/district
      const f = (data.features || [])[0]
      if (!f) return NextResponse.json({ features: [] })

      // Extract region/state from context array
      const ctx = f.context || []
      const region = ctx.find(c => c.id?.startsWith('region'))?.text || null
      const place = f.text || f.place_name

      return NextResponse.json({
        features: [{
          place_name: f.place_name,
          text: place,
          center: f.center,
          region,
        }],
      }, {
        headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' },
      })
    } catch (err) {
      console.error('[geocode] Reverse geocode error:', err.message || err)
      return NextResponse.json({ features: [] })
    }
  }

  // ── Forward geocode (query → places) ──
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ features: [] })
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q.trim())}.json?country=au&types=place,locality,neighborhood,address&limit=5&access_token=${token}`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })

    if (!res.ok) {
      return NextResponse.json({ features: [] })
    }

    const data = await res.json()

    // Return only the fields the client needs
    const features = (data.features || []).map(f => ({
      place_name: f.place_name,
      text: f.text,
      center: f.center,
    }))

    return NextResponse.json({ features }, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
      },
    })
  } catch {
    return NextResponse.json({ features: [] })
  }
}
