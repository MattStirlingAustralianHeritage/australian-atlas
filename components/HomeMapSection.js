'use client'
import 'mapbox-gl/dist/mapbox-gl.css'

import { useRef, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

const VERTICAL_COLORS = {
  sba: '#C49A3C', collection: '#7A6B8A', craft: '#C1603A', fine_grounds: '#8A7055',
  rest: '#5A8A9A', field: '#4A7C59', corner: '#5F8A7E', found: '#D4956A', table: '#C4634F',
}

const VERTICAL_LABELS = {
  sba: 'Small Batch', collection: 'Culture', craft: 'Craft',
  fine_grounds: 'Fine Grounds', rest: 'Rest', field: 'Field',
  corner: 'Corner', found: 'Found', table: 'Table',
}

const ALL_VERTICALS = ['sba', 'collection', 'craft', 'fine_grounds', 'rest', 'field', 'corner', 'found', 'table']

export default function HomeMapSection({ listingCount }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [visibleVerticals, setVisibleVerticals] = useState(new Set(ALL_VERTICALS))
  const observerRef = useRef(null)

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

      try {
        const res = await fetch('/api/map')
        const data = await res.json()
        const listings = data.listings || data || []

        if (!Array.isArray(listings) || listings.length === 0) {
          setMapLoaded(true)
          return
        }

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

  return (
    <section className="relative w-full overflow-hidden">
      <div
        ref={containerRef}
        style={{ width: '100%' }}
        className="map-container"
      />

      {/* Subtle edge vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.2) 100%)',
        }}
      />

      {/* Vertical filter toggles — top of map */}
      <div className="absolute top-0 left-0 right-0 z-10 px-4 py-3">
        <div className="flex items-center justify-center gap-1.5 overflow-x-auto scrollbar-hide">
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
                  color: active ? '#FAF8F4' : 'rgba(250,248,244,0.5)',
                  background: active ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)',
                  borderColor: active ? color : 'rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: active ? color : 'rgba(255,255,255,0.3)' }}
                />
                {VERTICAL_LABELS[v]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Open full map — bottom-right corner */}
      <div className="absolute bottom-4 right-4 z-10">
        <Link
          href="/map"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full shadow-lg hover:shadow-xl hover:opacity-90 transition-all"
          style={{
            fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '12px',
            background: 'rgba(0,0,0,0.7)', color: '#FAF8F4',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          Open full map
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      <style jsx>{`
        .map-container {
          height: min(32vh, 380px);
        }
        @media (max-width: 640px) {
          .map-container {
            height: min(40vh, 320px);
          }
        }
      `}</style>
    </section>
  )
}
