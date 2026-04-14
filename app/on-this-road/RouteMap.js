'use client'

import { useEffect, useRef, useCallback } from 'react'
import { ATLAS_DARK_STYLE } from '@/lib/atlas-map-style'

// Day ring colours — subtle shift per day, all warm-toned
const DAY_RING_COLORS = [
  '#C49A3C', // Day 1 — amber (default)
  '#D4A84A', // Day 2 — light gold
  '#B8862B', // Day 3 — deep amber
  '#A07828', // Day 4 — bronze
  '#E8C36A', // Day 5+ — pale gold
]

const ROUTE_COLOR = '#C49A3C'
const ROUTE_BG_COLOR = '#8B6914'
const PIN_FILL = '#C49A3C'
const PIN_TEXT = '#1C1A17'

/**
 * Atlas-styled route map with dark cartographic style.
 *
 * Props:
 *   routeGeometry  — GeoJSON LineString from Mapbox Directions API
 *   stops          — array of { lat, lng, listing_name, vertical, day_number, globalIndex, is_overnight }
 *   coverageGaps   — array of { midpoint: { lng, lat }, lengthKm }
 *   startName      — display name for start
 *   endName        — display name for end
 *   activeDayNumber — which day is currently in view (for day-fly)
 *   highlightedStopIndex — index of stop being hovered in the list (null = none)
 *   onPinClick     — (globalIndex) => void — called when a map pin is clicked
 *   compact        — boolean — mobile compact mode (120px preview bar)
 */
