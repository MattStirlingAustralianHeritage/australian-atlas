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

export default function RouteMap({ routeGeometry, stops, coverageGaps, startName, endName }) {
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

        // Start and end markers
        const routeStart = routeGeometry.coordinates[0]
        const routeEnd = routeGeometry.coordinates[routeGeometry.coordinates.length - 1]

        // Start marker (green circle)
        const startEl = document.createElement('div')
        startEl.style.cssText = 'width:28px;height:28px;border-radius:50%;background:#4a7c59;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.2);cursor:default;'
        const startInner = document.createElement('div')
        startInner.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#fff;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);'
        startEl.appendChild(startInner)
        new mapboxgl.Marker({ element: startEl })
          .setLngLat(routeStart)
          .setPopup(new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
            `<div style="font-family:system-ui;font-size:12px;padding:2px 4px;"><strong>${startName || 'Start'}</strong></div>`
          ))
          .addTo(map)

        // End marker (dark circle with flag)
        const endEl = document.createElement('div')
        endEl.style.cssText = 'width:28px;height:28px;border-radius:50%;background:#2d2a24;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.2);cursor:default;display:flex;align-items:center;justify-content:center;'
        endEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>'
        new mapboxgl.Marker({ element: endEl })
          .setLngLat(routeEnd)
          .setPopup(new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
            `<div style="font-family:system-ui;font-size:12px;padding:2px 4px;"><strong>${endName || 'End'}</strong></div>`
          ))
          .addTo(map)

        // Coverage gap annotations
        if (coverageGaps && coverageGaps.length > 0) {
          const gapFeatures = coverageGaps.map((gap, i) => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [gap.midpoint.lng, gap.midpoint.lat],
            },
            properties: {
              label: `${gap.lengthKm} km gap`,
              index: i,
            },
          }))

          map.addSource('coverage-gaps', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: gapFeatures,
            },
          })

          // Dashed circle for gap markers
          map.addLayer({
            id: 'coverage-gaps-circle',
            type: 'circle',
            source: 'coverage-gaps',
            paint: {
              'circle-radius': 16,
              'circle-color': 'rgba(212, 168, 67, 0.08)',
              'circle-stroke-width': 1.5,
              'circle-stroke-color': 'rgba(212, 168, 67, 0.4)',
            },
          })

          map.addLayer({
            id: 'coverage-gaps-label',
            type: 'symbol',
            source: 'coverage-gaps',
            layout: {
              'text-field': ['get', 'label'],
              'text-size': 10,
              'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
              'text-offset': [0, 2.2],
              'text-allow-overlap': false,
            },
            paint: {
              'text-color': 'rgba(184, 134, 43, 0.7)',
              'text-halo-color': '#fff',
              'text-halo-width': 1,
            },
          })
        }

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
  }, [routeGeometry, stops, coverageGaps, startName, endName])

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
