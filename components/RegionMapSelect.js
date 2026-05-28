'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

/* ═══════════════════════════════════════════════════════════════════════
   RegionMapSelect — synced map + list region selector
   ═══════════════════════════════════════════════════════════════════════
   Two-panel layout: interactive Mapbox map (left) + scrollable list (right).
   Hover/select synced both ways. Used by Q4 in the Plan-a-Stay planner.

   Desktop: map ~55%, list ~45%. Narrow: stacked, list primary.
   Map: covered regions as accent-fill polygons, uncovered plain.
   List: editorial rows with numeral, name, state code.                */


const MAPBOX_STYLE = 'mapbox://styles/mattstirlingaustralianheritage/cmn32b0iz003401swccb7d21k'

/* ─── Detect reduced motion preference ────────────────────────────────── */
function usePrefersReducedMotion() {
  const [prefersReduced, setPrefersReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReduced(mq.matches)
    const handler = (e) => setPrefersReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return prefersReduced
}

/* ─── Australia bounding box (leans southeast — honest) ───────────────── */
const AUSTRALIA_BOUNDS = [
  [112.0, -44.0],   // SW
  [154.0, -10.0],   // NE
]


export default function RegionMapSelect({ regions, selectedRegion, onSelect, onHover }) {
  const [hoveredRegion, setHoveredRegion] = useState(null)
  const [geojsonData, setGeojsonData] = useState(null)
  const [geojsonLoading, setGeojsonLoading] = useState(true)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [showMap, setShowMap] = useState(false) // mobile toggle
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const listRowRefs = useRef({})
  const prefersReducedMotion = usePrefersReducedMotion()

  // Regions keyed by name for fast lookup
  const regionsByName = useMemo(() => {
    const map = new Map()
    regions.forEach(r => map.set(r.name, r))
    return map
  }, [regions])

  // ── Fetch GeoJSON ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/plan-a-stay/regions-geojson')
      .then(res => {
        if (!res.ok) throw new Error(`GeoJSON fetch failed: ${res.status}`)
        return res.json()
      })
      .then(fc => {
        setGeojsonData(fc)
        setGeojsonLoading(false)
      })
      .catch(err => {
        console.error('[RegionMapSelect] GeoJSON fetch error:', err)
        setGeojsonLoading(false)
      })
  }, [])

  // ── Initialize Mapbox ──────────────────────────────────────────────
  useEffect(() => {
    if (!geojsonData || !mapContainerRef.current) return
    // Only init map if container is visible (desktop or mobile toggle on)
    if (mapRef.current) return

    let cancelled = false

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled) return

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: MAPBOX_STYLE,
        bounds: AUSTRALIA_BOUNDS,
        fitBoundsOptions: { padding: 30 },
        interactive: true,
        attributionControl: false,
      })

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

      map.on('load', () => {
        if (cancelled) return

        // Add region polygons source
        map.addSource('plan-regions', {
          type: 'geojson',
          data: geojsonData,
          promoteId: 'name',
        })

        // Fill layer — covered regions
        map.addLayer({
          id: 'region-fills',
          type: 'fill',
          source: 'plan-regions',
          paint: {
            'fill-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              '#C4603A',   // accent when selected
              ['boolean', ['feature-state', 'hover'], false],
              'rgba(196, 96, 58, 0.35)',   // accent at 35% on hover
              'rgba(196, 96, 58, 0.12)',   // subtle accent tint default
            ],
            'fill-opacity': 1,
          },
        })

        // Border layer
        map.addLayer({
          id: 'region-borders',
          type: 'line',
          source: 'plan-regions',
          paint: {
            'line-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              '#C4603A',
              ['boolean', ['feature-state', 'hover'], false],
              'rgba(196, 96, 58, 0.6)',
              'rgba(196, 96, 58, 0.25)',
            ],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              2,
              1,
            ],
          },
        })

        // Label layer — region names on hover/select
        map.addLayer({
          id: 'region-labels',
          type: 'symbol',
          source: 'plan-regions',
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            'text-size': 11,
            'text-anchor': 'center',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#1C1A17',
            'text-halo-color': 'rgba(248, 246, 241, 0.9)',
            'text-halo-width': 1.5,
            'text-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              1,
              ['boolean', ['feature-state', 'selected'], false],
              1,
              0,
            ],
          },
        })

        // ── Mouse interactions ─────────────────────────────────────
        let hoveredId = null

        map.on('mousemove', 'region-fills', (e) => {
          if (e.features.length > 0) {
            const name = e.features[0].properties.name
            if (hoveredId && hoveredId !== name) {
              map.setFeatureState({ source: 'plan-regions', id: hoveredId }, { hover: false })
            }
            hoveredId = name
            map.setFeatureState({ source: 'plan-regions', id: name }, { hover: true })
            map.getCanvas().style.cursor = 'pointer'
            setHoveredRegion(name)
            if (onHover) onHover(name)
          }
        })

        map.on('mouseleave', 'region-fills', () => {
          if (hoveredId) {
            map.setFeatureState({ source: 'plan-regions', id: hoveredId }, { hover: false })
            hoveredId = null
          }
          map.getCanvas().style.cursor = ''
          setHoveredRegion(null)
          if (onHover) onHover(null)
        })

        map.on('click', 'region-fills', (e) => {
          if (e.features.length > 0) {
            const name = e.features[0].properties.name
            onSelect(name)
          }
        })

        setMapLoaded(true)
        mapRef.current = map
      })
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [geojsonData, onSelect, onHover])

  // ── Sync selected state to map ─────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !geojsonData) return

    // Clear all selected states, then set the selected one
    geojsonData.features.forEach(f => {
      const name = f.properties.name
      mapRef.current.setFeatureState(
        { source: 'plan-regions', id: name },
        { selected: name === selectedRegion }
      )
    })
  }, [selectedRegion, mapLoaded, geojsonData])

  // ── Sync hovered region from list to map ───────────────────────────
  const handleListHover = useCallback((regionName) => {
    if (!mapRef.current || !mapLoaded) return

    // Clear previous hover
    if (geojsonData) {
      geojsonData.features.forEach(f => {
        mapRef.current.setFeatureState(
          { source: 'plan-regions', id: f.properties.name },
          { hover: f.properties.name === regionName }
        )
      })
    }
    setHoveredRegion(regionName)
  }, [mapLoaded, geojsonData])

  // ── Scroll hovered region into view in list ────────────────────────
  useEffect(() => {
    if (hoveredRegion && listRowRefs.current[hoveredRegion]) {
      listRowRefs.current[hoveredRegion].scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
      })
    }
  }, [hoveredRegion, prefersReducedMotion])


  return (
    <div>
      {/* ── Mobile map toggle ────────────────────────────────────── */}
      <div style={{
        display: 'none', // hidden on desktop, shown via media query below
        marginBottom: 16,
      }}
        className="region-map-mobile-toggle"
      >
        <button
          onClick={() => setShowMap(v => !v)}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-muted, #6B6760)',
            background: 'transparent',
            border: '1px solid var(--color-border, rgba(28,26,23,0.12))',
            borderRadius: 6,
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          {showMap ? 'Hide map' : 'Show map'}
        </button>
      </div>

      {/* ── Two-panel layout ─────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: 24,
        minHeight: 440,
      }}
        className="region-map-panels"
      >
        {/* Map panel */}
        <div
          ref={mapContainerRef}
          style={{
            flex: '0 0 55%',
            borderRadius: 10,
            overflow: 'hidden',
            background: '#2d2a24',
            minHeight: 400,
          }}
          className="region-map-panel"
        />

        {/* List panel */}
        <div
          style={{
            flex: 1,
            maxHeight: 480,
            overflowY: 'auto',
            borderTop: '1px solid rgba(28,26,23,0.08)',
          }}
          className="region-list-panel"
        >
          {regions.map((r, i) => {
            const isSelected = selectedRegion === r.name
            const isHovered = hoveredRegion === r.name
            const numeral = String(i + 1).padStart(2, '0')

            return (
              <button
                key={r.name}
                ref={el => { listRowRefs.current[r.name] = el }}
                role="option"
                aria-selected={isSelected}
                aria-label={`${r.name}, ${r.state}`}
                onClick={() => onSelect(r.name)}
                onMouseEnter={() => handleListHover(r.name)}
                onMouseLeave={() => handleListHover(null)}
                onFocus={() => handleListHover(r.name)}
                onBlur={() => handleListHover(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  textAlign: 'left',
                  padding: '14px 4px 14px 0',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(28,26,23,0.08)',
                  borderLeft: isSelected ? '2px solid var(--color-accent, #C4603A)' : '2px solid transparent',
                  paddingLeft: 12,
                  cursor: 'pointer',
                  transition: prefersReducedMotion
                    ? 'border-color 0.15s ease'
                    : 'border-color 0.15s ease, transform 0.18s ease',
                  transform: (!prefersReducedMotion && isHovered && !isSelected) ? 'translateY(-1px)' : 'none',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {/* Numeral */}
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 13,
                  color: isSelected
                    ? 'var(--color-accent, #C4603A)'
                    : 'var(--color-muted, #6B6760)',
                  opacity: isSelected ? 0.8 : 0.35,
                  minWidth: 28,
                  flexShrink: 0,
                }}>
                  {numeral}
                </span>

                {/* Name */}
                <span style={{
                  flex: 1,
                  fontSize: 15,
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected
                    ? 'var(--color-accent, #C4603A)'
                    : 'var(--color-ink, #1C1A17)',
                  lineHeight: 1.3,
                }}>
                  {r.name}
                </span>

                {/* State code */}
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--color-muted, #6B6760)',
                  opacity: 0.5,
                  flexShrink: 0,
                  marginLeft: 12,
                }}>
                  {r.state}
                </span>

                {/* Hover arrow */}
                <span style={{
                  fontSize: 14,
                  color: 'var(--color-muted, #6B6760)',
                  opacity: isHovered && !prefersReducedMotion ? 0.6 : 0,
                  transform: isHovered && !prefersReducedMotion ? 'translateX(0)' : 'translateX(4px)',
                  transition: 'opacity 0.18s ease, transform 0.18s ease',
                  marginLeft: 8,
                  flexShrink: 0,
                }}>
                  →
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Responsive styles (injected once) ────────────────────── */}
      <style>{`
        @media (max-width: 768px) {
          .region-map-mobile-toggle {
            display: block !important;
          }
          .region-map-panels {
            flex-direction: column !important;
            gap: 16px !important;
          }
          .region-map-panel {
            flex: none !important;
            display: ${showMap ? 'block' : 'none'} !important;
            min-height: 280px !important;
          }
          .region-list-panel {
            max-height: 360px !important;
          }
        }
      `}</style>
    </div>
  )
}
