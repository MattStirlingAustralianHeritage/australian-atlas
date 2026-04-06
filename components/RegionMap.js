'use client'

import { useEffect, useRef } from 'react'

const VERTICAL_COLORS = {
  sba: '#C49A3C',
  fine_grounds: '#8A7055',
  collection: '#7A6B8A',
  craft: '#C1603A',
  rest: '#5A8A9A',
  field: '#4A7C59',
  corner: '#5F8A7E',
  found: '#D4956A',
  table: '#C4634F',
}

/**
 * Mapbox map showing all listings in a region.
 * Points are colour-coded by vertical.
 *
 * @param {{ points: Array<{lat: number, lng: number, name: string, vertical: string}>, regionName: string }}
 */
export default function RegionMap({ points, regionName }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)

  useEffect(() => {
    if (!points?.length || !mapRef.current) return
    if (mapInstance.current) {
      mapInstance.current.remove()
      mapInstance.current = null
    }

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      // Calculate bounds from points
      const lngs = points.map(p => p.lng)
      const lats = points.map(p => p.lat)
      const bounds = [
        [Math.min(...lngs) - 0.05, Math.min(...lats) - 0.05],
        [Math.max(...lngs) + 0.05, Math.max(...lats) + 0.05],
      ]

      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
        bounds: bounds,
        fitBoundsOptions: { padding: 50, maxZoom: 12 },
        attributionControl: false,
      })

      map.addControl(new mapboxgl.NavigationControl(), 'top-right')

      map.on('load', () => {
        // GeoJSON source
        const features = points.map(p => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { name: p.name, vertical: p.vertical },
        }))

        map.addSource('region-listings', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        })

        // Colour by vertical using match expression
        const colorExpr = ['match', ['get', 'vertical']]
        for (const [v, c] of Object.entries(VERTICAL_COLORS)) {
          colorExpr.push(v, c)
        }
        colorExpr.push('#888') // fallback

        map.addLayer({
          id: 'listing-dots',
          type: 'circle',
          source: 'region-listings',
          paint: {
            'circle-radius': 6,
            'circle-color': colorExpr,
            'circle-opacity': 0.85,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#fff',
          },
        })

        // Hover popup
        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          maxWidth: '200px',
        })

        map.on('mouseenter', 'listing-dots', (e) => {
          map.getCanvas().style.cursor = 'pointer'
          const { name, vertical } = e.features[0].properties
          const color = VERTICAL_COLORS[vertical] || '#888'
          popup.setLngLat(e.lngLat).setHTML(`
            <div style="font-family: var(--font-body, system-ui); padding: 2px 0;">
              <div style="font-size: 13px; font-weight: 500; color: #2D2A26;">${name}</div>
              <div style="font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${color}; margin-top: 2px;">${vertical.replace('_', ' ')}</div>
            </div>
          `).addTo(map)
        })

        map.on('mouseleave', 'listing-dots', () => {
          map.getCanvas().style.cursor = ''
          popup.remove()
        })
      })

      mapInstance.current = map
    })

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [points])

  return (
    <div>
      <div
        style={{
          padding: '0.875rem 1.25rem',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            fontWeight: 600,
            margin: 0,
            color: 'var(--color-ink)',
          }}
        >
          {regionName}
        </h2>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            color: 'var(--color-muted)',
          }}
        >
          {points.length} {points.length === 1 ? 'listing' : 'listings'}
        </span>
      </div>
      <div
        ref={mapRef}
        style={{ height: 360, width: '100%' }}
      />
    </div>
  )
}
