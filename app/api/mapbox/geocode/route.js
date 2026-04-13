import { NextResponse } from 'next/server'

/**
 * Proxy for Mapbox Geocoding API — keeps the access token server-side.
 * Used by the "On This Road" planner for place autocomplete.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ features: [] })
  }

  try {
    const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) {
      return NextResponse.json({ features: [] })
    }

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
