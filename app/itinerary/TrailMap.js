'use client'

import { useEffect, useRef } from 'react'

const DAY_COLORS = ['#B87333', '#4A6741', '#4A5568', '#744210', '#2C5282']

export default function TrailMap({ days }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!days || days.length === 0) return

    let map
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      const allStops = days.flatMap(d => d.stops || [])
        .filter(s => s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng))

      if (allStops.length === 0) return

      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [parseFloat(allStops[0].lng), parseFloat(allStops[0].lat)],
        zoom: 10,
        attributionControl: false,
      })

      mapRef.current = map

      map.addControl(new mapboxgl.NavigationControl(), 'top-right')
      map.addControl(new mapboxgl.AttributionControl({ compact: true }))

      map.on('load', () => {
        map.resize()
        addMarkersAndRoutes(map, mapboxgl, days, allStops)
      })
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [days])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: 400 }}
    />
  )
}

async function addMarkersAndRoutes(map, mapboxgl, days, allStops) {
  // 1. Fit bounds to all stops
  const lngs = allStops.map(s => parseFloat(s.lng))
  const lats = allStops.map(s => parseFloat(s.lat))

  map.fitBounds(
    [
      [Math.min(...lngs) - 0.01, Math.min(...lats) - 0.01],
      [Math.max(...lngs) + 0.01, Math.max(...lats) + 0.01],
    ],
    { padding: 60, duration: 1000, maxZoom: 14 }
  )

  // 2. Fetch routed geometry for each day via server proxy
  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    const stops = (day.stops || [])
      .filter(s => s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng))

    if (stops.length < 2) continue

    const coords = stops.map(s => [parseFloat(s.lng), parseFloat(s.lat)])
    const color = DAY_COLORS[i % DAY_COLORS.length]

    // Try server proxy for real road routing
    let routeCoords = coords
    try {
      const coordStr = coords.map(c => c.join(',')).join(';')
      const res = await fetch(`/api/mapbox/directions?coords=${encodeURIComponent(coordStr)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.geometry?.coordinates?.length >= 2) {
          routeCoords = data.geometry.coordinates
        }
      }
    } catch {
      // silently fall back to straight lines
    }

    map.addSource(`route-day-${i}`, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: routeCoords },
      },
    })

    map.addLayer({
      id: `route-day-${i}-line`,
      type: 'line',
      source: `route-day-${i}`,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': color,
        'line-width': 3,
        'line-opacity': 0.8,
      },
    })
  }

  // 3. Add markers (after routes so they render on top)
  let stopIndex = 0
  days.forEach(day => {
    ;(day.stops || [])
      .filter(s => s.lat && s.lng)
      .forEach(stop => {
        stopIndex++
        const isAccom = stop.vertical === 'rest'
        const el = document.createElement('div')
        el.innerHTML = stopIndex
        el.style.cssText = `
          width: 28px; height: 28px; border-radius: 50%;
          background: ${isAccom ? '#4A6741' : '#1a1a1a'};
          color: white; font-size: 11px; font-weight: 600;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          opacity: 0; transform: scale(0);
          transition: opacity 0.3s ease ${stopIndex * 60}ms,
                      transform 0.3s cubic-bezier(0.34,1.56,0.64,1) ${stopIndex * 60}ms;
        `
        new mapboxgl.Marker({ element: el })
          .setLngLat([parseFloat(stop.lng), parseFloat(stop.lat)])
          .addTo(map)

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.opacity = '1'
            el.style.transform = 'scale(1)'
          })
        })
      })
  })
}
