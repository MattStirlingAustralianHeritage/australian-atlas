export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const coords = searchParams.get('coords')

  if (!coords) {
    return Response.json({ geometry: null })
  }

  const pairs = coords.split(';')
  if (pairs.length < 2 || pairs.length > 25) {
    return Response.json({ geometry: null })
  }

  try {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${token}`

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000)
    })

    if (!res.ok) return Response.json({ geometry: null })

    const data = await res.json()
    const geometry = data.routes?.[0]?.geometry ?? null

    return Response.json({ geometry })
  } catch {
    return Response.json({ geometry: null })
  }
}
