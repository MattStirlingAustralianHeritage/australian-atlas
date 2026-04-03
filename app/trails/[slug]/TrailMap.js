'use client'

import { useEffect, useRef } from 'react'

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Collections', craft: 'Craft', fine_grounds: 'Fine Grounds',
  rest: 'Rest', field: 'Field', corner: 'Corner', found: 'Found', table: 'Table',
}

async function fetchRouteGeometry(coordinates, token) {
  if (coordinates.length < 2 || coordinates.length > 25) return null
  const coords = coordinates.map(c => c.join(',')).join(';')
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${token}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    return data.routes?.[0]?.geometry ?? null
  } catch {
    return null
  }
}

export default function TrailMap({ stops }) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)

  const coordinates = stops
    .filter(s => s.venue_lat && s.venue_lng)
    .map(s => [parseFloat(s.venue_lng), parseFloat(s.venue_lat)])

  useEffect(() => {
    if (!coordinates || coordinates.length === 0) return
    if (mapRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return

    import('mapbox-gl').then(async (mapboxgl) => {
      mapboxgl = mapboxgl.default || mapboxgl
      mapboxgl.accessToken = token

      const bounds = coordinates.reduce(
        (b, coord) => b.extend(coord),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
      )

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
        bounds,
        fitBoundsOptions: { padding: 80 },
        scrollZoom: false,
      })

      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')

      map.on('load', async () => {
        // Route line — try Directions API, fall back to straight lines
        let routeGeometry = null
        if (coordinates.length >= 2) {
          routeGeometry = await fetchRouteGeometry(coordinates, token)
        }

        const geojsonData = routeGeometry
          ? { type: 'Feature', geometry: routeGeometry }
          : { type: 'Feature', geometry: { type: 'LineString', coordinates } }

        map.addSource('trail-route', { type: 'geojson', data: geojsonData })

        // Glow layer
        map.addLayer({
          id: 'trail-route-glow',
          type: 'line',
          source: 'trail-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#5f8a7e', 'line-width': 8, 'line-opacity': 0.15 },
        })

        // Dashed route line
        map.addLayer({
          id: 'trail-route-line',
          type: 'line',
          source: 'trail-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#4a7166', 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
        })

        // Numbered markers colored by vertical
        stops.forEach((stop, index) => {
          if (!stop.venue_lat || !stop.venue_lng) return

          const color = VERTICAL_COLORS[stop.vertical] || '#5f8a7e'
          const label = VERTICAL_LABELS[stop.vertical] || stop.vertical || ''

          const el = document.createElement('div')
          el.style.cssText = `width:30px;height:30px;border-radius:50%;background:${color};border:2px solid white;color:white;font-weight:bold;font-size:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;font-family:system-ui,sans-serif;`
          el.innerText = index + 1

          const popup = new mapboxgl.Popup({ offset: 20, closeButton: false })
            .setHTML(`
              <div style="font-family:system-ui,sans-serif;padding:6px 4px;">
                <p style="font-weight:600;margin:0 0 2px;font-size:13px;">${stop.venue_name || ''}</p>
                ${label ? `<p style="margin:0;color:${color};font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">${label}</p>` : ''}
              </div>
            `)

          new mapboxgl.Marker({ element: el })
            .setLngLat([parseFloat(stop.venue_lng), parseFloat(stop.venue_lat)])
            .setPopup(popup)
            .addTo(map)
        })
      })
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [coordinates, stops])

  if (!coordinates || coordinates.length === 0) {
    return (
      <div style={{ background: 'var(--color-cream)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-body)' }}>No mapped stops yet.</p>
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div ref={mapContainer} style={{ height: 480, width: '100%' }} />
      <div style={{ background: 'var(--color-card-bg)', padding: '10px 16px', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-body)', margin: 0 }}>
          {stops.length} stops · Click markers for details
        </p>
      </div>
    </div>
  )
}
