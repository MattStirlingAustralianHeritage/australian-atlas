'use client'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useRef, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { VERTICAL_STYLES } from '@/components/VerticalBadge'

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const MAP_SLUGS = {
  sba: 'small-batch', collection: 'collections', craft: 'craft',
  fine_grounds: 'fine-grounds', rest: 'rest', field: 'field',
  corner: 'corner', found: 'found', table: 'table',
}

const ALL_VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']

/**
 * Full-width interactive map section for the homepage.
 * Loads all nine vertical pin layers with lazy initialization.
 */
export default function HomeMapSection({ listingCount }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [visibleVerticals, setVisibleVerticals] = useState(new Set(ALL_VERTICALS))
  const observerRef = useRef(null)

  // Lazy init: only load map when section scrolls into view
  useEffect(() => {
    if (!containerRef.current) return

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          initMap()
          observerRef.current?.disconnect()
        }
      },
      { rootMargin: '200px' }
    )

    observerRef.current.observe(containerRef.current)

    return () => observerRef.current?.disconnect()
  }, [])

  async function initMap() {
    if (mapRef.current || !containerRef.current) return

    const mapboxgl = (await import('mapbox-gl')).default
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k',
      center: [134, -28],
      zoom: 3.8,
      minZoom: 3,
      maxZoom: 14,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    })

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('load', async () => {
      mapRef.current = map

      // Fetch listings
      try {
        const res = await fetch('/api/map')
        const data = await res.json()
        const listings = data.listings || data || []

        if (!Array.isArray(listings) || listings.length === 0) {
          setMapLoaded(true)
          return
        }

        // Group into GeoJSON per vertical
        const verticalFeatures = {}
        for (const v of ALL_VERTICALS) verticalFeatures[v] = []

        for (const l of listings) {
          if (!l.lat || !l.lng || !l.vertical) continue
          const v = l.vertical
          if (!verticalFeatures[v]) continue
          verticalFeatures[v].push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
            properties: { name: l.name, vertical: v },
          })
        }

        // Add source + layer per vertical
        for (const v of ALL_VERTICALS) {
          map.addSource(`pins-${v}`, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: verticalFeatures[v] },
          })

          map.addLayer({
            id: `layer-${v}`,
            type: 'circle',
            source: `pins-${v}`,
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2, 8, 4, 12, 6],
              'circle-color': VERTICAL_COLORS[v] || '#888',
              'circle-opacity': 0.8,
              'circle-stroke-width': 0.5,
              'circle-stroke-color': '#fff',
              'circle-stroke-opacity': 0.6,
            },
          })
        }
      } catch (err) {
        console.error('Map listings fetch error:', err)
      }

      setMapLoaded(true)
    })
  }

  // Toggle vertical visibility
  const toggleVertical = useCallback((v) => {
    setVisibleVerticals(prev => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)

      if (mapRef.current?.getLayer(`layer-${v}`)) {
        mapRef.current.setLayoutProperty(
          `layer-${v}`,
          'visibility',
          next.has(v) ? 'visible' : 'none'
        )
      }

      return next
    })
  }, [])

  const countDisplay = listingCount > 0 ? listingCount.toLocaleString() : '6,881'

  return (
    <section className="relative w-full overflow-hidden border-b border-[var(--color-border)]">
      {/* Map container */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: 480 }}
        className="map-container"
      />

      {/* Vignette for text readability */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.45) 60%, rgba(255,255,255,0.8) 100%)',
        }}
      />

      {/* Typographic overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none px-4">
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(28px, 5vw, 48px)',
            color: 'var(--color-ink)',
            lineHeight: 1.15,
            textAlign: 'center',
            margin: 0,
            textShadow: '0 1px 8px rgba(255,255,255,0.6)',
          }}
        >
          {countDisplay} independent places.
          <br />
          <span style={{ opacity: 0.7, fontSize: '0.7em' }}>One map.</span>
        </h2>

        <div className="mt-5 pointer-events-auto">
          <Link
            href="/map"
            className="inline-flex items-center gap-2 bg-[var(--color-ink)] text-white px-6 py-3 rounded-full shadow-lg hover:shadow-xl hover:opacity-90 transition-all"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '13px' }}
          >
            Open full map
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Vertical filter toggles */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 px-4 py-3"
        style={{ background: 'linear-gradient(to top, rgba(255,255,255,0.92), rgba(255,255,255,0))' }}
      >
        <div className="flex items-center justify-center gap-1.5 overflow-x-auto no-scrollbar">
          {ALL_VERTICALS.map(v => {
            const active = visibleVerticals.has(v)
            const color = VERTICAL_COLORS[v]
            return (
              <button
                key={v}
                onClick={() => toggleVertical(v)}
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all cursor-pointer"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 400,
                  fontSize: '11px',
                  color: active ? color : 'var(--color-muted)',
                  background: active ? '#fff' : 'rgba(255,255,255,0.5)',
                  borderColor: active ? color : 'var(--color-border)',
                  opacity: active ? 1 : 0.5,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: active ? color : '#ccc' }}
                />
                {VERTICAL_LABELS[v]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Responsive height */}
      <style jsx>{`
        .map-container {
          height: 480px;
        }
        @media (max-width: 640px) {
          .map-container {
            height: 280px;
          }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  )
}
