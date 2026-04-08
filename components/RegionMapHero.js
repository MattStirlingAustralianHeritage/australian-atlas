'use client'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useEffect, useRef, useState } from 'react'

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

const VERTICAL_LABELS = {
  sba: 'Small Batch',
  fine_grounds: 'Fine Grounds',
  collection: 'Culture',
  craft: 'Craft',
  rest: 'Rest',
  field: 'Field',
  corner: 'Corner',
  found: 'Found',
  table: 'Table',
}

const VERTICAL_URLS = {
  sba: 'https://smallbatchatlas.com.au/venue',
  collection: 'https://collectionatlas.com.au/venue',
  craft: 'https://craftatlas.com.au/venue',
  fine_grounds: 'https://finegroundsatlas.com.au/roasters',
  rest: 'https://restatlas.com.au/stay',
  field: 'https://fieldatlas.com.au/places',
  corner: 'https://corneratlas.com.au/shops',
  found: 'https://foundatlas.com.au/shops',
  table: 'https://tableatlas.com.au/listings',
}

/**
 * Interactive Mapbox hero for region pages.
 * Full-width, explorable, pins colored by vertical with click-to-detail popups.
 */
export default function RegionMapHero({ points, regionName, stateName, centerLat, centerLng, zoom }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!mapRef.current) return
    if (mapInstance.current) {
      mapInstance.current.remove()
      mapInstance.current = null
    }

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      const hasPoints = points?.length > 0

      // Calculate bounds from points or use center
      let mapOptions = {
        container: mapRef.current,
        style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
        attributionControl: false,
        interactive: true,
      }

      if (hasPoints && points.length > 1) {
        const lngs = points.map(p => p.lng)
        const lats = points.map(p => p.lat)
        mapOptions.bounds = [
          [Math.min(...lngs) - 0.05, Math.min(...lats) - 0.05],
          [Math.max(...lngs) + 0.05, Math.max(...lats) + 0.05],
        ]
        mapOptions.fitBoundsOptions = { padding: 60, maxZoom: 12 }
      } else if (centerLat && centerLng) {
        mapOptions.center = [centerLng, centerLat]
        mapOptions.zoom = (zoom || 9) - 1
      } else {
        mapOptions.center = [134, -28]
        mapOptions.zoom = 4
      }

      const map = new mapboxgl.Map(mapOptions)
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

      map.on('load', () => {
        if (!hasPoints) return

        const features = points.map(p => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { name: p.name, vertical: p.vertical, slug: p.slug },
        }))

        map.addSource('region-listings', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        })

        // Color by vertical
        const colorExpr = ['match', ['get', 'vertical']]
        for (const [v, c] of Object.entries(VERTICAL_COLORS)) {
          colorExpr.push(v, c)
        }
        colorExpr.push('#888')

        map.addLayer({
          id: 'listing-dots',
          type: 'circle',
          source: 'region-listings',
          paint: {
            'circle-radius': 7,
            'circle-color': colorExpr,
            'circle-opacity': 0.9,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          },
        })

        // Click popup with link
        const popup = new mapboxgl.Popup({
          closeButton: true,
          closeOnClick: true,
          offset: 14,
          maxWidth: '240px',
        })

        map.on('click', 'listing-dots', (e) => {
          const { name, vertical, slug } = e.features[0].properties
          const color = VERTICAL_COLORS[vertical] || '#888'
          const label = VERTICAL_LABELS[vertical] || vertical
          const url = slug ? `/place/${slug}` : '#'

          popup.setLngLat(e.lngLat).setHTML(`
            <div style="font-family: var(--font-body, system-ui); padding: 4px 0;">
              <div style="font-size: 14px; font-weight: 600; color: #2D2A26; margin-bottom: 3px;">${name}</div>
              <div style="font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${color}; margin-bottom: 6px;">${label}</div>
              <a href="${url}" style="font-size: 12px; color: ${color}; text-decoration: underline;">View listing</a>
            </div>
          `).addTo(map)
        })

        map.on('mouseenter', 'listing-dots', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'listing-dots', () => {
          map.getCanvas().style.cursor = ''
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
  }, [points, centerLat, centerLng, zoom, expanded])

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        ref={mapRef}
        style={{
          width: '100%',
          height: expanded ? '600px' : 'clamp(300px, 40vh, 450px)',
          transition: 'height 0.3s ease',
        }}
      />

      {/* Region name overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          pointerEvents: 'none',
          background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)',
          padding: 'clamp(1.25rem, 3vw, 2.5rem)',
        }}
      >
        <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
          <span
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: '10.5px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#fff',
              background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(8px)',
              padding: '0.25rem 0.625rem',
              borderRadius: '100px',
              marginBottom: '0.625rem',
            }}
          >
            {stateName}
          </span>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 'clamp(1.75rem, 4.5vw, 2.75rem)',
              color: '#fff',
              lineHeight: 1.1,
              margin: 0,
              textShadow: '0 2px 12px rgba(0,0,0,0.3)',
            }}
          >
            {regionName}
          </h1>
        </div>
      </div>

      {/* Expand / collapse toggle (mobile-friendly) */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          position: 'absolute',
          bottom: '12px',
          right: '12px',
          fontFamily: 'var(--font-body)',
          fontSize: '11px',
          fontWeight: 500,
          padding: '6px 12px',
          borderRadius: '6px',
          border: 'none',
          background: 'rgba(255,255,255,0.92)',
          color: '#2D2A26',
          cursor: 'pointer',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          zIndex: 5,
          pointerEvents: 'auto',
        }}
      >
        {expanded ? 'Collapse map' : 'Expand map'}
      </button>
    </div>
  )
}
