'use client'

import { useEffect, useRef } from 'react'

const VERTICAL_COLORS = {
  sba: '#6b3a2a',
  collection: '#5a6b7c',
  craft: '#7c6b5a',
  fine_grounds: '#5F8A7E',
  rest: '#8a5a6b',
  field: '#5a7c5a',
  corner: '#7c5a7c',
  found: '#5a7c6b',
  table: '#7c6b5a',
}

const ROUTE_COLOR = '#8B6914'

export default function RouteMap({ routeGeometry, stops }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!routeGeometry || !stops || stops.length === 0) return

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      // Calculate bounds from stops + route
      const allCoords = [
        ...routeGeometry.coordinates,
        ...stops.filter(s => s.lat && s.lng).map(s => [s.lng, s.lat]),
      ]
      const lngs = allCoords.map(c => c[0])
      const lats = allCoords.map(c => c[1])
      const sw = [Math.min(...lngs), Math.min(...lats)]
      const ne = [Math.max(...lngs), Math.max(...lats)]

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        bounds: [sw, ne],
        fitBoundsOptions: { padding: 60, maxZoom: 14 },
        attributionControl: false,
      })

      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')
      map.addControl(new mapboxgl.AttributionControl({ compact: true }))

      map.on('load', () => {
        // Route line
        map.addSource('route-line', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: routeGeometry,
          },
        })

        map.addLayer({
          id: 'route-line-bg',
          type: 'line',
          source: 'route-line',
          paint: {
            'line-color': ROUTE_COLOR,
            'line-width': 4,
            'line-opacity': 0.25,
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
        })

        map.addLayer({
          id: 'route-line-fg',
          type: 'line',
          source: 'route-line',
          paint: {
            'line-color': ROUTE_COLOR,
            'line-width': 2.5,
            'line-opacity': 0.7,
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
        })

        // Stop markers
        const stopsWithCoords = stops.filter(s => s.lat && s.lng)

        const stopFeatures = stopsWithCoords.map((stop, i) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [stop.lng, stop.lat],
          },
          properties: {
            index: i + 1,
            name: stop.listing_name,
            vertical: stop.vertical,
            color: VERTICAL_COLORS[stop.vertical] || '#5F8A7E',
          },
        }))

        map.addSource('stops', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: stopFeatures,
          },
        })

        // Circle background
        map.addLayer({
          id: 'stops-circle',
          type: 'circle',
          source: 'stops',
          paint: {
            'circle-radius': 14,
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        })

        // Number labels
        map.addLayer({
          id: 'stops-number',
          type: 'symbol',
          source: 'stops',
          layout: {
            'text-field': ['to-string', ['get', 'index']],
            'text-size': 11,
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#ffffff',
          },
        })

        // Popup on click
        map.on('click', 'stops-circle', (e) => {
          const props = e.features[0].properties
          const coords = e.features[0].geometry.coordinates
          new mapboxgl.Popup({ offset: 20, closeButton: false })
            .setLngLat(coords)
            .setHTML(`<div style="font-family: system-ui; font-size: 13px; padding: 2px 4px;">
              <strong>${props.name}</strong>
            </div>`)
            .addTo(map)
        })

        map.on('mouseenter', 'stops-circle', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'stops-circle', () => {
          map.getCanvas().style.cursor = ''
        })
      })

      return () => {
        map.remove()
        mapRef.current = null
      }
    })
  }, [routeGeometry, stops])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 400,
      }}
    />
  )
}