export default function RouteMap({
  routeGeometry, stops, coverageGaps, startName, endName,
  activeDayNumber, highlightedStopIndex, onPinClick, compact,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([]) // HTML markers for overnights
  const userInteractedRef = useRef(false)
  const interactionTimerRef = useRef(null)
  const lastFlyDayRef = useRef(null)

  // Suppress auto-fly for 2s after user manually pans/clicks
  const onUserInteraction = useCallback(() => {
    userInteractedRef.current = true
    clearTimeout(interactionTimerRef.current)
    interactionTimerRef.current = setTimeout(() => {
      userInteractedRef.current = false
    }, 2000)
  }, [])

  // Build day bounds lookup
  const getDayBounds = useCallback((dayNum) => {
    if (!stops || stops.length === 0) return null
    const dayStops = stops.filter(s => s.day_number === dayNum && s.lat && s.lng)
    if (dayStops.length === 0) return null
    const lngs = dayStops.map(s => s.lng)
    const lats = dayStops.map(s => s.lat)
    return [
      [Math.min(...lngs) - 0.05, Math.min(...lats) - 0.03],
      [Math.max(...lngs) + 0.05, Math.max(...lats) + 0.03],
    ]
  }, [stops])

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!routeGeometry || !stops || stops.length === 0) return

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

      // Calculate full route bounds
      const allCoords = [
        ...routeGeometry.coordinates,
        ...stops.filter(s => s.lat && s.lng).map(s => [s.lng, s.lat]),
      ]
      const lngs = allCoords.map(c => c[0])
      const lats = allCoords.map(c => c[1])
      const sw = [Math.min(...lngs) - 0.02, Math.min(...lats) - 0.02]
      const ne = [Math.max(...lngs) + 0.02, Math.max(...lats) + 0.02]

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: ATLAS_DARK_STYLE,
        bounds: [sw, ne],
        fitBoundsOptions: { padding: compact ? 30 : 60, maxZoom: 13 },
        attributionControl: false,
      })

      mapRef.current = map

      if (!compact) {
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
      }
      map.addControl(new mapboxgl.AttributionControl({ compact: true }))

      // Track user interaction for fly suppression
      map.on('dragstart', onUserInteraction)
      map.on('zoomstart', (e) => {
        if (e.originalEvent) onUserInteraction() // only manual zoom, not programmatic
      })

      map.on('load', () => {
        // ── Route line ───────────────────────────────────────────
        map.addSource('route-line', {
          type: 'geojson',
          data: { type: 'Feature', geometry: routeGeometry },
        })

        // Background glow
        map.addLayer({
          id: 'route-line-bg',
          type: 'line',
          source: 'route-line',
          paint: {
            'line-color': ROUTE_BG_COLOR,
            'line-width': 5,
            'line-opacity': 0.3,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        })

        // Foreground line
        map.addLayer({
          id: 'route-line-fg',
          type: 'line',
          source: 'route-line',
          paint: {
            'line-color': ROUTE_COLOR,
            'line-width': 2.5,
            'line-opacity': 0.85,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        })

        // ── Start marker ─────────────────────────────────────────
        const routeStart = routeGeometry.coordinates[0]
        const routeEnd = routeGeometry.coordinates[routeGeometry.coordinates.length - 1]

        const startEl = document.createElement('div')
        startEl.style.cssText = 'width:24px;height:24px;border-radius:50%;background:#4a7c59;border:2px solid #2d2a24;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:default;position:relative;'
        const startDot = document.createElement('div')
        startDot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#fff;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);'
        startEl.appendChild(startDot)
        new mapboxgl.Marker({ element: startEl })
          .setLngLat(routeStart)
          .setPopup(new mapboxgl.Popup({ offset: 14, closeButton: false, className: 'otr-map-popup' }).setHTML(
            `<strong>${startName || 'Start'}</strong>`
          ))
          .addTo(map)

        // ── End marker ───────────────────────────────────────────
        const endEl = document.createElement('div')
        endEl.style.cssText = 'width:24px;height:24px;border-radius:50%;background:#2d2a24;border:2px solid #C49A3C;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:default;display:flex;align-items:center;justify-content:center;'
        endEl.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#C49A3C" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>'
        new mapboxgl.Marker({ element: endEl })
          .setLngLat(routeEnd)
          .setPopup(new mapboxgl.Popup({ offset: 14, closeButton: false, className: 'otr-map-popup' }).setHTML(
            `<strong>${endName || 'End'}</strong>`
          ))
          .addTo(map)

        // ── Stop pins (non-overnight) ────────────────────────────
        const dayStops = stops.filter(s => s.lat && s.lng && !s.is_overnight)
        const overnightStops = stops.filter(s => s.lat && s.lng && s.is_overnight)

        const stopFeatures = dayStops.map((stop) => ({
          type: 'Feature',
          id: stop.globalIndex,
          geometry: { type: 'Point', coordinates: [stop.lng, stop.lat] },
          properties: {
            index: stop.globalIndex,
            name: stop.listing_name,
            dayNumber: stop.day_number || 1,
            ringColor: DAY_RING_COLORS[Math.min((stop.day_number || 1) - 1, DAY_RING_COLORS.length - 1)],
          },
        }))

        map.addSource('stops', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: stopFeatures },
          promoteId: 'index',
        })

        // Day ring (outer circle)
        map.addLayer({
          id: 'stops-ring',
          type: 'circle',
          source: 'stops',
          paint: {
            'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 19, 16],
            'circle-color': ['get', 'ringColor'],
            'circle-opacity': 0.4,
          },
        })

        // Amber fill circle
        map.addLayer({
          id: 'stops-circle',
          type: 'circle',
          source: 'stops',
          paint: {
            'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 15, 12],
            'circle-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#E8C36A', PIN_FILL],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#2d2a24',
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
            'text-color': PIN_TEXT,
          },
        })

        // ── Overnight pins (HTML markers — diamond shape) ────────
        for (const stop of overnightStops) {
          const el = document.createElement('div')
          el.className = 'otr-overnight-pin'
          el.style.cssText = 'width:28px;height:28px;transform:rotate(45deg);background:#2d2a24;border:2px solid #C49A3C;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer;display:flex;align-items:center;justify-content:center;'
          const inner = document.createElement('div')
          inner.style.cssText = 'transform:rotate(-45deg);color:#C49A3C;font-size:12px;line-height:1;'
          inner.textContent = '★'
          el.appendChild(inner)

          el.addEventListener('click', () => {
            if (onPinClick) onPinClick(stop.globalIndex)
          })

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([stop.lng, stop.lat])
            .setPopup(new mapboxgl.Popup({ offset: 18, closeButton: false, className: 'otr-map-popup' }).setHTML(
              `<strong>${stop.listing_name}</strong><br><span style="font-size:11px;opacity:0.7;">Tonight's stay</span>`
            ))
            .addTo(map)

          markersRef.current.push(marker)
        }

        // ── Coverage gap annotations ─────────────────────────────
        if (coverageGaps && coverageGaps.length > 0) {
          const gapFeatures = coverageGaps.map((gap, i) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [gap.midpoint.lng, gap.midpoint.lat] },
            properties: { label: `${gap.lengthKm} km gap`, index: i },
          }))

          map.addSource('coverage-gaps', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: gapFeatures },
          })

          map.addLayer({
            id: 'coverage-gaps-circle',
            type: 'circle',
            source: 'coverage-gaps',
            paint: {
              'circle-radius': 14,
              'circle-color': 'rgba(196, 154, 60, 0.06)',
              'circle-stroke-width': 1,
              'circle-stroke-color': 'rgba(196, 154, 60, 0.3)',
            },
          })

          map.addLayer({
            id: 'coverage-gaps-label',
            type: 'symbol',
            source: 'coverage-gaps',
            layout: {
              'text-field': ['get', 'label'],
              'text-size': 9,
              'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
              'text-offset': [0, 2],
              'text-allow-overlap': false,
            },
            paint: {
              'text-color': 'rgba(196, 154, 60, 0.5)',
              'text-halo-color': '#2d2a24',
              'text-halo-width': 1,
            },
          })
        }

        // ── Interactivity: pin click → scroll ────────────────────
        map.on('click', 'stops-circle', (e) => {
          const idx = e.features[0].properties.index
          if (onPinClick) onPinClick(idx)
        })

        map.on('mouseenter', 'stops-circle', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'stops-circle', () => {
          map.getCanvas().style.cursor = ''
        })
      })

      return () => {
        markersRef.current.forEach(m => m.remove())
        markersRef.current = []
        map.remove()
        mapRef.current = null
      }
    })
  }, [routeGeometry, stops, coverageGaps, startName, endName, compact, onPinClick, onUserInteraction])

  // ── Day-fly: when activeDayNumber changes, fly to that day's bounds ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !activeDayNumber || userInteractedRef.current) return
    if (activeDayNumber === lastFlyDayRef.current) return

    const bounds = getDayBounds(activeDayNumber)
    if (!bounds) return

    lastFlyDayRef.current = activeDayNumber
    map.fitBounds(bounds, {
      padding: compact ? 20 : 60,
      duration: 1200,
      maxZoom: 12,
    })
  }, [activeDayNumber, getDayBounds, compact])

  // ── Stop highlight: sync hover state from itinerary list ──────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    if (!map.getSource('stops')) return

    // Clear all hover states
    const features = stops?.filter(s => !s.is_overnight && s.lat && s.lng) || []
    for (const s of features) {
      map.setFeatureState(
        { source: 'stops', id: s.globalIndex },
        { hover: s.globalIndex === highlightedStopIndex }
      )
    }
  }, [highlightedStopIndex, stops])

  return (
    <div
      ref={containerRef}
      className={compact ? 'otr-map-compact' : 'otr-map-full'}
      style={{
        width: '100%',
        height: '100%',
        minHeight: compact ? 120 : 400,
      }}
    />
  )
}
